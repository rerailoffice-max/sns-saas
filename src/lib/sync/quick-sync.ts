/**
 * 軽量同期ロジック
 * ページ表示時に呼ばれ、フォロワー数 + 最新投稿インサイトを素早く更新
 * last_synced_at から5分以内の場合はスキップ
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdapter } from "@/lib/adapters/factory";
import { decrypt } from "@/lib/encryption";
import { ensureValidToken } from "@/lib/token-refresh";

const SKIP_THRESHOLD_MS = 5 * 60 * 1000;

export interface QuickSyncResult {
  synced: boolean;
  accounts: number;
  skipped: boolean;
  error?: string;
}

export async function quickSync(userId: string): Promise<QuickSyncResult> {
  try {
    const adminClient = createAdminClient();

    const { data: accounts } = await adminClient
      .from("social_accounts")
      .select("*")
      .eq("profile_id", userId)
      .eq("is_active", true);

    if (!accounts || accounts.length === 0) {
      return { synced: false, accounts: 0, skipped: true };
    }

    // 全アカウントが最近同期済みならスキップ
    const now = Date.now();
    const allRecentlySynced = accounts.every((acc) => {
      if (!acc.last_synced_at) return false;
      return now - new Date(acc.last_synced_at).getTime() < SKIP_THRESHOLD_MS;
    });

    if (allRecentlySynced) {
      return { synced: false, accounts: accounts.length, skipped: true };
    }

    let syncedCount = 0;

    for (const account of accounts) {
      if (
        account.last_synced_at &&
        now - new Date(account.last_synced_at).getTime() < SKIP_THRESHOLD_MS
      ) {
        continue;
      }

      try {
        let accessToken = decrypt(account.access_token_enc);
        accessToken = await ensureValidToken(adminClient, account, accessToken);
        const adapter = getAdapter(account.platform);

        // 1. フォロワー数を取得
        try {
          const followerCount = await adapter.getFollowerCount(accessToken);
          const today = new Date().toISOString().split("T")[0];
          await adminClient.from("follower_snapshots").upsert(
            {
              account_id: account.id,
              follower_count: followerCount,
              following_count: 0,
              recorded_at: today,
            },
            { onConflict: "account_id,recorded_at" }
          );
        } catch (err) {
          console.error(`[QuickSync] フォロワー取得失敗 [${account.id}]:`, err);
        }

        // 2. 最新10件の投稿インサイトを取得
        try {
          const threads = await adapter.getUserThreads(accessToken, { limit: 10 });

          if (threads.data) {
            for (const post of threads.data) {
              try {
                const metrics = await adapter.getPostInsights(accessToken, post.id);
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
              } catch {
                // 個別の投稿失敗は無視
              }
            }
          }
        } catch (err) {
          console.error(`[QuickSync] 投稿取得失敗 [${account.id}]:`, err);
        }

        // 3. last_synced_at を更新
        await adminClient
          .from("social_accounts")
          .update({ last_synced_at: new Date().toISOString() })
          .eq("id", account.id);

        syncedCount++;
      } catch (err) {
        console.error(`[QuickSync] アカウント処理失敗 [${account.id}]:`, err);
      }
    }

    return { synced: true, accounts: syncedCount, skipped: false };
  } catch (err) {
    console.error("[QuickSync] 同期エラー:", err);
    return {
      synced: false,
      accounts: 0,
      skipped: false,
      error: err instanceof Error ? err.message : "同期に失敗しました",
    };
  }
}
