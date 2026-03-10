import type { AnalysisResult } from "@/types/database";

export interface HookPattern {
  id: string;
  name: string;
  description: string;
  avgLikes: number;
  avgViews: number;
  examples: string[];
}

export const HOOK_PATTERNS: HookPattern[] = [
  {
    id: "A",
    name: "速報型",
    description: "breaking news — タイムリーな公式発表・リリースに最適。表示回数が伸びやすい",
    avgLikes: 48,
    avgViews: 3638,
    examples: [
      "【速報】OpenAIが新モデルGPT-5を発表した。これ、かなりデカい。",
      "Gemini 2.5が来た。Googleが本気出してきた。",
      "Meta、Llama 4をオープンソースで公開。AI業界に激震。",
    ],
  },
  {
    id: "B",
    name: "問題提起型",
    description: "problem — 「あのー、」で始める。希少性を保ち週1〜2回まで",
    avgLikes: 21.8,
    avgViews: 1964,
    examples: [
      "あのー、まだClaude Code使ってない人、マジで損してます。",
      "あのー、AIで画像生成してない人、時代に取り残されてますよ。",
    ],
  },
  {
    id: "C",
    name: "やばい型",
    description: "shock — 感情爆発で引き込む。大型発表・衝撃ニュースに使う",
    avgLikes: 136,
    avgViews: 1740,
    examples: [
      "やばい。GPT-5が来た。AI界隈に激震走ってます。",
      "マジでやばい。AI動画生成がここまで来た。もう実写と区別つかない。",
    ],
  },
  {
    id: "D",
    name: "数字型",
    description: "numbers — 具体的な数字を冒頭に。調達額・性能・ユーザー数で安定リーチ",
    avgLikes: 23,
    avgViews: 1810,
    examples: [
      "1,100億ドル調達。OpenAIの評価額がもう意味わからない。",
      "ユーザー数1億人突破。Threadsの成長スピードがえぐい。",
    ],
  },
  {
    id: "E",
    name: "断言型",
    description: "assertion — 強い主張で注目を引く。トレンド変化・業界の転換点に",
    avgLikes: 14,
    avgViews: 1200,
    examples: [
      "ChatGPTの時代は終わった。これからはマルチモーダルAIの時代。",
      "プロンプトエンジニアリングは不要になった。AIの使い方が根本から変わる。",
    ],
  },
  {
    id: "F",
    name: "質問型",
    description: "question — 返信を誘いアルゴリズムを加速させる",
    avgLikes: 8,
    avgViews: 1223,
    examples: [
      "Claude Code使ったことある？これマジで開発の仕方が変わる。",
      "Gemini 2.5とClaude 4、どっち派？今日のベンチマーク結果が面白い。",
    ],
  },
];

export const OPTIMIZATION_RULES = {
  optimalHookLength: 100,
  optimalThreadRange: [3, 5] as [number, number],
  threadVsSingleMultiplier: 4.2,
  viewsMultiplier: 4.7,
  hookLengthImpact: {
    under100: 15,
    over200: 0.9,
  },
  formatReuseOk: true,
} as const;

export interface ThreadPostRole {
  role: string;
  charMin: number;
  charMax: number;
}

export const THREAD_TEMPLATES: Record<
  number,
  { posts: ThreadPostRole[]; description: string }
> = {
  3: {
    description: "標準構成",
    posts: [
      { role: "フック + URL", charMin: 50, charMax: 100 },
      { role: "①②③ リストで要点", charMin: 150, charMax: 300 },
      { role: "「つまり〇〇ってこと」で締め", charMin: 80, charMax: 200 },
    ],
  },
  4: {
    description: "詳細あり",
    posts: [
      { role: "フック + URL", charMin: 50, charMax: 100 },
      { role: "①②③ リストで要点", charMin: 150, charMax: 300 },
      { role: "深掘り・補足情報", charMin: 100, charMax: 200 },
      { role: "「使ったことある？」等の質問で返信誘発", charMin: 50, charMax: 100 },
    ],
  },
  5: {
    description: "最高効率",
    posts: [
      { role: "フック + URL", charMin: 50, charMax: 100 },
      { role: "①②③ リストで要点", charMin: 150, charMax: 300 },
      { role: "深掘り・技術的な補足", charMin: 100, charMax: 200 },
      { role: "実用的な活用例", charMin: 100, charMax: 200 },
      { role: "質問 or まとめ", charMin: 50, charMax: 100 },
    ],
  },
};

export const NG_RULES: string[] = [
  "200字以上のフック（いいね平均が1/4に低下）",
  "単発投稿（5件スレッドと比べていいね4.2倍低い）",
  "「震えた」「やばいやつ来た」等の禁止ワード",
  "AI的比喩（「新たな地平」等）は不自然",
  "絵文字の多用（使うなら1〜2個まで）",
  "同じフックパターンの連続使用（ローテーションする）",
];

const HOOK_PATTERN_MAP: Record<string, HookPattern> = Object.fromEntries(
  HOOK_PATTERNS.map((p) => [p.id, p])
);

export function buildThreadSystemPrompt(
  modelAnalysis?: AnalysisResult | null,
  hookPattern?: string
): string {
  const hookSection = HOOK_PATTERNS.map(
    (p) =>
      `- ${p.id}: ${p.name}（${p.description}）— いいね平均${p.avgLikes}、表示${p.avgViews}回\n  例: ${p.examples[0]}`
  ).join("\n");

  const rulesSection = `
最適フック長: ${OPTIMIZATION_RULES.optimalHookLength}字以内
スレッド本数: ${OPTIMIZATION_RULES.optimalThreadRange[0]}〜${OPTIMIZATION_RULES.optimalThreadRange[1]}件
スレッド vs 単発: いいね${OPTIMIZATION_RULES.threadVsSingleMultiplier}倍
100字以下フック: いいね平均${OPTIMIZATION_RULES.hookLengthImpact.under100}件
200字超フック: いいね係数${OPTIMIZATION_RULES.hookLengthImpact.over200}
バズったフォーマットの再利用: ${OPTIMIZATION_RULES.formatReuseOk ? "OK" : "NG"}
`.trim();

  const threadSection = Object.entries(THREAD_TEMPLATES)
    .map(
      ([len, t]) =>
        `${len}件構成（${t.description}）:\n${t.posts.map((p, i) => `  投稿${i + 1}: ${p.role}（${p.charMin}〜${p.charMax}字）`).join("\n")}`
    )
    .join("\n\n");

  const ngSection = NG_RULES.map((r) => `- ${r}`).join("\n");

  let modelSection = "";
  if (modelAnalysis) {
    const ws = modelAnalysis.writing_style;
    const ep = modelAnalysis.engagement_patterns;
    const tips = modelAnalysis.modeling_tips ?? [];
    modelSection = `

## モデルアカウントの文体・エンゲージメントに合わせる
- 文体トーン: ${ws.tone}
- 平均文字数: ${ws.avg_length}字
- 絵文字: ${ws.emoji_usage}
- フックパターン: ${ws.hook_patterns?.join("、") ?? "指定なし"}
- いいね平均: ${ep.avg_likes}
- 最良フォーマット: ${ep.best_performing_format}
- 最適長: ${ep.optimal_length ?? "未指定"}
- モデリングのコツ: ${tips.join(" / ")}
- サマリー: ${modelAnalysis.summary}
`;
  }

  let hookInstruction = "";
  if (hookPattern && HOOK_PATTERN_MAP[hookPattern.toUpperCase()]) {
    const p = HOOK_PATTERN_MAP[hookPattern.toUpperCase()];
    hookInstruction = `

## フックパターン指定
必ずパターン${p.id}（${p.name}）を使用すること。
例: ${p.examples.join(" / ")}
`;
  }

  return `あなたはThreads投稿のプロコピーライターです。2,707件の実測データ（@kudooo_ai 1,553件 + @asa_to_ame 1,154件）に基づく最適化ルールに従い、スレッド形式の投稿を生成してください。

## フックパターン（A〜Fをローテーション）
${hookSection}

## 最適化ルール
${rulesSection}

## スレッド構成テンプレート
${threadSection}

## 禁止事項
${ngSection}
${modelSection}${hookInstruction}

## 出力形式
必ずJSON配列で返してください。各要素はスレッド内の1投稿文（文字列）です。
例: ["投稿1のテキスト", "投稿2のテキスト", "投稿3のテキスト"]
`;
}
