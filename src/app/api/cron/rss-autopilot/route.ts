/**
 * RSS自動投稿パイプライン Cronジョブ
 * GET /api/cron/rss-autopilot (Vercel Cron)
 *
 * 4時間ごとに実行（JST 8/12/16/20時）:
 * 1. 有効なユーザーの設定を取得
 * 2. RSSフィードを取得→rss_articlesに保存
 * 3. 英語記事10件をBrave Searchにかけ日本語記事の有無を確認
 * 4. 日本語記事がある記事からAIが4件以上を選出
 * 5. スレッド投稿を生成→status:pending_approvalで下書き保存（scheduled_postsには登録しない）
 * 6. Discord DM 1通に全件まとめて送信（各投稿に仮スロット時刻を表示）
 * 7. auto_post_batchesテーブルに記録 → confirm-autopilot cronが✅リアクション後に予約登録
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAllFeeds, DEFAULT_RSS_FEEDS, type RSSFeed } from "@/lib/rss/parser";
import { translateUntranslatedArticles } from "@/lib/rss/translate";
import { buildPostPrompt } from "@/lib/prompt-engine";
import { fetchUrlContent } from "@/lib/url-fetcher";
import Anthropic from "@anthropic-ai/sdk";
import { sendBatchApprovalDM, type BatchDraftPreview } from "@/lib/discord-notify";
import { searchJapaneseArticle } from "@/lib/brave-search";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 300;

const JST_OFFSET = 9 * 60 * 60 * 1000;
const MIN_PICKS = 4;
const BRAVE_SEARCH_LIMIT = 10;

/**
 * 仮スロット時刻を計算する（DBを参照せず、現在時刻から順番に割り当てる）
 * 承認前のDM表示用。実際の登録はconfirm-autopilot cronが行う。
 */
function calcPreviewSlots(
  count: number,
  startHour: number,
  endHour: number,
  intervalMinutes: number
): Array<{ slotLabel: string; slotTime: Date }> {
  const now = new Date();
  const nowJst = new Date(now.getTime() + JST_OFFSET);

  const slots: Array<{ slotLabel: string; slotTime: Date }> = [];

  for (let dayOffset = 0; dayOffset <= 3 && slots.length < count; dayOffset++) {
    const checkDate = new Date(nowJst.getTime() + dayOffset * 24 * 60 * 60 * 1000);
    const year = checkDate.getUTCFullYear();
    const month = checkDate.getUTCMonth();
    const date = checkDate.getUTCDate();

    for (let hour = startHour; hour < endHour && slots.length < count; hour++) {
      for (let min = 0; min < 60 && slots.length < count; min += intervalMinutes) {
        const slotJst = new Date(Date.UTC(year, month, date, hour, min, 0));
        const slotUtc = new Date(slotJst.getTime() - JST_OFFSET);
        if (slotUtc <= now) continue;

        const dayLabel = dayOffset === 0 ? "今日" : dayOffset === 1 ? "明日" : `${date}日`;
        const slotLabel = `${dayLabel} ${String(hour).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
        slots.push({ slotLabel, slotTime: slotUtc });
      }
    }
  }

  return slots;
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
  const stats = { users_processed: 0, articles_saved: 0, drafts_created: 0, batches_sent: 0 };

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
  stats: { users_processed: number; articles_saved: number; drafts_created: number; batches_sent: number }
) {
  stats.users_processed++;

  const feeds: RSSFeed[] =
    setting.rss_feeds && setting.rss_feeds.length > 0
      ? setting.rss_feeds
      : DEFAULT_RSS_FEEDS;

  const articles = await fetchAllFeeds(feeds);
  if (articles.length === 0) return;

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

  await translateUntranslatedArticles(admin, setting.profile_id, anthropic);

  // 当日JST 0:00を起点に記事を取得。当日記事が足りなければ昨日まで遡る
  const nowJst = new Date(Date.now() + JST_OFFSET);
  const todayStartJst = new Date(Date.UTC(
    nowJst.getUTCFullYear(), nowJst.getUTCMonth(), nowJst.getUTCDate(), 0, 0, 0
  ));
  const todayStartUtc = new Date(todayStartJst.getTime() - JST_OFFSET);

  let { data: unusedArticles } = await admin
    .from("rss_articles")
    .select("*")
    .eq("profile_id", setting.profile_id)
    .eq("is_used", false)
    .gte("published_at", todayStartUtc.toISOString())
    .order("published_at", { ascending: false })
    .limit(30);

  // 当日記事が10件未満の場合は昨日まで遡って補完
  if (!unusedArticles || unusedArticles.length < 10) {
    const yesterdayStartUtc = new Date(todayStartUtc.getTime() - 24 * 60 * 60 * 1000);
    const { data: fallbackArticles } = await admin
      .from("rss_articles")
      .select("*")
      .eq("profile_id", setting.profile_id)
      .eq("is_used", false)
      .gte("published_at", yesterdayStartUtc.toISOString())
      .order("published_at", { ascending: false })
      .limit(30);
    if (fallbackArticles && fallbackArticles.length > (unusedArticles?.length ?? 0)) {
      unusedArticles = fallbackArticles;
      console.log(`当日記事不足のため昨日分も含めて取得: ${fallbackArticles.length}件`);
    }
  }

  if (!unusedArticles || unusedArticles.length === 0) return;

  // 英語記事を最大10件に絞り、並列でBrave Searchして日本語記事の有無を確認
  const englishArticles = unusedArticles
    .filter((a) => /^[a-zA-Z0-9\s.,!?'"()\-:;]+$/.test((a.title ?? "").slice(0, 50)))
    .slice(0, BRAVE_SEARCH_LIMIT);

  type ArticleWithJa = (typeof unusedArticles)[number] & {
    jaArticle: { url: string; title: string };
  };

  const searchResults = await Promise.allSettled(
    englishArticles.map(async (article) => {
      const ja = await searchJapaneseArticle(article.title, article.source);
      if (!ja) return null;
      return { ...article, jaArticle: ja } as ArticleWithJa;
    })
  );

  const articlesWithJa = searchResults
    .filter(
      (r): r is PromiseFulfilledResult<ArticleWithJa> =>
        r.status === "fulfilled" && r.value !== null
    )
    .map((r) => r.value);

  if (articlesWithJa.length < MIN_PICKS) {
    console.log(`日本語記事が${articlesWithJa.length}件のみ。最低${MIN_PICKS}件必要なためスキップ`);
    return;
  }

  console.log(`日本語記事あり: ${articlesWithJa.length}件 / ${englishArticles.length}件`);

  // AIが「バズりそうな記事を全て選出」（最低MIN_PICKS件）
  const articlesList = articlesWithJa
    .map(
      (a, i) =>
        `${i + 1}. [${a.source}] ${a.title}\n   日本語記事: ${a.jaArticle.title}\n   URL: ${a.link}`
    )
    .join("\n\n");

  const pickResponse = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 500,
    messages: [
      {
        role: "user",
        content: `以下のAIニュース記事から、Threadsでバズりそうな記事を全て選んでください。
最低${MIN_PICKS}件は必ず選ぶこと（最大${articlesWithJa.length}件）。
選定基準: 話題性・インパクト・新規性・日本のAI界隈が盛り上がりそうなもの。

番号をJSON配列で返してください。例: [1, 2, 4, 5, 7]

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
    .map((i) => articlesWithJa[i - 1])
    .filter(Boolean);

  if (pickedArticles.length < MIN_PICKS) {
    console.log(`AIが選出した記事が${pickedArticles.length}件のみ。最低${MIN_PICKS}件必要なためスキップ`);
    return;
  }

  console.log(`AIが選出: ${pickedArticles.length}件`);

  // アカウント情報を取得
  const { data: account } = await admin
    .from("social_accounts")
    .select("platform")
    .eq("id", setting.account_id)
    .single();

  const platform = (account?.platform as "threads" | "x") ?? "threads";
  const systemPrompt = buildPostPrompt({ platform, threadCount: 4 });

  // 仮スロット時刻を計算（DMに表示する用）
  const previewSlots = calcPreviewSlots(
    pickedArticles.length,
    setting.schedule_start_hour ?? 8,
    setting.schedule_end_hour ?? 22,
    setting.schedule_interval_minutes ?? 60
  );

  // 各記事についてスレッド投稿を生成→下書き保存（pending_approval）
  const createdDraftIds: string[] = [];
  const batchPreviews: BatchDraftPreview[] = [];

  for (let i = 0; i < pickedArticles.length; i++) {
    const article = pickedArticles[i];
    const jaArticle = article.jaArticle;
    const slot = previewSlots[i] ?? { slotLabel: `${i + 1}番目`, slotTime: new Date() };

    try {
      let articleBody = "";
      let ogImageUrl = "";
      try {
        const fetched = await fetchUrlContent(article.link);
        articleBody = fetched.text?.slice(0, 3000) ?? "";
        ogImageUrl = fetched.mediaUrls?.[0] ?? "";
      } catch { /* フェッチ失敗時はdescriptionのみで生成 */ }

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
1. **投稿1の冒頭**に${jaArticle ? `以下の日本語記事URLを配置してください: ${jaArticle.url}` : `URLを配置してください: ${article.link}`}
2. 元記事の情報だけで終わらせず、関連する最新動向・背景・具体的な数字・業界への影響を補完し、情報密度の高い投稿にしてください
3. 情報量が多い場合は投稿2以降を400-500字の長文解説にしてください
4. 日本語で、分かりやすく解説
5. JSON文字列配列で返してください（例: ["投稿1", "投稿2", ...]）`,
          },
        ],
        system: systemPrompt,
      });

      const responseText =
        genResponse.content[0].type === "text" ? genResponse.content[0].text : "";
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

      // 下書き保存（pending_approval: まだカレンダーには登録しない）
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
            preview_slot: slot.slotTime.toISOString(),
            ...(jaArticle ? { ja_article_url: jaArticle.url, ja_article_title: jaArticle.title } : {}),
          },
          status: "pending_approval",
        })
        .select()
        .single();

      if (draftError || !draft) continue;

      stats.drafts_created++;
      createdDraftIds.push(draft.id);

      batchPreviews.push({
        draftId: draft.id,
        articleTitle: jaArticle?.title ?? article.title,
        firstPost: threadPosts[0],
        jaArticleUrl: jaArticle?.url,
        slotLabel: slot.slotLabel,
        slotTime: slot.slotTime,
      });

      // 記事を使用済みに
      await admin
        .from("rss_articles")
        .update({ is_used: true })
        .eq("id", article.id);
    } catch (err) {
      console.error(`RSS生成エラー [${article.title}]:`, err);
    }
  }

  if (createdDraftIds.length === 0) return;

  // Discord DM 1通に全件まとめて送信
  const batchResult = await sendBatchApprovalDM(
    batchPreviews,
    process.env.NEXT_PUBLIC_APP_URL
  ).catch((err) => {
    console.error("バッチDM通知エラー:", err);
    return null;
  });

  if (!batchResult) {
    console.warn("DM送信失敗。バッチレコードを保存せずに終了");
    return;
  }

  // auto_post_batchesテーブルに記録
  const previewSlotsJson = batchPreviews.map((p) => ({
    draft_id: p.draftId,
    slot_label: p.slotLabel,
    slot_time: p.slotTime.toISOString(),
  }));

  await admin.from("auto_post_batches").insert({
    profile_id: setting.profile_id,
    account_id: setting.account_id,
    discord_channel_id: batchResult.channelId,
    discord_message_id: batchResult.messageId,
    draft_ids: createdDraftIds,
    preview_slots: previewSlotsJson,
    status: "waiting",
  });

  stats.batches_sent++;
  console.log(`バッチ送信完了: ${createdDraftIds.length}件の下書き, MessageID: ${batchResult.messageId}`);
}
