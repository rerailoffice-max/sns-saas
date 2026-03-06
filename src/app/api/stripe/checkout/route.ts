/**
 * Stripe Checkout セッション作成API
 * POST /api/stripe/checkout
 */
import { createClient } from "@/lib/supabase/server";
import { stripe } from "@/lib/stripe/client";
import { STRIPE_PRICES } from "@/lib/stripe/plans";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const checkoutSchema = z.object({
  plan: z.enum(["starter", "professional"]),
  interval: z.enum(["monthly", "yearly"]),
});

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (!user || authError) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = checkoutSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "バリデーションエラー", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { plan, interval } = parsed.data;
  const priceId = STRIPE_PRICES[plan][interval];

  try {
    // 既存のStripe顧客IDを確認
    const { data: subscription } = await supabase
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("profile_id", user.id)
      .single();

    const session = await stripe.checkout.sessions.create({
      customer: subscription?.stripe_customer_id ?? undefined,
      customer_email: subscription?.stripe_customer_id ? undefined : user.email,
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/settings/billing?success=true`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/settings/billing?canceled=true`,
      metadata: {
        profile_id: user.id,
        plan,
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("Checkout セッション作成エラー:", err);
    return NextResponse.json({ error: "決済セッションの作成に失敗しました" }, { status: 500 });
  }
}
