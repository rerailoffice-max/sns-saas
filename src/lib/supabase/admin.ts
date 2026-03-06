/**
 * Supabase Admin クライアント（service_role）
 * RLSをバイパスする必要がある場合に使用
 * ※ サーバーサイドのみ。クライアントには絶対に公開しないこと
 */

import { createClient } from "@supabase/supabase-js";

export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}
