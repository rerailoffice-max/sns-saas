/**
 * 傾向分析API
 * GET /api/analytics/trends - フォロワー推移・投稿傾向データ
 */
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (!user || authError) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const accountId = searchParams.get("account_id");
  const period = searchParams.get("period") ?? "30d"; // 7d, 30d, 90d

  if (!accountId) {
    return NextResponse.json({ error: "account_id は必須です" }, { status: 400 });
  }

  // アカウント所有権確認
  const { data: account } = await supabase
    .from("social_accounts")
    .select("id")
    .eq("id", accountId)
    .eq("profile_id", user.id)
    .single();

  if (!account) {
    return NextResponse.json({ error: "アカウントが見つかりません" }, { status: 404 });
  }

  // 期間計算
  const days = period === "7d" ? 7 : period === "90d" ? 90 : 30;
  const since = new Date();
  since.setDate(since.getDate() - days);

  // フォロワー推移データ
  const { data: followerTrends } = await supabase
    .from("follower_snapshots")
    .select("*")
    .eq("account_id", accountId)
    .gte("recorded_at", since.toISOString())
    .order("recorded_at", { ascending: true });

  // 投稿パフォーマンス集計
  const { data: postInsights } = await supabase
    .from("post_insights")
    .select("*")
    .eq("account_id", accountId)
    .gte("fetched_at", since.toISOString())
    .order("fetched_at", { ascending: true });

  // 基本統計を計算
  const totalPosts = postInsights?.length ?? 0;
  const avgLikes = totalPosts > 0
    ? (postInsights?.reduce((sum, p) => sum + (p.likes ?? 0), 0) ?? 0) / totalPosts
    : 0;
  const avgReplies = totalPosts > 0
    ? (postInsights?.reduce((sum, p) => sum + (p.replies ?? 0), 0) ?? 0) / totalPosts
    : 0;

  return NextResponse.json({
    data: {
      period,
      followerTrends: followerTrends ?? [],
      postInsights: postInsights ?? [],
      summary: {
        totalPosts,
        avgLikes: Math.round(avgLikes * 10) / 10,
        avgReplies: Math.round(avgReplies * 10) / 10,
        followerChange: followerTrends && followerTrends.length >= 2
          ? followerTrends[followerTrends.length - 1].follower_count - followerTrends[0].follower_count
          : 0,
      },
    },
  });
}
