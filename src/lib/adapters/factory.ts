/**
 * SNSアダプターファクトリ
 * プラットフォームに応じた適切なアダプターを生成
 */

import type { Platform } from "@/types/database";
import type { SNSAdapter } from "./types";
import { ThreadsAdapter } from "./threads";
import { XAdapter } from "./x";
import { FacebookAdapter } from "./facebook";

// アダプターのシングルトンインスタンス
const adapters: Partial<Record<Platform, SNSAdapter>> = {};

/**
 * プラットフォームに対応するSNSアダプターを取得
 * @param platform - プラットフォーム識別子
 * @returns SNSAdapter の実装インスタンス
 * @throws 未対応プラットフォームの場合
 */
export function getAdapter(platform: Platform): SNSAdapter {
  if (adapters[platform]) {
    return adapters[platform]!;
  }

  let adapter: SNSAdapter;

  switch (platform) {
    case "threads":
      adapter = new ThreadsAdapter();
      break;
    case "instagram":
      throw new Error("Instagram アダプターは未実装です（MVP-1で対応予定）");
    case "x":
      adapter = new XAdapter();
      break;
    case "facebook":
      adapter = new FacebookAdapter();
      break;
    default:
      throw new Error(`未対応のプラットフォーム: ${platform}`);
  }

  adapters[platform] = adapter;
  return adapter;
}

/**
 * 対応済みプラットフォーム一覧を取得
 */
export function getSupportedPlatforms(): Platform[] {
  return ["threads", "x", "facebook"];
}
