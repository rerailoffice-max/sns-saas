/**
 * インサイト取得Cronジョブ
 * POST /api/cron/fetch-insights
 * 6時間毎: 直近投稿のインサイトデータを取得
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdapter } from "@/lib/adapters/factory";
import { decrypt } from "@/lib/encryption";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "認証エラー" }, { status: 401 });
  }

  const adminClient = createAdminClient();

  // 投稿済みの予約投稿を取得（直近7日以内）
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const { data: posts } = await adminClient
    .from("scheduled_posts")
    .select("*, social_accounts:account_id(*)")
    .eq("status", "published")
    .gte("published_at", sevenDaysAgo.toISOString())
    .not("platform_post_id", "is", null);

  if (!posts || posts.length === 0) {
    return NextResponse.json({ message: "対象投稿なし", processed: 0 });
  }

  let processed = 0;

  for (const post of posts) {
    try {
      const account = post.social_accounts;
      const accessToken = decrypt(account.access_token_enc);
      const adapter = getAdapter(account.platform);

      const insights = await adapter.getPostInsights(accessToken, post.platform_post_id!);

      // インサイトをupsert
      await adminClient.from("post_insights").upsert({
        account_id: post.account_id,
        platform_post_id: post.platform_post_id!,
        likes: insights.likes,
        replies: insights.replies,
        reposts: insights.reposts,
        impressions: insights.impressions ?? 0,
        quotes: insights.quotes,
        text_length: post.drafts?.text?.length ?? 0,
        hashtag_count: (post.drafts?.hashtags ?? []).length,
        fetched_at: new Date().toISOString(),
      }, {
        onConflict: "account_id,platform_post_id",
      });

      processed++;
    } catch (err) {
      console.error(`インサイト取得失敗 [${post.id}]:`, err);
    }
  }

  return NextResponse.json({ processed });
}
