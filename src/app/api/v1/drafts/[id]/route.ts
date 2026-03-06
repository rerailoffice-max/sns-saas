/**
 * 外部API v1 - 個別下書き操作
 * GET /api/v1/drafts/[id] - 下書き詳細取得
 * PUT /api/v1/drafts/[id] - 下書き更新
 * DELETE /api/v1/drafts/[id] - 下書き削除
 */

import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey, isAuthError } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { updateDraftSchema } from "@/lib/validations/draft";

/**
 * GET: 下書き詳細を取得
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // APIキー認証
  const auth = await authenticateApiKey(request);
  if (isAuthError(auth)) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  // UUIDフォーマットの簡易チェック
  if (!isValidUuid(id)) {
    return NextResponse.json(
      { error: "無効な下書きIDです" },
      { status: 400 }
    );
  }

  const adminClient = createAdminClient();
  const { data: draft, error } = await adminClient
    .from("drafts")
    .select("id, text, platform, hashtags, media_urls, status, source, metadata, created_at, updated_at")
    .eq("id", id)
    .eq("profile_id", auth.profileId)
    .single();

  if (error || !draft) {
    return NextResponse.json(
      { error: "下書きが見つかりません" },
      { status: 404 }
    );
  }

  return NextResponse.json({ data: draft });
}

/**
 * PUT: 下書きを更新
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // APIキー認証
  const auth = await authenticateApiKey(request);
  if (isAuthError(auth)) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  // UUIDフォーマットの簡易チェック
  if (!isValidUuid(id)) {
    return NextResponse.json(
      { error: "無効な下書きIDです" },
      { status: 400 }
    );
  }

  // リクエストボディの解析・バリデーション
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "リクエストボディが不正なJSONです" },
      { status: 400 }
    );
  }

  const parsed = updateDraftSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "バリデーションエラー", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  // 更新対象フィールドが空でないことを確認
  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json(
      { error: "更新するフィールドを指定してください" },
      { status: 400 }
    );
  }

  const adminClient = createAdminClient();

  // 下書きの存在確認 + 所有権チェック
  const { data: existing } = await adminClient
    .from("drafts")
    .select("id, status")
    .eq("id", id)
    .eq("profile_id", auth.profileId)
    .single();

  if (!existing) {
    return NextResponse.json(
      { error: "下書きが見つかりません" },
      { status: 404 }
    );
  }

  // published/publishing 状態の下書きは更新不可
  if (existing.status === "published" || existing.status === "publishing") {
    return NextResponse.json(
      { error: "公開済みまたは公開処理中の下書きは更新できません" },
      { status: 409 }
    );
  }

  // 更新実行
  const { data: draft, error } = await adminClient
    .from("drafts")
    .update({
      ...parsed.data,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("profile_id", auth.profileId)
    .select()
    .single();

  if (error || !draft) {
    console.error("下書き更新エラー:", error);
    return NextResponse.json(
      { error: "下書きの更新に失敗しました" },
      { status: 500 }
    );
  }

  return NextResponse.json({ data: draft });
}

/**
 * DELETE: 下書きを削除
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // APIキー認証
  const auth = await authenticateApiKey(request);
  if (isAuthError(auth)) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  // UUIDフォーマットの簡易チェック
  if (!isValidUuid(id)) {
    return NextResponse.json(
      { error: "無効な下書きIDです" },
      { status: 400 }
    );
  }

  const adminClient = createAdminClient();

  // 下書きの存在確認 + 所有権チェック
  const { data: existing } = await adminClient
    .from("drafts")
    .select("id, status")
    .eq("id", id)
    .eq("profile_id", auth.profileId)
    .single();

  if (!existing) {
    return NextResponse.json(
      { error: "下書きが見つかりません" },
      { status: 404 }
    );
  }

  // publishing 状態の下書きは削除不可
  if (existing.status === "publishing") {
    return NextResponse.json(
      { error: "公開処理中の下書きは削除できません" },
      { status: 409 }
    );
  }

  // 削除実行
  const { error } = await adminClient
    .from("drafts")
    .delete()
    .eq("id", id)
    .eq("profile_id", auth.profileId);

  if (error) {
    console.error("下書き削除エラー:", error);
    return NextResponse.json(
      { error: "下書きの削除に失敗しました" },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true }, { status: 200 });
}

/**
 * UUIDフォーマットの簡易バリデーション
 */
function isValidUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
