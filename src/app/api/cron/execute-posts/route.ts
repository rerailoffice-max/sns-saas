/**
 * 予約投稿実行Cronジョブ
 * GET /api/cron/execute-posts (Vercel Cron)
 * 毎分実行: scheduled_at <= now() のペンディング投稿を処理
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdapter } from "@/lib/adapters/factory";
import { decrypt } from "@/lib/encryption";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 120;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "認証エラー" }, { status: 401 });
  }

  const adminClient = createAdminClient();
  const results = { success: 0, failed: 0, recovered: 0 };

  // 0. processing スタック復旧: 10分以上 processing のまま残っている投稿を pending に戻す
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { data: stuckPosts } = await adminClient
    .from("scheduled_posts")
    .select("id")
    .eq("status", "processing")
    .lt("updated_at", tenMinutesAgo);

  if (stuckPosts && stuckPosts.length > 0) {
    for (const stuck of stuckPosts) {
      await adminClient
        .from("scheduled_posts")
        .update({ status: "pending" })
        .eq("id", stuck.id)
        .eq("status", "processing");
      results.recovered++;
    }
  }

  // 1. 実行待ちの予約投稿を取得（最大5件ずつ処理）
  const { data: posts, error } = await adminClient
    .from("scheduled_posts")
    .select("*, drafts(*), social_accounts:account_id(*)")
    .eq("status", "pending")
    .lte("scheduled_at", new Date().toISOString())
    .order("scheduled_at", { ascending: true })
    .limit(5);

  if (error || !posts) {
    console.error("予約投稿取得エラー:", error);
    return NextResponse.json({ error: "取得に失敗しました" }, { status: 500 });
  }

  for (const post of posts) {
    // 2. アトミックにステータスを processing に更新（楽観的ロック）
    const { data: lockResult } = await adminClient
      .from("scheduled_posts")
      .update({ status: "processing" })
      .eq("id", post.id)
      .eq("status", "pending")
      .select("id");

    if (!lockResult || lockResult.length === 0) {
      continue;
    }

    try {
      const account = post.social_accounts;
      const accessToken = decrypt(account.access_token_enc);
      const adapter = getAdapter(account.platform);
      const draftMeta = post.drafts.metadata as Record<string, unknown> | null;
      const threadPosts =
        Array.isArray(draftMeta?.thread_posts) && (draftMeta.thread_posts as string[]).length >= 2
          ? (draftMeta.thread_posts as string[])
          : null;

      let firstPostId: string;

      if (threadPosts) {
        let replyToId: string | undefined;
        const threadResults: Array<{ platform_post_id: string }> = [];

        for (let i = 0; i < threadPosts.length; i++) {
          const result = await adapter.createPost(accessToken, {
            text: threadPosts[i],
            media_urls: i === 0 ? (post.drafts.media_urls ?? []) : [],
            reply_to: replyToId,
          });
          threadResults.push(result);
          replyToId = result.platform_post_id;

          if (i < threadPosts.length - 1) {
            await new Promise((r) => setTimeout(r, 3000));
          }
        }

        firstPostId = threadResults[0].platform_post_id;
      } else {
        const result = await adapter.createPost(accessToken, {
          text: post.drafts.text,
          media_urls: post.drafts.media_urls ?? [],
        });
        firstPostId = result.platform_post_id;
      }

      await adminClient
        .from("scheduled_posts")
        .update({
          status: "published",
          platform_post_id: firstPostId,
          published_at: new Date().toISOString(),
        })
        .eq("id", post.id);

      await adminClient
        .from("drafts")
        .update({ status: "published" })
        .eq("id", post.draft_id);

      results.success++;
    } catch (err) {
      console.error(`予約投稿失敗 [${post.id}]:`, err);

      const retryCount = (post.retry_count ?? 0) + 1;

      if (retryCount >= 3) {
        await adminClient.from("dead_letters").insert({
          scheduled_post_id: post.id,
          error_message: err instanceof Error ? err.message : "不明なエラー",
          retry_count: retryCount,
        });

        await adminClient
          .from("scheduled_posts")
          .update({
            status: "failed",
            retry_count: retryCount,
            last_error: err instanceof Error ? err.message : "不明なエラー",
          })
          .eq("id", post.id);
      } else {
        // リトライバックオフ: 5分後に再実行
        const backoffAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
        await adminClient
          .from("scheduled_posts")
          .update({
            status: "pending",
            retry_count: retryCount,
            last_error: err instanceof Error ? err.message : "不明なエラー",
            scheduled_at: backoffAt,
          })
          .eq("id", post.id);
      }

      results.failed++;
    }
  }

  return NextResponse.json({
    processed: posts.length,
    ...results,
  });
}
