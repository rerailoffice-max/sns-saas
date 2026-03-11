/**
 * スクレイピングジョブ管理API
 * POST /api/models/[id]/scrape — 新規ジョブ作成
 * GET  /api/models/[id]/scrape — 最新ジョブのステータス取得
 */
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";

export async function POST(
  _request: NextRequest,
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

  const { data: model } = await supabase
    .from("model_accounts")
    .select("*")
    .eq("id", id)
    .eq("profile_id", user.id)
    .single();

  if (!model) {
    return NextResponse.json(
      { error: "モデルアカウントが見つかりません" },
      { status: 404 }
    );
  }

  // 既にpending/runningのジョブがないか確認
  const admin = createAdminClient();
  const { data: existingJob } = await admin
    .from("scraping_jobs")
    .select("id, status")
    .eq("model_account_id", id)
    .in("status", ["pending", "running"])
    .limit(1)
    .single();

  if (existingJob) {
    return NextResponse.json(
      { error: "既にスクレイピングが進行中です", job: existingJob },
      { status: 409 }
    );
  }

  const { data: job, error } = await admin
    .from("scraping_jobs")
    .insert({
      model_account_id: id,
      profile_id: user.id,
      username: model.username,
      platform: model.platform,
      status: "pending",
    })
    .select()
    .single();

  if (error) {
    console.error("スクレイピングジョブ作成エラー:", error);
    return NextResponse.json(
      { error: "ジョブの作成に失敗しました" },
      { status: 500 }
    );
  }

  return NextResponse.json({ data: job }, { status: 201 });
}

export async function GET(
  _request: NextRequest,
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

  // 所有権チェック
  const { data: model } = await supabase
    .from("model_accounts")
    .select("id")
    .eq("id", id)
    .eq("profile_id", user.id)
    .single();

  if (!model) {
    return NextResponse.json(
      { error: "モデルアカウントが見つかりません" },
      { status: 404 }
    );
  }

  const admin = createAdminClient();
  const { data: jobs, error } = await admin
    .from("scraping_jobs")
    .select("*")
    .eq("model_account_id", id)
    .order("created_at", { ascending: false })
    .limit(5);

  if (error) {
    console.error("スクレイピングジョブ取得エラー:", error);
    return NextResponse.json(
      { error: "ジョブの取得に失敗しました" },
      { status: 500 }
    );
  }

  return NextResponse.json({ data: jobs });
}
