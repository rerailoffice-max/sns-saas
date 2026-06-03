/**
 * AI投稿生成API
 *
 * 3系統:
 *  - X URL (sync): sns-saas 内で fetchXPostWithMedia → Claude → Gemini画像生成
 *    まで同期実行し、ai_generate_jobs に done で書き込んで返す。
 *    （ai-lab-bot worker の X API 401 を回避する暫定路）
 *  - YouTube/article URL (deep): ai_generate_jobs に enqueue → ai-lab-bot worker が
 *    動画DL/文字起こし/Claude生成/ChatGPT解説画像 を実行 → 結果書き戻し。
 *    クライアントは GET で job_id をポーリング。
 *  - URLなし (in-process): テーマ/貼付テキストから Claude が直接生成。画像なし。
 *
 * Xリンクは「絶対に貼らない」を守るため、APIのレスポンス手前でも stripXLinks を適用。
 */
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { buildPostPrompt, buildSinglePostPrompt } from "@/lib/prompt-engine";
import { stripXLinks } from "@/lib/x-link-sanitizer";
import { detectUrlType, fetchUrlContent } from "@/lib/url-fetcher";
import { generateInfographicImage } from "@/lib/image-generator";
import { uploadBufferImage } from "@/lib/media-uploader";
import type { AnalysisResult } from "@/types/database";

// X URL を同期処理する場合の Vercel Function 最大実行時間
// X取得 + Claude + Gemini画像並列で 60-180s 想定、余裕を持って 300s
export const maxDuration = 300;

/**
 * 不正なサロゲートペア（壊れた絵文字等）を除去
 */
function sanitizeText(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/g, "")
    .replace(/(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "");
}

const requestSchema = z.object({
  theme: z.string().min(1, "テーマは必須です").max(200),
  account_id: z.string().uuid(),
  model_account_id: z.string().uuid().optional(),
  selected_models: z.array(z.string()).optional(),
  style: z.enum(["default", "model", "custom"]).optional().default("default"),
  custom_instructions: z.string().max(500).optional(),
  arrange_prompt: z.string().max(500).optional(),
  long_form: z.boolean().optional(),
  source_url: z.string().optional(),
  source_text: z.string().max(50000).optional(),
  thread_mode: z.boolean().optional().default(false),
  hook_pattern: z.enum(["A", "B", "C", "D", "E", "F", "G", "H", "I"]).optional(),
  thread_count: z.number().min(1).max(6).optional(),
  platform: z.enum(["threads", "x"]).optional().default("threads"),
});

/**
 * GET /api/ai/generate-post?job_id=...
 * deep モードのジョブ状態をポーリング取得
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  const jobId = request.nextUrl.searchParams.get("job_id");
  if (!jobId) {
    return NextResponse.json({ error: "job_id 必須" }, { status: 400 });
  }

  const { data: job, error } = await supabase
    .from("ai_generate_jobs")
    .select("id, status, progress, result_json, error, source_url, created_at")
    .eq("id", jobId)
    .single();

  if (error || !job) {
    return NextResponse.json({ error: "ジョブが見つかりません" }, { status: 404 });
  }

  return NextResponse.json({ data: job });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (!user || authError) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "AI機能が設定されていません（ANTHROPIC_API_KEY未設定）" },
      { status: 503 }
    );
  }

  const body = await request.json();
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "バリデーションエラー", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const {
    style,
    model_account_id,
    selected_models,
    custom_instructions,
    arrange_prompt,
    long_form,
    thread_mode,
    hook_pattern,
    thread_count,
    platform,
    account_id,
  } = parsed.data;

  const theme = sanitizeText(parsed.data.theme);
  const source_text = parsed.data.source_text ? sanitizeText(parsed.data.source_text) : undefined;

  let source_url = parsed.data.source_url;
  if (source_url && !/^https?:\/\//i.test(source_url)) {
    source_url = `https://${source_url}`;
  }

  // ─────────────────────────────────────────
  // URLあり: X/Threads は sync、YouTube/article は deep enqueue
  // ─────────────────────────────────────────
  if (source_url) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", user.id)
      .single();
    if (!profile) {
      return NextResponse.json({ error: "プロフィール未作成" }, { status: 400 });
    }

    const urlType = detectUrlType(source_url).type;

    // X / Threads: sns-saas が同期で X API 取得 → Claude → Gemini画像 まで全部実行
    if (urlType === "x" || urlType === "threads") {
      return handleSyncXOrThreads({
        supabase,
        userId: user.id,
        profileId: profile.id,
        accountId: account_id,
        sourceUrl: source_url,
        params: {
          theme,
          platform,
          thread_mode,
          thread_count,
          hook_pattern,
          long_form,
          arrange_prompt,
          style,
          model_account_id,
          selected_models,
          custom_instructions,
        },
      });
    }

    // YouTube / article: 既存 deep enqueue（ai-lab-bot worker が処理）
    const params = {
      theme,
      account_id,
      platform,
      thread_mode,
      thread_count,
      hook_pattern,
      long_form,
      arrange_prompt,
      style,
      model_account_id,
      selected_models,
      custom_instructions,
      source_text,
    };

    const { data: job, error: jobErr } = await supabase
      .from("ai_generate_jobs")
      .insert({
        profile_id: profile.id,
        account_id,
        source_url,
        params_json: params,
        status: "queued",
        progress: "ジョブ受付完了。ワーカー待機中…",
      })
      .select("id")
      .single();

    if (jobErr || !job) {
      console.error("[ai/generate-post] ジョブ作成失敗:", jobErr);
      return NextResponse.json(
        { error: `ジョブ作成に失敗: ${jobErr?.message ?? "unknown"}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      data: { job_id: job.id, mode: "deep", status: "queued" },
    });
  }

  // ─────────────────────────────────────────
  // in-process モード: URLなし。テーマ/貼付テキストから直接生成（画像なし）
  // ─────────────────────────────────────────
  try {
    const { data: profile } = await supabase
      .from("profiles")
      .select("custom_writing_instructions")
      .eq("id", user.id)
      .single();

    const { data: recentPosts } = await supabase
      .from("post_insights")
      .select("post_text, likes, replies, reposts")
      .in(
        "account_id",
        (
          await supabase
            .from("social_accounts")
            .select("id")
            .eq("profile_id", user.id)
            .eq("is_active", true)
        ).data?.map((a) => a.id) ?? []
      )
      .not("post_text", "is", null)
      .order("likes", { ascending: false })
      .limit(10);

    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    if (source_text || thread_mode) {
      let modelAnalysis: AnalysisResult | null = null;
      if (style === "model" && model_account_id) {
        const { data: modelAccount } = await supabase
          .from("model_accounts")
          .select("analysis_result")
          .eq("id", model_account_id)
          .eq("profile_id", user.id)
          .single();
        modelAnalysis = (modelAccount?.analysis_result as AnalysisResult) ?? null;
      }

      const systemPrompt = buildPostPrompt({
        platform,
        selectedModels: selected_models ?? [],
        hookPattern: hook_pattern,
        threadCount: thread_count,
        customInstructions: custom_instructions,
        longForm: long_form,
        modelAnalysis,
        writingInstructions:
          style === "custom"
            ? custom_instructions
            : profile?.custom_writing_instructions ?? undefined,
        topPostsContext:
          recentPosts && recentPosts.length > 0
            ? recentPosts.map((p, i) => `${i + 1}. ${p.post_text} (いいね${p.likes})`).join("\n")
            : undefined,
      });

      let userContent: string;
      if (source_text) {
        const articleBody = source_text.slice(0, 5000);
        const threadCountInstruction = thread_count === 1
          ? "単発の長文投稿（500字以内）を1つ生成してください。"
          : thread_count
            ? `スレッドは${thread_count}件で構成してください。`
            : "テキストの情報量に応じて最適なスレッド数（2-5件）を選んでください。";
        const longFormInstruction = long_form
          ? "6. ★長文モード: 全投稿（フック除く）を400-500字の詳細解説にしてください。"
          : "";
        const arrangeInstruction = arrange_prompt
          ? `7. ★ユーザーのアレンジ指示: ${arrange_prompt}`
          : "";

        userContent = `以下のテキストをもとに、バズりやすい投稿を生成してください。

## 貼り付けテキスト
${articleBody}

## 生成ルール
1. ★重要: 貼り付けられたテキストの内容・主張を忠実に反映してください。
2. 関連する最新動向・背景・具体的な数字を補完し、情報密度の高い投稿にしてください。
3. 情報量が多い場合は投稿2以降を400-500字の長文解説にしてください。
4. ${threadCountInstruction}
5. JSON文字列配列で返してください（例: ["投稿1", "投稿2", ...])。
6. ★絶対禁止: x.com / twitter.com のURLは絶対に含めないでください。
${longFormInstruction}
${arrangeInstruction}`.trim();
      } else {
        const threadCountInstruction = thread_count === 1
          ? "単発の長文投稿（500字以内）を1つ生成してください。"
          : thread_count
            ? `スレッドは${thread_count}件で構成してください。`
            : "テーマの情報量に応じて最適なスレッド数（2-5件）を選んでください。";
        const longFormInstructionTheme = long_form
          ? "5. ★長文モード: 全投稿（フック除く）を400-500字の詳細解説にしてください。"
          : "";
        const arrangeInstructionTheme = arrange_prompt
          ? `6. ★ユーザーのアレンジ指示: ${arrange_prompt}`
          : "";

        userContent = `テーマ: ${theme}

## 生成ルール
1. 単なる紹介で終わらせず、関連する最新動向・背景知識・具体的な数字を補足し、情報密度の高い投稿にしてください。
2. 情報量が多い場合は投稿2以降を400-500字の長文解説にしてください。
3. ${threadCountInstruction}
4. JSON配列（各要素は1投稿文の文字列）で返してください。
5. ★絶対禁止: x.com / twitter.com のURLは絶対に含めないでください。
${longFormInstructionTheme}
${arrangeInstructionTheme}`.trim();
      }

      const response = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 8192,
        messages: [{ role: "user", content: userContent }],
        system: systemPrompt,
      });

      const responseText =
        response.content[0].type === "text" ? response.content[0].text : "";
      let jsonStr = responseText;
      const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1].trim();
      } else {
        const arrayMatch = responseText.match(/\[[\s\S]*\]/);
        if (arrayMatch) jsonStr = arrayMatch[0];
      }

      let threadPosts: string[] = [];
      try {
        const parsed = JSON.parse(jsonStr);
        threadPosts = Array.isArray(parsed) ? parsed : [];
      } catch {
        const partialMatch = jsonStr.match(/"([^"]+)"/g);
        if (partialMatch && partialMatch.length > 0) {
          threadPosts = partialMatch.map((s: string) =>
            s.slice(1, -1).replace(/\\n/g, "\n").replace(/\\"/g, '"')
          );
          console.warn(`JSON parse失敗 → 正規表現で${threadPosts.length}件復元`);
        } else {
          threadPosts = [responseText.slice(0, 500)];
          console.warn("JSON parse完全失敗 → レスポンスを1投稿として復元");
        }
      }

      threadPosts = threadPosts.map(stripXLinks);

      const posts = threadPosts.map((text, i) => ({
        text,
        style: `スレッド投稿${i + 1}`,
      }));

      return NextResponse.json({
        data: {
          posts,
          thread_posts: threadPosts,
          media_urls: [],
          source_url: null,
          model: model_account_id ? "model" : "default",
          system_prompt: systemPrompt,
        },
      });
    }

    // 3パターン単発投稿生成（テーマのみ、URLなし）
    let singleModelAnalysis: AnalysisResult | null = null;
    if (style === "model" && model_account_id) {
      const { data: modelAccount } = await supabase
        .from("model_accounts")
        .select("analysis_result")
        .eq("id", model_account_id)
        .eq("profile_id", user.id)
        .single();
      singleModelAnalysis = (modelAccount?.analysis_result as AnalysisResult) ?? null;
    }

    const systemPrompt = buildSinglePostPrompt({
      platform,
      selectedModels: selected_models ?? [],
      modelAnalysis: singleModelAnalysis,
      writingInstructions:
        style === "custom"
          ? custom_instructions
          : profile?.custom_writing_instructions ?? undefined,
      topPostsContext:
        recentPosts && recentPosts.length > 0
          ? recentPosts.map((p, i) => `${i + 1}. ${p.post_text} (いいね${p.likes})`).join("\n")
          : undefined,
    });

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 8192,
      messages: [
        {
          role: "user",
          content: `テーマ: ${theme}\n\n上記テーマでバズりやすいThreads投稿文を3パターン生成してください。x.com/twitter.com URLは絶対に含めないでください。JSON形式で返してください。`,
        },
      ],
      system: systemPrompt,
    });

    const responseText =
      response.content[0].type === "text" ? response.content[0].text : "";

    let jsonStr = responseText;
    const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim();
    } else {
      const arrayMatch = responseText.match(/\[[\s\S]*\]/);
      if (arrayMatch) {
        jsonStr = arrayMatch[0];
      } else {
        const objectMatch = responseText.match(/\{[\s\S]*\}/);
        if (objectMatch) {
          jsonStr = objectMatch[0];
        }
      }
    }

    let posts: Array<{ text: string; style?: string }> = [];
    try {
      const generated = JSON.parse(jsonStr);
      posts = Array.isArray(generated) ? generated : (generated.posts ?? []);
    } catch {
      const partialMatch = jsonStr.match(/"([^"]{10,})"/g);
      if (partialMatch && partialMatch.length > 0) {
        posts = partialMatch.map((s: string, i: number) => ({
          text: s.slice(1, -1).replace(/\\n/g, "\n").replace(/\\"/g, '"'),
          style: `投稿${i + 1}`,
        }));
        console.warn(`単発JSON parse失敗 → 正規表現で${posts.length}件復元`);
      } else {
        posts = [{ text: responseText.slice(0, 500), style: "投稿1" }];
        console.warn("単発JSON parse完全失敗 → レスポンスを1投稿として復元");
      }
    }

    posts = posts.map((p) => ({ ...p, text: stripXLinks(p.text) }));

    return NextResponse.json({
      data: {
        posts,
        model: model_account_id ? "model" : "default",
        system_prompt: systemPrompt,
      },
    });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    const errStack = err instanceof Error ? err.stack?.slice(0, 300) : "";
    console.error("AI生成エラー:", errMsg, errStack);

    return NextResponse.json(
      { error: `AI投稿生成に失敗しました: ${errMsg.slice(0, 200)}` },
      { status: 500 }
    );
  }
}

/* ───────────────────────────────────────────────────────────
 * X / Threads URL 同期処理
 *   応答返却前に全工程を await で実行（Vercel は応答後の async を kill するため）
 * ─────────────────────────────────────────────────────────── */

interface SyncXParams {
  theme: string;
  platform: "threads" | "x";
  thread_mode: boolean;
  thread_count?: number;
  hook_pattern?: "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H" | "I";
  long_form?: boolean;
  arrange_prompt?: string;
  style: "default" | "model" | "custom";
  model_account_id?: string;
  selected_models?: string[];
  custom_instructions?: string;
}

async function handleSyncXOrThreads({
  supabase,
  userId,
  profileId,
  accountId,
  sourceUrl,
  params,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
  userId: string;
  profileId: string;
  accountId: string;
  sourceUrl: string;
  params: SyncXParams;
}) {
  // 1) ai_generate_jobs に processing として作成（FEのポーリング互換のため、ジョブ履歴も残す）
  const { data: job, error: jobErr } = await supabase
    .from("ai_generate_jobs")
    .insert({
      profile_id: profileId,
      account_id: accountId,
      source_url: sourceUrl,
      params_json: params,
      status: "processing",
      progress: "Xツイート取得中…",
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (jobErr || !job) {
    console.error("[ai/generate-post] sync-X ジョブ作成失敗:", jobErr);
    return NextResponse.json(
      { error: `ジョブ作成に失敗: ${jobErr?.message ?? "unknown"}` },
      { status: 500 }
    );
  }

  const jobId = job.id;

  // 2) 全工程を await で実行（Vercel maxDuration=300内に完了させる）
  try {
    const urlContent = await fetchUrlContent(sourceUrl);
    if (urlContent.error || !urlContent.text) {
      const msg = `URL取得失敗: ${urlContent.error ?? "コンテンツなし"}`;
      await supabase
        .from("ai_generate_jobs")
        .update({
          status: "error",
          error: msg,
          completed_at: new Date().toISOString(),
        })
        .eq("id", jobId);
      return NextResponse.json({
        data: { job_id: jobId, mode: "deep", status: "error", error: msg },
      });
    }

    await supabase
      .from("ai_generate_jobs")
      .update({ progress: "Claudeで投稿生成中…" })
      .eq("id", jobId);

    let modelAnalysis: AnalysisResult | null = null;
    if (params.style === "model" && params.model_account_id) {
      const { data: ma } = await supabase
        .from("model_accounts")
        .select("analysis_result")
        .eq("id", params.model_account_id)
        .eq("profile_id", userId)
        .single();
      modelAnalysis = (ma?.analysis_result as AnalysisResult) ?? null;
    }

    const { data: pf } = await supabase
      .from("profiles")
      .select("custom_writing_instructions")
      .eq("id", userId)
      .single();

    const { data: recentPosts } = await supabase
      .from("post_insights")
      .select("post_text, likes")
      .in(
        "account_id",
        (
          await supabase
            .from("social_accounts")
            .select("id")
            .eq("profile_id", userId)
            .eq("is_active", true)
        ).data?.map((a: { id: string }) => a.id) ?? []
      )
      .not("post_text", "is", null)
      .order("likes", { ascending: false })
      .limit(10);

    const systemPrompt = buildPostPrompt({
      platform: params.platform,
      selectedModels: params.selected_models ?? [],
      hookPattern: params.hook_pattern,
      threadCount: params.thread_count,
      customInstructions: params.custom_instructions,
      longForm: params.long_form,
      modelAnalysis,
      writingInstructions:
        params.style === "custom"
          ? params.custom_instructions
          : pf?.custom_writing_instructions ?? undefined,
      topPostsContext:
        recentPosts && recentPosts.length > 0
          ? recentPosts.map((p: { post_text: string; likes: number }, i: number) => `${i + 1}. ${p.post_text} (いいね${p.likes})`).join("\n")
          : undefined,
    });

    const articleBody = urlContent.text.slice(0, 4000);
    const threadCountInstruction = params.thread_count === 1
      ? "単発の長文投稿（500字以内）を1つ生成してください。"
      : params.thread_count
        ? `スレッドは${params.thread_count}件で構成してください。`
        : "情報量に応じて最適なスレッド数（2-5件）を選んでください。";
    const longFormInstruction = params.long_form
      ? "★長文モード: 全投稿（フック除く）を400-500字の詳細解説にしてください。"
      : "";
    const arrangeInstruction = params.arrange_prompt
      ? `★ユーザーのアレンジ指示: ${params.arrange_prompt}`
      : "";

    const sourceLabel = urlContent.source === "x" ? "X（Twitter）投稿" : "Threads投稿";
    const userContent = `以下の${sourceLabel}をもとに、バズりやすい日本語スレッド投稿を生成してください。

## 元${sourceLabel}（スレッド全文）
URL: ${urlContent.url}
著者: ${urlContent.title ?? "（不明）"}

${articleBody}

## 生成ルール
1. ★絶対禁止: x.com / twitter.com の URL は絶対に含めないでください。
2. ★重要: 元投稿の主張・骨子を忠実に反映してください。
3. 関連する最新動向・背景・具体的な数字を補完し、情報密度の高い投稿にしてください。
4. ${threadCountInstruction}
5. JSON文字列配列で返してください（例: ["投稿1", "投稿2", ...])。1要素=1投稿。
${longFormInstruction}
${arrangeInstruction}`.trim();

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 8192,
      messages: [{ role: "user", content: userContent }],
      system: systemPrompt,
    });

    const responseText =
      response.content[0].type === "text" ? response.content[0].text : "";
    let jsonStr = responseText;
    const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) jsonStr = jsonMatch[1].trim();
    else {
      const arrayMatch = responseText.match(/\[[\s\S]*\]/);
      if (arrayMatch) jsonStr = arrayMatch[0];
    }

    let threadPosts: string[] = [];
    try {
      const parsed = JSON.parse(jsonStr);
      threadPosts = Array.isArray(parsed) ? parsed : [];
    } catch {
      const partial = jsonStr.match(/"([^"]+)"/g);
      if (partial && partial.length > 0) {
        threadPosts = partial.map((s) => s.slice(1, -1).replace(/\\n/g, "\n").replace(/\\"/g, '"'));
      } else {
        threadPosts = [responseText.slice(0, 500)];
      }
    }
    threadPosts = threadPosts.map(stripXLinks).filter((t) => t.trim().length > 0);

    if (threadPosts.length === 0) {
      const msg = "Claudeが投稿を生成できませんでした";
      await supabase
        .from("ai_generate_jobs")
        .update({
          status: "error",
          error: msg,
          completed_at: new Date().toISOString(),
        })
        .eq("id", jobId);
      return NextResponse.json({
        data: { job_id: jobId, mode: "deep", status: "error", error: msg },
      });
    }

    await supabase
      .from("ai_generate_jobs")
      .update({ progress: `画像生成中（${threadPosts.length}枚並列）…` })
      .eq("id", jobId);

    const articleTitle = urlContent.title || params.theme || "X投稿のまとめ";
    const articleSummary = articleBody.slice(0, 800);

    const imagePromises = threadPosts.map(async (postText, i) => {
      try {
        const imgResult = await generateInfographicImage({
          articleTitle,
          articleSummary,
          threadPosts: [postText],
        });
        if (!imgResult) return null;
        const slug = `sync-x-${jobId}-${i}-${Date.now().toString(36)}`;
        const url = await uploadBufferImage(imgResult.buffer, imgResult.mimeType, slug);
        return url ?? null;
      } catch (err) {
        console.warn(`[sync-X] post${i + 1} image gen failed:`, err instanceof Error ? err.message : err);
        return null;
      }
    });
    const imageUrls = await Promise.all(imagePromises);

    const postsWithMedia = threadPosts.map((text, i) => ({
      text,
      media_url: imageUrls[i] || null,
      media_type: "image" as const,
    }));

    const detected = detectUrlType(sourceUrl);
    await supabase
      .from("ai_generate_jobs")
      .update({
        status: "done",
        progress: "完了",
        result_json: {
          posts: postsWithMedia,
          source_kind: urlContent.source,
          tweet_id: detected.type === "x" ? detected.tweetId : null,
        },
        completed_at: new Date().toISOString(),
      })
      .eq("id", jobId);

    return NextResponse.json({
      data: { job_id: jobId, mode: "deep", status: "done" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[sync-X] error:", msg);
    await supabase
      .from("ai_generate_jobs")
      .update({
        status: "error",
        error: msg.slice(0, 480),
        completed_at: new Date().toISOString(),
      })
      .eq("id", jobId);
    return NextResponse.json({
      data: { job_id: jobId, mode: "deep", status: "error", error: msg.slice(0, 200) },
    });
  }
}
