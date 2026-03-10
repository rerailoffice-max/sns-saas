/**
 * テーマ自動提案API
 * POST /api/ai/suggest-themes
 *
 * ユーザーのモデルアカウントの最新投稿を分析し、
 * トレンドテーマを抽出して提案する。
 */
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

interface SuggestedTheme {
  theme: string;
  reason: string;
  source_username: string;
}

export async function POST() {
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
      { error: "AI機能が設定されていません" },
      { status: 503 }
    );
  }

  const { data: models } = await supabase
    .from("model_accounts")
    .select("id, username, platform")
    .eq("profile_id", user.id)
    .eq("status", "active");

  if (!models || models.length === 0) {
    return NextResponse.json(
      { error: "モデルアカウントが登録されていません" },
      { status: 404 }
    );
  }

  const modelIds = models.map((m) => m.id);

  const { data: posts } = await supabase
    .from("model_posts")
    .select("text, likes, replies, reposts, posted_at, model_account_id")
    .in("model_account_id", modelIds)
    .not("text", "is", null)
    .order("posted_at", { ascending: false })
    .limit(100);

  if (!posts || posts.length === 0) {
    return NextResponse.json(
      { error: "モデルアカウントの投稿データがありません。先にアカウントの分析を実行してください。" },
      { status: 404 }
    );
  }

  const modelMap = new Map(models.map((m) => [m.id, m.username]));
  const postSummaries = posts.map((p) => {
    const username = modelMap.get(p.model_account_id) ?? "unknown";
    const engagement = [
      p.likes != null ? `いいね${p.likes}` : null,
      p.replies != null ? `返信${p.replies}` : null,
      p.reposts != null ? `リポスト${p.reposts}` : null,
    ]
      .filter(Boolean)
      .join(", ");
    const text = (p.text ?? "").slice(0, 200);
    return `[@${username}] ${text}${engagement ? ` (${engagement})` : ""}`;
  });

  try {
    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20250514",
      max_tokens: 1500,
      system: `あなたはSNSマーケティングの専門家です。モデルアカウントの最新投稿を分析し、今バズりそうなテーマを提案してください。

ルール:
- 提案数は8〜12件
- 各テーマは具体的かつ投稿しやすい粒度にする（「AIの最新動向」のような抽象的なものはNG）
- エンゲージメントが高い投稿のテーマを優先する
- 類似テーマは統合する
- JSON配列で返す。各要素は {"theme": "テーマ名", "reason": "選定理由（20字以内）", "source_username": "参考アカウント名"}`,
      messages: [
        {
          role: "user",
          content: `以下のモデルアカウントの最新投稿からトレンドテーマを抽出してください。\n\n${postSummaries.join("\n")}`,
        },
      ],
    });

    const responseText =
      response.content[0].type === "text" ? response.content[0].text : "";

    let themes: SuggestedTheme[] = [];
    const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
    const jsonStr = jsonMatch
      ? jsonMatch[1].trim()
      : responseText.match(/\[[\s\S]*\]/)?.[0] ?? "[]";

    try {
      themes = JSON.parse(jsonStr);
    } catch {
      themes = [];
    }

    if (!Array.isArray(themes)) themes = [];

    return NextResponse.json({
      data: {
        themes: themes.slice(0, 12),
        post_count: posts.length,
        model_count: models.length,
      },
    });
  } catch (err) {
    console.error("テーマ提案エラー:", err);
    const detail = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: "テーマ提案に失敗しました", debug_detail: detail },
      { status: 500 }
    );
  }
}
