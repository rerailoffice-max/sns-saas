/**
 * プラン別制限定数
 * 要件定義書の料金プラン表（セクション9）に基づく
 */

import type { SubscriptionPlan } from "@/types/database";

export interface PlanLimits {
  maxAccounts: number;
  maxScheduledPerMonth: number;
  maxScheduleDays: number;
  analyticsRetentionDays: number;
  openclawEnabled: boolean;
  openclawPerDay: number;
  aiEditsPerMonth: number;
  apiRatePerDay: number;
  maxModelAccounts: number;
  aiOptimizationEnabled: boolean;
  advancedAnalyticsAiSummary: boolean;
}

export const PLAN_LIMITS: Record<SubscriptionPlan, PlanLimits> = {
  free: {
    maxAccounts: 5,
    maxScheduledPerMonth: Infinity,
    maxScheduleDays: 90,
    analyticsRetentionDays: 90,
    openclawEnabled: true,
    openclawPerDay: Infinity,
    aiEditsPerMonth: 30,
    apiRatePerDay: 1000,
    maxModelAccounts: 5,
    aiOptimizationEnabled: true,
    advancedAnalyticsAiSummary: true,
  },
  starter: {
    maxAccounts: 3,
    maxScheduledPerMonth: 30,
    maxScheduleDays: 30,
    analyticsRetentionDays: 30,
    openclawEnabled: true,
    openclawPerDay: 5,
    aiEditsPerMonth: 5,
    apiRatePerDay: 100,
    maxModelAccounts: 2,
    aiOptimizationEnabled: true,
    advancedAnalyticsAiSummary: true,
  },
  professional: {
    maxAccounts: 5,
    maxScheduledPerMonth: Infinity,
    maxScheduleDays: 90,
    analyticsRetentionDays: 90,
    openclawEnabled: true,
    openclawPerDay: Infinity,
    aiEditsPerMonth: 30,
    apiRatePerDay: 1000,
    maxModelAccounts: 5,
    aiOptimizationEnabled: true,
    advancedAnalyticsAiSummary: true,
  },
} as const;

/**
 * プラン制限を取得
 * 全ユーザーにprofessional相当の制限を返す（全機能利用可能）
 */
export function getPlanLimits(_plan: SubscriptionPlan, _userId?: string): PlanLimits {
  return PLAN_LIMITS.professional;
}

/**
 * 機能がプランで利用可能かチェック
 */
export function canUseFeature(
  plan: SubscriptionPlan,
  feature: keyof PlanLimits
): boolean {
  const limits = getPlanLimits(plan);
  const value = limits[feature];
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value > 0;
  return false;
}

/**
 * Stripe Price ID マッピング
 */
export const STRIPE_PRICES = {
  starter: {
    monthly: process.env.STRIPE_PRICE_STARTER_MONTHLY!,
    yearly: process.env.STRIPE_PRICE_STARTER_YEARLY!,
  },
  professional: {
    monthly: process.env.STRIPE_PRICE_PRO_MONTHLY!,
    yearly: process.env.STRIPE_PRICE_PRO_YEARLY!,
  },
} as const;
