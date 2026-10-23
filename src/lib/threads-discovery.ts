/**
 * Threads の公開データ取得（キーワード検索・プロフィールディスカバリー）
 *
 * - keyword_search: threads_keyword_search が必要。Metaの承認前は「自分の投稿」だけが検索対象
 * - profile_lookup / profile_posts: threads_profile_discovery が必要。
 *   承認前は @meta・@threads・@instagram・@facebook だけが対象
 *
 * 参照: https://developers.facebook.com/documentation/threads/keyword-search
 *       https://developers.facebook.com/documentation/threads/threads-profiles
 *       https://developers.facebook.com/documentation/threads/retrieve-and-discover-posts/retrieve-posts
 */

const THREADS_API_BASE = "https://graph.threads.net/v1.0";

/** 検索結果・投稿一覧で取るフィールド（owner は返らない） */
const POST_FIELDS = "id,text,media_type,permalink,timestamp,username,is_quote_post";

/** ユーザー名の形式（英数字・ピリオド・アンダースコア、30文字まで） */
const USERNAME_PATTERN = /^[A-Za-z0-9._]{1,30}$/;

export type SearchType = "TOP" | "RECENT";
export type SearchMode = "KEYWORD" | "TAG";

export interface DiscoveredPost {
  id: string;
  text: string | null;
  mediaType: string | null;
  permalink: string | null;
  timestamp: string | null;
  username: string | null;
  isQuotePost: boolean;
}

export interface DiscoveredProfile {
  username: string;
  name: string | null;
  profilePictureUrl: string | null;
  biography: string | null;
  isVerified: boolean;
  followerCount: number | null;
  /** 以下は過去7日間の合計 */
  likesCount: number | null;
  quotesCount: number | null;
  repostsCount: number | null;
  viewsCount: number | null;
}

/**
 * Threads API のエラー
 * code 10 / 200 は「アプリにその権限が無い」（Metaの承認前、または接続時に同意していない）
 */
export class ThreadsDiscoveryError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: number | null
  ) {
    super(message);
    this.name = "ThreadsDiscoveryError";
  }

  get isPermissionError(): boolean {
    return this.code === 10 || this.code === 200 || this.status === 403;
  }
}

/**
 * 入力されたユーザー名を整える（先頭の@と空白を外す）。形式に合わなければ null
 */
export function normalizeUsername(input: string): string | null {
  const username = input.trim().replace(/^@/, "");
  return USERNAME_PATTERN.test(username) ? username : null;
}

async function callThreads(path: string, params: URLSearchParams): Promise<unknown> {
  const res = await fetch(`${THREADS_API_BASE}/${path}?${params}`, { cache: "no-store" });
  const body = await res.json().catch(() => null);

  if (!res.ok) {
    const error = (body as { error?: { message?: string; code?: number } } | null)?.error;
    throw new ThreadsDiscoveryError(
      error?.message ?? `Threads API error (${res.status})`,
      res.status,
      typeof error?.code === "number" ? error.code : null
    );
  }

  return body;
}

function toPost(raw: Record<string, unknown>): DiscoveredPost {
  return {
    id: String(raw.id),
    text: typeof raw.text === "string" ? raw.text : null,
    mediaType: typeof raw.media_type === "string" ? raw.media_type : null,
    permalink: typeof raw.permalink === "string" ? raw.permalink : null,
    timestamp: typeof raw.timestamp === "string" ? raw.timestamp : null,
    username: typeof raw.username === "string" ? raw.username : null,
    isQuotePost: raw.is_quote_post === true,
  };
}

function toNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * 公開投稿をキーワードまたはトピックタグで検索する
 */
export async function searchPublicPosts(
  accessToken: string,
  options: {
    query: string;
    searchType?: SearchType;
    searchMode?: SearchMode;
    limit?: number;
  }
): Promise<DiscoveredPost[]> {
  const params = new URLSearchParams({
    q: options.query,
    search_type: options.searchType ?? "RECENT",
    search_mode: options.searchMode ?? "KEYWORD",
    fields: POST_FIELDS,
    limit: String(Math.min(Math.max(options.limit ?? 25, 1), 100)),
    access_token: accessToken,
  });

  const body = (await callThreads("keyword_search", params)) as { data?: Record<string, unknown>[] };
  return (body.data ?? []).map(toPost);
}

/**
 * 公開プロフィールの基本情報と過去7日間の数字を取る（フォロワー100人以上の公開プロフィールのみ）
 */
export async function lookupPublicProfile(
  accessToken: string,
  username: string
): Promise<DiscoveredProfile> {
  const params = new URLSearchParams({ username, access_token: accessToken });
  const raw = (await callThreads("profile_lookup", params)) as Record<string, unknown>;

  return {
    username: typeof raw.username === "string" ? raw.username : username,
    name: typeof raw.name === "string" ? raw.name : null,
    profilePictureUrl: typeof raw.profile_picture_url === "string" ? raw.profile_picture_url : null,
    biography: typeof raw.biography === "string" ? raw.biography : null,
    isVerified: raw.is_verified === true,
    followerCount: toNumber(raw.follower_count),
    likesCount: toNumber(raw.likes_count),
    quotesCount: toNumber(raw.quotes_count),
    repostsCount: toNumber(raw.reposts_count),
    viewsCount: toNumber(raw.views_count),
  };
}

/**
 * 公開プロフィールの最近の公開投稿を取る
 */
export async function getPublicProfilePosts(
  accessToken: string,
  username: string,
  limit = 10
): Promise<DiscoveredPost[]> {
  const params = new URLSearchParams({
    username,
    fields: POST_FIELDS,
    limit: String(Math.min(Math.max(limit, 1), 100)),
    access_token: accessToken,
  });

  const body = (await callThreads("profile_posts", params)) as { data?: Record<string, unknown>[] };
  return (body.data ?? []).map(toPost);
}
