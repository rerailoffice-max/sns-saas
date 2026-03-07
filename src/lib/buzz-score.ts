/**
 * バズスコア算出エンジン
 * 各投稿のバイラル度を数値化して比較可能にする
 */

export interface BuzzScoreResult {
  score: number;
  rank: "S" | "A" | "B" | "C" | "D";
  label: string;
  color: string;
}

/**
 * バズスコアを計算
 * スコア = (likes×1.0 + replies×2.0 + reposts×3.0 + quotes×2.5) / max(impressions, 1) × 1000
 */
export function calculateBuzzScore(post: {
  likes: number;
  replies: number;
  reposts: number;
  quotes?: number;
  impressions?: number | null;
}): number {
  const weighted =
    post.likes * 1.0 +
    post.replies * 2.0 +
    post.reposts * 3.0 +
    (post.quotes ?? 0) * 2.5;

  // インプレッションがない場合はエンゲージメント合計をそのまま使う
  if (!post.impressions || post.impressions === 0) {
    return Math.round(weighted);
  }

  return Math.round((weighted / post.impressions) * 1000);
}

/**
 * バズスコアからランクを判定
 * パーセンタイルベースで判定するため、全投稿のスコア配列を渡す
 */
export function getBuzzRank(score: number, allScores: number[]): BuzzScoreResult {
  if (allScores.length === 0) {
    return { score, rank: "C", label: "普通", color: "text-muted-foreground" };
  }

  const sorted = [...allScores].sort((a, b) => b - a);
  const index = sorted.indexOf(score);
  const percentile = index === -1 ? 50 : (index / sorted.length) * 100;

  if (percentile < 5) {
    return { score, rank: "S", label: "バズ🔥", color: "text-red-500" };
  } else if (percentile < 20) {
    return { score, rank: "A", label: "好調", color: "text-orange-500" };
  } else if (percentile < 50) {
    return { score, rank: "B", label: "良好", color: "text-yellow-500" };
  } else if (percentile < 80) {
    return { score, rank: "C", label: "普通", color: "text-muted-foreground" };
  } else {
    return { score, rank: "D", label: "低調", color: "text-gray-400" };
  }
}

/**
 * スコアからランクを直接判定（パーセンタイルなし、絶対値ベース）
 */
export function getBuzzRankAbsolute(score: number): BuzzScoreResult {
  if (score >= 100) {
    return { score, rank: "S", label: "バズ🔥", color: "text-red-500" };
  } else if (score >= 50) {
    return { score, rank: "A", label: "好調", color: "text-orange-500" };
  } else if (score >= 25) {
    return { score, rank: "B", label: "良好", color: "text-yellow-500" };
  } else if (score >= 10) {
    return { score, rank: "C", label: "普通", color: "text-muted-foreground" };
  } else {
    return { score, rank: "D", label: "低調", color: "text-gray-400" };
  }
}
