/**
 * 外部API v1 - Webhook受信
 * POST /api/v1/webhook - 外部サービスからのWebhook通知を受信
 *
 * イベントタイプ:
 *   - draft.created: 下書き作成通知
 *   - draft.updated: 下書き更新通知
 *   - post.published: 投稿完了通知
 *
 * MVP-0ではログ出力のみのスタブ実装。
 * 本番では署名検証（HMAC-SHA256）を追加する。
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

/** Webhookリクエストのバリデーションスキーマ */
const webhookSchema = z.object({
  event: z.string().min(1, "イベントタイプは必須です"),
  data: z.record(z.string(), z.unknown()).optional().default({}),
  timestamp: z.string().datetime().optional(),
});

/** 対応するイベントタイプ一覧 */
const SUPPORTED_EVENTS = [
  "draft.created",
  "draft.updated",
  "post.published",
] as const;

type WebhookEvent = (typeof SUPPORTED_EVENTS)[number];

export async function POST(request: NextRequest) {
  // Webhook署名検証（MVP-0ではシークレットトークンの簡易チェック）
  const signature = request.headers.get("x-webhook-signature");
  const webhookSecret = process.env.WEBHOOK_SECRET;

  // 署名検証: シークレットが設定されている場合のみチェック
  if (webhookSecret && signature !== webhookSecret) {
    console.warn("Webhook署名不一致:", {
      received: signature?.slice(0, 8) ?? "なし",
      timestamp: new Date().toISOString(),
    });
    return NextResponse.json(
      { error: "Webhook署名が無効です" },
      { status: 401 }
    );
  }

  // リクエストボディの解析
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json(
      { error: "リクエストボディが不正なJSONです" },
      { status: 400 }
    );
  }

  // バリデーション
  const parsed = webhookSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "バリデーションエラー", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { event, data, timestamp } = parsed.data;

  // イベント処理（MVP-0: ログ出力のみ）
  const logContext = {
    event,
    data,
    timestamp: timestamp ?? new Date().toISOString(),
    source_ip: request.headers.get("x-forwarded-for") ?? "unknown",
  };

  switch (event as WebhookEvent) {
    case "draft.created":
      console.log("[Webhook] 下書き作成通知を受信:", JSON.stringify(logContext));
      // TODO: 下書き作成時の処理を実装
      // 例: 通知送信、ダッシュボード更新トリガー
      break;

    case "draft.updated":
      console.log("[Webhook] 下書き更新通知を受信:", JSON.stringify(logContext));
      // TODO: 下書き更新時の処理を実装
      break;

    case "post.published":
      console.log("[Webhook] 投稿完了通知を受信:", JSON.stringify(logContext));
      // TODO: 投稿完了時の処理を実装
      // 例: インサイト取得のトリガー、通知送信
      break;

    default:
      console.log(`[Webhook] 未対応のイベント: ${event}`, JSON.stringify(logContext));
      // 未対応イベントでもエラーにはしない（前方互換性のため）
      break;
  }

  return NextResponse.json({
    received: true,
    event,
    timestamp: new Date().toISOString(),
  });
}
