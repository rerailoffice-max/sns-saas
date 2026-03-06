/**
 * Threads アプリ連携解除コールバック
 * ユーザーがThreadsアプリの許可を取り消した時にMetaから呼ばれる
 */

import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    // Metaからの署名付きリクエストを受信
    const body = await request.text();
    console.log("[Threads Deauthorize] Received:", body);

    // TODO: 署名検証 + ユーザーのトークン無効化処理
    // 本番ではsigned_requestをパースしてユーザーを特定し、
    // social_accountsテーブルからトークンを削除する

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Threads Deauthorize] Error:", error);
    return NextResponse.json({ success: true });
  }
}

export async function GET() {
  return NextResponse.json({ status: "ok" });
}
