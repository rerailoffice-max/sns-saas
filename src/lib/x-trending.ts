/**
 * X (Twitter) API v2 Recent Search を使って
 * AI関連の主要アカウントからバズ投稿を取得するモジュール
 */

const X_API_BASE = "https://api.x.com/2";

export interface XTrendingPost {
  tweet_id: string;
  text: string;
  author_username: string;
  author_name: string;
  like_count: number;
  retweet_count: number;
  reply_count: number;
  created_at: string;
  tweet_url: string;
  conversation_id: string;
}

/** 公式・創設者アカウント（いいね ≥500 でフィルタ） */
const OFFICIAL_ACCOUNTS = [
  "OpenAI",
  "sama",
  "AnthropicAI",
  "claudeai",
  "DarioAmodei",
  "gdb",
  "ilyasut",
  "ylecun",
  "perplexity_ai",
  "AravSrinivas",
  "ManusAI",
  "OpenAIDevs",
  "OfficialLoganK",
  "DrJimFan",
];

/** AIインフルエンサー（いいね ≥1000 でフィルタ） */
const INFLUENCER_ACCOUNTS = [
  "rowancheung",
  "heykahn",
  "_akhaliq",
  "hasantoxr",
  "mattshumer_",
  "omarsar0",
  "AiBreakfast",
  "itsPaulAi",
  "TheRundownAI",
];

const OFFICIAL_MIN_LIKES = 500;
const INFLUENCER_MIN_LIKES = 1000;

interface XApiTweet {
  id: string;
  text: string;
  author_id: string;
  public_metrics: {
    like_count: number;
    retweet_count: number;
    reply_count: number;
    impression_count?: number;
  };
  created_at: string;
  conversation_id: string;
}

interface XApiUser {
  id: string;
  username: string;
  name: string;
}

interface XApiResponse {
  data?: XApiTweet[];
  includes?: { users?: XApiUser[] };
  meta?: { result_count: number };
  errors?: Array<{ message: string }>;
}

function buildFromQuery(accounts: string[]): string {
  const fromClauses = accounts.map((a) => `from:${a}`).join(" OR ");
  return `(${fromClauses}) -is:retweet -is:reply`;
}

async function searchRecent(
  query: string,
  bearerToken: string,
  maxResults = 20
): Promise<XApiResponse> {
  const url = new URL(`${X_API_BASE}/tweets/search/recent`);
  url.searchParams.set("query", query);
  url.searchParams.set("max_results", String(maxResults));
  url.searchParams.set("sort_order", "relevancy");
  url.searchParams.set(
    "tweet.fields",
    "public_metrics,created_at,author_id,conversation_id"
  );
  url.searchParams.set("expansions", "author_id");
  url.searchParams.set("user.fields", "username,name");

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${bearerToken}` },
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`X API error ${res.status}: ${body}`);
  }

  return res.json() as Promise<XApiResponse>;
}

function mapTweets(
  data: XApiResponse,
  minLikes: number
): XTrendingPost[] {
  if (!data.data || data.data.length === 0) return [];

  const users = new Map<string, XApiUser>();
  for (const u of data.includes?.users ?? []) {
    users.set(u.id, u);
  }

  return data.data
    .filter((t) => t.public_metrics.like_count >= minLikes)
    .map((t) => {
      const user = users.get(t.author_id);
      return {
        tweet_id: t.id,
        text: t.text,
        author_username: user?.username ?? "unknown",
        author_name: user?.name ?? "unknown",
        like_count: t.public_metrics.like_count,
        retweet_count: t.public_metrics.retweet_count,
        reply_count: t.public_metrics.reply_count,
        created_at: t.created_at,
        tweet_url: `https://x.com/${user?.username ?? "i"}/status/${t.id}`,
        conversation_id: t.conversation_id,
      };
    });
}

/**
 * AI関連主要アカウントのバズ投稿を取得
 * 2回のAPI呼び出しで全23アカウントをカバー
 */
export async function fetchTrendingAIPosts(): Promise<XTrendingPost[]> {
  const bearerToken = process.env.X_BEARER_TOKEN;
  if (!bearerToken) {
    console.log("X_BEARER_TOKEN 未設定: X trending スキップ");
    return [];
  }

  const results: XTrendingPost[] = [];

  // 公式アカウント
  try {
    const officialQuery = buildFromQuery(OFFICIAL_ACCOUNTS);
    const officialData = await searchRecent(officialQuery, bearerToken);
    const officialPosts = mapTweets(officialData, OFFICIAL_MIN_LIKES);
    results.push(...officialPosts);
    console.log(
      `X公式: ${officialData.meta?.result_count ?? 0}件取得 → ${officialPosts.length}件(≥${OFFICIAL_MIN_LIKES}likes)`
    );
  } catch (err) {
    console.error("X公式アカウント検索エラー:", err);
  }

  // インフルエンサー
  try {
    const influencerQuery = buildFromQuery(INFLUENCER_ACCOUNTS);
    const influencerData = await searchRecent(influencerQuery, bearerToken);
    const influencerPosts = mapTweets(influencerData, INFLUENCER_MIN_LIKES);
    results.push(...influencerPosts);
    console.log(
      `Xインフルエンサー: ${influencerData.meta?.result_count ?? 0}件取得 → ${influencerPosts.length}件(≥${INFLUENCER_MIN_LIKES}likes)`
    );
  } catch (err) {
    console.error("Xインフルエンサー検索エラー:", err);
  }

  // conversation_id で重複排除（同一スレッドは最もいいねが多い投稿のみ）
  const seen = new Map<string, XTrendingPost>();
  for (const post of results) {
    const existing = seen.get(post.conversation_id);
    if (!existing || post.like_count > existing.like_count) {
      seen.set(post.conversation_id, post);
    }
  }

  const deduped = Array.from(seen.values()).sort(
    (a, b) => b.like_count - a.like_count
  );

  console.log(`X trending 合計: ${deduped.length}件（重複排除後）`);
  return deduped;
}
