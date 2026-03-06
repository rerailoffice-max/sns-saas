/**
 * モデルアカウント管理API
 * GET /api/models - 一覧取得
 * POST /api/models - 新規登録
 */
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { createModelAccountSchema } from "@/lib/validations/model-account";
import { getPlanLimits } from "@/lib/stripe/plans";
import type { SubscriptionPlan } from "@/types/database";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (!user || authError) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get("page") ?? "1");
  const limit = parseInt(searchParams.get("limit") ?? "20");
  const offset = (page - 1) * limit;

  const { data, error, count } = await supabase
    .from("model_accounts")
    .select("*", { count: "exact" })
    .eq("profile_id", user.id)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error("モデルアカウント一覧取得エラー:", error);
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
  const parsed = createModelAccountSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "バリデーションエラー", details: parsed.error.flatten() },
      { status: 400 }
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

  // 現在のモデルアカウント数を確認
  const { count: currentCount } = await supabase
    .from("model_accounts")
    .select("*", { count: "exact", head: true })
    .eq("profile_id", user.id);

  if ((currentCount ?? 0) >= limits.maxModelAccounts) {
    return NextResponse.json(
      { error: `現在のプラン（${plan}）ではモデルアカウントを${limits.maxModelAccounts}件まで登録できます` },
      { status: 403 }
    );
  }

  const { data: model, error } = await supabase
    .from("model_accounts")
    .insert({
      profile_id: user.id,
      ...parsed.data,
      status: "active",
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "このアカウントは既に登録されています" }, { status: 409 });
    }
    console.error("モデルアカウント登録エラー:", error);
    return NextResponse.json({ error: "登録に失敗しました" }, { status: 500 });
  }

  return NextResponse.json({ data: model }, { status: 201 });
}
