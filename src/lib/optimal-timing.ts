/**
 * 最適投稿時間レコメンドエンジン
 * 過去の投稿データから曜日×時間帯の最適な投稿タイミングを算出
 */

export interface TimingRecommendation {
  dayIndex: number; // 0=月曜, 6=日曜
  dayName: string;
  hour: number;
  avgEngagement: number;
  postCount: number;
}

const DAY_NAMES = ["月", "火", "水", "木", "金", "土", "日"];

/**
 * 投稿データから最適な投稿時間帯TOP Nを算出
 */
export function getOptimalTimings(
  posts: Array<{
    posted_at: string | null;
    likes: number;
    replies: number;
    reposts: number;
  }>,
  topN: number = 3
): TimingRecommendation[] {
  // 曜日×時間帯でグループ化
  const slotMap = new Map<
    string,
    { totalEngagement: number; count: number; dayIndex: number; hour: number }
  >();

  for (const post of posts) {
    if (!post.posted_at) continue;

    const date = new Date(post.posted_at);
    const dayOfWeek = date.getDay();
    const dayIndex = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // 0=月, 6=日
    const hour = date.getHours();
    const engagement = post.likes + post.replies + post.reposts;

    const key = `${dayIndex}-${hour}`;
    const existing = slotMap.get(key) ?? {
      totalEngagement: 0,
      count: 0,
      dayIndex,
      hour,
    };
    slotMap.set(key, {
      totalEngagement: existing.totalEngagement + engagement,
      count: existing.count + 1,
      dayIndex,
      hour,
    });
  }

  // 平均エンゲージメントでソートしてTOP N
  return Array.from(slotMap.values())
    .filter((slot) => slot.count >= 1) // 最低1件以上
    .map((slot) => ({
      dayIndex: slot.dayIndex,
      dayName: DAY_NAMES[slot.dayIndex],
      hour: slot.hour,
      avgEngagement: Math.round(slot.totalEngagement / slot.count),
      postCount: slot.count,
    }))
    .sort((a, b) => b.avgEngagement - a.avgEngagement)
    .slice(0, topN);
}

/**
 * 次の最適投稿時間を取得
 */
export function getNextOptimalTime(
  recommendations: TimingRecommendation[]
): Date | null {
  if (recommendations.length === 0) return null;

  const now = new Date();
  const currentDayOfWeek = now.getDay();
  const currentDayIndex = currentDayOfWeek === 0 ? 6 : currentDayOfWeek - 1;
  const currentHour = now.getHours();

  // 今日以降で最も近い推奨時間を探す
  for (let daysAhead = 0; daysAhead < 7; daysAhead++) {
    const targetDayIndex = (currentDayIndex + daysAhead) % 7;

    for (const rec of recommendations) {
      if (rec.dayIndex === targetDayIndex) {
        // 今日の場合は現在時刻より後の時間のみ
        if (daysAhead === 0 && rec.hour <= currentHour) continue;

        const targetDate = new Date(now);
        targetDate.setDate(targetDate.getDate() + daysAhead);
        targetDate.setHours(rec.hour, 0, 0, 0);
        return targetDate;
      }
    }
  }

  return null;
}
