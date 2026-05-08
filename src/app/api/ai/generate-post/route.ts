/**
 * AI投稿生成API
 *
 * 2系統:
 *  - URLあり (deep): ai_generate_jobs に enqueue → ai-lab-bot worker が
 *    動画DL/文字起こし/Claude生成/ChatGPT解説画像 を実行 → 結果書き戻し。
 *    クライアントは GET で job_id をポーリング。
 *  - URLなし (in-process): テーマ/貼付テキストから Claude が直接生成。
 *    画像生成は行わない。
 *
 * Xリンクは「絶対に貼らない」を守るため、APIのレスポンス手前でも stripXLinks を適用。
 */
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { buildPostPrompt, buildSinglePostPrompt } from "@/lib/prompt-engine";
import { stripXLinks } from "@/lib/x-link-sanitizer";
import type { AnalysisResult } from "@/types/database";

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
  // deep モード: URLが指定されたらジョブ enqueue
  //   動画DL/文字起こし/Claude生成/ChatGPT画像生成は ai-lab-bot worker が実行
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

    // 貼付テキストありor thread_modeフラグあり → スレッド形式生成
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

      // X-link 二重防御: APIレスポンス手前で全投稿に適用
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

    // X-link 二重防御
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
