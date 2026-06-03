/**
 * ツリー生成 API（投稿スタジオ / Phase 2a / 2026-05-30）
 *
 * エンジン振り分け:
 *  - engine="video"（オーナー動画ツリー）: ai_generate_jobs に enqueue →
 *    Mac の deep-generate-worker が「動画DL→字幕焼付→Claudeツリー→ChatGPT図解」を実行。
 *    クライアントは GET /api/ai/generate-post?job_id=... でポーリング（既存と共用）。
 *  - engine="cloud"（既定 / 画像+テキスト・マルチテナント対応）: このサーバ内で
 *    Anthropic がツリー本文生成 ＋ Gemini で図解1枚を生成して Supabase Storage に保存。
 *    同期で {posts:[{order,text,media_url}]} を返す。Mac 不要。
 *
 * 型は POST-FORMAT-SPEC.md（動画ツリー型 / 画像型）に準拠。
 * 認証: ログインユーザーのみ。環境変数: ANTHROPIC_API_KEY（cloud） / GOOGLE_AI_API_KEY（図解）。
 */
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { buildPostPrompt } from "@/lib/prompt-engine";
import { stripXLinks } from "@/lib/x-link-sanitizer";
import { generateInfographicImage } from "@/lib/image-generator";
import { uploadBufferImage } from "@/lib/media-uploader";

function sanitizeText(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/g, "")
    .replace(/(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "");
}

const requestSchema = z.object({
  account_id: z.string().uuid(),
  engine: z.enum(["cloud", "video"]).optional().default("cloud"),
  platform: z.enum(["threads", "x"]).optional().default("threads"),
  source_url: z.string().optional(),
  source_text: z.string().max(50000).optional(),
  theme: z.string().max(300).optional(),
  thread_count: z.number().min(1).max(6).optional().default(3),
  hook_pattern: z.enum(["A", "B", "C", "D", "E", "F", "G", "H", "I"]).optional(),
  long_form: z.boolean().optional(),
  custom_instructions: z.string().max(500).optional(),
  arrange_prompt: z.string().max(500).optional(),
  with_image: z.boolean().optional().default(true),
});

function parseJsonArray(responseText: string): string[] {
  let jsonStr = responseText;
  const fence = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) jsonStr = fence[1].trim();
  else {
    const arr = responseText.match(/\[[\s\S]*\]/);
    if (arr) jsonStr = arr[0];
  }
  try {
    const parsed = JSON.parse(jsonStr);
    if (Array.isArray(parsed)) return parsed.map((x) => String(x));
    if (Array.isArray(parsed?.posts)) return parsed.posts.map((x: unknown) => String(x));
  } catch {
    const partial = jsonStr.match(/"([^"]{8,})"/g);
    if (partial?.length) {
      return partial.map((s) => s.slice(1, -1).replace(/\\n/g, "\n").replace(/\\"/g, '"'));
    }
  }
  return [responseText.slice(0, 500)];
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (!user || authError) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "バリデーションエラー", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const {
    account_id, engine, platform, thread_count, hook_pattern,
    long_form, custom_instructions, arrange_prompt, with_image,
  } = parsed.data;
  const theme = parsed.data.theme ? sanitizeText(parsed.data.theme) : "";
  const source_text = parsed.data.source_text ? sanitizeText(parsed.data.source_text) : "";
  let source_url = parsed.data.source_url;
  if (source_url && !/^https?:\/\//i.test(source_url)) source_url = `https://${source_url}`;

  // ─────────────────────────────────────────
  // engine=video: オーナーの字幕動画ツリー → 既存 deep ワーカーに委譲
  // ─────────────────────────────────────────
  if (engine === "video") {
    if (!source_url) {
      return NextResponse.json({ error: "engine=video には source_url が必須です" }, { status: 400 });
    }
    const { data: profile } = await supabase.from("profiles").select("id").eq("id", user.id).single();
    if (!profile) return NextResponse.json({ error: "プロフィール未作成" }, { status: 400 });

    const params = {
      theme, account_id, platform, thread_mode: true, thread_count, hook_pattern,
      long_form, arrange_prompt, custom_instructions, source_text,
      engine: "video", studio: true,
    };
    const { data: job, error: jobErr } = await supabase
      .from("ai_generate_jobs")
      .insert({
        profile_id: profile.id, account_id, source_url,
        params_json: params, status: "queued",
        progress: "ジョブ受付完了。動画ワーカー待機中…",
      })
      .select("id")
      .single();
    if (jobErr || !job) {
      return NextResponse.json({ error: `ジョブ作成失敗: ${jobErr?.message ?? "unknown"}` }, { status: 500 });
    }
    return NextResponse.json({ data: { job_id: job.id, mode: "deep", engine: "video", status: "queued" } });
  }

  // ─────────────────────────────────────────
  // engine=cloud: サーバ内で Anthropic ツリー生成 + Gemini 図解（同期）
  // ─────────────────────────────────────────
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "AI機能が未設定です（ANTHROPIC_API_KEY）" }, { status: 503 });
  }
  if (!theme && !source_text) {
    return NextResponse.json({ error: "theme か source_text のいずれかが必要です" }, { status: 400 });
  }

  try {
    const { data: profile } = await supabase
      .from("profiles").select("custom_writing_instructions").eq("id", user.id).single();

    const systemPrompt = buildPostPrompt({
      platform,
      selectedModels: [],
      hookPattern: hook_pattern,
      threadCount: thread_count,
      customInstructions: custom_instructions,
      longForm: long_form,
      modelAnalysis: null,
      writingInstructions: profile?.custom_writing_instructions ?? undefined,
    });

    const longFormLine = long_form ? "・全投稿（フック除く）を400-500字の詳細解説に。" : "";
    const arrangeLine = arrange_prompt ? `・アレンジ指示: ${arrange_prompt}` : "";
    const base = source_text
      ? `以下のテキストをもとに、バズりやすいThreadsツリーを生成してください。\n\n## 元テキスト\n${source_text.slice(0, 5000)}`
      : `テーマ: ${theme}`;
    const userContent = `${base}

## 生成ルール
・主張/内容を忠実に反映し、最新動向・背景・具体的数字を補完して情報密度を高く。
・スレッドは${thread_count}件で構成。冒頭2-5秒で続きを読ませるフックを1投稿目に。
・JSON配列（各要素=1投稿文の文字列）のみで返す。例: ["投稿1","投稿2"]
・★絶対禁止: x.com / twitter.com のURLは含めない。
${longFormLine}
${arrangeLine}`.trim();

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 8192,
      system: systemPrompt,
      messages: [{ role: "user", content: userContent }],
    });
    const responseText = response.content[0].type === "text" ? response.content[0].text : "";
    let threadPosts = parseJsonArray(responseText).map(stripXLinks).filter((t) => t.trim().length > 0);
    if (threadPosts.length === 0) {
      return NextResponse.json({ error: "ツリー生成に失敗しました（空応答）" }, { status: 500 });
    }

    // 図解（Gemini）を1枚生成して先頭postに添付
    let leadImageUrl: string | null = null;
    if (with_image) {
      try {
        const img = await generateInfographicImage({
          articleTitle: theme || threadPosts[0].slice(0, 60),
          articleSummary: source_text || threadPosts.join("\n").slice(0, 800),
          threadPosts,
        });
        if (img) {
          leadImageUrl = await uploadBufferImage(img.buffer, img.mimeType, `studio_${user.id}_${Date.now()}`);
        }
      } catch (e) {
        console.warn("[generate-tree] 図解生成スキップ:", e instanceof Error ? e.message : e);
      }
    }

    const posts = threadPosts.map((text, i) => ({
      order: i + 1,
      text,
      media_url: i === 0 ? leadImageUrl : null,
    }));

    return NextResponse.json({
      data: {
        engine: "cloud",
        posts,
        thread_posts: threadPosts,
        lead_image_url: leadImageUrl,
        system_prompt: systemPrompt,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[ai/generate-tree] エラー:", msg);
    return NextResponse.json({ error: `ツリー生成に失敗しました: ${msg.slice(0, 200)}` }, { status: 500 });
  }
}
