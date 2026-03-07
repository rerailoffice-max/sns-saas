/**
 * インサイト取得Cronジョブ
 * POST /api/cron/fetch-insights
 * 6時間毎: post_insights内の全投稿のインサイトを再取得
 * + 新規投稿の自動発見・取り込み
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdapter } from "@/lib/adapters/factory";
import { decrypt } from "@/lib/encryption";
import { ensureValidToken } from "@/lib/token-refresh";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "認証エラー" }, { status: 401 });
  }

  const adminClient = createAdminClient();

  // アクティブなアカウントを全取得
  const { data: accounts } = await adminClient
    .from("social_accounts")
    .select("*")
    .eq("is_active", true);

  if (!accounts || accounts.length === 0) {
    return NextResponse.json({ message: "対象アカウントなし", processed: 0 });
  }

  let totalProcessed = 0;

  for (const account of accounts) {
    try {
      let accessToken = decrypt(account.access_token_enc);
      accessToken = await ensureValidToken(adminClient, account, accessToken);
      const adapter = getAdapter(account.platform);

      // ========================================
      // 1. post_insights内の既存レコードのインサイトを再取得（直近30日）
      // ========================================
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const { data: existingInsights } = await adminClient
        .from("post_insights")
        .select("id, platform_post_id, post_text")
        .eq("account_id", account.id)
        .gte("posted_at", thirtyDaysAgo.toISOString());

      if (existingInsights && existingInsights.length > 0) {
        for (const insight of existingInsights) {
          try {
            const metrics = await adapter.getPostInsights(
              accessToken,
              insight.platform_post_id
            );

            await adminClient
              .from("post_insights")
              .update({
                likes: metrics.likes,
                replies: metrics.replies,
                reposts: metrics.reposts,
                quotes: metrics.quotes,
                impressions: metrics.impressions ?? 0,
                fetched_at: new Date().toISOString(),
              })
              .eq("id", insight.id);

            totalProcessed++;
          } catch (err) {
            console.error(
              `[CronInsights] インサイト更新失敗 [${insight.platform_post_id}]:`,
              err
            );
          }
        }
      }

      // ========================================
      // 2. 新規投稿がないかチェック（getUserThreadsで最新25件取得）
      // ========================================
      try {
        const threads = await adapter.getUserThreads(accessToken, {
          limit: 25,
        });

        if (threads.data && threads.data.length > 0) {
          const existingIds = new Set(
            existingInsights?.map((i) => i.platform_post_id) ?? []
          );

          for (const post of threads.data) {
            if (existingIds.has(post.id)) continue;

            try {
              const metrics = await adapter.getPostInsights(
                accessToken,
                post.id
              );

              await adminClient.from("post_insights").upsert(
                {
                  account_id: account.id,
                  platform_post_id: post.id,
                  post_text: post.text ?? null,
                  post_url: post.permalink ?? null,
                  media_type: post.media_type ?? null,
                  media_url: post.media_url ?? null,
                  likes: metrics.likes,
                  replies: metrics.replies,
                  reposts: metrics.reposts,
                  quotes: metrics.quotes,
                  impressions: metrics.impressions ?? 0,
                  text_length: post.text?.length ?? 0,
                  hashtag_count: (post.text?.match(/#/g) ?? []).length,
                  posted_at: post.timestamp ?? null,
                  fetched_at: new Date().toISOString(),
                },
                { onConflict: "account_id,platform_post_id" }
              );

              totalProcessed++;
            } catch (err) {
              console.error(
                `[CronInsights] 新規投稿取得失敗 [${post.id}]:`,
                err
              );
            }
          }
        }
      } catch (err) {
        console.error(
          `[CronInsights] getUserThreads失敗 [${account.id}]:`,
          err
        );
      }

      // 同期ステータスを更新
      await adminClient
        .from("social_accounts")
        .update({ last_synced_at: new Date().toISOString() })
        .eq("id", account.id);
    } catch (err) {
      console.error(`[CronInsights] アカウント処理失敗 [${account.id}]:`, err);
    }
  }

  return NextResponse.json({ processed: totalProcessed });
}
