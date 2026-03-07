/**
 * ハッシュタグレコメンドエンジン
 * 過去の投稿データからハッシュタグ別のエンゲージメントを分析し、
 * 効果の高いハッシュタグを推薦する
 */

export interface HashtagStats {
  tag: string;
  count: number;
  avgEngagement: number;
  totalEngagement: number;
}

/**
 * 投稿データからハッシュタグ別の効果を集計
 */
export function analyzeHashtags(
  posts: Array<{
    post_text: string | null;
    likes: number;
    replies: number;
    reposts: number;
  }>,
  topN: number = 10
): HashtagStats[] {
  const tagMap = new Map<
    string,
    { totalEngagement: number; count: number }
  >();

  for (const post of posts) {
    if (!post.post_text) continue;

    // ハッシュタグ抽出（日本語含む）
    const tags = post.post_text.match(
      /#[\w\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]+/g
    );
    if (!tags || tags.length === 0) continue;

    const engagement = post.likes + post.replies + post.reposts;

    for (const tag of tags) {
      const normalized = tag.toLowerCase();
      const existing = tagMap.get(normalized) ?? {
        totalEngagement: 0,
        count: 0,
      };
      tagMap.set(normalized, {
        totalEngagement: existing.totalEngagement + engagement,
        count: existing.count + 1,
      });
    }
  }

  // 平均エンゲージメントでソートしてTOP N
  return Array.from(tagMap.entries())
    .filter(([, stats]) => stats.count >= 2) // 最低2回以上使用
    .map(([tag, stats]) => ({
      tag,
      count: stats.count,
      avgEngagement: Math.round(stats.totalEngagement / stats.count),
      totalEngagement: stats.totalEngagement,
    }))
    .sort((a, b) => b.avgEngagement - a.avgEngagement)
    .slice(0, topN);
}

/**
 * 投稿テキストに含まれていないおすすめハッシュタグを返す
 */
export function getRecommendedHashtags(
  currentText: string,
  allStats: HashtagStats[],
  maxSuggestions: number = 5
): HashtagStats[] {
  const currentTags = new Set(
    (
      currentText
        .toLowerCase()
        .match(/#[\w\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]+/g) ?? []
    )
  );

  return allStats
    .filter((stat) => !currentTags.has(stat.tag.toLowerCase()))
    .slice(0, maxSuggestions);
}
