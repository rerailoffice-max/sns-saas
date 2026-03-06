/**
 * APIキー認証ヘルパー
 * 外部API v1 エンドポイントで共通使用する認証ロジック
 *
 * Authorization: Bearer <api_key> ヘッダーからキーを取得し、
 * api_keys テーブルで検証 → profile_id を返す
 */

import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { SubscriptionPlan } from "@/types/database";

/** 認証成功時の戻り値 */
export interface AuthResult {
  profileId: string;
  plan: SubscriptionPlan;
  apiKeyId: string;
}

/** 認証エラー時の戻り値 */
export interface AuthError {
  error: string;
  status: number;
}

/**
 * APIキー認証を実行する
 * - Authorization: Bearer <api_key> ヘッダーからキーを取得
 * - api_keys テーブルでキーを検索（MVP-0ではプレーンテキスト比較）
 * - last_used_at を更新
 * - profile_id と plan を返す
 */
export async function authenticateApiKey(
  request: NextRequest
): Promise<AuthResult | AuthError> {
  // Authorizationヘッダーの検証
  const authHeader = request.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return {
      error: "Authorization ヘッダーが必要です（Bearer <api_key>）",
      status: 401,
    };
  }

  const apiKey = authHeader.slice(7).trim();
  if (!apiKey) {
    return {
      error: "APIキーが空です",
      status: 401,
    };
  }

  const adminClient = createAdminClient();

  // APIキーの検索
  // MVP-0: key_prefix（先頭8文字）でフィルタリング後、プレーンテキスト比較
  // 本番: SHA-256ハッシュまたはbcryptで比較する
  const keyPrefix = apiKey.slice(0, 8);

  const { data: keyRecords, error: fetchError } = await adminClient
    .from("api_keys")
    .select("id, profile_id, key_hash, key_prefix, is_active")
    .eq("key_prefix", keyPrefix)
    .eq("is_active", true);

  if (fetchError) {
    console.error("APIキー検索エラー:", fetchError);
    return {
      error: "認証処理中にエラーが発生しました",
      status: 500,
    };
  }

  if (!keyRecords || keyRecords.length === 0) {
    return {
      error: "無効なAPIキーです",
      status: 401,
    };
  }

  // MVP-0: key_hash にプレーンテキストが保存されている前提で比較
  // 本番ではbcrypt.compare(apiKey, key_hash) を使用
  const matchedKey = keyRecords.find((k) => k.key_hash === apiKey);

  if (!matchedKey) {
    return {
      error: "無効なAPIキーです",
      status: 401,
    };
  }

  // last_used_at を更新（エラーは無視）
  await adminClient
    .from("api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", matchedKey.id);

  // サブスクリプション情報を取得
  const { data: subscription } = await adminClient
    .from("subscriptions")
    .select("plan, status")
    .eq("profile_id", matchedKey.profile_id)
    .in("status", ["active", "trialing"])
    .single();

  // サブスクリプションが無い場合はfreeプラン扱い
  const plan: SubscriptionPlan = subscription?.plan ?? "free";

  return {
    profileId: matchedKey.profile_id,
    plan,
    apiKeyId: matchedKey.id,
  };
}

/**
 * 認証結果がエラーかどうかを判定する型ガード
 */
export function isAuthError(
  result: AuthResult | AuthError
): result is AuthError {
  return "error" in result;
}
