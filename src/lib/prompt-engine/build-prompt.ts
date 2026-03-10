/**
 * プロンプト組み立てエンジン
 *
 * 5アカウント統合のマスタールールと、選択したモデルプロファイルを
 * 組み合わせてシステムプロンプトを生成する。
 */
import {
  HOOK_PATTERNS,
  THREAD_TEMPLATES,
  OPTIMIZATION_RULES,
  NG_RULES,
  type HookPattern,
} from "./master-rules";
import { MODEL_PROFILES, buildModelContext, getAllModelKeys } from "./model-profiles";
import type { AnalysisResult } from "@/types/database";

export interface BuildPromptOptions {
  platform: "threads" | "x";
  selectedModels?: string[];
  hookPattern?: string;
  threadCount?: number;
  customInstructions?: string;
  /** DB上のanalysis_result（レガシー互換） */
  modelAnalysis?: AnalysisResult | null;
  /** ユーザーの writing_instructions */
  writingInstructions?: string;
  /** 過去のバズ投稿TOP10テキスト */
  topPostsContext?: string;
}

const HOOK_PATTERN_MAP: Record<string, HookPattern> = Object.fromEntries(
  HOOK_PATTERNS.map((p) => [p.id, p])
);

/**
 * メインのプロンプトビルダー
 */
export function buildPostPrompt(options: BuildPromptOptions): string {
  const {
    platform,
    selectedModels = [],
    hookPattern,
    threadCount,
    customInstructions,
    modelAnalysis,
    writingInstructions,
    topPostsContext,
  } = options;

  const sections: string[] = [];

  // --- ヘッダー ---
  const dataDescription =
    platform === "threads"
      ? "Threads 2,156件（@kudooo_ai 1,002件 + @asa_to_ame 1,154件）+ X 4,137件（@masahirochaen 2,073件 + @SuguruKun_ai 2,064件）"
      : "X 4,137件（@masahirochaen 2,073件 + @SuguruKun_ai 2,064件）+ Threads 2,156件（@kudooo_ai 1,002件 + @asa_to_ame 1,154件）";

  sections.push(
    `あなたは${platform === "threads" ? "Threads" : "X"}投稿のプロコピーライターです。` +
      `7,000件超の実測データ（${dataDescription}）に基づく最適化ルールに従い、スレッド形式の投稿を生成してください。`
  );

  // --- フックパターン一覧 ---
  const platformPatterns =
    platform === "threads"
      ? HOOK_PATTERNS.filter((p) => !["G"].includes(p.id))
      : HOOK_PATTERNS;

  sections.push(
    "## フックパターン（ローテーション推奨）\n" +
      platformPatterns
        .map(
          (p) =>
            `- ${p.id}: ${p.name}（${p.description}）— いいね平均${p.avgLikes}件\n  例: ${p.examples[0]}\n  頻度: ${p.frequency}`
        )
        .join("\n")
  );

  // --- 最適化ルール ---
  const threadRules =
    platform === "threads"
      ? OPTIMIZATION_RULES.thread.threads
      : OPTIMIZATION_RULES.thread.x;

  sections.push(
    `## 最適化ルール
フック長: ${OPTIMIZATION_RULES.hook.optimalLength}字以内（${OPTIMIZATION_RULES.hook.impact.under100}）
200字超フック: ${OPTIMIZATION_RULES.hook.impact.over200}
スレッド本数: ${threadRules.optimalRange[0]}-${threadRules.optimalRange[1]}件（最適: ${threadRules.bestLength}件）
スレッド vs 単発: いいね${OPTIMIZATION_RULES.thread.vsSingleMultiplier}倍
バズったフォーマットの再利用: OK`
  );

  // --- スレッド構成テンプレート ---
  const templateKeys = threadCount
    ? [threadCount]
    : platform === "threads"
      ? [3, 4, 5]
      : [3, 4, 5, 6];

  sections.push(
    "## スレッド構成テンプレート\n" +
      templateKeys
        .filter((k) => THREAD_TEMPLATES[k])
        .map((k) => {
          const t = THREAD_TEMPLATES[k];
          return `${k}件構成（${t.description}）:\n${t.posts.map((p, i) => `  投稿${i + 1}: ${p.role}（${p.charMin}-${p.charMax}字）`).join("\n")}`;
        })
        .join("\n\n")
  );

  // --- プラットフォーム固有ルール ---
  if (platform === "threads") {
    const timing = OPTIMIZATION_RULES.timing.threads;
    sections.push(
      `## Threads固有ルール
- 推奨投稿時間: ${timing.bestHours.map((h) => `${h}時`).join("、")}
- 避ける時間帯: ${timing.avoidHours.map((h) => `${h}時`).join("、")}
- ${timing.bestDay}が最強、${timing.worstDay}が最弱
- 1投稿500文字以内（API制限）
- 画像添付で差別化（使用率3-27%）
- ハッシュタグ不要`
    );
  } else {
    sections.push(
      `## X固有ルール
- 1投稿280字以内
- 投稿1は141-200字が最適（いいね平均297-818件）
- メディア添付率85%が理想（画像 or 動画）
- 外部リンク添付率はスタイルによる`
    );
  }

  // --- 禁止事項 ---
  sections.push("## 禁止事項\n" + NG_RULES.map((r) => `- ${r}`).join("\n"));

  // --- モデルプロファイル注入 ---
  const modelsToUse =
    selectedModels.length > 0
      ? selectedModels
      : getAllModelKeys().filter((k) =>
          MODEL_PROFILES[k].platform === platform
        );

  if (modelsToUse.length > 0) {
    const ctx = buildModelContext(modelsToUse);
    if (ctx) {
      sections.push("## 参考モデルアカウント\n以下のアカウントのスタイルを参考にしてください：\n\n" + ctx);
    }
  }

  // --- レガシー: DB analysis_result から注入 ---
  if (modelAnalysis) {
    const parts: string[] = [];
    parts.push("\n## 選択モデルの詳細分析データ");
    const ws = modelAnalysis.writing_style;
    const ep = modelAnalysis.engagement_patterns;
    const tips = modelAnalysis.modeling_tips ?? [];
    if (ws) {
      parts.push(`- 文体トーン: ${ws.tone}`);
      parts.push(`- 平均文字数: ${ws.avg_length}字`);
      parts.push(`- 絵文字: ${ws.emoji_usage}`);
      parts.push(`- フックパターン: ${ws.hook_patterns?.join("、") ?? "指定なし"}`);
    }
    if (ep) {
      parts.push(`- いいね平均: ${ep.avg_likes}`);
      parts.push(`- 最良フォーマット: ${ep.best_performing_format}`);
      parts.push(`- 最適長: ${ep.optimal_length ?? "未指定"}`);
    }
    if (tips.length > 0) parts.push(`- モデリングのコツ: ${tips.join(" / ")}`);
    if (modelAnalysis.summary) parts.push(`- サマリー: ${modelAnalysis.summary}`);
    sections.push(parts.join("\n"));
  }

  // --- フックパターン指定 ---
  if (hookPattern && HOOK_PATTERN_MAP[hookPattern.toUpperCase()]) {
    const p = HOOK_PATTERN_MAP[hookPattern.toUpperCase()];
    sections.push(
      `## フックパターン指定\n必ずパターン${p.id}（${p.name}）を使用すること。\n例: ${p.examples.join(" / ")}`
    );
  }

  // --- ユーザーカスタム指示 ---
  if (writingInstructions) {
    sections.push(`## ユーザーの文体指示\n${writingInstructions}`);
  }

  if (customInstructions) {
    sections.push(`## 追加指示\n${customInstructions}`);
  }

  // --- 過去バズ投稿 ---
  if (topPostsContext) {
    sections.push(`## 過去のバズ投稿（参考）\n${topPostsContext}`);
  }

  // --- 出力形式 ---
  sections.push(
    `## 出力形式\n必ずJSON配列で返してください。各要素はスレッド内の1投稿文（文字列）です。\n例: ["投稿1のテキスト", "投稿2のテキスト", "投稿3のテキスト"]`
  );

  return sections.join("\n\n");
}

/**
 * 単発投稿用プロンプト（3パターン生成）
 */
export function buildSinglePostPrompt(options: {
  platform: "threads" | "x";
  selectedModels?: string[];
  modelAnalysis?: AnalysisResult | null;
  writingInstructions?: string;
  topPostsContext?: string;
}): string {
  const {
    platform,
    selectedModels = [],
    modelAnalysis,
    writingInstructions,
    topPostsContext,
  } = options;

  const sections: string[] = [];

  sections.push(
    `あなたは${platform === "threads" ? "Threads" : "X"}投稿のプロコピーライターです。7,000件超の実測データに基づき、与えられたテーマで3パターンの投稿文を生成してください。`
  );

  const charLimit = platform === "threads" ? 500 : 280;
  sections.push(
    `## ルール
- ${charLimit}文字以内
- 各パターンで異なるフックパターン（A-${platform === "x" ? "G" : "F"}）を使用
- 自然な日本語（AI的比喩・絵文字多用は禁止）
- 情報源は非表示（自分の投稿として見せる）
- ハッシュタグは最大2個まで`
  );

  // モデル注入
  const modelsToUse =
    selectedModels.length > 0
      ? selectedModels
      : getAllModelKeys().filter((k) => MODEL_PROFILES[k].platform === platform);

  if (modelsToUse.length > 0) {
    const ctx = buildModelContext(modelsToUse);
    if (ctx) {
      sections.push("## 参考モデル\n" + ctx);
    }
  }

  if (modelAnalysis?.writing_style) {
    sections.push(
      `## 選択モデルの文体\n- トーン: ${modelAnalysis.writing_style.tone}\n- 平均文字数: ${modelAnalysis.writing_style.avg_length}字`
    );
  }

  if (writingInstructions) {
    sections.push(`## ユーザーの文体指示\n${writingInstructions}`);
  }

  if (topPostsContext) {
    sections.push(`## 過去のバズ投稿（参考）\n${topPostsContext}`);
  }

  sections.push(
    `## 出力形式\nJSON配列で3パターン返してください。\n[{"text": "投稿文1", "style": "パターン名"}, {"text": "投稿文2", "style": "パターン名"}, {"text": "投稿文3", "style": "パターン名"}]`
  );

  return sections.join("\n\n");
}
