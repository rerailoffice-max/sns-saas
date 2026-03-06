/**
 * 通知設定ページ（Server Component）
 * メール通知のON/OFF管理
 */
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { NotificationsSettingsClient } from "@/components/settings/notifications-settings-client";

export default async function NotificationsSettingsPage() {
  // デモモード: Supabase未設定時はデフォルト値で表示
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">通知設定</h1>
        <NotificationsSettingsClient emailNotifications={true} />
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
    .select("email_notifications")
    .eq("id", user.id)
    .single();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">通知設定</h1>
      <NotificationsSettingsClient
        emailNotifications={profile?.email_notifications ?? true}
      />
    </div>
  );
}
