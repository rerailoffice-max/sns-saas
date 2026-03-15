/**
 * 過去投稿との重複チェックユーティリティ
 * 同じトピックの記事が繰り返し投稿されるのを防ぐ
 */
import { createAdminClient } from "@/lib/supabase/admin";

// 英語・日本語タイトルから固有名詞・数値を含む主要キーワードを抽出
function extractKeywords(title: string): string[] {
  return title
    .replace(/[^\w\s\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2)
    .slice(0, 8);
}

/**
 * 過去N日間に投稿・下書き済みの記事タイトル一覧を取得
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
 * 重複していない記事だけをフィルタして返す
 */
export function filterDuplicates<T extends { title: string }>(
  articles: T[],
  recentTitles: string[]
): T[] {
  return articles.filter((a) => !isDuplicate(a.title, recentTitles));
}
