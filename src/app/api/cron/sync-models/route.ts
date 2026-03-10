/**
 * モデルアカウント定期同期 Cron
 * GET /api/cron/sync-models
 *
 * 毎日3時に全activeモデルアカウントの新規投稿を取得
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";
import { ThreadsAdapter } from "@/lib/adapters/threads";
import { decrypt } from "@/lib/encryption";
import type { ThreadListItem } from "@/types/sns";

export async function GET(request: NextRequest) {
  // Vercel Cron検証
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  try {
    // 全activeモデルアカウントを取得（profile_idごとにグループ化するため）
    const { data: models, error: modelsError } = await admin
      .from("model_accounts")
      .select("id, profile_id, platform, platform_user_id, username")
      .eq("status", "active");

    if (modelsError || !models || models.length === 0) {
      return NextResponse.json({
        data: { synced: 0, message: "同期対象のモデルがありません" },
      });
    }

    let totalSynced = 0;
    let totalErrors = 0;

    // profile_idでグループ化（同じユーザーのモデルは1つのトークンで処理）
    const profileGroups = new Map<
      string,
      Array<{ id: string; platform: string; platform_user_id: string | null; username: string }>
    >();

    for (const model of models) {
      const group = profileGroups.get(model.profile_id) ?? [];
      group.push(model);
      profileGroups.set(model.profile_id, group);
    }

    for (const [profileId, profileModels] of profileGroups) {
      // このユーザーのThreadsアクセストークンを取得
      const { data: socialAccount } = await admin
        .from("social_accounts")
        .select("access_token_enc")
        .eq("profile_id", profileId)
        .eq("platform", "threads")
        .eq("is_active", true)
        .single();

      if (!socialAccount?.access_token_enc) {
        continue; // トークンがなければスキップ
      }

      const accessToken = decrypt(socialAccount.access_token_enc);
      const adapter = new ThreadsAdapter();

      for (const model of profileModels) {
        try {
          // 投稿を取得（最大25件＝新着分）
          const threadsResult = await adapter.getPublicThreads(
            model.platform_user_id ?? model.username,
            accessToken,
            { limit: 25 }
          );

          const posts = threadsResult.data ?? [];
          if (posts.length === 0) continue;

          // model_postsにupsert
          const postsToInsert = posts.map((post: ThreadListItem) => ({
            model_account_id: model.id,
            platform_post_id: post.id,
            text: post.text ?? null,
            hashtags: extractHashtags(post.text ?? ""),
            media_type: (post.media_type ?? "text").toLowerCase(),
            posted_at: post.timestamp ?? null,
          }));

          await admin.from("model_posts").upsert(postsToInsert, {
            onConflict: "model_account_id,platform_post_id",
            ignoreDuplicates: true,
          });

          totalSynced++;
        } catch (err) {
          console.error(`モデル ${model.id} 同期エラー:`, err);
          totalErrors++;
        }
      }
    }

    return NextResponse.json({
      data: {
        synced: totalSynced,
        errors: totalErrors,
        total: models.length,
      },
    });
  } catch (err) {
    console.error("モデル同期cronエラー:", err);
    return NextResponse.json(
      { error: "モデル同期に失敗しました" },
      { status: 500 }
    );
  }
}

/** テキストからハッシュタグを抽出 */
function extractHashtags(text: string): string[] {
  const matches = text.match(/#[\w\u3000-\u9FFF]+/g);
  return matches ? matches.map((tag) => tag.replace("#", "")) : [];
}
