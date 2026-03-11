/**
 * モデルアカウント管理API
 * GET /api/models - 一覧取得
 * POST /api/models - 新規登録（プロフィール+投稿の自動取得付き）
 */
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";
import { createModelAccountSchema } from "@/lib/validations/model-account";
import { getPlanLimits } from "@/lib/stripe/plans";
import { ThreadsAdapter } from "@/lib/adapters/threads";
import { decrypt } from "@/lib/encryption";
import type { SubscriptionPlan } from "@/types/database";
import type { ThreadListItem } from "@/types/sns";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (!user || authError) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get("page") ?? "1");
  const limit = parseInt(searchParams.get("limit") ?? "20");
  const offset = (page - 1) * limit;

  const { data, error, count } = await supabase
    .from("model_accounts")
    .select("*", { count: "exact" })
    .eq("profile_id", user.id)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error("モデルアカウント一覧取得エラー:", error);
    return NextResponse.json({ error: "取得に失敗しました" }, { status: 500 });
  }

  return NextResponse.json({
    data,
    pagination: {
      page,
      limit,
      total: count ?? 0,
      totalPages: Math.ceil((count ?? 0) / limit),
    },
  });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (!user || authError) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = createModelAccountSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "バリデーションエラー", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  // プラン制限チェック
  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("plan")
    .eq("profile_id", user.id)
    .single();

  const plan = (subscription?.plan ?? "free") as SubscriptionPlan;
  const limits = getPlanLimits(plan);

  // 現在のモデルアカウント数を確認
  const { count: currentCount } = await supabase
    .from("model_accounts")
    .select("*", { count: "exact", head: true })
    .eq("profile_id", user.id);

  if ((currentCount ?? 0) >= limits.maxModelAccounts) {
    return NextResponse.json(
      { error: `現在のプラン（${plan}）ではモデルアカウントを${limits.maxModelAccounts}件まで登録できます` },
      { status: 403 }
    );
  }

  const { data: model, error } = await supabase
    .from("model_accounts")
    .insert({
      profile_id: user.id,
      ...parsed.data,
      status: "active",
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "このアカウントは既に登録されています" }, { status: 409 });
    }
    console.error("モデルアカウント登録エラー:", error);
    return NextResponse.json({ error: "登録に失敗しました" }, { status: 500 });
  }

  // 登録成功後: バックグラウンドでデータ取得を試みる
  if (model) {
    const cookies = request.headers.get("cookie") ?? "";
    fetchModelDataBackground(user.id, model.id, parsed.data.platform, parsed.data.username, cookies);
  }

  return NextResponse.json({ data: model }, { status: 201 });
}

/**
 * バックグラウンドでモデルアカウントのデータを取得
 * 1. Threads APIで取得を試みる（Threadsのみ）
 * 2. 失敗またはX → research/フォルダの研究データをインポート
 */
async function fetchModelDataBackground(
  profileId: string,
  modelId: string,
  platform: string,
  username: string,
  cookies: string
) {
  try {
    const admin = createAdminClient();
    let apiSuccess = false;

    // Threads: API経由で取得を試みる
    if (platform === "threads") {
      try {
        const { data: socialAccount } = await admin
          .from("social_accounts")
          .select("access_token_enc")
          .eq("profile_id", profileId)
          .eq("platform", platform)
          .eq("is_active", true)
          .single();

        if (socialAccount?.access_token_enc) {
          const accessToken = decrypt(socialAccount.access_token_enc);
          const adapter = new ThreadsAdapter();

          try {
            const profile = await adapter.getPublicProfile(username, accessToken);
            await admin
              .from("model_accounts")
              .update({
                display_name: profile.display_name,
                avatar_url: profile.avatar_url,
                platform_user_id: profile.platform_user_id,
              })
              .eq("id", modelId);
          } catch {
            // プロフィール取得失敗は無視
          }

          const threadsResult = await adapter.getPublicThreads(username, accessToken, {
            limit: 25,
          });
          const posts = threadsResult.data ?? [];

          if (posts.length > 0) {
            const postsToInsert = posts.map((post: ThreadListItem) => ({
              model_account_id: modelId,
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
            apiSuccess = true;
          }
        }
      } catch {
        // API取得失敗 → 研究データにフォールバック
      }
    }

    // API取得失敗 or X → 研究データからインポート
    if (!apiSuccess) {
      try {
        const baseUrl =
          process.env.NEXT_PUBLIC_APP_URL ||
          (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
        await fetch(`${baseUrl}/api/models/${modelId}/import-research`, {
          method: "POST",
          headers: { cookie: cookies },
        });
      } catch {
        // 研究データインポート失敗もサイレント
      }
    }

    // データ取得後: 自動AI分析を実行
    try {
      const baseUrl =
        process.env.NEXT_PUBLIC_APP_URL ||
        (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
      await fetch(`${baseUrl}/api/models/${modelId}/analyze`, {
        method: "POST",
        headers: { cookie: cookies },
      });
    } catch {
      // 自動分析失敗はサイレント
    }
  } catch (err) {
    console.error("モデルデータ自動取得エラー:", err);
  }
}

/** テキストからハッシュタグを抽出 */
function extractHashtags(text: string): string[] {
  const matches = text.match(/#[\w\u3000-\u9FFF]+/g);
  return matches ? matches.map((tag) => tag.replace("#", "")) : [];
}
