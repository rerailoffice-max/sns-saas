/**
 * エンゲージメント予測エンジン
 *
 * 7,000件超の研究データから導き出したルールベースの予測。
 * 投稿テキストの特徴量を分析し、0-100のスコアを算出する。
 */
import { HOOK_PATTERNS, OPTIMIZATION_RULES } from "./prompt-engine";

export interface PredictionResult {
  score: number;
  grade: "S" | "A" | "B" | "C" | "D";
  factors: PredictionFactor[];
  suggestions: string[];
}

export interface PredictionFactor {
  name: string;
  score: number;
  maxScore: number;
  detail: string;
}

/**
 * 投稿テキストからエンゲージメント予測スコアを算出
 */
export function predictEngagement(
  text: string,
  options: {
    platform?: "threads" | "x";
    threadPosts?: string[];
    hasMedia?: boolean;
  } = {}
): PredictionResult {
  const { platform = "threads", threadPosts, hasMedia = false } = options;
  const isThread = threadPosts && threadPosts.length > 1;
  const fullText = isThread ? threadPosts.join("\n") : text;
  const hookText = isThread ? threadPosts[0] : text;
  const threadCount = isThread ? threadPosts.length : 1;

  const factors: PredictionFactor[] = [];
  const suggestions: string[] = [];

  // 1. フック長 (0-25点)
  const hookLength = hookText.length;
  let hookScore = 0;
  if (hookLength <= 100) {
    hookScore = 25;
  } else if (hookLength <= 150) {
    hookScore = 18;
  } else if (hookLength <= 200) {
    hookScore = 10;
  } else {
    hookScore = 5;
    suggestions.push(`フックが${hookLength}字と長すぎます。100字以内が最適です`);
  }
  factors.push({
    name: "フック長",
    score: hookScore,
    maxScore: 25,
    detail: `${hookLength}字（100字以内が理想）`,
  });

  // 2. フックパターン検出 (0-20点)
  let hookPatternScore = 10;
  let detectedPattern = "その他";
  const hookLower = hookText.toLowerCase();

  if (/^あのー/.test(hookText)) {
    hookPatternScore = 18;
    detectedPattern = "問題提起型（あのー）";
  } else if (/やばい|ガチで|まじで/i.test(hookLower)) {
    hookPatternScore = 16;
    detectedPattern = "やばい型";
  } else if (/【速報】|【緊急】|⚡/.test(hookText)) {
    hookPatternScore = 17;
    detectedPattern = "速報型";
  } else if (/^\d|[0-9０-９].*億|[0-9０-９].*万|[0-9０-９].*%/.test(hookText)) {
    hookPatternScore = 15;
    detectedPattern = "数字型";
  } else if (/？$|\?$|知ってる|使ったことある/.test(hookText)) {
    hookPatternScore = 12;
    detectedPattern = "質問型";
  } else if (/出してた|公開した|有益すぎ|まとめ/.test(hookText)) {
    hookPatternScore = 20;
    detectedPattern = "Tips告知型";
  }

  factors.push({
    name: "フックパターン",
    score: hookPatternScore,
    maxScore: 20,
    detail: detectedPattern,
  });

  // 3. スレッド構成 (0-25点)
  let threadScore = 5;
  if (isThread) {
    const optRange =
      platform === "threads"
        ? OPTIMIZATION_RULES.thread.threads
        : OPTIMIZATION_RULES.thread.x;

    if (threadCount >= optRange.optimalRange[0] && threadCount <= optRange.optimalRange[1]) {
      threadScore = 25;
    } else if (threadCount === 2) {
      threadScore = 12;
    } else if (threadCount > optRange.optimalRange[1]) {
      threadScore = 18;
    }
  } else {
    suggestions.push(
      "単発投稿よりスレッド（3-5件）の方がいいね4.2倍になります"
    );
  }

  factors.push({
    name: "スレッド構成",
    score: threadScore,
    maxScore: 25,
    detail: isThread ? `${threadCount}件スレッド` : "単発投稿",
  });

  // 4. メディア添付 (0-15点)
  let mediaScore = 0;
  if (hasMedia) {
    mediaScore = 15;
  } else {
    mediaScore = 3;
    if (platform === "x") {
      suggestions.push("X では画像添付でいいねが3.5倍になります（85%が添付）");
    }
  }

  factors.push({
    name: "メディア",
    score: mediaScore,
    maxScore: 15,
    detail: hasMedia ? "添付あり" : "添付なし",
  });

  // 5. NGワード・パターンチェック (0-15点)
  let qualityScore = 15;
  const ngPatterns = [
    { pattern: /新たな地平|パラダイムシフト|革新的な/, penalty: 5, msg: "AI的比喩を避けてください" },
    { pattern: /震えた|やばいやつ来た/, penalty: 3, msg: "禁止ワード「震えた」を避けてください" },
    { pattern: /(😀|🔥|💡|🚀){3,}/, penalty: 3, msg: "絵文字の使いすぎ（1-2個まで推奨）" },
    { pattern: /https?:\/\/note\.com/, penalty: 5, msg: "note誘導はThreadsでリーチ93%減" },
  ];

  for (const ng of ngPatterns) {
    if (ng.pattern.test(fullText)) {
      qualityScore -= ng.penalty;
      suggestions.push(ng.msg);
    }
  }
  qualityScore = Math.max(0, qualityScore);

  factors.push({
    name: "品質チェック",
    score: qualityScore,
    maxScore: 15,
    detail: qualityScore === 15 ? "問題なし" : "改善点あり",
  });

  const totalScore = factors.reduce((sum, f) => sum + f.score, 0);

  let grade: PredictionResult["grade"];
  if (totalScore >= 85) grade = "S";
  else if (totalScore >= 70) grade = "A";
  else if (totalScore >= 50) grade = "B";
  else if (totalScore >= 30) grade = "C";
  else grade = "D";

  return { score: totalScore, grade, factors, suggestions };
}

/**
 * A/Bテストの提案を生成
 */
export function generateABTestSuggestions(
  text: string,
  platform: "threads" | "x" = "threads"
): string[] {
  const suggestions: string[] = [];
  const hookLength = text.split("\n")[0]?.length ?? text.length;

  if (hookLength > 100) {
    suggestions.push("フックを100字以内に短縮したバージョンを試す");
  }

  if (!/やばい|ガチ|マジ/i.test(text) && !/あのー/.test(text)) {
    suggestions.push("「あのー、」で始まる問題提起型フックを試す");
  }

  if (!/【|】|⚡|速報/.test(text)) {
    suggestions.push("「【速報】」を冒頭に付けた速報型フックを試す");
  }

  if (!/\d/.test(text)) {
    suggestions.push("具体的な数字を冒頭に入れた数字型フックを試す");
  }

  if (!/？|\?/.test(text)) {
    suggestions.push("最後を質問形式にして返信誘発を試す");
  }

  suggestions.push(
    `投稿時間を変えて比較: ${
      platform === "threads"
        ? "朝6時 vs 夜19時"
        : "朝7時 vs 昼12時 vs 夜19時"
    }`
  );

  return suggestions.slice(0, 4);
}
