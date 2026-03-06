/**
 * Stripe カスタマーポータルAPI
 * POST /api/stripe/portal
 */
import { createClient } from "@/lib/supabase/server";
import { stripe } from "@/lib/stripe/client";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (!user || authError) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  // Stripe顧客IDを取得
  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("stripe_customer_id")
    .eq("profile_id", user.id)
    .single();

  if (!subscription?.stripe_customer_id) {
    return NextResponse.json({ error: "サブスクリプションが見つかりません" }, { status: 404 });
  }

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: subscription.stripe_customer_id,
      return_url: `${process.env.NEXT_PUBLIC_APP_URL}/settings/billing`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("ポータルセッション作成エラー:", err);
    return NextResponse.json({ error: "ポータルの作成に失敗しました" }, { status: 500 });
  }
}
