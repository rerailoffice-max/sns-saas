/**
 * APIキー管理ページ（Server Component）
 * APIキー一覧・プラン情報を取得してクライアントに渡す
 */
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { ApiKeysClient } from "@/components/settings/api-keys-client";
import { isAdmin } from "@/lib/admin";
import type { SubscriptionPlan } from "@/types/database";

export default async function ApiKeysSettingsPage() {
  // デモモード: Supabase未設定時はフリープラン・空のキー一覧で表示
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">APIキー管理</h1>
        <ApiKeysClient initialKeys={[]} currentPlan="free" />
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

  // APIキー一覧を取得
  const { data: keys } = await supabase
    .from("api_keys")
    .select("id, name, key_prefix, last_used_at, is_active, created_at")
    .eq("profile_id", user.id)
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  // サブスクリプション情報を取得
  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("plan")
    .eq("profile_id", user.id)
    .single();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">APIキー管理</h1>

      <ApiKeysClient
        initialKeys={keys ?? []}
        currentPlan={isAdmin(user.id) ? "professional" : ((subscription?.plan as SubscriptionPlan) ?? "free")}
      />
    </div>
  );
}
