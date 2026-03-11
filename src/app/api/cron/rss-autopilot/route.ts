/**
 * RSS自動投稿パイプライン Cronジョブ
 * POST /api/cron/rss-autopilot
 *
 * 4時間ごとに実行:
 * 1. 有効なユーザーの設定を取得
 * 2. RSSフィードを取得→rss_articlesに保存
 * 3. AIがトレンド記事をピックアップ
 * 4. スレッド投稿を生成→下書き保存→自動予約
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAllFeeds, DEFAULT_RSS_FEEDS, type RSSFeed } from "@/lib/rss/parser";
import { buildPostPrompt } from "@/lib/prompt-engine";
import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 120;

interface AutoPostSetting {
  id: string;
  profile_id: string;
  is_enabled: boolean;
  account_id: string | null;
  posts_per_cycle: number;
  schedule_delay_minutes: number;
  rss_feeds: RSSFeed[] | null;
}

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "認証エラー" }, { status: 401 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY未設定" }, { status: 503 });
  }

  const admin = createAdminClient();
  const stats = { users_processed: 0, articles_saved: 0, drafts_created: 0, posts_scheduled: 0 };

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
  stats: { users_processed: number; articles_saved: number; drafts_created: number; posts_scheduled: number }
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

  // 4. 未使用記事を取得
  const { data: unusedArticles } = await admin
    .from("rss_articles")
    .select("*")
    .eq("profile_id", setting.profile_id)
    .eq("is_used", false)
    .order("published_at", { ascending: false })
    .limit(30);

  if (!unusedArticles || unusedArticles.length === 0) return;

  // 5. AIがトレンド記事をピックアップ
  const postsPerCycle = setting.posts_per_cycle ?? 1;
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
      const genResponse = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2000,
        messages: [
          {
            role: "user",
            content: `以下のAIニュース記事をもとに、バズりやすいスレッド形式の投稿を生成してください。

記事タイトル: ${article.title}
記事URL: ${article.link}
記事概要: ${article.description ?? ""}
ソース: ${article.source}

重要ルール:
- 投稿1にはこの記事のURL（${article.link}）を必ず含めてください
- ニュースの要点を分かりやすく日本語で解説してください
- JSON文字列配列で返してください`,
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

      // 下書き保存
      const { data: draft, error: draftError } = await admin
        .from("drafts")
        .insert({
          profile_id: setting.profile_id,
          account_id: setting.account_id,
          text: threadPosts[0],
          hashtags: [],
          media_urls: [],
          source: "ai",
          metadata: {
            thread_posts: threadPosts,
            rss_article_id: article.id,
            source_url: article.link,
            rss_source: article.source,
            rss_title: article.title,
          },
          status: "draft",
        })
        .select()
        .single();

      if (draftError || !draft) continue;
      stats.drafts_created++;

      // 予約作成
      const scheduledAt = new Date(
        Date.now() + (setting.schedule_delay_minutes + i * 60) * 60 * 1000
      );

      const { error: scheduleError } = await admin
        .from("scheduled_posts")
        .insert({
          draft_id: draft.id,
          account_id: setting.account_id,
          scheduled_at: scheduledAt.toISOString(),
          status: "pending",
        });

      if (!scheduleError) {
        stats.posts_scheduled++;
        await admin
          .from("drafts")
          .update({ status: "scheduled" })
          .eq("id", draft.id);
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
