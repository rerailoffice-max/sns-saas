/**
 * モデルアカウント投稿取得API
 * POST /api/models/[id]/fetch-posts
 *
 * 指定モデルアカウントの公開投稿を取得してmodel_postsテーブルに保存
 */
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";
import { ThreadsAdapter } from "@/lib/adapters/threads";
import type { ThreadListItem } from "@/types/sns";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (!user || authError) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  // モデルアカウント取得（所有権チェック）
  const { data: model, error: modelError } = await supabase
    .from("model_accounts")
    .select("*")
    .eq("id", id)
    .eq("profile_id", user.id)
    .single();

  if (!model || modelError) {
    return NextResponse.json(
      { error: "モデルアカウントが見つかりません" },
      { status: 404 }
    );
  }

  // ユーザーの接続済みアカウントからアクセストークンを取得
  const admin = createAdminClient();
  const { data: socialAccount } = await admin
    .from("social_accounts")
    .select("access_token_enc")
    .eq("profile_id", user.id)
    .eq("platform", model.platform)
    .eq("is_active", true)
    .single();

  if (!socialAccount?.access_token_enc) {
    return NextResponse.json(
      { error: "対象プラットフォームに接続されたアカウントが必要です" },
      { status: 400 }
    );
  }

  // トークン復号化
  const { decrypt } = await import("@/lib/encryption");
  const accessToken = decrypt(socialAccount.access_token_enc);

  try {
    const adapter = new ThreadsAdapter();

    // 公開投稿を取得（最大50件）
    const threadsResult = await adapter.getPublicThreads(
      model.platform_user_id ?? model.username,
      { limit: 50 }
    );

    const posts = threadsResult.data ?? [];
    if (posts.length === 0) {
      return NextResponse.json({
        data: { fetched: 0, message: "投稿が見つかりませんでした" },
      });
    }

    // model_postsにbulk upsert
    const postsToInsert = posts.map((post: ThreadListItem) => ({
      model_account_id: id,
      platform_post_id: post.id,
      text: post.text ?? null,
      hashtags: extractHashtags(post.text ?? ""),
      media_type: (post.media_type ?? "text").toLowerCase(),
      posted_at: post.timestamp ?? null,
    }));

    const { error: insertError } = await admin
      .from("model_posts")
      .upsert(postsToInsert, {
        onConflict: "model_account_id,platform_post_id",
        ignoreDuplicates: false,
      });

    if (insertError) {
      console.error("モデル投稿保存エラー:", insertError);
      // 重複エラーは無視して続行
    }

    // プロフィール情報も更新（display_name, avatar_url）
    try {
      const profile = await adapter.getPublicProfile(
        model.platform_user_id ?? model.username
      );
      await admin
        .from("model_accounts")
        .update({
          display_name: profile.display_name,
          avatar_url: profile.avatar_url,
        })
        .eq("id", id);
    } catch {
      // プロフィール取得失敗は無視
    }

    return NextResponse.json({
      data: {
        fetched: posts.length,
        message: `${posts.length}件の投稿を取得しました`,
      },
    });
  } catch (err) {
    console.error("モデル投稿取得エラー:", err);
    return NextResponse.json(
      { error: "投稿の取得に失敗しました" },
      { status: 500 }
    );
  }
}

/** テキストからハッシュタグを抽出 */
function extractHashtags(text: string): string[] {
  const matches = text.match(/#[\w\u3000-\u9FFF]+/g);
  return matches ? matches.map((tag) => tag.replace("#", "")) : [];
}
