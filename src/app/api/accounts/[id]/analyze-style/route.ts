/**
 * セルフスタイル分析API
 * POST /api/accounts/[id]/analyze-style
 *
 * 自分の投稿データをClaude APIで分析し、ライティングプロファイルを生成
 */
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
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

  // 対象アカウントの所有権チェック
  const { data: account } = await supabase
    .from("social_accounts")
    .select("id, platform")
    .eq("id", id)
    .eq("profile_id", user.id)
    .single();

  if (!account) {
    return NextResponse.json(
      { error: "アカウントが見つかりません" },
      { status: 404 }
    );
  }

  // 自分の投稿データを取得（直近50件）
  const { data: posts } = await supabase
    .from("post_insights")
    .select("post_text, likes, replies, reposts, quotes, impressions, posted_at, media_type")
    .eq("account_id", id)
    .not("post_text", "is", null)
    .order("posted_at", { ascending: false })
    .limit(50);

  if (!posts || posts.length < 5) {
    return NextResponse.json(
      { error: "分析に十分な投稿データがありません（最低5件必要）" },
      { status: 400 }
    );
  }

  try {
    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    // 投稿データをテキスト化
    const postsText = posts
      .map(
        (p, i) =>
          `${i + 1}. ${p.post_text}\n   (いいね${p.likes} リプ${p.replies} RP${p.reposts} 投稿日${p.posted_at ?? "不明"})`
      )
      .join("\n\n");

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 3000,
      system: `あなたはSNS分析のプロフェッショナルです。以下の投稿データを分析して、この人の投稿スタイルを詳細にプロファイリングしてください。

JSON形式で以下の構造で返してください：
{
  "writing_style": {
    "tone": "この人の文体の特徴（例: カジュアル、ビジネス、知的、親しみやすい等）",
    "avg_length": 平均文字数（数値）,
    "emoji_usage": "絵文字の使用傾向（例: 多用、適度、少なめ、不使用）",
    "hook_patterns": ["よく使うフック（冒頭）パターンTOP5"]
  },
  "content_themes": [
    {"theme": "テーマ名", "frequency": 出現頻度（パーセント）}
  ],
  "hashtag_strategy": {
    "avg_count": 平均ハッシュタグ数,
    "top_hashtags": ["よく使うタグTOP10"],
    "usage_pattern": "ハッシュタグの使い方パターン"
  },
  "posting_frequency": {
    "avg_per_week": 週平均投稿数,
    "peak_days": ["投稿が多い曜日"],
    "peak_hours": [投稿が多い時間帯（時の数値）]
  },
  "summary": "この人の投稿スタイル総合分析（200字以内）"
}`,
      messages: [
        {
          role: "user",
          content: `以下の${posts.length}件の投稿を分析してください：\n\n${postsText}`,
        },
      ],
    });

    // レスポンスからJSON抽出
    const responseText =
      response.content[0].type === "text" ? response.content[0].text : "";

    let jsonStr = responseText;
    const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim();
    } else {
      const directMatch = responseText.match(/\{[\s\S]*\}/);
      if (directMatch) {
        jsonStr = directMatch[0];
      }
    }

    const writingProfile = {
      ...JSON.parse(jsonStr),
      analyzed_at: new Date().toISOString(),
    };

    // social_accountsのwriting_profileに保存
    const { error: updateError } = await supabase
      .from("social_accounts")
      .update({ writing_profile: writingProfile })
      .eq("id", id);

    if (updateError) {
      console.error("ライティングプロファイル保存エラー:", updateError);
    }

    return NextResponse.json({ data: writingProfile });
  } catch (err) {
    console.error("セルフ分析エラー:", err);
    return NextResponse.json(
      { error: "スタイル分析に失敗しました" },
      { status: 500 }
    );
  }
}
