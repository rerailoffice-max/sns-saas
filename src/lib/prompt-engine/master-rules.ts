/**
 * 5アカウント・7,000件超の研究データから抽出した統合投稿ルール
 *
 * データソース:
 *   kudooo_ai (Threads, 1,002件) / asa_to_ame (Threads, 1,154件)
 *   masahirochaen (X, 2,073件) / SuguruKun_ai (X, 2,064件)
 */

export interface HookPattern {
  id: string;
  name: string;
  description: string;
  avgLikes: number;
  avgViews: number;
  examples: string[];
  frequency: string;
}

export const HOOK_PATTERNS: HookPattern[] = [
  {
    id: "A",
    name: "速報型",
    description: "タイムリーな公式発表・リリースに最適。表示回数が伸びやすい",
    avgLikes: 48,
    avgViews: 3638,
    examples: [
      "【速報】OpenAIが新モデルGPT-5を発表した。これ、かなりデカい。",
      "Gemini 2.5が来た。Googleが本気出してきた。",
      "Meta、Llama 4をオープンソースで公開。AI業界に激震。",
    ],
    frequency: "ニュース時に随時",
  },
  {
    id: "B",
    name: "問題提起型",
    description: "「あのー、」で始める。kudooo_aiの最強パターン（いいね29.1件）。週1-2回まで",
    avgLikes: 29.1,
    avgViews: 1964,
    examples: [
      "あのー、まだClaude Code使ってない人、マジで損してます。",
      "あのー、AIで画像生成してない人、時代に取り残されてますよ。",
      "あのー、Threads午後3時とか4時に投稿しない方が良いですよ。",
    ],
    frequency: "週1-2回（希少性を維持）",
  },
  {
    id: "C",
    name: "やばい型",
    description: "感情爆発で引き込む。大型発表・衝撃ニュースに",
    avgLikes: 136,
    avgViews: 1740,
    examples: [
      "やばい。GPT-5が来た。AI界隈に激震走ってます。",
      "マジでやばい。AI動画生成がここまで来た。もう実写と区別つかない。",
      "やばいやばい。ガチでやばい。",
    ],
    frequency: "週1-2回（多用禁止）",
  },
  {
    id: "D",
    name: "数字型",
    description: "具体的な数字を冒頭に。調達額・性能・ユーザー数で安定リーチ",
    avgLikes: 23,
    avgViews: 1810,
    examples: [
      "1,100億ドル調達。OpenAIの評価額がもう意味わからない。",
      "ユーザー数1億人突破。Threadsの成長スピードがえぐい。",
    ],
    frequency: "数字がある話題で随時",
  },
  {
    id: "E",
    name: "断言型",
    description: "強い主張で注目を引く。トレンド変化・業界の転換点に",
    avgLikes: 14,
    avgViews: 1200,
    examples: [
      "ChatGPTの時代は終わった。これからはマルチモーダルAIの時代。",
      "プロンプトエンジニアリングは不要になった。AIの使い方が根本から変わる。",
    ],
    frequency: "随時",
  },
  {
    id: "F",
    name: "質問型",
    description: "返信を誘いアルゴリズムを加速させる",
    avgLikes: 8,
    avgViews: 1223,
    examples: [
      "Claude Code使ったことある？これマジで開発の仕方が変わる。",
      "Gemini 2.5とClaude 4、どっち派？今日のベンチマーク結果が面白い。",
    ],
    frequency: "随時（返信誘導用）",
  },
  {
    id: "G",
    name: "Tips告知型",
    description: "SuguruKun_aiの最強パターン（いいね1,350件）。無料リソース・ガイド紹介に",
    avgLikes: 1350,
    avgViews: 185415,
    examples: [
      "Googleがやばい学習サイト出してた...",
      "Googleが無料公開した「Gemini活用ガイド」が有益すぎた。",
      "海外で大バズした「各AIモデルの使い分け」をまとめました：",
    ],
    frequency: "有益リソース発見時（1日1回まで）",
  },
];

export interface ThreadTemplate {
  posts: Array<{ role: string; charMin: number; charMax: number }>;
  description: string;
}

export const THREAD_TEMPLATES: Record<number, ThreadTemplate> = {
  3: {
    description: "標準構成（Threads/X共通）",
    posts: [
      { role: "フック + URL", charMin: 50, charMax: 100 },
      { role: "①②③ リストで要点", charMin: 150, charMax: 300 },
      { role: "「つまり〇〇ってこと」で締め or 質問", charMin: 80, charMax: 200 },
    ],
  },
  4: {
    description: "詳細あり",
    posts: [
      { role: "フック + URL", charMin: 50, charMax: 100 },
      { role: "①②③ リストで要点", charMin: 150, charMax: 300 },
      { role: "深掘り・補足情報", charMin: 100, charMax: 200 },
      { role: "質問 or CTA で返信誘発", charMin: 50, charMax: 100 },
    ],
  },
  5: {
    description: "最高効率（いいね4.2倍）",
    posts: [
      { role: "フック + URL", charMin: 50, charMax: 100 },
      { role: "①②③ リストで要点", charMin: 150, charMax: 300 },
      { role: "深掘り・技術的な補足", charMin: 100, charMax: 200 },
      { role: "実用的な活用例", charMin: 100, charMax: 200 },
      { role: "質問 or まとめ", charMin: 50, charMax: 100 },
    ],
  },
  6: {
    description: "X長スレッド（SuguruKun_ai型・いいね918件）",
    posts: [
      { role: "フック（141字以内）", charMin: 80, charMax: 141 },
      { role: "概要・背景", charMin: 100, charMax: 200 },
      { role: "ポイント①②③", charMin: 100, charMax: 200 },
      { role: "具体例・スクリーンショット", charMin: 80, charMax: 200 },
      { role: "活用法・応用", charMin: 80, charMax: 200 },
      { role: "まとめ + CTA", charMin: 50, charMax: 150 },
    ],
  },
};

export const OPTIMIZATION_RULES = {
  hook: {
    optimalLength: 100,
    maxLength: 200,
    impact: {
      under100: "いいね平均15件（100字超の4倍）",
      over200: "いいね係数0.9（大幅低下）",
    },
  },
  thread: {
    threads: { optimalRange: [3, 5] as [number, number], bestLength: 5 },
    x: { optimalRange: [3, 6] as [number, number], bestLength: 6 },
    vsSingleMultiplier: 4.2,
  },
  timing: {
    threads: {
      bestHours: [6, 18, 19, 20, 21],
      avoidHours: [9, 10, 11, 15, 16, 17],
      bestDay: "土曜",
      worstDay: "水曜",
    },
    x: {
      bestHours: [7, 8, 12, 18, 19, 20],
      avoidHours: [0, 1, 2, 3, 4, 5],
    },
  },
  media: {
    threads: "画像添付で差別化（使用率3-27%）",
    x_suguru: "画像優先（添付率85%）。いいね平均743件 vs テキストのみ210件",
    x_chaen: "動画優先（添付率82%）。動画付きいいね363件 vs 画像254件",
  },
} as const;

export const NG_RULES: string[] = [
  "200字以上のフック（いいね平均が1/4に低下）",
  "単発投稿（5件スレッドと比べていいね4.2倍低い）",
  "「震えた」「やばいやつ来た」等の禁止ワード",
  "AI的比喩（「新たな地平」「パラダイムシフト」等）は不自然",
  "絵文字の多用（使うなら1-2個まで）",
  "同じフックパターンの連続使用（A-Gをローテーション）",
  "note/外部リンクへの誘導（Threadsではリーチ93%減）",
  "ハッシュタグの多用（Threadsでは逆効果の傾向）",
];
