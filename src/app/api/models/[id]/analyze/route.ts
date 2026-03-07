/**
 * モデルアカウントAI分析API
 * POST /api/models/[id]/analyze - Claude APIで文体・パターンを分析
 */
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { getPlanLimits } from "@/lib/stripe/plans";
import Anthropic from "@anthropic-ai/sdk";
import type { SubscriptionPlan } from "@/types/database";

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

  // プラン制限チェック
  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("plan")
    .eq("profile_id", user.id)
    .single();

  const plan = (subscription?.plan ?? "free") as SubscriptionPlan;
  const limits = getPlanLimits(plan);

  if (!limits.aiOptimizationEnabled) {
    return NextResponse.json(
      { error: "AI分析機能はStarterプラン以上で利用できます" },
      { status: 403 }
    );
  }

  // モデルアカウント取得
  const { data: model, error: modelError } = await supabase
    .from("model_accounts")
    .select("*")
    .eq("id", id)
    .eq("profile_id", user.id)
    .single();

  if (!model || modelError) {
    return NextResponse.json(
      { error: "モデルアカウントが見つかりません" },
      { status: 404 }
    );
  }

  // モデル投稿データを取得
  const { data: posts } = await supabase
    .from("model_posts")
    .select("*")
    .eq("model_account_id", id)
    .order("posted_at", { ascending: false })
    .limit(50);

  if (!posts || posts.length === 0) {
    return NextResponse.json(
      {
        error:
          "分析に十分な投稿データがありません。先に「投稿を取得」を実行してください",
      },
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
          `${i + 1}. ${p.text ?? "(テキストなし)"}\n   ハッシュタグ: ${(p.hashtags ?? []).map((t: string) => `#${t}`).join(" ") || "なし"}\n   メディア: ${p.media_type ?? "テキスト"}\n   いいね${p.likes ?? 0} リプ${p.replies ?? 0} RP${p.reposts ?? 0}\n   投稿日: ${p.posted_at ?? "不明"}`
      )
      .join("\n\n");

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4000,
      system: `あなたはSNS分析のプロフェッショナルです。以下の投稿データを分析して、このアカウント（@${model.username}）の特徴を詳細にプロファイリングしてください。

以下のJSON形式で返してください：
{
  "writing_style": {
    "tone": "文体の特徴（例: カジュアル、ビジネス、知的、熱血、親しみやすい等）を50字以内で",
    "avg_length": 平均文字数（数値）,
    "emoji_usage": "絵文字の使用傾向（多用/適度/少なめ/不使用）",
    "hook_patterns": ["よく使う冒頭フックパターンTOP5（例: 質問形、数字、断言、体験談等）"]
  },
  "content_themes": [
    {"theme": "テーマ名", "frequency": 出現割合（0-100の数値）}
  ],
  "hashtag_strategy": {
    "avg_count": 1投稿あたりの平均ハッシュタグ数,
    "top_hashtags": ["よく使うタグTOP10（#なし）"],
    "usage_pattern": "ハッシュタグの使い方の特徴"
  },
  "posting_frequency": {
    "avg_per_week": 週平均投稿数,
    "peak_days": ["投稿が多い曜日（月〜日）"],
    "peak_hours": [投稿が多い時間帯の数値配列]
  },
  "engagement_patterns": {
    "avg_likes": 平均いいね数,
    "avg_replies": 平均リプライ数,
    "avg_reposts": 平均リポスト数,
    "top_post_features": ["バズった投稿に共通する特徴5つ"],
    "best_performing_format": "最もエンゲージメントが高い投稿フォーマット"
  },
  "summary": "このアカウントの投稿スタイル総合分析（200字以内）",
  "modeling_tips": [
    "このアカウントの文体をモデリングするためのコツ5つ（各50字以内）"
  ]
}

正確なJSON形式で返してください。コメントや余計なテキストは不要です。`,
      messages: [
        {
          role: "user",
          content: `@${model.username} の直近${posts.length}件の投稿を分析してください：\n\n${postsText}`,
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

    const analysisResult = JSON.parse(jsonStr);

    // 分析結果をDBに保存
    const { error: updateError } = await supabase
      .from("model_accounts")
      .update({
        analysis_result: analysisResult,
        last_analyzed_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (updateError) {
      console.error("分析結果保存エラー:", updateError);
    }

    return NextResponse.json({ data: analysisResult });
  } catch (err) {
    console.error("AI分析エラー:", err);
    return NextResponse.json(
      { error: "AI分析に失敗しました" },
      { status: 500 }
    );
  }
}
