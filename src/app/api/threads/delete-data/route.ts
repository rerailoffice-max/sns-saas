/**
 * Threads データ削除リクエストコールバック
 * ユーザーがデータ削除をリクエストした時にMetaから呼ばれる
 *
 * signed_request の署名を確かめ、そのThreadsユーザーの連携情報（トークン）を削除する。
 * 下書き・予約投稿・インサイトなど、連携アカウントにひもづくデータは外部キーの on delete cascade で一緒に消える。
 * 応答は Meta が求める { url, confirmation_code }
 */

import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { readSignedRequest, verifyMetaSignedRequest } from "@/lib/meta-signed-request";

export async function POST(request: NextRequest) {
  const signedRequest = await readSignedRequest(request);
  const payload = signedRequest ? verifyMetaSignedRequest(signedRequest) : null;

  if (!payload?.user_id) {
    console.warn("[Threads Delete Data] 署名を確認できないリクエストを拒否しました");
    return NextResponse.json({ error: "invalid signed_request" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("social_accounts")
    .delete()
    .eq("platform", "threads")
    .eq("platform_user_id", String(payload.user_id));

  if (error) {
    console.error("[Threads Delete Data] 削除エラー:", error.message);
    return NextResponse.json({ error: "deletion failed" }, { status: 500 });
  }

  const confirmationCode = randomBytes(8).toString("hex");
  console.log(`[Threads Delete Data] 削除しました（確認コード: ${confirmationCode}）`);

  // 環境変数の値に末尾の改行が入っていることがあるため trim する
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://sns-saas.vercel.app").trim();
  return NextResponse.json({
    url: `${appUrl}/deletion-status?code=${confirmationCode}`,
    confirmation_code: confirmationCode,
  });
}

export async function GET() {
  return NextResponse.json({ status: "ok" });
}
