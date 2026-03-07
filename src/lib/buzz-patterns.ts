/**
 * バズ投稿パターン分析エンジン
 * バズった投稿の共通点を抽出して「バズる投稿の型」を明らかにする
 */

export interface BuzzPattern {
  avgTextLength: number;
  avgHashtagCount: number;
  topHookPatterns: Array<{ pattern: string; count: number }>;
  bestTimeSlots: Array<{ dayName: string; hour: number; count: number }>;
  mediaRatio: number; // メディア付き投稿の割合
  questionRatio: number; // 問いかけ形式の割合
  numberRatio: number; // 数字を含む割合
  totalAnalyzed: number;
}

const DAY_NAMES = ["月", "火", "水", "木", "金", "土", "日"];

// フックパターン検出
const HOOK_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /^[\u3010\u300A\u3008【《〈].+[\u3011\u300B\u3009】》〉]/, label: "【見出し型】" },
  { pattern: /^.{0,30}[？?]/, label: "問いかけ型" },
  { pattern: /^\d+[つのヶ個選]/, label: "数字列挙型" },
  { pattern: /^(知ってた|実は|驚きの|衝撃|意外)/, label: "驚き導入型" },
  { pattern: /^(なぜ|どうして|なんで)/, label: "Why型" },
  { pattern: /方法|やり方|コツ|テクニック|秘訣/, label: "ノウハウ型" },
  { pattern: /^(おはよう|こんにちは|お疲れ)/, label: "挨拶型" },
  { pattern: /^(今日は|本日)/, label: "今日型" },
  { pattern: /ランキング|TOP|ベスト/, label: "ランキング型" },
  { pattern: /(する人|しない人|できる人|できない人)/, label: "人物対比型" },
];

/**
 * バズ投稿（上位N%）のパターンを分析
 */
export function analyzeBuzzPatterns(
  posts: Array<{
    post_text: string | null;
    posted_at: string | null;
    likes: number;
    replies: number;
    reposts: number;
    media_type?: string | null;
  }>,
  buzzPercentile: number = 30 // 上位30%をバズとみなす
): BuzzPattern {
  if (posts.length === 0) {
    return {
      avgTextLength: 0,
      avgHashtagCount: 0,
      topHookPatterns: [],
      bestTimeSlots: [],
      mediaRatio: 0,
      questionRatio: 0,
      numberRatio: 0,
      totalAnalyzed: 0,
    };
  }

  // エンゲージメント順にソートして上位N%を取得
  const sorted = [...posts]
    .map((p) => ({
      ...p,
      engagement: p.likes + p.replies + p.reposts,
    }))
    .sort((a, b) => b.engagement - a.engagement);

  const cutoff = Math.max(1, Math.floor(sorted.length * (buzzPercentile / 100)));
  const buzzPosts = sorted.slice(0, cutoff);

  // テキスト長
  const textLengths = buzzPosts
    .filter((p) => p.post_text)
    .map((p) => p.post_text!.length);
  const avgTextLength =
    textLengths.length > 0
      ? Math.round(textLengths.reduce((a, b) => a + b, 0) / textLengths.length)
      : 0;

  // ハッシュタグ数
  const hashtagCounts = buzzPosts.map(
    (p) => (p.post_text?.match(/#/g) ?? []).length
  );
  const avgHashtagCount =
    hashtagCounts.length > 0
      ? Math.round(
          (hashtagCounts.reduce((a, b) => a + b, 0) / hashtagCounts.length) * 10
        ) / 10
      : 0;

  // フックパターン集計
  const hookCounter = new Map<string, number>();
  for (const p of buzzPosts) {
    if (!p.post_text) continue;
    for (const hook of HOOK_PATTERNS) {
      if (hook.pattern.test(p.post_text)) {
        hookCounter.set(hook.label, (hookCounter.get(hook.label) ?? 0) + 1);
      }
    }
  }
  const topHookPatterns = Array.from(hookCounter.entries())
    .map(([pattern, count]) => ({ pattern, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // 投稿時間帯
  const timeSlotCounter = new Map<string, number>();
  for (const p of buzzPosts) {
    if (!p.posted_at) continue;
    const date = new Date(p.posted_at);
    const dayOfWeek = date.getDay();
    const dayIndex = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const hour = date.getHours();
    const key = `${dayIndex}-${hour}`;
    timeSlotCounter.set(key, (timeSlotCounter.get(key) ?? 0) + 1);
  }
  const bestTimeSlots = Array.from(timeSlotCounter.entries())
    .map(([key, count]) => {
      const [dayIndex, hour] = key.split("-").map(Number);
      return { dayName: DAY_NAMES[dayIndex], hour, count };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // メディア比率
  const withMedia = buzzPosts.filter(
    (p) => p.media_type && p.media_type !== "TEXT"
  ).length;
  const mediaRatio =
    buzzPosts.length > 0
      ? Math.round((withMedia / buzzPosts.length) * 100)
      : 0;

  // 問いかけ比率
  const withQuestion = buzzPosts.filter(
    (p) => p.post_text && /[？?]/.test(p.post_text)
  ).length;
  const questionRatio =
    buzzPosts.length > 0
      ? Math.round((withQuestion / buzzPosts.length) * 100)
      : 0;

  // 数字含有比率
  const withNumber = buzzPosts.filter(
    (p) => p.post_text && /\d+/.test(p.post_text)
  ).length;
  const numberRatio =
    buzzPosts.length > 0
      ? Math.round((withNumber / buzzPosts.length) * 100)
      : 0;

  return {
    avgTextLength,
    avgHashtagCount,
    topHookPatterns,
    bestTimeSlots,
    mediaRatio,
    questionRatio,
    numberRatio,
    totalAnalyzed: buzzPosts.length,
  };
}
