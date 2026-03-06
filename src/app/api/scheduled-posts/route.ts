/**
 * 予約投稿管理API
 * GET /api/scheduled-posts - 一覧取得
 * POST /api/scheduled-posts - 新規作成
 */
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { createScheduledPostSchema } from "@/lib/validations/scheduled-post";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (!user || authError) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  // ユーザーのアクティブなアカウントID取得（scheduled_postsにはprofile_idがないため）
  const { data: accounts } = await supabase
    .from("social_accounts")
    .select("id")
    .eq("profile_id", user.id)
    .eq("is_active", true);

  const accountIds = accounts?.map((a) => a.id) ?? [];

  if (accountIds.length === 0) {
    return NextResponse.json({
      data: [],
      pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
    });
  }

  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get("page") ?? "1");
  const limit = parseInt(searchParams.get("limit") ?? "20");
  const status = searchParams.get("status");
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const offset = (page - 1) * limit;

  let query = supabase
    .from("scheduled_posts")
    .select("*, drafts(*)", { count: "exact" })
    .in("account_id", accountIds)
    .order("scheduled_at", { ascending: true })
    .range(offset, offset + limit - 1);

  if (status) {
    query = query.eq("status", status);
  }
  if (from) {
    query = query.gte("scheduled_at", from);
  }
  if (to) {
    query = query.lte("scheduled_at", to);
  }

  const { data, error, count } = await query;

  if (error) {
    console.error("予約投稿一覧取得エラー:", error);
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

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (!user || authError) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = createScheduledPostSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "バリデーションエラー", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  // 下書きの存在確認
  const { data: draft, error: draftError } = await supabase
    .from("drafts")
    .select("*")
    .eq("id", parsed.data.draft_id)
    .eq("profile_id", user.id)
    .single();

  if (!draft || draftError) {
    return NextResponse.json({ error: "下書きが見つかりません" }, { status: 404 });
  }

  // SNSアカウントの確認
  const { data: account, error: accountError } = await supabase
    .from("social_accounts")
    .select("*")
    .eq("id", parsed.data.account_id)
    .eq("profile_id", user.id)
    .eq("is_active", true)
    .single();

  if (!account || accountError) {
    return NextResponse.json({ error: "有効なSNSアカウントが見つかりません" }, { status: 404 });
  }

  // 予約投稿を作成
  const { data: post, error } = await supabase
    .from("scheduled_posts")
    .insert({
      draft_id: parsed.data.draft_id,
      account_id: parsed.data.account_id,
      scheduled_at: parsed.data.scheduled_at,
      status: "pending",
    })
    .select()
    .single();

  if (error) {
    console.error("予約投稿作成エラー:", error);
    return NextResponse.json({ error: "作成に失敗しました" }, { status: 500 });
  }

  // 下書きのステータスを更新
  await supabase
    .from("drafts")
    .update({ status: "scheduled" })
    .eq("id", parsed.data.draft_id);

  return NextResponse.json({ data: post }, { status: 201 });
}
