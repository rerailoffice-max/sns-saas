/**
 * 投稿分析API
 * GET /api/analytics/insights - インサイトデータ取得
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
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const page = parseInt(searchParams.get("page") ?? "1");
  const limit = parseInt(searchParams.get("limit") ?? "20");
  const sortBy = searchParams.get("sort_by") ?? "fetched_at";
  const order = searchParams.get("order") ?? "desc";
  const offset = (page - 1) * limit;

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

  let query = supabase
    .from("post_insights")
    .select("*", { count: "exact" })
    .eq("account_id", accountId)
    .order(sortBy, { ascending: order === "asc" })
    .range(offset, offset + limit - 1);

  if (from) {
    query = query.gte("fetched_at", from);
  }
  if (to) {
    query = query.lte("fetched_at", to);
  }

  const { data, error, count } = await query;

  if (error) {
    console.error("インサイト取得エラー:", error);
    return NextResponse.json({ error: "取得に失敗しました" }, { status: 500 });
  }

  return NextResponse.json({
    data,
    pagination: {
      page,
      limit,
      total: count ?? 0,
      totalPages: Math.ceil((count ?? 0) / limit),
    },
  });
}
