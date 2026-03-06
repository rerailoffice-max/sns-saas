/**
 * オンボーディングページ（Server Component）
 * 初回ログイン時のステップウィザード
 * - Step 1: プロフィール設定
 * - Step 2: SNSアカウント接続
 * - Step 3: 最初の投稿作成
 */
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { OnboardingClient } from "@/components/onboarding/onboarding-client";

export default async function OnboardingPage() {
  // デモモード: Supabase未設定時は初期状態で表示
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return (
      <div className="mx-auto max-w-2xl py-8">
        <OnboardingClient
          steps={{
            profileCompleted: false,
            accountsConnected: false,
            firstDraftCreated: false,
          }}
          displayName=""
          connectedAccounts={[]}
          userEmail="demo@example.com"
        />
      </div>
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // 現在の状態を確認
  const [profileResult, accountsResult, draftsResult] = await Promise.all([
    supabase
      .from("profiles")
      .select("display_name, avatar_url")
      .eq("id", user.id)
      .single(),
    supabase
      .from("social_accounts")
      .select("id, platform, username")
      .eq("profile_id", user.id)
      .eq("is_active", true),
    supabase
      .from("drafts")
      .select("id")
      .eq("profile_id", user.id)
      .limit(1),
  ]);

  const profile = profileResult.data;
  const accounts = accountsResult.data ?? [];
  const hasDrafts = (draftsResult.data?.length ?? 0) > 0;

  // 各ステップの完了状態を判定
  const steps = {
    profileCompleted: !!profile?.display_name,
    accountsConnected: accounts.length > 0,
    firstDraftCreated: hasDrafts,
  };

  return (
    <div className="mx-auto max-w-2xl py-8">
      <OnboardingClient
        steps={steps}
        displayName={profile?.display_name ?? ""}
        connectedAccounts={accounts}
        userEmail={user.email ?? ""}
      />
    </div>
  );
}
