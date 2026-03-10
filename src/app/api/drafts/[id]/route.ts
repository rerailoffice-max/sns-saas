import { createClient } from "@/lib/supabase/server";
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

  const { data: draft, error } = await supabase
    .from("drafts")
    .update({
      ...parsed.data,
      updated_at: new Date().toISOString(),
    })
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
