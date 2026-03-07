/**
 * トークンリフレッシュ共通ロジック
 * API呼び出し前にトークン有効期限をチェックし、
 * 期限切れの場合は自動リフレッシュ + DB更新
 */
import { getAdapter } from "@/lib/adapters/factory";
import { encrypt } from "@/lib/encryption";
import type { SupabaseClient } from "@supabase/supabase-js";

// リフレッシュの閾値（期限切れ7日前にリフレッシュ）
const REFRESH_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * トークンの有効期限をチェックし、必要ならリフレッシュして有効なトークンを返す
 */
export async function ensureValidToken(
  adminClient: SupabaseClient,
  account: {
    id: string;
    platform: string;
    token_expires_at: string | null;
    access_token_enc: string;
  },
  currentAccessToken: string
): Promise<string> {
  // 有効期限がない、または十分に残っている場合はそのまま返す
  if (!account.token_expires_at) {
    return currentAccessToken;
  }

  const expiresAt = new Date(account.token_expires_at).getTime();
  const now = Date.now();

  // 期限まで閾値以上残っている場合はそのまま
  if (expiresAt - now > REFRESH_THRESHOLD_MS) {
    return currentAccessToken;
  }

  // トークンをリフレッシュ
  try {
    console.log(`[TokenRefresh] ${account.id}: トークンをリフレッシュ中...`);

    const adapter = getAdapter(account.platform as "threads" | "instagram" | "x");
    const newTokens = await adapter.refreshToken(currentAccessToken);

    // DBを更新
    const newExpiresAt = newTokens.expires_in
      ? new Date(Date.now() + newTokens.expires_in * 1000).toISOString()
      : null;

    await adminClient
      .from("social_accounts")
      .update({
        access_token_enc: encrypt(newTokens.access_token),
        token_expires_at: newExpiresAt,
      })
      .eq("id", account.id);

    console.log(`[TokenRefresh] ${account.id}: リフレッシュ成功`);

    return newTokens.access_token;
  } catch (err) {
    console.error(`[TokenRefresh] ${account.id}: リフレッシュ失敗:`, err);
    // リフレッシュに失敗した場合は現在のトークンをそのまま返す（期限内なら動くかもしれない）
    return currentAccessToken;
  }
}
