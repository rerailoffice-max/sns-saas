/**
 * 課金管理クライアントコンポーネント
 * プラン比較・アップグレード・ポータル管理
 */
"use client";

import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Check, Loader2, CreditCard, Zap, Crown } from "lucide-react";
import type { SubscriptionPlan } from "@/types/database";

interface BillingPageClientProps {
  currentPlan: SubscriptionPlan;
  subscriptionStatus: string | null;
  currentPeriodEnd: string | null;
  hasStripeCustomer: boolean;
  success?: boolean;
  canceled?: boolean;
}

/** プラン定義 */
interface PlanDef {
  id: SubscriptionPlan;
  name: string;
  price: number;
  description: string;
  icon: typeof Zap;
  popular?: boolean;
  features: string[];
  limits: string[];
}

const PLANS: PlanDef[] = [
  {
    id: "free",
    name: "Free",
    price: 0,
    description: "個人利用・お試しに最適",
    icon: Zap,
    features: [
      "1 SNSアカウント",
      "月5件の予約投稿",
      "7日間の分析データ",
      "基本分析",
    ],
    limits: [
      "モデリング機能なし",
      "AI編集なし",
      "API連携なし",
    ],
  },
  {
    id: "starter",
    name: "Starter",
    price: 980,
    description: "本格的なSNS運用を始める方に",
    icon: CreditCard,
    popular: true,
    features: [
      "3 SNSアカウント",
      "月30件の予約投稿",
      "30日間の分析データ",
      "モデリング2アカウント",
      "AI編集 月5回",
      "API連携（100リクエスト/日）",
    ],
    limits: [],
  },
  {
    id: "professional",
    name: "Professional",
    price: 2980,
    description: "プロフェッショナルな運用に",
    icon: Crown,
    features: [
      "5 SNSアカウント",
      "無制限の予約投稿",
      "90日間の分析データ",
      "モデリング5アカウント",
      "AI編集 月30回",
      "API連携（1,000リクエスト/日）",
      "高度なAI分析サマリー",
    ],
    limits: [],
  },
];

export function BillingPageClient({
  currentPlan,
  subscriptionStatus,
  currentPeriodEnd,
  hasStripeCustomer,
  success,
  canceled,
}: BillingPageClientProps) {
  const [loading, setLoading] = useState<string | null>(null);

  // 成功・キャンセルのトースト表示
  useEffect(() => {
    if (success) {
      toast.success("プランが更新されました", {
        description: "新しいプランの機能をご利用いただけます",
      });
    }
    if (canceled) {
      toast.info("決済がキャンセルされました", {
        description: "引き続き現在のプランをご利用ください",
      });
    }
  }, [success, canceled]);

  /** Checkoutセッションに遷移 */
  const handleCheckout = async (plan: "starter" | "professional") => {
    setLoading(plan);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, interval: "monthly" }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "エラーが発生しました");
      }

      // Stripe Checkoutページへリダイレクト
      window.location.href = data.url;
    } catch (err) {
      toast.error("決済セッションの作成に失敗しました", {
        description: err instanceof Error ? err.message : "もう一度お試しください",
      });
      setLoading(null);
    }
  };

  /** カスタマーポータルに遷移 */
  const handlePortal = async () => {
    setLoading("portal");
    try {
      const res = await fetch("/api/stripe/portal", {
        method: "POST",
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "エラーが発生しました");
      }

      window.location.href = data.url;
    } catch (err) {
      toast.error("ポータルの起動に失敗しました", {
        description: err instanceof Error ? err.message : "もう一度お試しください",
      });
      setLoading(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* 現在のプラン情報 */}
      <Card>
        <CardHeader>
          <CardTitle>現在のプラン</CardTitle>
          <CardDescription>ご利用中のプランと課金情報</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Badge
                variant={currentPlan === "free" ? "secondary" : "default"}
                className="text-sm px-3 py-1"
              >
                {currentPlan === "free" && "Free"}
                {currentPlan === "starter" && "Starter"}
                {currentPlan === "professional" && "Professional"}
              </Badge>
              {subscriptionStatus && subscriptionStatus !== "canceled" && (
                <span className="text-sm text-muted-foreground">
                  {subscriptionStatus === "active" && "有効"}
                  {subscriptionStatus === "past_due" && "支払い遅延"}
                  {subscriptionStatus === "trialing" && "トライアル中"}
                </span>
              )}
            </div>
            {currentPeriodEnd && currentPlan !== "free" && (
              <p className="text-sm text-muted-foreground">
                次回更新日: {new Date(currentPeriodEnd).toLocaleDateString("ja-JP")}
              </p>
            )}
          </div>
        </CardContent>
        {hasStripeCustomer && currentPlan !== "free" && (
          <CardFooter>
            <Button
              variant="outline"
              onClick={handlePortal}
              disabled={loading === "portal"}
            >
              {loading === "portal" ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <CreditCard className="mr-2 h-4 w-4" />
              )}
              プラン管理・支払い情報
            </Button>
          </CardFooter>
        )}
      </Card>

      {/* プラン比較 */}
      <div>
        <h2 className="text-lg font-semibold mb-4">プラン比較</h2>
        <div className="grid gap-6 md:grid-cols-3">
          {PLANS.map((plan) => {
            const isCurrent = currentPlan === plan.id;
            const Icon = plan.icon;

            return (
              <Card
                key={plan.id}
                className={`relative ${
                  plan.popular
                    ? "border-primary shadow-md"
                    : ""
                } ${isCurrent ? "ring-2 ring-primary" : ""}`}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge className="bg-primary text-primary-foreground">
                      人気
                    </Badge>
                  </div>
                )}
                <CardHeader className="text-center pb-2">
                  <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                    <Icon className="h-6 w-6" />
                  </div>
                  <CardTitle className="text-xl">{plan.name}</CardTitle>
                  <CardDescription>{plan.description}</CardDescription>
                  <div className="mt-2">
                    <span className="text-3xl font-bold">
                      ¥{plan.price.toLocaleString()}
                    </span>
                    <span className="text-muted-foreground">/月</span>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* 利用可能な機能 */}
                  <ul className="space-y-2">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2 text-sm">
                        <Check className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                  {/* 制限事項 */}
                  {plan.limits.length > 0 && (
                    <ul className="space-y-2 border-t pt-3">
                      {plan.limits.map((limit) => (
                        <li
                          key={limit}
                          className="flex items-start gap-2 text-sm text-muted-foreground"
                        >
                          <span className="h-4 w-4 text-center shrink-0">-</span>
                          <span>{limit}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
                <CardFooter>
                  {isCurrent ? (
                    <Button variant="outline" className="w-full" disabled>
                      現在のプラン
                    </Button>
                  ) : plan.id === "free" ? (
                    // Freeプランへのダウングレードはポータルから
                    hasStripeCustomer && currentPlan !== "free" ? (
                      <Button
                        variant="outline"
                        className="w-full"
                        onClick={handlePortal}
                        disabled={loading === "portal"}
                      >
                        {loading === "portal" ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : null}
                        ダウングレード
                      </Button>
                    ) : (
                      <Button variant="outline" className="w-full" disabled>
                        現在のプラン
                      </Button>
                    )
                  ) : (
                    <Button
                      className="w-full"
                      onClick={() => handleCheckout(plan.id as "starter" | "professional")}
                      disabled={loading !== null}
                    >
                      {loading === plan.id ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : null}
                      {currentPlan !== "free" ? "プラン変更" : "このプランにする"}
                    </Button>
                  )}
                </CardFooter>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
