/**
 * 一括下書き生成API
 * POST /api/ai/batch-generate
 *
 * テーマリストから複数の下書きを一括生成し、draftsテーブルに保存する。
 */
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { buildPostPrompt } from "@/lib/prompt-engine";
import { fetchUrlContent } from "@/lib/url-fetcher";

export const maxDuration = 120;

const rssArticleSchema = z.object({
  id: z.string(),
  title: z.string(),
  link: z.string().url(),
  description: z.string().optional(),
  source: z.string().optional(),
});

const autoScheduleSchema = z.object({
  enabled: z.boolean(),
  interval_hours: z.number().min(1).max(4).default(1),
  start_at: z.string(),
});

const requestSchema = z.object({
  themes: z.array(z.string().min(1).max(200)).min(1).max(15).optional(),
  rss_articles: z.array(rssArticleSchema).min(1).max(15).optional(),
  account_id: z.string().uuid(),
  platform: z.enum(["threads", "x"]).optional().default("threads"),
  selected_models: z.array(z.string()).optional(),
  thread_count: z.number().min(3).max(6).optional().default(4),
  auto_schedule: autoScheduleSchema.optional(),
}).refine(
  (data) => (data.themes && data.themes.length > 0) || (data.rss_articles && data.rss_articles.length > 0),
  { message: "themes または rss_articles のどちらかが必要です" }
);

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (!user || authError) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "AI機能が設定されていません" },
      { status: 503 }
    );
  }

  const body = await request.json();
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "バリデーションエラー", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { themes, rss_articles, account_id, platform, selected_models, thread_count, auto_schedule } =
    parsed.data;

  const { data: account } = await supabase
    .from("social_accounts")
    .select("id")
    .eq("id", account_id)
    .eq("profile_id", user.id)
    .single();

  if (!account) {
    return NextResponse.json(
      { error: "アカウントが見つかりません" },
      { status: 404 }
    );
  }

  try {
    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    const systemPrompt = buildPostPrompt({
      platform,
      selectedModels: selected_models ?? [],
      threadCount: thread_count,
    });

    interface DraftItem {
      theme: string;
      thread_posts: string[];
      rss_article_id?: string;
      source_url?: string;
      rss_source?: string;
      og_image?: string;
    }
    const drafts: DraftItem[] = [];

    // RSS記事からの生成（本文取得 + 強化プロンプト）
    if (rss_articles && rss_articles.length > 0) {
      for (const article of rss_articles) {
        try {
          // 記事本文・OG画像を取得
          let articleBody = "";
          let ogImageUrl = "";
          try {
            const fetched = await fetchUrlContent(article.link);
            articleBody = fetched.text?.slice(0, 3000) ?? "";
            ogImageUrl = fetched.mediaUrls?.[0] ?? "";
          } catch { /* フェッチ失敗時はdescriptionのみで生成 */ }

          const isEnglish = /^[a-zA-Z0-9\s.,!?'"()\-:;]+$/.test(
            (article.title ?? "").slice(0, 50)
          );

          const response = await anthropic.messages.create({
            model: "claude-sonnet-4-20250514",
            max_tokens: 3000,
            messages: [
              {
                role: "user",
                content: `以下の記事をもとに、バズりやすいスレッド投稿を生成してください。

## 元記事情報
タイトル: ${article.title}
URL: ${article.link}
概要: ${article.description ?? "なし"}
ソース: ${article.source ?? "不明"}
${articleBody ? `\n## 記事本文（抜粋）\n${articleBody}` : ""}

## 重要ルール
1. **投稿1の冒頭**にURLを配置してください${isEnglish ? `。ただし元記事が英語の場合は、同じニュースの日本語記事URL（ITmedia, GIGAZINE, TechCrunch Japan, CNET Japan, Impress Watch等）を代わりに使ってください。日本語記事が見つからない場合のみ元の英語URLを使用` : ""}
2. 元記事の情報だけで終わらせず、あなたの知識から**関連する最新動向・背景・具体的な数字・業界への影響**を補完し、元記事より有益で情報密度の高い投稿にしてください
3. 投稿2以降は詳細解説（400字以上推奨）。具体例・比較・今後の展望を盛り込む
4. 日本語で、分かりやすく解説
5. JSON文字列配列で返してください（例: ["投稿1", "投稿2", ...]）`,
              },
            ],
            system: systemPrompt,
          });

          const responseText =
            response.content[0].type === "text" ? response.content[0].text : "";
          const threadPosts = parseThreadPosts(responseText);

          if (threadPosts.length > 0) {
            drafts.push({
              theme: article.title,
              thread_posts: threadPosts,
              rss_article_id: article.id,
              source_url: article.link,
              rss_source: article.source,
              og_image: ogImageUrl || undefined,
            });
          }
        } catch {
          drafts.push({ theme: article.title, thread_posts: [] });
        }
      }
    }

    // テーマからの生成（従来方式）
    if (themes && themes.length > 0) {
      for (const theme of themes) {
        try {
          const response = await anthropic.messages.create({
            model: "claude-sonnet-4-20250514",
            max_tokens: 2000,
            messages: [
              {
                role: "user",
                content: `テーマ: ${theme}\n\nバズりやすいスレッド形式の投稿を生成してください。JSON配列で返してください。`,
              },
            ],
            system: systemPrompt,
          });

          const responseText =
            response.content[0].type === "text" ? response.content[0].text : "";
          const threadPosts = parseThreadPosts(responseText);

          if (threadPosts.length > 0) {
            drafts.push({ theme, thread_posts: threadPosts });
          }
        } catch {
          drafts.push({ theme, thread_posts: [] });
        }
      }
    }

    const savedDrafts = [];
    for (const draft of drafts) {
      if (draft.thread_posts.length === 0) continue;

      const metadata: Record<string, unknown> = {
        thread_posts: draft.thread_posts,
        batch_theme: draft.theme,
      };
      if (draft.rss_article_id) {
        metadata.rss_article_id = draft.rss_article_id;
        metadata.source_url = draft.source_url;
        metadata.rss_source = draft.rss_source;
      }

      const mediaUrls: string[] = [];
      if (draft.og_image) mediaUrls.push(draft.og_image);

      const { data, error } = await supabase
        .from("drafts")
        .insert({
          profile_id: user.id,
          account_id,
          text: draft.thread_posts[0],
          hashtags: [],
          media_urls: mediaUrls,
          source: "ai",
          metadata,
          status: "draft",
        })
        .select()
        .single();

      if (!error && data) {
        savedDrafts.push({ ...data, thread_posts: draft.thread_posts });
      }
    }

    // RSS記事を使用済みに更新
    if (rss_articles && rss_articles.length > 0) {
      const usedIds = drafts
        .filter((d) => d.rss_article_id && d.thread_posts.length > 0)
        .map((d) => d.rss_article_id!);

      if (usedIds.length > 0) {
        await supabase
          .from("rss_articles")
          .update({ is_used: true })
          .in("id", usedIds);
      }
    }

    // 自動予約: 生成した下書きを間隔を空けてscheduled_postsに登録
    let scheduledCount = 0;
    if (auto_schedule?.enabled && savedDrafts.length > 0) {
      const adminClient = createAdminClient();
      const startTime = new Date(auto_schedule.start_at).getTime();
      const intervalMs = auto_schedule.interval_hours * 60 * 60 * 1000;

      for (let i = 0; i < savedDrafts.length; i++) {
        const scheduledAt = new Date(startTime + i * intervalMs).toISOString();
        const { error: schedError } = await adminClient
          .from("scheduled_posts")
          .insert({
            draft_id: savedDrafts[i].id,
            account_id,
            scheduled_at: scheduledAt,
            status: "pending",
          });

        if (!schedError) {
          scheduledCount++;
          await supabase
            .from("drafts")
            .update({ status: "scheduled" })
            .eq("id", savedDrafts[i].id);
        }
      }
    }

    return NextResponse.json({
      data: {
        generated: drafts.length,
        saved: savedDrafts.length,
        scheduled: scheduledCount,
        drafts: savedDrafts,
      },
    });
  } catch (err) {
    console.error("一括生成エラー:", err);
    return NextResponse.json(
      { error: "一括生成に失敗しました" },
      { status: 500 }
    );
  }
}

function parseThreadPosts(responseText: string): string[] {
  try {
    let jsonStr = responseText;
    const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim();
    } else {
      const arrayMatch = responseText.match(/\[[\s\S]*\]/);
      if (arrayMatch) jsonStr = arrayMatch[0];
    }
    const parsed = JSON.parse(jsonStr) as string[];
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : [];
  } catch {
    return [];
  }
}
