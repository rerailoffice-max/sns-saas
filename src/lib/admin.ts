/**
 * 管理者判定ユーティリティ
 * 環境変数 ADMIN_USER_IDS にカンマ区切りでSupabase user.idを設定
 */

const ADMIN_USER_IDS = (process.env.ADMIN_USER_IDS ?? "")
  .split(",")
  .map((id) => id.trim())
  .filter(Boolean);

/**
 * 指定ユーザーが管理者かどうかを判定
 */
export function isAdmin(userId: string): boolean {
  return ADMIN_USER_IDS.includes(userId);
}
