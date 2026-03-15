import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";
import { updateDraftSchema } from "@/lib/validations/draft";

export async function PUT(
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

  const body = await request.json();
  const parsed = updateDraftSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "入力が不正です", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const updatePayload: Record<string, unknown> = {
    ...parsed.data,
    updated_at: new Date().toISOString(),
  };
  if (body.metadata) {
    updatePayload.metadata = body.metadata;
  }

  const { data: draft, error } = await supabase
    .from("drafts")
    .update(updatePayload)
    .eq("id", id)
    .eq("profile_id", user.id)
    .select()
    .single();

  if (error || !draft) {
    return NextResponse.json(
      { error: "下書きの更新に失敗しました" },
      { status: 500 }
    );
  }

  return NextResponse.json({ draft });
}

const ALLOWED_STATUS_TRANSITIONS: Record<string, string[]> = {
  pending_approval: ["draft", "rejected"],
  rejected: ["draft"],
  scheduled: ["draft"],
};

export async function PATCH(
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

  const body = await request.json();

  // instant_post アクション: scheduled_posts に now() で登録して即時投稿
  if (body.action === "instant_post") {
    const { data: existing } = await supabase
      .from("drafts")
      .select("id, account_id, status")
      .eq("id", id)
      .eq("profile_id", user.id)
      .single();

    if (!existing) {
      return NextResponse.json({ error: "下書きが見つかりません" }, { status: 404 });
    }

    const admin = createAdminClient();

    // 既存の pending scheduled_post をキャンセル
    await admin
      .from("scheduled_posts")
      .update({ status: "failed", last_error: "即時投稿に置き換え" })
      .eq("draft_id", id)
      .eq("status", "pending");

    // now() で新規登録（execute-posts cron が1分以内に処理）
    const { error: insertError } = await admin.from("scheduled_posts").insert({
      draft_id: id,
      account_id: existing.account_id,
      scheduled_at: new Date().toISOString(),
      status: "pending",
    });

    if (insertError) {
      return NextResponse.json({ error: "即時投稿の登録に失敗しました" }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: "1分以内に投稿されます" });
  }

  const newStatus = body.status as string;

  if (!newStatus) {
    return NextResponse.json({ error: "status または action が必要です" }, { status: 400 });
  }

  const { data: existing } = await supabase
    .from("drafts")
    .select("status")
    .eq("id", id)
    .eq("profile_id", user.id)
    .single();

  if (!existing) {
    return NextResponse.json({ error: "下書きが見つかりません" }, { status: 404 });
  }

  const allowed = ALLOWED_STATUS_TRANSITIONS[existing.status];
  if (!allowed || !allowed.includes(newStatus)) {
    return NextResponse.json(
      { error: `${existing.status} → ${newStatus} への変更はできません` },
      { status: 400 }
    );
  }

  const { data: draft, error } = await supabase
    .from("drafts")
    .update({ status: newStatus, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("profile_id", user.id)
    .select()
    .single();

  if (error || !draft) {
    return NextResponse.json({ error: "更新に失敗しました" }, { status: 500 });
  }

  return NextResponse.json({ draft });
}

export async function DELETE(
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

  const { error } = await supabase
    .from("drafts")
    .delete()
    .eq("id", id)
    .eq("profile_id", user.id);

  if (error) {
    return NextResponse.json(
      { error: "下書きの削除に失敗しました" },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
