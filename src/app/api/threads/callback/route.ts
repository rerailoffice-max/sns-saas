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

    const { error: dbError } = await adminClient
      .from("social_accounts")
      .upsert({
        profile_id: user.id,
        platform: "threads",
        platform_user_id: profile.platform_user_id,
        username: profile.username,
        display_name: profile.display_name,
        avatar_url: profile.avatar_url,
        access_token_enc: encrypt(tokens.access_token),
        refresh_token_enc: tokens.refresh_token ? encrypt(tokens.refresh_token) : null,
        token_expires_at: tokenExpiresAt,
        is_active: true,
      }, {
        onConflict: "profile_id,platform,platform_user_id",
      });

    if (dbError) {
      console.error("SNSアカウント保存エラー:", dbError);
      return NextResponse.redirect(`${origin}/settings/accounts?error=db_save_failed`);
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
