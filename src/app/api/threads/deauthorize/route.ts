/**
 * Threads アプリ連携解除コールバック
 * ユーザーがThreadsアプリの許可を取り消した時にMetaから呼ばれる
 *
 * signed_request の署名を確かめ、そのThreadsユーザーの連携を無効にしてトークンを消す。
 * 下書きなどのデータは残す（データの削除は delete-data のコールバックで行う）
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { encrypt } from "@/lib/encryption";
import { readSignedRequest, verifyMetaSignedRequest } from "@/lib/meta-signed-request";

export async function POST(request: NextRequest) {
  const signedRequest = await readSignedRequest(request);
  const payload = signedRequest ? verifyMetaSignedRequest(signedRequest) : null;

  if (!payload?.user_id) {
    console.warn("[Threads Deauthorize] 署名を確認できないリクエストを拒否しました");
    return NextResponse.json({ error: "invalid signed_request" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("social_accounts")
    .update({
      is_active: false,
      // access_token_enc は NOT NULL のため、使えない値を暗号化して上書きする
      access_token_enc: encrypt("revoked"),
      refresh_token_enc: null,
      token_expires_at: null,
    })
    .eq("platform", "threads")
    .eq("platform_user_id", String(payload.user_id));

  if (error) {
    console.error("[Threads Deauthorize] 更新エラー:", error.message);
    return NextResponse.json({ error: "update failed" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

export async function GET() {
  return NextResponse.json({ status: "ok" });
}
