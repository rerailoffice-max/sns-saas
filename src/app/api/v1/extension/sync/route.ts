/**
 * Chrome拡張同期API
 * POST /api/v1/extension/sync - Chrome拡張からのエンゲージメントデータ一括同期
 *
 * 機能:
 *   - APIキー認証
 *   - モデルアカウントの所有権確認
 *   - 投稿データのupsert（platform_post_id で重複排除）
 *   - 同期結果のサマリーを返却
 */

import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey, isAuthError } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { extensionSyncSchema } from "@/lib/validations/extension-sync";
import { getPlanLimits } from "@/lib/stripe/plans";

/** 同期エラーの詳細情報 */
interface SyncError {
  platform_post_id: string;
  reason: string;
}

export async function POST(request: NextRequest) {
  // APIキー認証
  const auth = await authenticateApiKey(request);
  if (isAuthError(auth)) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  // プラン制限チェック: OpenClaw/拡張機能の利用可否
  const limits = getPlanLimits(auth.plan);
  if (!limits.openclawEnabled) {
    return NextResponse.json(
      { error: "現在のプランではChrome拡張の同期機能は利用できません。プランをアップグレードしてください。" },
      { status: 403 }
    );
  }

  // リクエストボディの解析
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json(
      { error: "リクエストボディが不正なJSONです" },
      { status: 400 }
    );
  }

  // バリデーション
  const parsed = extensionSyncSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "バリデーションエラー", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { model_account_id, posts } = parsed.data;
  const adminClient = createAdminClient();

  // モデルアカウントの所有権確認
  const { data: modelAccount } = await adminClient
    .from("model_accounts")
    .select("id, username, platform")
    .eq("id", model_account_id)
    .eq("profile_id", auth.profileId)
    .single();

  if (!modelAccount) {
    return NextResponse.json(
      { error: "指定されたモデルアカウントが見つかりません" },
      { status: 404 }
    );
  }

  // 既存の投稿データを取得（重複チェック用）
  const existingPostIds = posts.map((p) => p.platform_post_id);
  const { data: existingPosts } = await adminClient
    .from("model_posts")
    .select("platform_post_id, likes, replies, reposts")
    .eq("model_account_id", model_account_id)
    .in("platform_post_id", existingPostIds);

  // 既存投稿のマップを作成（高速ルックアップ用）
  const existingMap = new Map(
    (existingPosts ?? []).map((p) => [p.platform_post_id, p])
  );

  // 同期処理
  let synced = 0;
  let skipped = 0;
  const errors: SyncError[] = [];

  for (const post of posts) {
    try {
      const existing = existingMap.get(post.platform_post_id);

      // 既存データと完全一致する場合はスキップ（エンゲージメント数が同じ）
      if (
        existing &&
        existing.likes === (post.likes ?? null) &&
        existing.replies === (post.replies ?? null) &&
        existing.reposts === (post.reposts ?? null)
      ) {
        skipped++;
        continue;
      }

      // upsert: platform_post_id の重複時は更新
      const { error: upsertError } = await adminClient
        .from("model_posts")
        .upsert(
          {
            model_account_id,
            platform_post_id: post.platform_post_id,
            text: post.text ?? null,
            media_type: post.media_type ?? null,
            posted_at: post.posted_at ?? null,
            likes: post.likes ?? null,
            replies: post.replies ?? null,
            reposts: post.reposts ?? null,
            engagement_source: "extension" as const,
            engagement_updated_at: new Date().toISOString(),
          },
          {
            onConflict: "model_account_id,platform_post_id",
          }
        );

      if (upsertError) {
        console.error(`投稿同期失敗 [${post.platform_post_id}]:`, upsertError);
        errors.push({
          platform_post_id: post.platform_post_id,
          reason: upsertError.message,
        });
      } else {
        synced++;
      }
    } catch (err) {
      console.error(`投稿同期中に予期しないエラー [${post.platform_post_id}]:`, err);
      errors.push({
        platform_post_id: post.platform_post_id,
        reason: "予期しないエラーが発生しました",
      });
    }
  }

  return NextResponse.json({
    synced,
    skipped,
    errors: errors.length,
    error_details: errors.length > 0 ? errors : undefined,
    total: posts.length,
    model_account: {
      id: modelAccount.id,
      username: modelAccount.username,
      platform: modelAccount.platform,
    },
    timestamp: new Date().toISOString(),
  });
}
