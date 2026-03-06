/**
 * Stripe クライアント設定
 * 遅延初期化パターン: ビルド時に環境変数がなくてもエラーにならない
 */

import Stripe from "stripe";

let _stripe: Stripe | null = null;

/** サーバーサイド Stripe クライアント（遅延初期化） */
export function getStripe(): Stripe {
  if (!_stripe) {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error("STRIPE_SECRET_KEY が設定されていません");
    }
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: "2026-02-25.clover",
      typescript: true,
    });
  }
  return _stripe;
}

/** 後方互換のためのエイリアス（Proxy経由で遅延初期化） */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const stripe = new Proxy({} as Stripe, {
  get(_, prop) {
    return (getStripe() as any)[prop];
  },
});
