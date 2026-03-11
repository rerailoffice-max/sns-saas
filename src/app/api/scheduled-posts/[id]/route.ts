/**
 * 予約投稿 個別操作API
 * PUT /api/scheduled-posts/[id]  - 予約日時・投稿テキスト更新
 * DELETE /api/scheduled-posts/[id] - 予約削除
 */
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { updateScheduledPostSchema } from "@/lib/validations/scheduled-post";

async function getAuthenticatedUser() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (!user || error) return { supabase: null, user: null };
  return { supabase, user };
}

async function getOwnedScheduledPost(
  supabase: Awaited<ReturnType<typeof createClient>>,
  postId: string,
  userId: string
) {
  const { data: accounts } = await supabase
    .from("social_accounts")
    .select("id")
    .eq("profile_id", userId)
    .eq("is_active", true);

  const accountIds = accounts?.map((a: { id: string }) => a.id) ?? [];
  if (accountIds.length === 0) return null;

  const { data: post } = await supabase
    .from("scheduled_posts")
    .select("*, drafts(*)")
    .eq("id", postId)
    .in("account_id", accountIds)
    .single();

  return post;
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { supabase, user } = await getAuthenticatedUser();

  if (!supabase || !user) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  const post = await getOwnedScheduledPost(supabase, id, user.id);
  if (!post) {
    return NextResponse.json(
      { error: "予約投稿が見つかりません" },
      { status: 404 }
    );
  }

  if (post.status !== "pending") {
    return NextResponse.json(
      { error: "待機中の予約のみ編集できます" },
      { status: 400 }
    );
  }

  const body = await request.json();
  const parsed = updateScheduledPostSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "バリデーションエラー", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { scheduled_at, account_id, draft_text } = parsed.data;

  if (account_id) {
    const { data: account } = await supabase
      .from("social_accounts")
      .select("id")
      .eq("id", account_id)
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

  const scheduledUpdate: Record<string, string> = {};
  if (scheduled_at) scheduledUpdate.scheduled_at = scheduled_at;
  if (account_id) scheduledUpdate.account_id = account_id;

  if (Object.keys(scheduledUpdate).length > 0) {
    const { error: updateError } = await supabase
      .from("scheduled_posts")
      .update(scheduledUpdate)
      .eq("id", id);

    if (updateError) {
      console.error("予約投稿更新エラー:", updateError);
      return NextResponse.json(
        { error: "予約の更新に失敗しました" },
        { status: 500 }
      );
    }
  }

  if (draft_text && post.draft_id) {
    const { error: draftError } = await supabase
      .from("drafts")
      .update({ text: draft_text })
      .eq("id", post.draft_id);

    if (draftError) {
      console.error("下書き更新エラー:", draftError);
      return NextResponse.json(
        { error: "投稿テキストの更新に失敗しました" },
        { status: 500 }
      );
    }
  }

  const { data: updated } = await supabase
    .from("scheduled_posts")
    .select("*, drafts(*)")
    .eq("id", id)
    .single();

  return NextResponse.json({ data: updated });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { supabase, user } = await getAuthenticatedUser();

  if (!supabase || !user) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  const post = await getOwnedScheduledPost(supabase, id, user.id);
  if (!post) {
    return NextResponse.json(
      { error: "予約投稿が見つかりません" },
      { status: 404 }
    );
  }

  if (post.status !== "pending") {
    return NextResponse.json(
      { error: "待機中の予約のみ削除できます" },
      { status: 400 }
    );
  }

  if (post.draft_id) {
    await supabase
      .from("drafts")
      .update({ status: "draft" })
      .eq("id", post.draft_id);
  }

  const { error } = await supabase
    .from("scheduled_posts")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("予約投稿削除エラー:", error);
    return NextResponse.json(
      { error: "削除に失敗しました" },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
