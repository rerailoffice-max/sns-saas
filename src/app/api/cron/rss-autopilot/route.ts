/**
 * RSS + X Trending 自動投稿パイプライン Cronジョブ
 * GET /api/cron/rss-autopilot (Vercel Cron)
 *
 * 1日5回実行（JST 4:00, 8:00, 12:00, 16:00, 20:00）
 * 各回2スロットに投稿予約
 *
 * フロー:
 * 1. RSS取得 → rss_articles 保存
 * 2. X trending取得（主要AIアカウントのバズ投稿）→ rss_articles 保存
 * 3. RSS記事: Brave Searchで日本語記事の有無を確認
 *    X記事: 日本語記事検索スキップ（直接パイプラインへ）
 * 4. 過去30日の投稿と重複チェック → 重複記事を除外
 * 5. AIがバズり基準で選出（インフルエンサー優先）
 * 6. スレッド投稿を生成（フック→要点→深掘り→まとめ構造）
 * 7. status:pending_approval で下書き保存
 * 8. Discord DM に全件送信（各投稿に✅❌リアクション）
 * 9. auto_post_batchesに記録 → confirm-autopilot cronが✅後に予約登録
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
  getRecentSourceUrls,
} from "@/lib/duplicate-checker";
import { downloadAndUploadImages } from "@/lib/media-uploader";
import { fetchTrendingAIPosts } from "@/lib/x-trending";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 300;

const JST_OFFSET = 9 * 60 * 60 * 1000;
const BRAVE_SEARCH_LIMIT = 10;

/**
 * 実行時刻（JST）に応じてサイクルのスロット開始時間を決定
 * 5回/日: JST 4:00→5,6 / 8:00→9,10 / 12:00→13,14 / 16:00→17,18 / 20:00→21,22
 */
function getCycleSlots(nowJstHour: number): number[] | null {
  if (nowJstHour >= 3 && nowJstHour < 6) return [5, 6];
  if (nowJstHour >= 7 && nowJstHour < 10) return [9, 10];
  if (nowJstHour >= 11 && nowJstHour < 14) return [13, 14];
  if (nowJstHour >= 15 && nowJstHour < 18) return [17, 18];
  if (nowJstHour >= 19 && nowJstHour < 22) return [21, 22];
  return null;
}

function calcCyclePreviewSlots(
  slotHours: number[],
  baseDate: Date
): Array<{ slotLabel: string; slotTime: Date }> {
  const nowJst = new Date(baseDate.getTime() + JST_OFFSET);
  const year = nowJst.getUTCFullYear();
  const month = nowJst.getUTCMonth();
  const date = nowJst.getUTCDate();

  return slotHours.map((hour) => {
    const dayOffset = hour === 0 ? 1 : 0;
    const targetDate = new Date(Date.UTC(year, month, date + dayOffset, hour, 0, 0));
    const slotUtc = new Date(targetDate.getTime() - JST_OFFSET);
    const displayHour = hour === 0 ? "24" : String(hour).padStart(2, "0");
    const dayLabel = dayOffset === 1 ? "明日" : "今日";
    return { slotLabel: `${dayLabel} ${displayHour}:00`, slotTime: slotUtc };
  });
}

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

  // ── Step 1: RSS取得 ──
  const feeds: RSSFeed[] =
    setting.rss_feeds && setting.rss_feeds.length > 0
      ? setting.rss_feeds
      : DEFAULT_RSS_FEEDS;

  const articles = await fetchAllFeeds(feeds);

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

  // ── Step 2: X trending取得 ──
  let xPostsSaved = 0;
  try {
    const xPosts = await fetchTrendingAIPosts();
    console.log(`X trending: ${xPosts.length}件取得`);

    for (const xPost of xPosts) {
      const { error } = await admin.from("rss_articles").upsert(
        {
          profile_id: setting.profile_id,
          title: xPost.text.slice(0, 200),
          link: xPost.tweet_url,
          description: xPost.text,
          source: `X:@${xPost.author_username}`,
          published_at: xPost.created_at,
          is_used: false,
        },
        { onConflict: "link", ignoreDuplicates: true }
      );
      if (!error) {
        stats.articles_saved++;
        xPostsSaved++;
      }
    }
  } catch (err) {
    console.error("X trending取得エラー:", err);
  }

  await translateUntranslatedArticles(admin, setting.profile_id, anthropic);

  // JST当日0:00基準で記事取得
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

  if (!unusedArticles || unusedArticles.length === 0) {
    console.log("未使用記事0件のため終了");
    return;
  }

  // ── Step 3: 2トラックに分岐 ──
  const xArticles = unusedArticles.filter((a) => (a.source as string)?.startsWith("X:"));
  const rssArticles = unusedArticles.filter((a) => !(a.source as string)?.startsWith("X:"));

  console.log(`未使用記事: RSS ${rssArticles.length}件, X ${xArticles.length}件`);

  // Track A: RSS記事 → Brave Search で日本語記事を検索
  const englishArticles = rssArticles
    .filter((a) => /^[a-zA-Z0-9\s.,!?'"()\-:;]+$/.test((a.title ?? "").slice(0, 50)))
    .slice(0, BRAVE_SEARCH_LIMIT);

  type ArticleCandidate = (typeof unusedArticles)[number] & {
    jaArticle: { url: string; title: string };
    isXSource?: boolean;
  };

  const searchResults = await Promise.allSettled(
    englishArticles.map(async (article) => {
      const ja = await searchJapaneseArticle(article.title, article.source);
      if (!ja) return null;
      return { ...article, jaArticle: ja, isXSource: false } as ArticleCandidate;
    })
  );

  const rssWithJa = searchResults
    .filter(
      (r): r is PromiseFulfilledResult<ArticleCandidate> =>
        r.status === "fulfilled" && r.value !== null
    )
    .map((r) => r.value);

  console.log(`Brave Search: ${englishArticles.length}件中 ${rssWithJa.length}件に日本語記事あり`);

  // Track B: X記事 → Brave Search スキップ、tweet URLをそのまま使用
  const xCandidates: ArticleCandidate[] = xArticles.map((a) => ({
    ...a,
    jaArticle: { url: a.link as string, title: a.title as string },
    isXSource: true,
  }));

  // 両トラックをマージ
  let allCandidates = [...rssWithJa, ...xCandidates];

  if (allCandidates.length === 0) {
    console.log("候補記事0件のため終了");
    return;
  }

  // ── Step 4: 重複チェック ──
  const recentTitles = await getRecentPostTitles(admin, setting.profile_id, 30);

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

  const beforeCount = allCandidates.length;
  allCandidates = filterDuplicatesWithPostedTexts(
    allCandidates,
    recentTitles,
    recentPostedTexts
  ) as ArticleCandidate[];
  const removedCount = beforeCount - allCandidates.length;
  if (removedCount > 0) {
    console.log(`重複チェック: ${removedCount}件除外、残り${allCandidates.length}件`);
  }

  // source_urlベースの完全一致重複チェック（キーワード閾値では漏れるケースを補完）
  const recentSourceUrls = await getRecentSourceUrls(admin, setting.profile_id, 7);
  if (recentSourceUrls.size > 0) {
    const beforeUrlDedup = allCandidates.length;
    allCandidates = allCandidates.filter(
      (a) => !recentSourceUrls.has(a.link as string)
    ) as ArticleCandidate[];
    const urlDedupRemoved = beforeUrlDedup - allCandidates.length;
    if (urlDedupRemoved > 0) {
      console.log(`URL重複チェック: ${urlDedupRemoved}件除外、残り${allCandidates.length}件`);
    }
  }

  // MIN_PICKS: 5回/日なので各回1件以上あればOK
  const minPicks = Math.max(1, Math.min(2, allCandidates.length));

  if (allCandidates.length < minPicks) {
    console.log(`候補${allCandidates.length}件のみ（最低${minPicks}件必要）。スキップ`);
    return;
  }

  // ── Step 5: AI選定 ──
  const articlesList = allCandidates
    .map((a, i) => {
      if (a.isXSource) {
        return `${i + 1}. [${a.source}] ${(a.title as string).slice(0, 150)}\n   URL: ${a.link}`;
      }
      return `${i + 1}. [${a.source}] ${a.title}\n   日本語記事: ${a.jaArticle.title}\n   URL: ${a.link}`;
    })
    .join("\n\n");

  const recentTitlesSummary = recentTitles.length > 0
    ? `\n\n【除外条件】以下のトピックと内容がかぶる記事は選ばないこと:\n${recentTitles.slice(0, 20).join("\n")}`
    : "";

  const pickResponse = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 500,
    messages: [
      {
        role: "user",
        content: `以下のAIニュース記事・X投稿から、Threadsでバズりそうなものを選んでください。
最低${minPicks}件は必ず選ぶこと（最大${allCandidates.length}件）。

## 選定優先度（重要）
1. **最優先: AIインフルエンサーの投稿**（X:@rowancheung, X:@heykahn, X:@_akhaliq, X:@hasantoxr, X:@mattshumer_, X:@omarsar0, X:@AiBreakfast, X:@itsPaulAi, X:@TheRundownAI）
   → 話題性・インパクト・新規性があるものを積極的に選ぶ
2. **公式・創設者の投稿**（X:@OpenAI, X:@AnthropicAI, X:@sama, X:@DarioAmodei 等）
   → **新製品発表・新サービス・新機能のアナウンスのみ**採用
   → 日常の感想・意見・お祝い・採用情報など製品発表以外は除外
3. **RSS記事**（日本語記事あり）
   → インフルエンサー・公式の投稿で十分な場合は優先度を下げてOK

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
    .map((i) => allCandidates[i - 1])
    .filter(Boolean);

  if (pickedArticles.length < minPicks) {
    console.log(`AI選出${pickedArticles.length}件のみ（最低${minPicks}件必要）。スキップ`);
    return;
  }

  console.log(`AI選出: ${pickedArticles.length}件`);

  // アカウント情報
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
  }

  // ── Step 6: スレッド生成 + 下書き保存 ──
  const createdDraftIds: string[] = [];
  const batchPreviews: BatchDraftPreview[] = [];

  for (let i = 0; i < pickedArticles.length; i++) {
    const article = pickedArticles[i];
    const jaArticle = article.jaArticle;
    const isXSource = article.isXSource === true;
    const slot = previewSlots[i] ?? previewSlots[previewSlots.length - 1] ?? {
      slotLabel: `${i + 1}番目`,
      slotTime: new Date(now.getTime() + (i + 1) * 60 * 60 * 1000),
    };

    try {
      let articleBody = "";
      let rawMediaUrls: string[] = [];
      let xThreadTexts: string[] | undefined;

      try {
        const urlType = detectUrlType(article.link as string);
        const fetched = await fetchUrlContent(article.link as string);
        articleBody = fetched.text?.slice(0, 3000) ?? "";
        rawMediaUrls = fetched.mediaUrls ?? [];

        if (urlType.type === "x" && fetched.xThreadTexts && fetched.xThreadTexts.length > 1) {
          xThreadTexts = fetched.xThreadTexts;
          articleBody = fetched.xThreadTexts
            .slice(0, 5)
            .join("\n---\n")
            .slice(0, 3000);
        }
      } catch { /* フェッチ失敗時はdescriptionのみで生成 */ }

      // 画像アップロード
      const tempDraftId = `tmp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      let uploadedMediaUrls: string[] = rawMediaUrls;
      if (rawMediaUrls.length > 0) {
        try {
          uploadedMediaUrls = await downloadAndUploadImages(rawMediaUrls, tempDraftId);
        } catch {
          uploadedMediaUrls = rawMediaUrls;
        }
      }

      // 全てのアップロード済みメディアURLを使用
      const mediaUrls: string[] = uploadedMediaUrls.filter(Boolean);

      const xThreadContext = xThreadTexts && xThreadTexts.length > 1
        ? `\n## 元スレッド全文（${xThreadTexts.length}投稿）\n${xThreadTexts.map((t, idx) => `投稿${idx + 1}: ${t}`).join("\n\n")}`
        : "";

      // X記事とRSS記事でプロンプトを分岐
      let generationPrompt: string;
      if (isXSource) {
        const sourceUrl = article.link as string;
        generationPrompt = `以下のXのバズ投稿をもとに、Threadsでバズりやすいスレッド投稿を生成してください。

## 元投稿情報
投稿者: ${article.source}
URL: ${sourceUrl}
内容: ${article.description ?? article.title}
${articleBody && !xThreadContext ? `\n## 投稿本文\n${articleBody}` : ""}${xThreadContext}

## スレッド構造（必ずこの順番で）
**投稿1（フック）**: 読者が思わず止まる衝撃的な1〜2行 + 改行 + 元投稿URL（${sourceUrl}）
**投稿2（要点）**: ①②③形式のリスト。具体的な数字・固有名詞・新事実を必ず含める（300〜400字）
**投稿3（深掘り）**: なぜこれが重要か・業界への影響・日本市場への示唆（300〜450字）
**投稿4（まとめ）**: 読者への問いかけ or 行動提案（200字以内・省略可）
${xThreadTexts && xThreadTexts.length > 1 ? "\n※ 元スレッドの構造（各投稿の話の流れ）を保持して日本語に再構成すること" : ""}

## 重要ルール
- 元投稿の情報だけで終わらせず、関連する最新動向・背景・具体的な数字を補完すること
- 「〜です」「〜ます」ではなく体言止めや「〜だ」調のカジュアルなトーン
- AI的な紋切り型表現（「〜の世界」「まさに」「革命」）は禁止
- 情報源・元投稿URLは投稿1にのみ記載（他の投稿には不要）
- JSON文字列配列で返してください（例: ["投稿1テキスト", "投稿2テキスト", ...]）`;
      } else {
        const refUrl = jaArticle ? jaArticle.url : (article.link as string);
        generationPrompt = `以下の記事をもとに、バズりやすいThreadsスレッド投稿を生成してください。

## 元記事情報
タイトル: ${article.title}
URL: ${article.link}
概要: ${article.description ?? "なし"}
ソース: ${article.source}
${jaArticle ? `\n## 日本語記事\nタイトル: ${jaArticle.title}\nURL: ${jaArticle.url}` : ""}
${articleBody && !xThreadContext ? `\n## 記事本文（抜粋）\n${articleBody}` : ""}${xThreadContext}

## スレッド構造（必ずこの順番で）
**投稿1（フック）**: 読者が思わず止まる衝撃的な1〜2行 + 改行 + 日本語記事URL（${refUrl}）
**投稿2（要点）**: ①②③形式のリスト。具体的な数字・固有名詞・新事実を必ず含める（300〜400字）
**投稿3（深掘り）**: なぜこれが重要か・業界への影響・日本市場への示唆（300〜450字）
**投稿4（まとめ）**: 読者への問いかけ or 行動提案（200字以内・省略可）
${xThreadTexts && xThreadTexts.length > 1 ? "\n※ 元スレッドの構造（各投稿の話の流れ）を保持して日本語に再構成すること" : ""}

## 重要ルール
- 元記事の情報だけで終わらせず、関連する最新動向・背景・具体的な数字を補完すること
- 「〜です」「〜ます」ではなく体言止めや「〜だ」調のカジュアルなトーン
- AI的な紋切り型表現（「〜の世界」「まさに」「革命」）は禁止
- 情報源・元記事URLは投稿1にのみ記載（他の投稿には不要）
- JSON文字列配列で返してください（例: ["投稿1テキスト", "投稿2テキスト", ...]）`;
      }

      const genResponse = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 3000,
        messages: [{ role: "user", content: generationPrompt }],
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

      // 下書き保存（pending_approval）
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
            is_x_source: isXSource,
            preview_slot: slot.slotTime.toISOString(),
            ...(jaArticle && !isXSource ? { ja_article_url: jaArticle.url, ja_article_title: jaArticle.title } : {}),
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
        articleTitle: isXSource ? (article.title as string).slice(0, 80) : (jaArticle?.title ?? (article.title as string)),
        firstPost: threadPosts[0],
        threadPosts,
        jaArticleUrl: isXSource ? (article.link as string) : jaArticle?.url,
        slotLabel: slot.slotLabel,
        slotTime: slot.slotTime,
      });

      // 記事を使用済みに
      await admin
        .from("rss_articles")
        .update({ is_used: true })
        .eq("id", article.id);
    } catch (err) {
      console.error(`生成エラー [${article.title}]:`, err);
    }
  }

  if (createdDraftIds.length === 0) return;

  // Discord DM に全件まとめて送信（各投稿のメッセージIDも取得）
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
