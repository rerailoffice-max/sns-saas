/**
 * Stripe Webhook ハンドラ
 * POST /api/stripe/webhook
 */
import { stripe } from "@/lib/stripe/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";
import type { Stripe } from "stripe";

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "署名がありません" }, { status: 400 });
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    console.error("Webhook署名検証エラー:", err);
    return NextResponse.json({ error: "署名が無効です" }, { status: 400 });
  }

  const adminClient = createAdminClient();

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const profileId = session.metadata?.profile_id;
        const plan = session.metadata?.plan;

        if (profileId && plan) {
          await adminClient
            .from("subscriptions")
            .upsert({
              profile_id: profileId,
              plan,
              status: "active",
              stripe_customer_id: session.customer as string,
              stripe_subscription_id: session.subscription as string,
              current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            }, {
              onConflict: "profile_id",
            });
        }
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        // Stripe APIバージョンに応じてperiod情報を取得
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const subData = subscription as any;
        const periodEnd = subData.current_period_end as number | undefined;
        await adminClient
          .from("subscriptions")
          .update({
            status: subscription.status === "active" ? "active" : "past_due",
            ...(typeof periodEnd === "number" && {
              current_period_end: new Date(periodEnd * 1000).toISOString(),
            }),
          })
          .eq("stripe_subscription_id", subscription.id);
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        await adminClient
          .from("subscriptions")
          .update({
            plan: "free",
            status: "canceled",
            canceled_at: new Date().toISOString(),
          })
          .eq("stripe_subscription_id", subscription.id);
        break;
      }

      default:
        console.log(`未処理のWebhookイベント: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("Webhookイベント処理エラー:", err);
    return NextResponse.json({ error: "処理に失敗しました" }, { status: 500 });
  }
}
