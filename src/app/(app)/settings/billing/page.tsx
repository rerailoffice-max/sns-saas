/**
 * 課金管理ページ（Server Component）
 * サブスクリプション情報を取得してクライアントに渡す
 */
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { BillingPageClient } from "@/components/settings/billing-page-client";
import type { SubscriptionPlan } from "@/types/database";

export default async function BillingSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; canceled?: string }>;
}) {
  // デモモード: Supabase未設定時はフリープランで表示
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    const params = await searchParams;
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">課金管理</h1>
        <BillingPageClient
          currentPlan="free"
          subscriptionStatus={null}
          currentPeriodEnd={null}
          hasStripeCustomer={false}
          success={params?.success === "true"}
          canceled={params?.canceled === "true"}
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

  // サブスクリプション情報を取得
  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("plan, status, current_period_end, stripe_customer_id")
    .eq("profile_id", user.id)
    .single();

  const params = await searchParams;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">課金管理</h1>

      <BillingPageClient
        currentPlan={(subscription?.plan as SubscriptionPlan) ?? "free"}
        subscriptionStatus={subscription?.status ?? null}
        currentPeriodEnd={subscription?.current_period_end ?? null}
        hasStripeCustomer={!!subscription?.stripe_customer_id}
        success={params?.success === "true"}
        canceled={params?.canceled === "true"}
      />
    </div>
  );
}
