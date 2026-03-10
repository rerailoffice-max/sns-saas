/**
 * AI投稿生成API
 * POST /api/ai/generate-post
 *
 * 7,000件超の研究データに基づくプロンプトエンジンで投稿文を生成。
 * スレッド形式（URL/テーマ）と3パターン単発に対応。
 */
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { fetchUrlContent } from "@/lib/url-fetcher";
import { buildPostPrompt, buildSinglePostPrompt } from "@/lib/prompt-engine";
import type { AnalysisResult } from "@/types/database";

const requestSchema = z.object({
  theme: z.string().min(1, "テーマは必須です").max(200),
  account_id: z.string().uuid(),
  model_account_id: z.string().uuid().optional(),
  selected_models: z.array(z.string()).optional(),
  style: z.enum(["default", "model", "custom"]).optional().default("default"),
  custom_instructions: z.string().max(500).optional(),
  source_url: z.string().optional(),
  thread_mode: z.boolean().optional().default(false),
  hook_pattern: z.enum(["A", "B", "C", "D", "E", "F", "G"]).optional(),
  thread_count: z.number().min(3).max(6).optional(),
  platform: z.enum(["threads", "x"]).optional().default("threads"),
});

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
    theme,
    style,
    model_account_id,
    selected_models,
    custom_instructions,
    thread_mode,
    hook_pattern,
    thread_count,
    platform,
  } = parsed.data;

  let source_url = parsed.data.source_url;
  if (source_url && !/^https?:\/\//i.test(source_url)) {
    source_url = `https://${source_url}`;
  }

  try {
    // ユーザーのカスタムライティング指示を取得
    const { data: profile } = await supabase
      .from("profiles")
      .select("custom_writing_instructions")
      .eq("id", user.id)
      .single();

    // 自分の過去投稿からパターンを参考にする
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

    // Claude API呼び出し
    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    // source_url または thread_mode の場合: スレッド形式生成
    if (source_url || thread_mode) {
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
      let fetchedMediaUrls: string[] = [];
      let fetchedSource = "";
      if (source_url) {
        const urlContent = await fetchUrlContent(source_url);
        fetchedSource = urlContent.source;
        if (urlContent.error || !urlContent.text) {
          return NextResponse.json(
            {
              error: "URLの取得に失敗しました",
              details: urlContent.error ?? "コンテンツが取得できませんでした",
            },
            { status: 400 }
          );
        }
        fetchedMediaUrls = urlContent.mediaUrls;
        userContent = `以下のURLの内容を元に、Threadsスレッド形式の投稿を生成してください。

URL: ${urlContent.url}
タイトル: ${urlContent.title ?? "（なし）"}
本文:
${urlContent.text}
${thread_count ? `\nスレッドは${thread_count}件で構成してください。` : ""}

上記内容を要約・再構成し、バズりやすいスレッド形式でJSON配列（各要素は1投稿文の文字列）で返してください。`;
      } else {
        userContent = `テーマ: ${theme}
${thread_count ? `\nスレッドは${thread_count}件で構成してください。` : ""}

上記テーマでバズりやすいThreadsスレッド形式の投稿を生成してください。JSON配列（各要素は1投稿文の文字列）で返してください。`;
      }

      const response = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2000,
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

      let threadPosts = JSON.parse(jsonStr) as string[];
      if (!Array.isArray(threadPosts)) threadPosts = [];

      if (
        source_url &&
        threadPosts.length > 0 &&
        fetchedSource === "article" &&
        !threadPosts[0].includes(source_url)
      ) {
        threadPosts[0] = threadPosts[0].trimEnd() + "\n\n" + source_url;
      }

      const posts = threadPosts.map((text, i) => ({
        text,
        style: `スレッド投稿${i + 1}`,
      }));

      return NextResponse.json({
        data: {
          posts,
          thread_posts: threadPosts,
          media_urls: fetchedMediaUrls,
          source_url: source_url ?? null,
          model: model_account_id ? "model" : "default",
          system_prompt: systemPrompt,
        },
      });
    }

    // 3パターン単発投稿生成（新プロンプトエンジン）
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
      max_tokens: 2000,
      messages: [
        {
          role: "user",
          content: `テーマ: ${theme}\n\n上記テーマでバズりやすいThreads投稿文を3パターン生成してください。JSON形式で返してください。`,
        },
      ],
      system: systemPrompt,
    });

    // レスポンスからJSON抽出
    const responseText =
      response.content[0].type === "text" ? response.content[0].text : "";

    // JSONブロックを抽出（```json...```形式にも対応）
    let jsonStr = responseText;
    const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim();
    } else {
      // 直接JSONの場合
      const directMatch = responseText.match(/\{[\s\S]*\}/);
      if (directMatch) {
        jsonStr = directMatch[0];
      }
    }

    const generated = JSON.parse(jsonStr);

    return NextResponse.json({
      data: {
        posts: generated.posts ?? [],
        model: model_account_id ? "model" : "default",
        system_prompt: systemPrompt,
      },
    });
  } catch (err) {
    console.error("AI生成エラー:", err);
    return NextResponse.json(
      { error: "AI投稿生成に失敗しました" },
      { status: 500 }
    );
  }
}
