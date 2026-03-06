"use client";

/**
 * プラン制限ゲートコンポーネント
 * 有料機能へのアクセスを制限し、アップグレードを促す
 */
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Lock } from "lucide-react";
import Link from "next/link";
import type { SubscriptionPlan } from "@/types/database";

interface PlanGateProps {
  /** ユーザーの現在のプラン */
  currentPlan: SubscriptionPlan;
  /** この機能に必要な最低プラン */
  requiredPlan: SubscriptionPlan;
  /** 機能名（表示用） */
  featureName: string;
  /** 制限内であれば表示する子要素 */
  children: React.ReactNode;
}

const planOrder: SubscriptionPlan[] = ["free", "starter", "professional"];
const planLabels: Record<SubscriptionPlan, string> = {
  free: "Free",
  starter: "Starter",
  professional: "Professional",
};

export function PlanGate({ currentPlan, requiredPlan, featureName, children }: PlanGateProps) {
  const currentIndex = planOrder.indexOf(currentPlan);
  const requiredIndex = planOrder.indexOf(requiredPlan);

  // 現在のプランが必要プラン以上ならそのまま表示
  if (currentIndex >= requiredIndex) {
    return <>{children}</>;
  }

  return (
    <Card className="border-dashed">
      <CardHeader className="text-center">
        <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <Lock className="h-6 w-6 text-muted-foreground" />
        </div>
        <CardTitle className="text-lg">{featureName}</CardTitle>
        <CardDescription>
          この機能は{planLabels[requiredPlan]}プラン以上で利用できます
        </CardDescription>
      </CardHeader>
      <CardContent className="text-center">
        <Button asChild>
          <Link href="/settings/billing">プランをアップグレード</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
