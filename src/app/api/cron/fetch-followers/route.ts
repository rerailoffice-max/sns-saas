/**
 * フォロワー数取得Cronジョブ
 * GET /api/cron/fetch-followers (Vercel Cron)
 * 毎日0時: 全アクティブアカウントのフォロワー数スナップショット
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdapter } from "@/lib/adapters/factory";
import { decrypt } from "@/lib/encryption";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "認証エラー" }, { status: 401 });
  }

  const adminClient = createAdminClient();

  // アクティブなSNSアカウントを全取得
  const { data: accounts } = await adminClient
    .from("social_accounts")
    .select("*")
    .eq("is_active", true);

  if (!accounts || accounts.length === 0) {
    return NextResponse.json({ message: "対象アカウントなし", processed: 0 });
  }

  let processed = 0;

  for (const account of accounts) {
    try {
      const accessToken = decrypt(account.access_token_enc);
      const adapter = getAdapter(account.platform);
      const followerCount = await adapter.getFollowerCount(accessToken);

      await adminClient.from("follower_snapshots").insert({
        account_id: account.id,
        follower_count: followerCount,
        recorded_at: new Date().toISOString(),
      });

      processed++;
    } catch (err) {
      console.error(`フォロワー取得失敗 [${account.id}]:`, err);
    }
  }

  return NextResponse.json({ processed });
}
