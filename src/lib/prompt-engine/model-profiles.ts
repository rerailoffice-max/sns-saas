/**
 * モデルアカウントの特徴プロファイル
 *
 * 現在は研究データからハードコード。
 * 将来的には DB の analysis_result から動的に生成する。
 */

export interface ModelProfile {
  username: string;
  platform: "threads" | "x";
  displayName: string;
  style: string;
  hookStyle: string;
  threadStructure: string;
  signature: string;
  avgLikes: number;
  bestHook: string;
  optimalThreadLength: string;
  postFrequency: string;
  mediaStrategy: string;
  topThemes: string[];
  dataSize: string;
}

export const MODEL_PROFILES: Record<string, ModelProfile> = {
  kudooo_ai: {
    username: "kudooo_ai",
    platform: "threads",
    displayName: "くどう",
    style: "長文解説型",
    hookStyle: "あのー型・損訴求型が強い（あのー型いいね29.1件）",
    threadStructure: "投稿1: 50字フック → 投稿2: 400字解説 → 投稿3: CTA",
    signature: "▼で次投稿誘導、最終投稿に必ずCTA、損訴求で煽る",
    avgLikes: 4.4,
    bestHook: "あのー型（いいね平均29.1件、最大588件）",
    optimalThreadLength: "4-7件（5件でいいね48.6件）",
    postFrequency: "約5.6スレッド/日",
    mediaStrategy: "画像3%・リンク12%（テキスト中心）",
    topThemes: [
      "Threadsアルゴリズム変更",
      "新機能解説",
      "AI活用Tips（ChatGPT/Claude）",
    ],
    dataSize: "1,002件（2026-02〜03）",
  },
  asa_to_ame: {
    username: "asa_to_ame",
    platform: "threads",
    displayName: "アオト",
    style: "短文リスト型",
    hookStyle: "感性型（いいね560件）・やばい型（いいね136件）が突出",
    threadStructure: "投稿1: 78字フック → 投稿2: 94字①②③ → 短文連続",
    signature: "▼なし、画像+質問で返信誘発、フレーズ再利用戦略",
    avgLikes: 11.6,
    bestHook: "感性型＋画像シリーズ（いいね平均560件、最大2,339件）",
    optimalThreadLength: "5-7件（5件でいいね22.4件、7件で26.8件）",
    postFrequency: "約7.7スレッド/日",
    mediaStrategy: "画像12%・リンク16%（短文+画像シリーズがバズる）",
    topThemes: [
      "AI画像生成",
      "フォロワー増加実績",
      "無料配布企画",
      "Threads運用ノウハウ",
    ],
    dataSize: "1,154件（2026-01〜03）",
  },
  masahirochaen: {
    username: "masahirochaen",
    platform: "x",
    displayName: "チャエン｜デジライズ CEO",
    style: "高頻度速報型",
    hookStyle: "速報・衝撃型が強い。投稿1の文字数161字（280字の58%）",
    threadStructure: "投稿1: 161字 → 短めスレッド（1-2件中心）",
    signature: "動画・メディア添付率82%、外部リンク55%、速度重視",
    avgLikes: 276,
    bestHook: "速報型＋動画（いいね平均363件）",
    optimalThreadLength: "2-4件（4件でいいね409件）",
    postFrequency: "6.2スレッド/日（高頻度）",
    mediaStrategy: "動画 > 画像 > テキスト（動画363件 vs 画像254件 vs テキスト148件）",
    topThemes: [
      "AIツール速報",
      "業界ニュース",
      "海外事例・バイラルコンテンツ",
      "コーディング・開発ツール",
    ],
    dataSize: "2,073件（2025-09〜2026-03）",
  },
  SuguruKun_ai: {
    username: "SuguruKun_ai",
    platform: "x",
    displayName: "すぐる｜ChatGPTガチ勢",
    style: "質重視Tips型",
    hookStyle: "Tips告知型が最強（いいね1,350件）。141字フック",
    threadStructure: "投稿1: 141字 → 長スレッド（4-6件）→ 保存価値重視",
    signature: "画像優先、1日1.3投稿の質重視、ブックマーク676件/投稿",
    avgLikes: 642,
    bestHook: "Tips告知型（いいね平均1,350件、最大7,019件）",
    optimalThreadLength: "6件以上（いいね918件、インプ185,415回）",
    postFrequency: "1.3スレッド/日（質重視）",
    mediaStrategy: "画像優先（添付率85%）。画像743件 vs テキスト210件",
    topThemes: [
      "Google無料リソース・学習サイト",
      "ChatGPT/Claude活用法",
      "プロンプト術",
      "AI新サービスレビュー",
    ],
    dataSize: "2,064件（2025-03〜2026-03）",
  },
};

/**
 * プロファイルのサマリーを1行で生成
 */
export function getProfileSummary(username: string): string {
  const p = MODEL_PROFILES[username];
  if (!p) return "";
  return `@${p.username}（${p.platform}）: ${p.style}。${p.bestHook}。${p.optimalThreadLength}。`;
}

/**
 * 複数プロファイルをプロンプト用テキストに変換
 */
export function buildModelContext(usernames: string[]): string {
  const profiles = usernames
    .map((u) => MODEL_PROFILES[u])
    .filter(Boolean);
  if (profiles.length === 0) return "";

  return profiles
    .map(
      (p) =>
        `### @${p.username}（${p.displayName}）— ${p.style}
- フック: ${p.hookStyle}
- 構成: ${p.threadStructure}
- 特徴: ${p.signature}
- 平均いいね: ${p.avgLikes}件
- 最適スレッド長: ${p.optimalThreadLength}
- メディア: ${p.mediaStrategy}
- 得意テーマ: ${p.topThemes.join("、")}`
    )
    .join("\n\n");
}

/**
 * 全モデルのキーを取得
 */
export function getAllModelKeys(): string[] {
  return Object.keys(MODEL_PROFILES);
}
