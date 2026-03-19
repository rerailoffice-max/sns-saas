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
import { searchJapaneseArticle } from "@/lib/brave-search";
import { buildPostPrompt, buildSinglePostPrompt } from "@/lib/prompt-engine";
import type { AnalysisResult } from "@/types/database";

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
    arrange_prompt,
    long_form,
    thread_mode,
    hook_pattern,
    thread_count,
    platform,
    source_text,
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

    // source_text, source_url, または thread_mode の場合: スレッド形式生成
    if (source_text || source_url || thread_mode) {
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
      let fetchedMediaUrls: string[] = [];
      let fetchedSource = "";
      if (source_text) {
        // ユーザーが手動で貼り付けたテキストを使用
        const articleBody = source_text.slice(0, 5000);
        const threadCountInstruction = thread_count === 1
          ? "単発の長文投稿（500字以内）を1つ生成してください。"
          : thread_count
            ? `スレッドは${thread_count}件で構成してください。`
            : "テキストの情報量に応じて最適なスレッド数（2-5件）を選んでください。";

        const longFormInstruction = long_form
          ? "6. ★長文モード: 全投稿（フック除く）を400-500字の詳細解説にしてください。数字・背景・影響を具体的に。"
          : "";
        const arrangeInstruction = arrange_prompt
          ? `7. ★ユーザーのアレンジ指示: ${arrange_prompt}`
          : "";

        userContent = `以下のテキストをもとに、バズりやすい投稿を生成してください。

## 貼り付けテキスト
${articleBody}

## 生成ルール
1. ★重要: 貼り付けられたテキストの内容・主張を忠実に反映してください。テキストと無関係な内容を生成しないでください。
2. その上で、関連する最新動向・背景・具体的な数字を補完し、元テキストより有益で情報密度の高い投稿にしてください
3. 情報量が多い場合は投稿2以降を400-500字の長文解説にしてください
4. ${threadCountInstruction}
5. JSON文字列配列で返してください（例: ["投稿1", "投稿2", ...])
${longFormInstruction}
${arrangeInstruction}`.trim();

        console.log(`[ai/generate-post] 貼り付けテキスト使用: textLen=${source_text.length}`);
      } else if (source_url) {
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

        console.log(`[ai/generate-post] URL取得結果: source=${urlContent.source}, title=${urlContent.title ?? "(なし)"}, textLen=${urlContent.text.length}, media=${urlContent.mediaUrls.length}`);
        console.log(`[ai/generate-post] URL取得テキスト先頭200文字: ${urlContent.text.slice(0, 200)}`);

        const articleBody = urlContent.text.slice(0, 3000);
        const isEnglish = /^[a-zA-Z0-9\s.,!?'"()\-:;]+$/.test(
          (urlContent.title ?? "").slice(0, 50)
        );

        let jaArticle: { url: string; title: string } | null = null;
        if (isEnglish) {
          try {
            jaArticle = await searchJapaneseArticle(urlContent.title ?? "", fetchedSource);
          } catch { /* 検索失敗時は英語URLで続行 */ }
        }

        const urlInstruction = jaArticle
          ? `1. **投稿1の冒頭**に以下の日本語記事URLを配置してください: ${jaArticle.url}\n   （日本語記事タイトル: ${jaArticle.title}）`
          : isEnglish
            ? `1. **投稿1の冒頭**に元URLを配置してください: ${source_url}\n   ※海外メディアの報道として紹介してください`
            : `1. **投稿1の冒頭**にURLを配置してください: ${source_url}`;

        const threadCountInstruction = thread_count === 1
          ? "単発の長文投稿（500字以内）を1つ生成してください。"
          : thread_count
            ? `スレッドは${thread_count}件で構成してください。`
            : "記事の情報量に応じて最適なスレッド数（2-5件）を選んでください。";

        const longFormInstruction = long_form
          ? "7. ★長文モード: 全投稿（フック除く）を400-500字の詳細解説にしてください。数字・背景・影響を具体的に。"
          : "";
        const arrangeInstruction = arrange_prompt
          ? `8. ★ユーザーのアレンジ指示: ${arrange_prompt}`
          : "";

        const sourceLabel = urlContent.source === "x" ? "X（Twitter）投稿" : "記事";
        const faithfulInstruction = urlContent.source === "x"
          ? "2. ★重要: 元のX投稿の内容・主張を忠実に反映してください。元投稿と無関係な内容を生成しないでください。その上で、関連する最新動向・背景・具体的な数字を補完してください"
          : "2. 元記事の情報だけで終わらせず、あなたの知識から**関連する最新動向・背景・具体的な数字・業界への影響**を補完し、元記事より有益で情報密度の高い投稿にしてください";

        userContent = `以下の${sourceLabel}をもとに、バズりやすい投稿を生成してください。

## 元${sourceLabel}情報
URL: ${urlContent.url}
タイトル: ${urlContent.title ?? "（なし）"}
${jaArticle ? `\n## 日本語記事\nタイトル: ${jaArticle.title}\nURL: ${jaArticle.url}` : ""}

## ${sourceLabel}本文（抜粋）
${articleBody}

## 生成ルール
${urlInstruction}
${faithfulInstruction}
3. 情報量が多い場合は投稿2以降を400-500字の長文解説にしてください（@kudooo_ai型）
4. ${threadCountInstruction}
5. 日本語で、分かりやすく解説
6. JSON文字列配列で返してください（例: ["投稿1", "投稿2", ...])
${longFormInstruction}
${arrangeInstruction}`.trim();
      } else {
        const threadCountInstruction = thread_count === 1
          ? "単発の長文投稿（500字以内）を1つ生成してください。"
          : thread_count
            ? `スレッドは${thread_count}件で構成してください。`
            : "テーマの情報量に応じて最適なスレッド数（2-5件）を選んでください。";

        const longFormInstructionTheme = long_form
          ? "5. ★長文モード: 全投稿（フック除く）を400-500字の詳細解説にしてください。数字・背景・影響を具体的に。"
          : "";
        const arrangeInstructionTheme = arrange_prompt
          ? `6. ★ユーザーのアレンジ指示: ${arrange_prompt}`
          : "";

        userContent = `テーマ: ${theme}

## 生成ルール
1. 単なる紹介で終わらせず、関連する最新動向・背景知識・具体的な数字を補足し、情報密度の高い投稿にする
2. 情報量が多い場合は投稿2以降を400-500字の長文解説にしてください
3. ${threadCountInstruction}
4. JSON配列（各要素は1投稿文の文字列）で返してください
${longFormInstructionTheme}
${arrangeInstructionTheme}`.trim();
      }

      const response = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
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

    const generated = JSON.parse(jsonStr);
    const posts = Array.isArray(generated) ? generated : (generated.posts ?? []);

    return NextResponse.json({
      data: {
        posts,
        model: model_account_id ? "model" : "default",
        system_prompt: systemPrompt,
      },
    });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("AI生成エラー:", errMsg);

    // JSON parse失敗の場合は具体的なメッセージ
    if (errMsg.includes("JSON") || errMsg.includes("Unexpected token")) {
      return NextResponse.json(
        { error: "AI応答の解析に失敗しました。入力テキストが長すぎる可能性があります。テキストを短くして再度お試しください。" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { error: `AI投稿生成に失敗しました: ${errMsg.slice(0, 100)}` },
      { status: 500 }
    );
  }
}
