/**
 * RSS自動投稿パイプライン Cronジョブ
 * GET /api/cron/rss-autopilot (Vercel Cron)
 *
 * 5回/日 (JST 4:00, 8:00, 12:00, 16:00, 20:00) 実行
 * 各サイクル: 実行1時間後から2スロット（1時間間隔）に投稿予約
 *
 * フロー:
 * 1. RSS取得 → rss_articles 保存
 * 2. 英語記事10件をBrave Searchにかけ日本語記事の有無を確認
 * 3. 過去30日の投稿と重複チェック → 重複記事を除外
 * 4. AIが4件以上をバズり基準で全選出
 * 5. スレッド投稿を生成（フック→要点→深掘り→まとめ構造）
 * 6. status:pending_approval で下書き保存（scheduled_posts には未登録）
 * 7. Discord DM 1通に全件まとめて送信（各投稿に時間スロット表示）
 * 8. auto_post_batchesに記録 → confirm-autopilot cronが✅後に予約登録
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAllFeeds, DEFAULT_RSS_FEEDS, type RSSFeed } from "@/lib/rss/parser";
import { translateUntranslatedArticles } from "@/lib/rss/translate";
import { buildPostPrompt } from "@/lib/prompt-engine";
import { fetchUrlContent, detectUrlType } from "@/lib/url-fetcher";
import Anthropic from "@anthropic-ai/sdk";
import { sendBatchApprovalDM, type BatchDraftPreview } from "@/lib/discord-notify";
import { searchJapaneseArticle } from "@/lib/brave-search";
import {
  getRecentPostTitles,
  getRecentThreadsPostTexts,
  filterDuplicatesWithPostedTexts,
} from "@/lib/duplicate-checker";
import { downloadAndUploadImages } from "@/lib/media-uploader";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 300;

const JST_OFFSET = 9 * 60 * 60 * 1000;
const MIN_PICKS = 2;
const BRAVE_SEARCH_LIMIT = 10;

/**
 * 実行時刻（JST）に応じてサイクルのスロット開始時間を決定
 * 5回/日: JST 4:00→5,6 / 8:00→9,10 / 12:00→13,14 / 16:00→17,18 / 20:00→21,22
 * それ以外 → auto_post_settingsの設定に従う（フォールバック）
 */
function getCycleSlots(nowJstHour: number): number[] | null {
  // 5回/日 cron: JST 4:00, 8:00, 12:00, 16:00, 20:00
  // 各サイクルは実行の1時間後から2スロット（1時間間隔）
  if (nowJstHour >= 3 && nowJstHour < 6) {
    // JST 4時実行 → 5, 6時
    return [5, 6];
  }
  if (nowJstHour >= 7 && nowJstHour < 10) {
    // JST 8時実行 → 9, 10時
    return [9, 10];
  }
  if (nowJstHour >= 11 && nowJstHour < 14) {
    // JST 12時実行 → 13, 14時
    return [13, 14];
  }
  if (nowJstHour >= 15 && nowJstHour < 18) {
    // JST 16時実行 → 17, 18時
    return [17, 18];
  }
  if (nowJstHour >= 19 && nowJstHour < 22) {
    // JST 20時実行 → 21, 22時
    return [21, 22];
  }
  return null; // フォールバック: 設定値を使用
}

/**
 * サイクルスロット配列から仮予定スロットを生成
 * 24時(0時)は翌日0時として計算
 */
function calcCyclePreviewSlots(
  slotHours: number[],
  baseDate: Date
): Array<{ slotLabel: string; slotTime: Date }> {
  const nowJst = new Date(baseDate.getTime() + JST_OFFSET);
  const year = nowJst.getUTCFullYear();
  const month = nowJst.getUTCMonth();
  const date = nowJst.getUTCDate();

  return slotHours.map((hour) => {
    // 0時は翌日
    const dayOffset = hour === 0 ? 1 : 0;
    const targetDate = new Date(Date.UTC(year, month, date + dayOffset, hour, 0, 0));
    const slotUtc = new Date(targetDate.getTime() - JST_OFFSET);

    const displayHour = hour === 0 ? "24" : String(hour).padStart(2, "0");
    const dayLabel = dayOffset === 1 ? "明日" : "今日";
    const slotLabel = `${dayLabel} ${displayHour}:00`;

    return { slotLabel, slotTime: slotUtc };
  });
}

/**
 * フォールバック用: 設定値ベースの仮スロット計算（DBなし）
 */
function calcFallbackPreviewSlots(
  count: number,
  startHour: number,
  endHour: number,
  intervalMinutes: number,
  baseDate: Date
): Array<{ slotLabel: string; slotTime: Date }> {
  const now = baseDate;
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
  const now = new Date();

  for (const setting of settings as AutoPostSetting[]) {
    try {
      await processUser(admin, anthropic, setting, stats, now);
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
  stats: { users_processed: number; articles_saved: number; drafts_created: number; batches_sent: number },
  now: Date
) {
  stats.users_processed++;

  // RSS取得
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

  // 過去48時間の使用済み記事をリセット（同日複数回実行時も新鮮な記事を使えるよう）
  const twoDaysAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString();
  await admin
    .from("rss_articles")
    .update({ is_used: false })
    .eq("profile_id", setting.profile_id)
    .eq("is_used", true)
    .gte("published_at", twoDaysAgo);

  // JST当日0:00基準で記事取得、不足なら過去48時間まで遡る
  const nowJst = new Date(now.getTime() + JST_OFFSET);
  const todayStartJst = new Date(Date.UTC(
    nowJst.getUTCFullYear(), nowJst.getUTCMonth(), nowJst.getUTCDate(), 0, 0, 0
  ));
  const todayStartUtc = new Date(todayStartJst.getTime() - JST_OFFSET);
  const twoDaysAgoUtc = new Date(todayStartUtc.getTime() - 24 * 60 * 60 * 1000);

  let { data: unusedArticles } = await admin
    .from("rss_articles")
    .select("*")
    .eq("profile_id", setting.profile_id)
    .eq("is_used", false)
    .gte("published_at", todayStartUtc.toISOString())
    .order("published_at", { ascending: false })
    .limit(30);

  if (!unusedArticles || unusedArticles.length < 10) {
    const { data: fallback } = await admin
      .from("rss_articles")
      .select("*")
      .eq("profile_id", setting.profile_id)
      .eq("is_used", false)
      .gte("published_at", twoDaysAgoUtc.toISOString())
      .order("published_at", { ascending: false })
      .limit(30);
    if (fallback && fallback.length > (unusedArticles?.length ?? 0)) {
      unusedArticles = fallback;
      console.log(`当日記事不足のため過去48時間分を取得: ${fallback.length}件`);
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

  let articlesWithJa = searchResults
    .filter(
      (r): r is PromiseFulfilledResult<ArticleWithJa> =>
        r.status === "fulfilled" && r.value !== null
    )
    .map((r) => r.value);

  if (articlesWithJa.length === 0) {
    console.log("日本語記事が見つかった記事が0件のため処理終了");
    return;
  }

  // 過去30日の投稿タイトルを取得して重複チェック（DBタイトル + Threads実投稿テキスト）
  const recentTitles = await getRecentPostTitles(admin, setting.profile_id, 30);

  // Threads アカウントのアクセストークンを取得して実投稿テキストも重複チェックに使う
  const { data: accountRow } = await admin
    .from("social_accounts")
    .select("platform, access_token")
    .eq("id", setting.account_id)
    .single();

  const threadsAccessToken =
    accountRow?.platform === "threads" && accountRow?.access_token
      ? (accountRow.access_token as string)
      : null;

  const recentPostedTexts = await getRecentThreadsPostTexts(threadsAccessToken, 30);
  if (recentPostedTexts.length > 0) {
    console.log(`Threads実投稿から${recentPostedTexts.length}件を重複チェックに追加`);
  }

  const beforeCount = articlesWithJa.length;
  articlesWithJa = filterDuplicatesWithPostedTexts(
    articlesWithJa,
    recentTitles,
    recentPostedTexts
  ) as ArticleWithJa[];
  const removedCount = beforeCount - articlesWithJa.length;
  if (removedCount > 0) {
    console.log(`重複チェック: ${removedCount}件を除外、残り${articlesWithJa.length}件`);
  }

  if (articlesWithJa.length < MIN_PICKS) {
    console.log(`日本語記事（重複除外後）が${articlesWithJa.length}件のみ。最低${MIN_PICKS}件必要なためスキップ`);
    return;
  }

  console.log(`日本語記事あり（重複除外後）: ${articlesWithJa.length}件`);

  // AIが「バズりそうな記事を全て選出」（最低MIN_PICKS件）
  const articlesList = articlesWithJa
    .map(
      (a, i) =>
        `${i + 1}. [${a.source}] ${a.title}\n   日本語記事: ${a.jaArticle.title}\n   URL: ${a.link}`
    )
    .join("\n\n");

  // 過去投稿タイトルを選定プロンプトに含めて重複回避を強化
  const recentTitlesSummary = recentTitles.length > 0
    ? `\n\n【除外条件】以下のトピックと内容がかぶる記事は選ばないこと:\n${recentTitles.slice(0, 20).join("\n")}`
    : "";

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

${articlesList}${recentTitlesSummary}`,
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

  // アカウント情報（platform）は重複チェック時に取得済みの accountRow を再利用
  const platform = (accountRow?.platform as "threads" | "x") ?? "threads";
  const systemPrompt = buildPostPrompt({ platform, threadCount: 4 });

  // 実行時刻に応じてサイクルスロットを決定
  const nowJstHour = nowJst.getUTCHours();
  const cycleSlots = getCycleSlots(nowJstHour);

  let previewSlots: Array<{ slotLabel: string; slotTime: Date }>;
  if (cycleSlots) {
    previewSlots = calcCyclePreviewSlots(cycleSlots, now);
    console.log(`サイクルスロット（JST ${nowJstHour}時実行）: ${previewSlots.map(s => s.slotLabel).join(", ")}`);
  } else {
    previewSlots = calcFallbackPreviewSlots(
      pickedArticles.length,
      setting.schedule_start_hour ?? 8,
      setting.schedule_end_hour ?? 22,
      setting.schedule_interval_minutes ?? 60,
      now
    );
    console.log(`フォールバックスロット使用（JST ${nowJstHour}時実行）`);
  }

  // 各記事についてスレッド投稿を生成→下書き保存（pending_approval）
  const createdDraftIds: string[] = [];
  const batchPreviews: BatchDraftPreview[] = [];

  for (let i = 0; i < pickedArticles.length; i++) {
    const article = pickedArticles[i];
    const jaArticle = article.jaArticle;
    const slot = previewSlots[i] ?? previewSlots[previewSlots.length - 1] ?? {
      slotLabel: `${i + 1}番目`,
      slotTime: new Date(now.getTime() + (i + 1) * 60 * 60 * 1000),
    };

    try {
      // 記事本文・OG画像を取得
      // X投稿URLの場合はX API v2でスレッド全文+実際の画像URLを取得
      let articleBody = "";
      let rawMediaUrls: string[] = [];
      let xThreadTexts: string[] | undefined;

      try {
        const urlType = detectUrlType(article.link);
        const fetched = await fetchUrlContent(article.link);
        articleBody = fetched.text?.slice(0, 3000) ?? "";
        rawMediaUrls = fetched.mediaUrls ?? [];

        // X投稿のスレッド全文が取得できた場合は記事本文に補完
        if (urlType.type === "x" && fetched.xThreadTexts && fetched.xThreadTexts.length > 1) {
          xThreadTexts = fetched.xThreadTexts;
          // スレッド全文をarticleBodyにも追加（AIプロンプトの情報源として使用）
          articleBody = fetched.xThreadTexts
            .slice(0, 5) // 最大5投稿分
            .join("\n---\n")
            .slice(0, 3000);
        }
      } catch { /* フェッチ失敗時はdescriptionのみで生成 */ }

      // 画像をSupabase Storageにアップロード（外部URLのまま使うと403になるリスクを排除）
      // まず仮のdraft_idを使い、保存後に正式なIDに置き換える
      const tempDraftId = `tmp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      let uploadedMediaUrls: string[] = rawMediaUrls;
      if (rawMediaUrls.length > 0) {
        try {
          uploadedMediaUrls = await downloadAndUploadImages(rawMediaUrls, tempDraftId);
        } catch {
          // アップロード失敗は元のURLをフォールバックとして使用
          uploadedMediaUrls = rawMediaUrls;
        }
      }

      // スレッド構造強化プロンプト
      // X投稿ソースの場合はスレッド全文の構造を保持するよう指示を追加
      const isXSource = detectUrlType(article.link).type === "x";
      const xThreadContext = xThreadTexts && xThreadTexts.length > 1
        ? `\n## 元スレッド全文（${xThreadTexts.length}投稿）\n${xThreadTexts.map((t, i) => `投稿${i + 1}: ${t}`).join("\n\n")}`
        : "";

      const genResponse = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 3000,
        messages: [
          {
            role: "user",
            content: `以下の記事をもとに、バズりやすいThreadsスレッド投稿を生成してください。

## 元記事情報
タイトル: ${article.title}
URL: ${article.link}
概要: ${article.description ?? "なし"}
ソース: ${article.source}
${jaArticle ? `\n## 日本語記事\nタイトル: ${jaArticle.title}\nURL: ${jaArticle.url}` : ""}
${articleBody && !xThreadContext ? `\n## 記事本文（抜粋）\n${articleBody}` : ""}${xThreadContext}

## スレッド構造（必ずこの順番で）
**投稿1（フック）**: 読者が思わず止まる衝撃的な1〜2行 + 改行 + 日本語記事URL${jaArticle ? `（${jaArticle.url}）` : `（${article.link}）`}
**投稿2（要点）**: ①②③形式のリスト。具体的な数字・固有名詞・新事実を必ず含める（300〜400字）
**投稿3（深掘り）**: なぜこれが重要か・業界への影響・日本市場への示唆（300〜450字）
**投稿4（まとめ）**: 読者への問いかけ or 行動提案（200字以内・省略可）
${isXSource && xThreadTexts && xThreadTexts.length > 1 ? "\n※ 元スレッドの構造（各投稿の話の流れ）を保持して日本語に再構成すること" : ""}

## 重要ルール
- 元記事の情報だけで終わらせず、関連する最新動向・背景・具体的な数字を補完すること
- 「〜です」「〜ます」ではなく体言止めや「〜だ」調のカジュアルなトーン
- AI的な紋切り型表現（「〜の世界」「まさに」「革命」）は禁止
- 情報源・元記事URLは投稿1にのみ記載（他の投稿には不要）
- JSON文字列配列で返してください（例: ["投稿1テキスト", "投稿2テキスト", ...]）`,
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

      // 全てのアップロード済みメディアURLを使用
      const mediaUrls: string[] = uploadedMediaUrls.filter(Boolean);

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
            ...(xThreadTexts && xThreadTexts.length > 1 ? { x_thread_texts: xThreadTexts, x_thread_count: xThreadTexts.length } : {}),
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
        threadPosts,
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

  // auto_post_batchesテーブルに記録（各投稿のDiscordメッセージIDも保存）
  const previewSlotsJson = batchPreviews.map((p) => ({
    draft_id: p.draftId,
    slot_label: p.slotLabel,
    slot_time: p.slotTime.toISOString(),
    discord_message_id: batchResult.draftMessageMap[p.draftId] ?? null,
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
  console.log(`バッチ送信完了: ${createdDraftIds.length}件, MessageID: ${batchResult.messageId}`);
}
