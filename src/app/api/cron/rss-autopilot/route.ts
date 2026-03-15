/**
 * RSS自動投稿パイプライン Cronジョブ
 * GET /api/cron/rss-autopilot (Vercel Cron)
 *
 * 4時間ごとに実行:
 * 1. 有効なユーザーの設定を取得
 * 2. RSSフィードを取得→rss_articlesに保存
 * 3. AIがトレンド記事をピックアップ
 * 4. スレッド投稿を生成→下書き保存→scheduled_postsに自動予約
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

/**
 * 次の空き投稿スロット時間を計算する
 * - start_hour〜end_hour の範囲内で interval_minutes 間隔のスロットを順番に確認
 * - 既に scheduled_posts に予約済みのスロットはスキップ
 * - 今日の空きがなければ翌日の最初のスロット
 */
async function calcNextSlot(
  admin: ReturnType<typeof createAdminClient>,
  accountId: string,
  startHour: number,
  endHour: number,
  intervalMinutes: number
): Promise<Date> {
  // JST オフセット（UTC+9）
  const JST_OFFSET = 9 * 60 * 60 * 1000;
  const now = new Date();
  const nowJst = new Date(now.getTime() + JST_OFFSET);

  // 既存の予約スロットを取得（今日〜2日後まで）
  const fromDate = new Date(now);
  const toDate = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
  const { data: existingPosts } = await admin
    .from("scheduled_posts")
    .select("scheduled_at")
    .eq("account_id", accountId)
    .in("status", ["pending", "processing"])
    .gte("scheduled_at", fromDate.toISOString())
    .lte("scheduled_at", toDate.toISOString());

  const occupiedTimes = new Set(
    (existingPosts ?? []).map((p) => {
      const d = new Date(p.scheduled_at);
      const dJst = new Date(d.getTime() + JST_OFFSET);
      return `${dJst.getUTCFullYear()}-${dJst.getUTCMonth()}-${dJst.getUTCDate()}-${dJst.getUTCHours()}-${Math.floor(dJst.getUTCMinutes() / intervalMinutes) * intervalMinutes}`;
    })
  );

  // 今日から2日分のスロットを順番に確認
  for (let dayOffset = 0; dayOffset <= 1; dayOffset++) {
    const checkDate = new Date(nowJst.getTime() + dayOffset * 24 * 60 * 60 * 1000);
    const year = checkDate.getUTCFullYear();
    const month = checkDate.getUTCMonth();
    const date = checkDate.getUTCDate();

    for (let hour = startHour; hour < endHour; hour++) {
      for (let min = 0; min < 60; min += intervalMinutes) {
        // 過去のスロットはスキップ
        const slotJst = new Date(Date.UTC(year, month, date, hour, min, 0));
        const slotUtc = new Date(slotJst.getTime() - JST_OFFSET);
        if (slotUtc <= now) continue;

        const slotKey = `${year}-${month}-${date}-${hour}-${min}`;
        if (!occupiedTimes.has(slotKey)) {
          return slotUtc;
        }
      }
    }
  }

  // フォールバック: 翌日の startHour
  const tomorrow = new Date(nowJst.getTime() + 24 * 60 * 60 * 1000);
  const fallbackJst = new Date(Date.UTC(
    tomorrow.getUTCFullYear(),
    tomorrow.getUTCMonth(),
    tomorrow.getUTCDate(),
    startHour, 0, 0
  ));
  return new Date(fallbackJst.getTime() - JST_OFFSET);
}

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
        } catch { /* 検索失敗時はスキップ */ }

        // 日本語記事が見つからない英語記事はスキップ
        if (!jaArticle) {
          console.log(`日本語記事未発見のためスキップ: ${article.title}`);
          continue;
        }
      }

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
1. **投稿1の冒頭**に${jaArticle ? `以下の日本語記事URLを配置してください: ${jaArticle.url}\n   （日本語記事タイトル: ${jaArticle.title}）` : `URLを配置してください: ${article.link}`}
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

      // 下書き保存（scheduled: 予約投稿として保存）
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
            ...(jaArticle ? { ja_article_url: jaArticle.url, ja_article_title: jaArticle.title } : {}),
          },
          status: "scheduled",
        })
        .select()
        .single();

      if (draftError || !draft) continue;
      stats.drafts_created++;

      // 次の空き投稿スロットを計算して scheduled_posts に登録
      const scheduledAt = await calcNextSlot(
        admin,
        setting.account_id!,
        setting.schedule_start_hour ?? 8,
        setting.schedule_end_hour ?? 22,
        setting.schedule_interval_minutes ?? 60
      );

      await admin.from("scheduled_posts").insert({
        draft_id: draft.id,
        account_id: setting.account_id,
        scheduled_at: scheduledAt.toISOString(),
        status: "pending",
      });

      // Discord DM で予約確認を通知
      await sendApprovalDM({
        draftId: draft.id,
        threadPosts,
        articleTitle: article.title,
        sourceUrl: jaArticle?.url ?? article.link,
        appUrl: process.env.NEXT_PUBLIC_APP_URL,
        scheduledAt,
      }).catch((err) => console.error("DM通知エラー:", err));

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
