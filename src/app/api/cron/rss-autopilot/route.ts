/**
 * RSS自動投稿パイプライン Cronジョブ
 * GET /api/cron/rss-autopilot (Vercel Cron)
 *
 * 4時間ごとに実行:
 * 1. 有効なユーザーの設定を取得
 * 2. RSSフィードを取得→rss_articlesに保存
 * 3. AIがトレンド記事をピックアップ
 * 4. スレッド投稿を生成→下書き保存（予約はユーザーが手動で行う）
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAllFeeds, DEFAULT_RSS_FEEDS, type RSSFeed } from "@/lib/rss/parser";
import { translateUntranslatedArticles } from "@/lib/rss/translate";
import { buildPostPrompt } from "@/lib/prompt-engine";
import { fetchUrlContent } from "@/lib/url-fetcher";
import Anthropic from "@anthropic-ai/sdk";
import { sendApprovalDM } from "@/lib/discord-notify";
import { searchJapaneseArticle } from "@/lib/brave-search";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 120;

interface AutoPostSetting {
  id: string;
  profile_id: string;
  is_enabled: boolean;
  account_id: string | null;
  approval_required: boolean;
  schedule_start_hour: number;
  schedule_end_hour: number;
  schedule_interval_minutes: number;
  rss_feeds: RSSFeed[] | null;
  x_accounts: string[] | null;
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "認証エラー" }, { status: 401 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY未設定" }, { status: 503 });
  }

  const admin = createAdminClient();
  const stats = { users_processed: 0, articles_saved: 0, drafts_created: 0 };

  // 1. 有効な自動投稿設定を取得
  const { data: settings, error: settingsError } = await admin
    .from("auto_post_settings")
    .select("*")
    .eq("is_enabled", true)
    .not("account_id", "is", null);

  if (settingsError || !settings || settings.length === 0) {
    return NextResponse.json({ message: "有効な設定がありません", stats });
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  for (const setting of settings as AutoPostSetting[]) {
    try {
      await processUser(admin, anthropic, setting, stats);
    } catch (err) {
      console.error(`RSS autopilot error [${setting.profile_id}]:`, err);
    }
  }

  return NextResponse.json({ message: "完了", stats });
}

async function processUser(
  admin: ReturnType<typeof createAdminClient>,
  anthropic: Anthropic,
  setting: AutoPostSetting,
  stats: { users_processed: number; articles_saved: number; drafts_created: number }
) {
  stats.users_processed++;

  // 2. RSSフィードを取得
  const feeds: RSSFeed[] =
    setting.rss_feeds && setting.rss_feeds.length > 0
      ? setting.rss_feeds
      : DEFAULT_RSS_FEEDS;

  const articles = await fetchAllFeeds(feeds);
  if (articles.length === 0) return;

  // 3. rss_articlesにupsert (link重複スキップ)
  for (const article of articles) {
    const { error } = await admin.from("rss_articles").upsert(
      {
        profile_id: setting.profile_id,
        title: article.title,
        link: article.link,
        description: article.description,
        source: article.source,
        published_at: article.published_at,
        is_used: false,
      },
      { onConflict: "link", ignoreDuplicates: true }
    );
    if (!error) stats.articles_saved++;
  }

  // 3.5. 未翻訳の記事を日本語に一括翻訳
  await translateUntranslatedArticles(admin, setting.profile_id, anthropic);

  // 4. 未使用記事を取得
  const { data: unusedArticles } = await admin
    .from("rss_articles")
    .select("*")
    .eq("profile_id", setting.profile_id)
    .eq("is_used", false)
    .order("published_at", { ascending: false })
    .limit(30);

  if (!unusedArticles || unusedArticles.length === 0) return;

  // 5. AIがトレンド記事をピックアップ（1回1件）
  const postsPerCycle = 1;
  const articlesList = unusedArticles
    .map(
      (a, i) =>
        `${i + 1}. [${a.source}] ${a.title}\n   URL: ${a.link}\n   ${a.description ?? ""}`
    )
    .join("\n\n");

  const pickResponse = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 500,
    messages: [
      {
        role: "user",
        content: `以下のAIニュース記事一覧から、最もバズりそうな記事を${postsPerCycle}件選んでください。
選定基準: 話題性・インパクト・新規性が高いもの。

番号だけをJSON配列で返してください。例: [1, 5]

${articlesList}`,
      },
    ],
  });

  const pickText =
    pickResponse.content[0].type === "text" ? pickResponse.content[0].text : "[]";
  let pickedIndices: number[] = [];
  try {
    const match = pickText.match(/\[[\d,\s]*\]/);
    if (match) pickedIndices = JSON.parse(match[0]) as number[];
  } catch {
    return;
  }

  const pickedArticles = pickedIndices
    .map((i) => unusedArticles[i - 1])
    .filter(Boolean)
    .slice(0, postsPerCycle);

  if (pickedArticles.length === 0) return;

  // 6. アカウント情報を取得
  const { data: account } = await admin
    .from("social_accounts")
    .select("platform")
    .eq("id", setting.account_id)
    .single();

  const platform = (account?.platform as "threads" | "x") ?? "threads";

  const systemPrompt = buildPostPrompt({
    platform,
    threadCount: 4,
  });

  // 7. 各記事についてスレッド投稿を生成→下書き→予約
  for (let i = 0; i < pickedArticles.length; i++) {
    const article = pickedArticles[i];

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

      // Brave Search で日本語記事を検索
      let jaArticle: { url: string; title: string } | null = null;
      if (isEnglish) {
        try {
          jaArticle = await searchJapaneseArticle(article.title, article.source);
        } catch { /* 検索失敗時は英語URLで続行 */ }
      }

      const urlInstruction = jaArticle
        ? `1. **投稿1の冒頭**に以下の日本語記事URLを配置してください: ${jaArticle.url}\n   （日本語記事タイトル: ${jaArticle.title}）`
        : isEnglish
          ? `1. **投稿1の冒頭**に元URLを配置してください: ${article.link}\n   ※海外メディア（${article.source}）の報道として紹介してください`
          : `1. **投稿1の冒頭**にURLを配置してください: ${article.link}`;

      const genResponse = await anthropic.messages.create({
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
ソース: ${article.source}
${jaArticle ? `\n## 日本語記事\nタイトル: ${jaArticle.title}\nURL: ${jaArticle.url}` : ""}
${articleBody ? `\n## 記事本文（抜粋）\n${articleBody}` : ""}

## 重要ルール
${urlInstruction}
2. 元記事の情報だけで終わらせず、あなたの知識から**関連する最新動向・背景・具体的な数字・業界への影響**を補完し、元記事より有益で情報密度の高い投稿にしてください
3. 情報量が多い場合は投稿2以降を400-500字の長文解説にしてください
4. 日本語で、分かりやすく解説
5. JSON文字列配列で返してください（例: ["投稿1", "投稿2", ...]）`,
          },
        ],
        system: systemPrompt,
      });

      const responseText =
        genResponse.content[0].type === "text"
          ? genResponse.content[0].text
          : "";
      let jsonStr = responseText;
      const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1].trim();
      } else {
        const arrayMatch = responseText.match(/\[[\s\S]*\]/);
        if (arrayMatch) jsonStr = arrayMatch[0];
      }

      const threadPosts = JSON.parse(jsonStr) as string[];
      if (!Array.isArray(threadPosts) || threadPosts.length === 0) continue;

      const mediaUrls: string[] = [];
      if (ogImageUrl) mediaUrls.push(ogImageUrl);

      const draftStatus = setting.approval_required ? "pending_approval" : "draft";

      // 下書き保存
      const { data: draft, error: draftError } = await admin
        .from("drafts")
        .insert({
          profile_id: setting.profile_id,
          account_id: setting.account_id,
          text: threadPosts[0],
          hashtags: [],
          media_urls: mediaUrls,
          source: "ai",
          metadata: {
            thread_posts: threadPosts,
            rss_article_id: article.id,
            source_url: article.link,
            rss_source: article.source,
            rss_title: article.title,
            auto_generated: true,
            requires_approval: setting.approval_required,
            ...(jaArticle ? { ja_article_url: jaArticle.url, ja_article_title: jaArticle.title } : {}),
          },
          status: draftStatus,
        })
        .select()
        .single();

      if (draftError || !draft) continue;
      stats.drafts_created++;

      // 承認待ちなら Discord DM で通知
      if (setting.approval_required) {
        await sendApprovalDM({
          draftId: draft.id,
          threadPosts,
          articleTitle: article.title,
          sourceUrl: jaArticle?.url ?? article.link,
          appUrl: process.env.NEXT_PUBLIC_APP_URL,
        }).catch((err) => console.error("DM通知エラー:", err));
      }

      // 記事を使用済みに
      await admin
        .from("rss_articles")
        .update({ is_used: true })
        .eq("id", article.id);
    } catch (err) {
      console.error(`RSS生成エラー [${article.title}]:`, err);
    }
  }
}
