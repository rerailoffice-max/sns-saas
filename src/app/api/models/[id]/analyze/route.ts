/**
 * モデルアカウントAI分析API
 * POST /api/models/[id]/analyze - AI分析実行
 */
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { getPlanLimits } from "@/lib/stripe/plans";
import type { SubscriptionPlan } from "@/types/database";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (!user || authError) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
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
    return NextResponse.json({ error: "モデルアカウントが見つかりません" }, { status: 404 });
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
      { error: "分析に十分な投稿データがありません。先にデータを収集してください" },
      { status: 400 }
    );
  }

  try {
    // TODO: Gemini APIでAI分析を実行
    // 現在はスケルトン。MVP-0では基本統計のみ返す
    // AnalysisResult型に準拠した構造で返す
    const analysisResult = {
      writing_style: {
        tone: "分析中...",
        avg_length: Math.round(posts.reduce((sum, p) => sum + (p.text?.length ?? 0), 0) / posts.length),
        emoji_usage: "不明",
        hook_patterns: [],
      },
      content_themes: [],
      hashtag_strategy: {
        avg_count: 0,
        top_hashtags: [],
        usage_pattern: "不明",
      },
      posting_frequency: {
        avg_per_week: 0,
        peak_days: [],
        peak_hours: [],
      },
      summary: "AI分析機能は開発中です。基本統計データを表示しています。",
    };

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
    return NextResponse.json({ error: "分析に失敗しました" }, { status: 500 });
  }
}
