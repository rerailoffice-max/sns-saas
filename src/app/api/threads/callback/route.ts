import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";
import { getAdapter } from "@/lib/adapters/factory";
import { encrypt } from "@/lib/encryption";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  // エラーチェック
  if (error) {
    return NextResponse.redirect(`${origin}/settings/accounts?error=${error}`);
  }

  // stateパラメータの検証（CSRF保護）
  const savedState = request.cookies.get("threads_oauth_state")?.value;
  if (!state || !savedState || state !== savedState) {
    return NextResponse.redirect(`${origin}/settings/accounts?error=invalid_state`);
  }

  if (!code) {
    return NextResponse.redirect(`${origin}/settings/accounts?error=no_code`);
  }

  try {
    // ユーザー認証確認
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (!user || authError) {
      return NextResponse.redirect(`${origin}/login`);
    }

    // Threads APIでトークン交換
    const adapter = getAdapter("threads");
    const tokens = await adapter.authenticate(code);

    // プロフィール取得
    const profile = await adapter.getProfile(tokens.access_token);

    // トークンを暗号化してDBに保存
    const adminClient = createAdminClient();
    // トークン有効期限を計算
    const tokenExpiresAt = tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
      : null;

    // DBに保存するデータを構築（avatar_urlカラムの有無に対応）
    const upsertData: Record<string, unknown> = {
      profile_id: user.id,
      platform: "threads",
      platform_user_id: profile.platform_user_id,
      username: profile.username,
      display_name: profile.display_name,
      access_token_enc: encrypt(tokens.access_token),
      refresh_token_enc: tokens.refresh_token ? encrypt(tokens.refresh_token) : null,
      token_expires_at: tokenExpiresAt,
      is_active: true,
    };

    // avatar_urlがあれば追加（カラムが存在する場合のみ成功する）
    if (profile.avatar_url) {
      upsertData.avatar_url = profile.avatar_url;
    }

    console.log("[Threads Callback] Upserting data for user:", user.id);

    const { error: dbError } = await adminClient
      .from("social_accounts")
      .upsert(upsertData, {
        onConflict: "profile_id,platform,platform_user_id",
      });

    if (dbError) {
      console.error("SNSアカウント保存エラー:", JSON.stringify(dbError));
      console.error("保存データ:", JSON.stringify({
        profile_id: user.id,
        platform: "threads",
        platform_user_id: profile.platform_user_id,
        username: profile.username,
        display_name: profile.display_name,
        has_avatar: !!profile.avatar_url,
        has_access_token: !!tokens.access_token,
        has_refresh_token: !!tokens.refresh_token,
      }));
      // エラー詳細をURLに含めてデバッグしやすくする
      const errorDetail = encodeURIComponent(dbError.message || dbError.code || "unknown");
      return NextResponse.redirect(`${origin}/settings/accounts?error=db_save_failed&detail=${errorDetail}`);
    }

    // 初回同期を非同期でトリガー（fire-and-forget）
    const { data: savedAccount } = await adminClient
      .from("social_accounts")
      .select("id")
      .eq("profile_id", user.id)
      .eq("platform", "threads")
      .eq("platform_user_id", profile.platform_user_id)
      .single();

    if (savedAccount) {
      const syncUrl = `${origin}/api/accounts/${savedAccount.id}/sync`;
      fetch(syncUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: request.headers.get("cookie") || "",
        },
      }).catch((err) => {
        console.error("[Callback] 初回同期トリガーエラー:", err);
      });
      console.log(`[Callback] 初回同期をトリガー: ${savedAccount.id}`);
    }

    // stateクッキーを削除
    const response = NextResponse.redirect(`${origin}/settings/accounts?success=threads_connected`);
    response.cookies.delete("threads_oauth_state");
    return response;
  } catch (err) {
    console.error("Threads OAuth エラー:", err);
    return NextResponse.redirect(`${origin}/settings/accounts?error=oauth_failed`);
  }
}
