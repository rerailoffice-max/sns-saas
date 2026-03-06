/**
 * プロフィール設定ページ（Server Component）
 * 表示名・メール通知設定の管理
 */
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { ProfileSettingsClient } from "@/components/settings/profile-settings-client";

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
    </div>
  );
}
