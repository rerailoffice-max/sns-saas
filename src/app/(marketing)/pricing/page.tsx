/**
 * 料金プランページ
 */
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Check } from "lucide-react";
import Link from "next/link";

const plans = [
  {
    name: "Free",
    price: "¥0",
    description: "個人利用・お試し",
    features: ["SNSアカウント1つ", "月5件の予約投稿", "7日間の分析", "基本ダッシュボード"],
    cta: "無料で始める",
    href: "/signup",
    popular: false,
  },
  {
    name: "Starter",
    price: "¥980",
    period: "/月",
    description: "本格運用向け",
    features: ["SNSアカウント3つ", "月30件の予約投稿", "30日間の分析", "AI投稿提案", "モデルアカウント2つ", "Chrome拡張対応"],
    cta: "Starterを始める",
    href: "/signup",
    popular: true,
  },
  {
    name: "Professional",
    price: "¥2,980",
    period: "/月",
    description: "プロフェッショナル向け",
    features: ["SNSアカウント5つ", "無制限の予約投稿", "90日間の分析", "高度なAI分析", "モデルアカウント5つ", "外部API連携", "優先サポート"],
    cta: "Proを始める",
    href: "/signup",
    popular: false,
  },
];

export default function PricingPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-16">
      <div className="text-center">
        <h1 className="text-3xl font-bold">料金プラン</h1>
        <p className="mt-4 text-muted-foreground">あなたのニーズに合ったプランを選択</p>
      </div>

      <div className="mt-12 grid gap-6 md:grid-cols-3">
        {plans.map((plan) => (
          <Card key={plan.name} className={plan.popular ? "border-primary shadow-lg" : ""}>
            {plan.popular && (
              <div className="bg-primary text-primary-foreground text-center text-sm font-medium py-1 rounded-t-lg">
                人気No.1
              </div>
            )}
            <CardHeader>
              <CardTitle>{plan.name}</CardTitle>
              <CardDescription>{plan.description}</CardDescription>
              <div className="mt-4">
                <span className="text-3xl font-bold">{plan.price}</span>
                {plan.period && <span className="text-muted-foreground">{plan.period}</span>}
              </div>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-center gap-2 text-sm">
                    <Check className="h-4 w-4 text-primary" />
                    {feature}
                  </li>
                ))}
              </ul>
            </CardContent>
            <CardFooter>
              <Button className="w-full" variant={plan.popular ? "default" : "outline"} asChild>
                <Link href={plan.href}>{plan.cta}</Link>
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>
    </div>
  );
}
