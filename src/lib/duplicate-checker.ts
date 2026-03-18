/**
 * 過去投稿との重複チェックユーティリティ
 * 同じトピックの記事が繰り返し投稿されるのを防ぐ
 *
 * チェック対象:
 * 1. DB内の drafts テーブル（published/scheduled/pending_approval）のタイトル
 * 2. Threads API から取得した実際の投稿テキスト（実際に公開されたもの）
 */
import { createAdminClient } from "@/lib/supabase/admin";

const THREADS_API_BASE = "https://graph.threads.net/v1.0";

// 英語・日本語タイトルから固有名詞・数値を含む主要キーワードを抽出
function extractKeywords(title: string): string[] {
  return title
    .replace(/[^\w\s\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2)
    .slice(0, 8);
}

/**
 * 過去N日間に投稿・下書き済みの記事タイトル一覧を取得（DBベース）
 */
export async function getRecentPostTitles(
  admin: ReturnType<typeof createAdminClient>,
  profileId: string,
  days: number = 30
): Promise<string[]> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const { data: drafts } = await admin
    .from("drafts")
    .select("metadata")
    .eq("profile_id", profileId)
    .in("status", ["published", "scheduled", "pending_approval"])
    .gte("created_at", since);

  if (!drafts) return [];

  const titles: string[] = [];
  for (const draft of drafts) {
    const meta = draft.metadata as Record<string, string> | null;
    if (meta?.rss_title) titles.push(meta.rss_title);
    if (meta?.ja_article_title) titles.push(meta.ja_article_title);
  }

  return titles;
}

/**
 * Threads API から過去N日分の実際の投稿テキストを取得
 * RSS自動投稿以外のものも含め、全投稿テキストを返す
 * accessToken が null の場合は空配列を返す
 */
export async function getRecentThreadsPostTexts(
  accessToken: string | null,
  days: number = 30
): Promise<string[]> {
  if (!accessToken) return [];

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const texts: string[] = [];
  let nextCursor: string | null = null;
  const maxPages = 5; // 最大5ページ（約100投稿分）

  for (let page = 0; page < maxPages; page++) {
    const params = new URLSearchParams({
      fields: "id,text,timestamp",
      limit: "25",
      access_token: accessToken,
    });
    if (nextCursor) params.set("after", nextCursor);

    try {
      const res = await fetch(`${THREADS_API_BASE}/me/threads?${params}`, {
        signal: AbortSignal.timeout(10000),
      });

      if (!res.ok) {
        console.warn(`Threads API取得エラー: ${res.status}`);
        break;
      }

      const data = (await res.json()) as {
        data?: Array<{ id: string; text: string; timestamp: string }>;
        paging?: { cursors?: { after?: string }; next?: string };
      };

      if (!data.data || data.data.length === 0) break;

      for (const post of data.data) {
        const postDate = new Date(post.timestamp);
        if (postDate < since) {
          // これ以降は古いので終了
          return texts;
        }
        if (post.text) texts.push(post.text);
      }

      // 次のページ
      if (data.paging?.next && data.paging.cursors?.after) {
        nextCursor = data.paging.cursors.after;
      } else {
        break;
      }
    } catch {
      break;
    }
  }

  return texts;
}

/**
 * 候補記事が過去投稿と重複しているか判定
 * キーワードの50%以上が一致する場合は重複とみなす
 */
export function isDuplicate(
  candidateTitle: string,
  recentTitles: string[]
): boolean {
  if (recentTitles.length === 0) return false;

  const candidateKws = extractKeywords(candidateTitle);
  if (candidateKws.length === 0) return false;

  return recentTitles.some((t) => {
    const overlap = candidateKws.filter((kw) =>
      t.toLowerCase().includes(kw.toLowerCase())
    );
    return overlap.length / candidateKws.length >= 0.5;
  });
}

/**
 * Threads の実投稿テキストと候補テキストが重複しているか判定
 * フック文（投稿1）のキーワードで比較する
 */
export function isDuplicateWithPostedText(
  candidateTitleOrFirstPost: string,
  postedTexts: string[]
): boolean {
  if (postedTexts.length === 0) return false;

  const candidateKws = extractKeywords(candidateTitleOrFirstPost);
  if (candidateKws.length === 0) return false;

  return postedTexts.some((posted) => {
    // 投稿テキストの先頭200字だけをチェック（フック部分）
    const postedHead = posted.slice(0, 200);
    const overlap = candidateKws.filter((kw) =>
      postedHead.toLowerCase().includes(kw.toLowerCase())
    );
    return overlap.length / candidateKws.length >= 0.5;
  });
}

/**
 * 重複していない記事だけをフィルタして返す（DBタイトルのみ）
 */
export function filterDuplicates<T extends { title: string }>(
  articles: T[],
  recentTitles: string[]
): T[] {
  return articles.filter((a) => !isDuplicate(a.title, recentTitles));
}

/**
 * Threads実投稿テキストとも照合して重複除外する（強化版）
 * DBタイトルと実投稿テキストの両方でチェックする
 */
export function filterDuplicatesWithPostedTexts<T extends { title: string }>(
  articles: T[],
  recentTitles: string[],
  postedTexts: string[]
): T[] {
  return articles.filter(
    (a) =>
      !isDuplicate(a.title, recentTitles) &&
      !isDuplicateWithPostedText(a.title, postedTexts)
  );
}

/**
 * 過去N日間のドラフトから source_url を収集（URLベースの完全一致重複チェック用）
 * キーワード閾値より確実に同一記事の重複を検出する
 */
export async function getRecentSourceUrls(
  admin: ReturnType<typeof createAdminClient>,
  profileId: string,
  days: number = 7
): Promise<Set<string>> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const { data: drafts } = await admin
    .from("drafts")
    .select("metadata")
    .eq("profile_id", profileId)
    .in("status", ["published", "scheduled", "pending_approval"])
    .gte("created_at", since);

  const urls = new Set<string>();
  for (const draft of drafts ?? []) {
    const meta = draft.metadata as Record<string, string> | null;
    if (meta?.source_url) urls.add(meta.source_url);
  }
  return urls;
}
