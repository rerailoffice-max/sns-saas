/**
 * モデルアカウント投稿一覧API
 * GET /api/models/[id]/posts - モデルの投稿データ取得
 */
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (!user || authError) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  // モデルアカウントの所有権確認
  const { data: model } = await supabase
    .from("model_accounts")
    .select("id")
    .eq("id", id)
    .eq("profile_id", user.id)
    .single();

  if (!model) {
    return NextResponse.json({ error: "モデルアカウントが見つかりません" }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get("page") ?? "1");
  const limit = parseInt(searchParams.get("limit") ?? "20");
  const sortBy = searchParams.get("sort_by") ?? "posted_at";
  const order = searchParams.get("order") ?? "desc";
  const offset = (page - 1) * limit;

  const { data, error, count } = await supabase
    .from("model_posts")
    .select("*", { count: "exact" })
    .eq("model_account_id", id)
    .order(sortBy, { ascending: order === "asc" })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error("モデル投稿取得エラー:", error);
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
