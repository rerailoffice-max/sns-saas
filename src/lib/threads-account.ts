/**
 * ログイン中のユーザーが接続しているThreadsアカウントのアクセストークンを取り出す
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { decrypt } from "@/lib/encryption";

/**
 * 有効なThreadsアカウントのトークンを返す。未接続・復号できないときは null
 */
export async function getActiveThreadsToken(profileId: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("social_accounts")
    .select("access_token_enc")
    .eq("profile_id", profileId)
    .eq("platform", "threads")
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data?.access_token_enc) {
    return null;
  }

  try {
    return decrypt(data.access_token_enc);
  } catch {
    return null;
  }
}
