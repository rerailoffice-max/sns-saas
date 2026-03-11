/**
 * プロフィール設定ページ（Server Component）
 * 表示名・メール通知設定・ライティングスタイル設定・自動投稿設定の管理
 */
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { ProfileSettingsClient } from "@/components/settings/profile-settings-client";
import { WritingStyleSettings } from "@/components/settings/writing-style-settings";
import { AutoPostSettings } from "@/components/settings/auto-post-settings";

export default async function SettingsPage() {
  // デモモード: Supabase未設定時はモックデータで表示
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">プロフィール設定</h1>
        <ProfileSettingsClient
          profile={{
            display_name: "デモユーザー",
            email: "demo@example.com",
            avatar_url: null,
            email_notifications: true,
          }}
        />
        <WritingStyleSettings
          initialInstructions=""
          hasWritingProfile={false}
          accountId={null}
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

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  // 接続済みのSNSアカウント情報を取得
  const { data: socialAccounts } = await supabase
    .from("social_accounts")
    .select("id, platform, username, writing_profile")
    .eq("profile_id", user.id)
    .eq("is_active", true);

  const firstAccount = socialAccounts?.[0];
  const accountId = firstAccount?.id ?? null;
  const hasWritingProfile = !!firstAccount?.writing_profile;

  const accountsForAutoPost = (socialAccounts ?? []).map((a) => ({
    id: a.id,
    platform: a.platform as string,
    username: a.username as string,
  }));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">プロフィール設定</h1>
      <ProfileSettingsClient
        profile={{
          display_name: profile?.display_name ?? "",
          email: user.email ?? "",
          avatar_url: profile?.avatar_url ?? null,
          email_notifications: profile?.email_notifications ?? true,
        }}
      />
      <WritingStyleSettings
        initialInstructions={profile?.custom_writing_instructions ?? ""}
        hasWritingProfile={hasWritingProfile}
        accountId={accountId}
      />
      <AutoPostSettings accounts={accountsForAutoPost} />
    </div>
  );
}
