/**
 * 外部API v1 - 下書き管理
 * GET /api/v1/drafts - 一覧取得（status, limit, offset パラメータ対応）
 * POST /api/v1/drafts - 新規作成（OpenClaw/Chrome拡張から）
 */

import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey, isAuthError } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createDraftSchema } from "@/lib/validations/draft";
import { getPlanLimits } from "@/lib/stripe/plans";
import type { DraftStatus } from "@/types/database";

/**
 * GET: 下書き一覧を取得
 * クエリパラメータ:
 *   - status: DraftStatus でフィルタ（省略時は全件）
 *   - limit: 取得件数（デフォルト20, 最大100）
 *   - offset: オフセット（デフォルト0）
 */
export async function GET(request: NextRequest) {
  // APIキー認証
  const auth = await authenticateApiKey(request);
  if (isAuthError(auth)) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const adminClient = createAdminClient();
  const { searchParams } = new URL(request.url);

  // クエリパラメータの解析
  const limit = Math.min(
    Math.max(parseInt(searchParams.get("limit") ?? "20", 10) || 20, 1),
    100
  );
  const offset = Math.max(parseInt(searchParams.get("offset") ?? "0", 10) || 0, 0);
  const statusFilter = searchParams.get("status") as DraftStatus | null;

  // 有効なステータス値のバリデーション
  const validStatuses: DraftStatus[] = ["draft", "scheduled", "publishing", "published", "failed"];
  if (statusFilter && !validStatuses.includes(statusFilter)) {
    return NextResponse.json(
      { error: `無効なステータスです。有効な値: ${validStatuses.join(", ")}` },
      { status: 400 }
    );
  }

  // クエリ構築
  let query = adminClient
    .from("drafts")
    .select("id, text, platform, hashtags, media_urls, status, source, metadata, created_at, updated_at", {
      count: "exact",
    })
    .eq("profile_id", auth.profileId)
    .order("created_at", { ascending: false });

  // ステータスフィルタ
  if (statusFilter) {
    query = query.eq("status", statusFilter);
  }

  // ページネーション
  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) {
    console.error("下書き一覧取得エラー:", error);
    return NextResponse.json(
      { error: "下書きの取得に失敗しました" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    data: data ?? [],
    meta: {
      total: count ?? 0,
      limit,
      offset,
    },
  });
}

/**
 * POST: 下書きを新規作成
 * リクエストボディ: createDraftSchema に準拠
 * プラン制限チェック（freeプランはAPI経由の下書き作成不可）
 */
export async function POST(request: NextRequest) {
  // APIキー認証
  const auth = await authenticateApiKey(request);
  if (isAuthError(auth)) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  // プラン制限チェック: freeプランはAPI利用不可
  const limits = getPlanLimits(auth.plan);
  if (limits.apiRatePerDay === 0) {
    return NextResponse.json(
      { error: "現在のプランではAPI経由の下書き作成はできません。プランをアップグレードしてください。" },
      { status: 403 }
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

  const parsed = createDraftSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "バリデーションエラー", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const adminClient = createAdminClient();

  // アカウントの所有者確認
  const { data: account } = await adminClient
    .from("social_accounts")
    .select("id")
    .eq("id", parsed.data.account_id)
    .eq("profile_id", auth.profileId)
    .single();

  if (!account) {
    return NextResponse.json(
      { error: "指定されたアカウントが見つかりません" },
      { status: 404 }
    );
  }

  // 下書き数の上限チェック（プラン制限）
  // MVP-0では上限なしとするが、将来的に制限を追加可能
  // const { count: currentDrafts } = await adminClient
  //   .from("drafts")
  //   .select("id", { count: "exact", head: true })
  //   .eq("profile_id", auth.profileId);

  // 下書き作成
  const { data: draft, error } = await adminClient
    .from("drafts")
    .insert({
      profile_id: auth.profileId,
      account_id: parsed.data.account_id,
      text: parsed.data.text,
      hashtags: parsed.data.hashtags ?? [],
      media_urls: parsed.data.media_urls ?? [],
      source: parsed.data.source ?? "api",
      metadata: parsed.data.metadata ?? {},
      status: "draft",
    })
    .select()
    .single();

  if (error) {
    console.error("下書き作成エラー:", error);
    return NextResponse.json(
      { error: "下書きの作成に失敗しました" },
      { status: 500 }
    );
  }

  return NextResponse.json({ data: draft }, { status: 201 });
}
