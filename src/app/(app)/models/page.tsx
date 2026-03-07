/**
 * モデルアカウント一覧ページ（Server Component）
 * ユーザーが登録したモデルアカウントをグリッド表示する
 */
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getPlanLimits } from "@/lib/stripe/plans";
import { ModelListClient } from "@/components/models/model-list-client";
import type { ModelAccount, SubscriptionPlan } from "@/types/database";

export default async function ModelsPage() {
  // デモモード: Supabase未設定時はフリープラン・空リストで表示
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    const limits = getPlanLimits("free");
    return (
      <div className="container mx-auto px-4 py-8">
        <ModelListClient
          models={[]}
          plan="free"
          maxModelAccounts={limits.maxModelAccounts}
        />
      </div>
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  // 未認証の場合はログインページへリダイレクト
  if (!user || authError) {
    redirect("/login");
  }

  // モデルアカウント一覧を取得
  const { data: models, error: modelsError } = await supabase
    .from("model_accounts")
    .select("*")
    .eq("profile_id", user.id)
    .order("created_at", { ascending: false });

  // 各モデルの投稿数を取得
  const modelIds = (models ?? []).map((m) => m.id);
  let postCounts: Record<string, number> = {};
  if (modelIds.length > 0) {
    const { data: counts } = await supabase
      .from("model_posts")
      .select("model_account_id")
      .in("model_account_id", modelIds);
    if (counts) {
      for (const row of counts) {
        postCounts[row.model_account_id] = (postCounts[row.model_account_id] ?? 0) + 1;
      }
    }
  }

  // サブスクリプション情報を取得
  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("plan")
    .eq("profile_id", user.id)
    .single();

  const plan = (subscription?.plan ?? "free") as SubscriptionPlan;
  const limits = getPlanLimits(plan);

  // エラー時のフォールバック
  if (modelsError) {
    return (
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold mb-4">モデリング</h1>
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-destructive">
          モデルアカウントの取得に失敗しました。再度お試しください。
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <ModelListClient
        models={(models as ModelAccount[]) ?? []}
        plan={plan}
        maxModelAccounts={limits.maxModelAccounts}
        postCounts={postCounts}
      />
    </div>
  );
}
