/**
 * 自動投稿設定 CRUD API
 * GET /api/settings/auto-post  - 現在の設定を取得
 * PUT /api/settings/auto-post  - 設定を更新
 */
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const updateSchema = z.object({
  is_enabled: z.boolean().optional(),
  account_id: z.string().uuid().nullable().optional(),
  approval_required: z.boolean().optional(),
  schedule_start_hour: z.number().min(0).max(23).optional(),
  schedule_end_hour: z.number().min(0).max(23).optional(),
  schedule_interval_minutes: z.number().min(30).max(240).optional(),
  rss_feeds: z
    .array(
      z.object({
        url: z.string().url(),
        source: z.string().min(1).max(50),
      })
    )
    .max(10)
    .optional(),
  x_accounts: z
    .array(z.string().min(1).max(100))
    .max(20)
    .optional(),
});

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (!user || authError) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  const { data: setting } = await supabase
    .from("auto_post_settings")
    .select("*")
    .eq("profile_id", user.id)
    .single();

  if (!setting) {
    return NextResponse.json({
      data: {
        is_enabled: false,
        account_id: null,
        approval_required: true,
        schedule_start_hour: 8,
        schedule_end_hour: 22,
        schedule_interval_minutes: 60,
        rss_feeds: [],
        x_accounts: [],
      },
    });
  }

  return NextResponse.json({ data: setting });
}

export async function PUT(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (!user || authError) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = updateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "バリデーションエラー", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  if (parsed.data.account_id) {
    const { data: account } = await supabase
      .from("social_accounts")
      .select("id")
      .eq("id", parsed.data.account_id)
      .eq("profile_id", user.id)
      .eq("is_active", true)
      .single();

    if (!account) {
      return NextResponse.json(
        { error: "有効なSNSアカウントが見つかりません" },
        { status: 404 }
      );
    }
  }

  const { data: existing } = await supabase
    .from("auto_post_settings")
    .select("id")
    .eq("profile_id", user.id)
    .single();

  if (existing) {
    const { data, error } = await supabase
      .from("auto_post_settings")
      .update({ ...parsed.data, updated_at: new Date().toISOString() })
      .eq("profile_id", user.id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: "更新に失敗しました" }, { status: 500 });
    }
    return NextResponse.json({ data });
  } else {
    const { data, error } = await supabase
      .from("auto_post_settings")
      .insert({
        profile_id: user.id,
        is_enabled: false,
        approval_required: true,
        schedule_start_hour: 8,
        schedule_end_hour: 22,
        schedule_interval_minutes: 60,
        rss_feeds: [],
        x_accounts: [],
        ...parsed.data,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: "作成に失敗しました" }, { status: 500 });
    }
    return NextResponse.json({ data }, { status: 201 });
  }
}
