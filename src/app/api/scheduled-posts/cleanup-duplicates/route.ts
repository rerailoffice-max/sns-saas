/**
 * 予約投稿の一括削除API
 *
 * POST /api/scheduled-posts/cleanup-duplicates
 *   同じdraft_idでpending状態の予約が複数ある場合、
 *   最も早い予約時間の1件だけ残して残りを削除する。
 *
 * DELETE /api/scheduled-posts/cleanup-duplicates
 *   pending状態の予約投稿を全件削除し、紐づくdraftsをdraftステータスに戻す。
 */
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (!user || authError) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  // ユーザーのアカウントID取得
  const { data: accounts } = await supabase
    .from("social_accounts")
    .select("id")
    .eq("profile_id", user.id)
    .eq("is_active", true);

  const accountIds = accounts?.map((a: { id: string }) => a.id) ?? [];
  if (accountIds.length === 0) {
    return NextResponse.json({ message: "アカウントなし", deleted: 0 });
  }

  // pending状態の予約を全取得
  const { data: pendingPosts, error } = await supabase
    .from("scheduled_posts")
    .select("id, draft_id, scheduled_at")
    .in("account_id", accountIds)
    .eq("status", "pending")
    .order("scheduled_at", { ascending: true });

  if (error || !pendingPosts) {
    return NextResponse.json({ error: "取得に失敗しました" }, { status: 500 });
  }

  // draft_idごとにグループ化し、最初の1件以外を重複として特定
  const draftGroups = new Map<string, string[]>();
  for (const post of pendingPosts) {
    if (!post.draft_id) continue;
    const existing = draftGroups.get(post.draft_id) ?? [];
    existing.push(post.id);
    draftGroups.set(post.draft_id, existing);
  }

  const duplicateIds: string[] = [];
  for (const [, ids] of draftGroups) {
    if (ids.length > 1) {
      // 最初の1件（最も早い予約時間）は残す
      duplicateIds.push(...ids.slice(1));
    }
  }

  if (duplicateIds.length === 0) {
    return NextResponse.json({ message: "重複なし", deleted: 0 });
  }

  // 重複を削除
  const { error: deleteError } = await supabase
    .from("scheduled_posts")
    .delete()
    .in("id", duplicateIds);

  if (deleteError) {
    console.error("重複削除エラー:", deleteError);
    return NextResponse.json({ error: "削除に失敗しました" }, { status: 500 });
  }

  console.log(`[cleanup-duplicates] ${duplicateIds.length}件の重複予約を削除`);

  return NextResponse.json({
    message: `${duplicateIds.length}件の重複予約を削除しました`,
    deleted: duplicateIds.length,
    details: duplicateIds,
  });
}

/**
 * 全pending予約投稿を一括削除し、紐づくdraftsをdraftステータスに戻す
 */
export async function DELETE() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (!user || authError) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  // ユーザーのアカウントID取得
  const { data: accounts } = await supabase
    .from("social_accounts")
    .select("id")
    .eq("profile_id", user.id)
    .eq("is_active", true);

  const accountIds = accounts?.map((a: { id: string }) => a.id) ?? [];
  if (accountIds.length === 0) {
    return NextResponse.json({ message: "アカウントなし", deleted: 0 });
  }

  // pending状態の予約を全取得
  const { data: pendingPosts, error } = await supabase
    .from("scheduled_posts")
    .select("id, draft_id")
    .in("account_id", accountIds)
    .eq("status", "pending");

  if (error || !pendingPosts) {
    return NextResponse.json({ error: "取得に失敗しました" }, { status: 500 });
  }

  if (pendingPosts.length === 0) {
    return NextResponse.json({ message: "削除対象なし", deleted: 0 });
  }

  const postIds = pendingPosts.map((p) => p.id);
  const draftIds = [...new Set(pendingPosts.map((p) => p.draft_id).filter(Boolean))] as string[];

  // 予約投稿を全削除
  const { error: deleteError } = await supabase
    .from("scheduled_posts")
    .delete()
    .in("id", postIds);

  if (deleteError) {
    console.error("一括削除エラー:", deleteError);
    return NextResponse.json({ error: "削除に失敗しました" }, { status: 500 });
  }

  // 紐づくdraftsのステータスをdraftに戻す
  if (draftIds.length > 0) {
    await supabase
      .from("drafts")
      .update({ status: "draft" })
      .in("id", draftIds);
  }

  console.log(`[bulk-delete] ${postIds.length}件のpending予約を削除、${draftIds.length}件のdraftsをdraftに戻し`);

  return NextResponse.json({
    message: `${postIds.length}件の予約投稿を削除しました`,
    deleted: postIds.length,
    drafts_reverted: draftIds.length,
  });
}
