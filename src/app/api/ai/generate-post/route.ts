/**
 * AI投稿生成API
 * POST /api/ai/generate-post
 *
 * Claude APIを使って、バズりやすい投稿文を3パターン生成
 * モデルアカウントの文体指定にも対応
 */
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

const requestSchema = z.object({
  theme: z.string().min(1, "テーマは必須です").max(200),
  account_id: z.string().uuid(),
  model_account_id: z.string().uuid().optional(),
  style: z.enum(["default", "model", "custom"]).optional().default("default"),
  custom_instructions: z.string().max(500).optional(),
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

  const { theme, style, model_account_id, custom_instructions } = parsed.data;

  try {
    // ユーザーのカスタムライティング指示を取得
    const { data: profile } = await supabase
      .from("profiles")
      .select("custom_writing_instructions")
      .eq("id", user.id)
      .single();

    // モデルアカウントの分析結果を取得（指定時）
    let modelContext = "";
    if (style === "model" && model_account_id) {
      const { data: modelAccount } = await supabase
        .from("model_accounts")
        .select("username, display_name, analysis_result")
        .eq("id", model_account_id)
        .eq("profile_id", user.id)
        .single();

      if (modelAccount?.analysis_result) {
        const analysis = modelAccount.analysis_result as Record<string, unknown>;
        modelContext = `
以下のモデルアカウント（@${modelAccount.username}）の文体で生成してください：
- 文体: ${JSON.stringify(analysis.writing_style ?? {})}
- ハッシュタグ戦略: ${JSON.stringify(analysis.hashtag_strategy ?? {})}
- モデリングのコツ: ${JSON.stringify(analysis.modeling_tips ?? [])}
`;
      }
    }

    // カスタム指示
    let writingInstructions = "";
    if (style === "custom" && custom_instructions) {
      writingInstructions = `\nユーザーのカスタム指示: ${custom_instructions}`;
    } else if (
      style === "default" &&
      profile?.custom_writing_instructions
    ) {
      writingInstructions = `\nユーザーの文体指示: ${profile.custom_writing_instructions}`;
    }

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

    const topPostsContext =
      recentPosts && recentPosts.length > 0
        ? `\n参考: ユーザーの過去のバズ投稿TOP10:\n${recentPosts.map((p, i) => `${i + 1}. ${p.post_text} (いいね${p.likes})`).join("\n")}`
        : "";

    // Claude API呼び出し
    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    const systemPrompt = `あなたはSNS投稿のプロコピーライターです。Threadsで「バズる」投稿文を生成してください。

ルール:
- 500文字以内（Threads制限）
- 読者の心を掴むフック（冒頭3行）が最重要
- 具体的な数字や事実を入れる
- 問いかけや読者参加を促す要素を入れる
- 適切なハッシュタグを2-3個つける
- 必ず3パターン生成する

出力形式（JSON）:
{
  "posts": [
    {"text": "投稿文1", "style": "スタイル説明"},
    {"text": "投稿文2", "style": "スタイル説明"},
    {"text": "投稿文3", "style": "スタイル説明"}
  ]
}
${modelContext}${writingInstructions}${topPostsContext}`;

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
