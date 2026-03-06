/**
 * ランディングページ
 * マーケティングサイトのトップページ
 */
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import {
  BarChart3,
  Calendar,
  PenSquare,
  Users,
  Zap,
  Shield,
  ArrowRight,
  CheckCircle2,
} from "lucide-react";

const features = [
  {
    icon: PenSquare,
    title: "投稿作成・管理",
    description: "下書き保存、複数アカウント管理、投稿プレビュー機能でSNS投稿を効率化",
  },
  {
    icon: Calendar,
    title: "予約投稿",
    description: "ベストな時間帯に自動投稿。カレンダーUIで投稿スケジュールを一目で管理",
  },
  {
    icon: BarChart3,
    title: "投稿分析",
    description: "エンゲージメント、インプレッション、フォロワー推移をダッシュボードで可視化",
  },
  {
    icon: Users,
    title: "モデルアカウント分析",
    description: "参考にしたいアカウントを登録し、投稿パターンやエンゲージメントをAIが分析",
  },
  {
    icon: Zap,
    title: "AI添削",
    description: "AIが投稿テキストを添削・改善提案。エンゲージメントを最大化する文章に",
  },
  {
    icon: Shield,
    title: "API連携",
    description: "外部ツールからの投稿作成や、Chrome拡張からのデータ取り込みに対応",
  },
];

const plans = [
  {
    name: "Free",
    price: "¥0",
    period: "永久無料",
    features: ["SNSアカウント1つ", "月10投稿", "基本分析", "下書き保存"],
    cta: "無料で始める",
    highlighted: false,
  },
  {
    name: "Starter",
    price: "¥980",
    period: "月額（税込）",
    features: [
      "SNSアカウント3つ",
      "月100投稿",
      "予約投稿",
      "詳細分析",
      "モデルアカウント5つ",
    ],
    cta: "14日間無料トライアル",
    highlighted: true,
  },
  {
    name: "Pro",
    price: "¥2,980",
    period: "月額（税込）",
    features: [
      "SNSアカウント10個",
      "投稿数無制限",
      "AI添削",
      "API連携",
      "モデルアカウント無制限",
      "優先サポート",
    ],
    cta: "14日間無料トライアル",
    highlighted: false,
  },
];

export default function LandingPage() {
  return (
    <div className="flex flex-col min-h-screen">
      {/* ナビゲーション */}
      <header className="sticky top-0 z-50 w-full border-b bg-background/80 backdrop-blur-sm">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold text-sm">
              S
            </div>
            <span className="text-lg font-semibold">SNS Manager</span>
          </Link>
          <nav className="hidden md:flex items-center gap-6">
            <Link href="/pricing" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              料金
            </Link>
            <Link href="/login" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              ログイン
            </Link>
            <Button asChild size="sm">
              <Link href="/signup">無料で始める</Link>
            </Button>
          </nav>
          <div className="md:hidden">
            <Button asChild size="sm">
              <Link href="/signup">無料で始める</Link>
            </Button>
          </div>
        </div>
      </header>

      {/* ヒーローセクション */}
      <section className="relative overflow-hidden">
        <div className="mx-auto max-w-6xl px-4 py-24 md:py-32">
          <div className="flex flex-col items-center text-center space-y-8">
            <div className="inline-flex items-center rounded-full border px-4 py-1.5 text-sm text-muted-foreground">
              🧵 Threads対応のSNS管理ツール
            </div>
            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl max-w-3xl">
              SNS運用を
              <span className="text-primary">スマート</span>
              に。
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl">
              予約投稿、投稿分析、AI添削、モデルアカウント分析。
              Threads対応のオールインワンSNS管理ツールで、効率的なSNS運用を実現します。
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <Button asChild size="lg" className="text-base">
                <Link href="/signup">
                  無料で始める
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="text-base">
                <Link href="/pricing">料金プランを見る</Link>
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              クレジットカード不要 • 1分で登録完了
            </p>
          </div>
        </div>
      </section>

      {/* 機能紹介 */}
      <section className="border-t bg-muted/30">
        <div className="mx-auto max-w-6xl px-4 py-20">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold">すべてを1つのツールで</h2>
            <p className="mt-4 text-muted-foreground">
              SNS運用に必要な機能をワンストップで提供
            </p>
          </div>
          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
            {features.map((feature) => (
              <Card key={feature.title} className="border-0 shadow-sm">
                <CardHeader>
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    <feature.icon className="h-5 w-5 text-primary" />
                  </div>
                  <CardTitle className="text-lg">{feature.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">{feature.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* 料金プラン */}
      <section className="border-t">
        <div className="mx-auto max-w-6xl px-4 py-20">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold">シンプルな料金プラン</h2>
            <p className="mt-4 text-muted-foreground">まずは無料プランからお試しください</p>
          </div>
          <div className="grid gap-8 md:grid-cols-3 max-w-4xl mx-auto">
            {plans.map((plan) => (
              <Card
                key={plan.name}
                className={plan.highlighted ? "border-primary shadow-lg scale-105" : ""}
              >
                {plan.highlighted && (
                  <div className="bg-primary text-primary-foreground text-center text-xs font-medium py-1 rounded-t-lg">
                    人気
                  </div>
                )}
                <CardHeader className="text-center">
                  <CardTitle className="text-xl">{plan.name}</CardTitle>
                  <div className="mt-2">
                    <span className="text-3xl font-bold">{plan.price}</span>
                    <span className="text-sm text-muted-foreground ml-1">/ {plan.period}</span>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <ul className="space-y-2">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-center gap-2 text-sm">
                        <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                  <Button
                    asChild
                    className="w-full"
                    variant={plan.highlighted ? "default" : "outline"}
                  >
                    <Link href="/signup">{plan.cta}</Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t bg-primary/5">
        <div className="mx-auto max-w-6xl px-4 py-20 text-center">
          <h2 className="text-3xl font-bold">今すぐSNS運用を効率化</h2>
          <p className="mt-4 text-muted-foreground max-w-xl mx-auto">
            無料プランで今すぐ始められます。クレジットカード不要。
          </p>
          <Button asChild size="lg" className="mt-8 text-base">
            <Link href="/signup">
              無料で始める
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </section>

      {/* フッター */}
      <footer className="border-t">
        <div className="mx-auto max-w-6xl px-4 py-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded bg-primary text-primary-foreground font-bold text-xs">
                S
              </div>
              <span className="text-sm font-medium">SNS Manager</span>
            </div>
            <nav className="flex gap-6 text-sm text-muted-foreground">
              <Link href="/pricing" className="hover:text-foreground">料金</Link>
              <Link href="/terms" className="hover:text-foreground">利用規約</Link>
              <Link href="/privacy" className="hover:text-foreground">プライバシーポリシー</Link>
            </nav>
            <p className="text-xs text-muted-foreground">
              © 2026 SNS Manager. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
