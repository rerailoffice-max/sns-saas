/**
 * 初回同期API
 * POST /api/accounts/[id]/sync
 * OAuth接続直後に過去投稿・フォロワーを一括取得
 */
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";
import { getAdapter } from "@/lib/adapters/factory";
import { decrypt } from "@/lib/encryption";
import { ensureValidToken } from "@/lib/token-refresh";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: accountId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (!user || authError) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  const adminClient = createAdminClient();

  // アカウント取得
  const { data: account, error: accountError } = await adminClient
    .from("social_accounts")
    .select("*")
    .eq("id", accountId)
    .eq("profile_id", user.id)
    .eq("is_active", true)
    .single();

  if (!account || accountError) {
    return NextResponse.json(
      { error: "アカウントが見つかりません" },
      { status: 404 }
    );
  }

  // 同期ステータスを更新
  await adminClient
    .from("social_accounts")
    .update({ sync_status: "syncing" })
    .eq("id", accountId);

  try {
    // トークン復号化 & リフレッシュチェック
    let accessToken = decrypt(account.access_token_enc);
    accessToken = await ensureValidToken(adminClient, account, accessToken);

    const adapter = getAdapter(account.platform);

    // ========================================
    // 1. 過去投稿を一括取得（最大100件）
    // ========================================
    let allPosts: Array<{
      id: string;
      text?: string | null;
      media_type?: string | null;
      media_url?: string | null;
      timestamp?: string | null;
      permalink?: string | null;
    }> = [];
    let cursor: string | undefined;

    for (let page = 0; page < 4; page++) {
      // 最大4ページ = 100件
      const threads = await adapter.getUserThreads(accessToken, {
        limit: 25,
        cursor,
      });

      if (threads.data && threads.data.length > 0) {
        allPosts = [...allPosts, ...threads.data];
      }

      // 次ページがない場合は終了
      cursor = threads.paging?.cursors?.after;
      if (!cursor) break;
    }

    console.log(`[Sync] ${allPosts.length}件の投稿を取得`);

    // 各投稿のインサイトを取得してupsert
    let syncedCount = 0;
    for (const post of allPosts) {
      try {
        // インサイト取得
        const insights = await adapter.getPostInsights(accessToken, post.id);

        // post_insights にupsert
        await adminClient.from("post_insights").upsert(
          {
            account_id: accountId,
            platform_post_id: post.id,
            post_text: post.text ?? null,
            post_url: post.permalink ?? null,
            media_type: post.media_type ?? null,
            media_url: post.media_url ?? null,
            likes: insights.likes,
            replies: insights.replies,
            reposts: insights.reposts,
            quotes: insights.quotes,
            impressions: insights.impressions ?? 0,
            text_length: post.text?.length ?? 0,
            hashtag_count: (post.text?.match(/#/g) ?? []).length,
            posted_at: post.timestamp ?? null,
            fetched_at: new Date().toISOString(),
          },
          {
            onConflict: "account_id,platform_post_id",
          }
        );

        syncedCount++;

        // レート制限対策: 50ms待機
        await new Promise((resolve) => setTimeout(resolve, 50));
      } catch (err) {
        console.error(`[Sync] 投稿インサイト取得失敗 [${post.id}]:`, err);
      }
    }

    // ========================================
    // 2. フォロワー数を取得してスナップショット作成
    // ========================================
    try {
      const followerCount = await adapter.getFollowerCount(accessToken);

      await adminClient.from("follower_snapshots").upsert(
        {
          account_id: accountId,
          follower_count: followerCount,
          following_count: 0,
          recorded_at: new Date().toISOString().split("T")[0],
        },
        {
          onConflict: "account_id,recorded_at",
        }
      );

      console.log(`[Sync] フォロワー数: ${followerCount}`);
    } catch (err) {
      console.error("[Sync] フォロワー取得失敗:", err);
    }

    // ========================================
    // 3. 同期ステータスを完了に更新
    // ========================================
    await adminClient
      .from("social_accounts")
      .update({
        sync_status: "completed",
        last_synced_at: new Date().toISOString(),
      })
      .eq("id", accountId);

    return NextResponse.json({
      message: "同期完了",
      synced_posts: syncedCount,
      total_posts: allPosts.length,
    });
  } catch (err) {
    console.error("[Sync] 同期エラー:", err);

    // 同期ステータスをエラーに更新
    await adminClient
      .from("social_accounts")
      .update({ sync_status: "error" })
      .eq("id", accountId);

    return NextResponse.json({ error: "同期に失敗しました" }, { status: 500 });
  }
}
