"use client";

/**
 * プラン制限ゲートコンポーネント
 * 有料機能へのアクセスを制限し、アップグレードを促す
 * （現在は常に子要素を表示）
 */
import type { SubscriptionPlan } from "@/types/database";

interface PlanGateProps {
  /** ユーザーの現在のプラン */
  currentPlan: SubscriptionPlan;
  /** この機能に必要な最低プラン */
  requiredPlan: SubscriptionPlan;
  /** 機能名（表示用） */
  featureName: string;
  /** 表示する子要素 */
  children: React.ReactNode;
}

export function PlanGate({ children }: PlanGateProps) {
  return <>{children}</>;
}
