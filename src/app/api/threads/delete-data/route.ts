/**
 * Threads データ削除リクエストコールバック
 * ユーザーがデータ削除をリクエストした時にMetaから呼ばれる
 */

import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    // Metaからの署名付きリクエストを受信
    const body = await request.text();
    console.log("[Threads Delete Data] Received:", body);

    // TODO: 署名検証 + ユーザーデータ削除処理
    // 本番ではsigned_requestをパースしてユーザーを特定し、
    // 関連するすべてのデータを削除する

    // Metaが要求するレスポンス形式
    // confirmation_codeとurlを返す必要がある
    const confirmationCode = `del_${Date.now()}`;

    return NextResponse.json({
      url: `${process.env.NEXT_PUBLIC_APP_URL}/deletion-status?code=${confirmationCode}`,
      confirmation_code: confirmationCode,
    });
  } catch (error) {
    console.error("[Threads Delete Data] Error:", error);
    return NextResponse.json({
      url: `${process.env.NEXT_PUBLIC_APP_URL || "https://sns-saas.vercel.app"}/deletion-status`,
      confirmation_code: `del_error_${Date.now()}`,
    });
  }
}

export async function GET() {
  return NextResponse.json({ status: "ok" });
}
