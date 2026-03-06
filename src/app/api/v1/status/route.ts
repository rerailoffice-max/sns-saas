/**
 * 外部API v1 - ステータス確認
 * GET /api/v1/status - APIキー認証 → サブスクリプション情報、接続アカウント数、下書き数を返す
 */

import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey, isAuthError } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPlanLimits } from "@/lib/stripe/plans";

export async function GET(request: NextRequest) {
  // APIキー認証
  const auth = await authenticateApiKey(request);
  if (isAuthError(auth)) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const adminClient = createAdminClient();

  // 並列でデータ取得
  const [accountsResult, draftsResult, scheduledResult] = await Promise.all([
    // 接続済みSNSアカウント数
    adminClient
      .from("social_accounts")
      .select("id", { count: "exact", head: true })
      .eq("profile_id", auth.profileId)
      .eq("is_active", true),

    // 下書き数
    adminClient
      .from("drafts")
      .select("id", { count: "exact", head: true })
      .eq("profile_id", auth.profileId),

    // 予約投稿数（pending + processing）
    adminClient
      .from("scheduled_posts")
      .select("id, drafts!inner(profile_id)", { count: "exact", head: true })
      .eq("drafts.profile_id", auth.profileId)
      .in("status", ["pending", "processing"]),
  ]);

  // プラン制限情報
  const limits = getPlanLimits(auth.plan);

  return NextResponse.json({
    status: "ok",
    version: "1.0.0",
    plan: auth.plan,
    accounts_count: accountsResult.count ?? 0,
    drafts_count: draftsResult.count ?? 0,
    scheduled_posts_count: scheduledResult.count ?? 0,
    limits: {
      max_accounts: limits.maxAccounts,
      max_scheduled_per_month: limits.maxScheduledPerMonth === Infinity ? -1 : limits.maxScheduledPerMonth,
      api_rate_per_day: limits.apiRatePerDay,
      openclaw_enabled: limits.openclawEnabled,
      openclaw_per_day: limits.openclawPerDay === Infinity ? -1 : limits.openclawPerDay,
    },
    timestamp: new Date().toISOString(),
  });
}
