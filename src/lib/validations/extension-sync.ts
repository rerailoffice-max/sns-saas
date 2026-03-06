/**
 * Chrome拡張Sync API のZodバリデーションスキーマ
 */

import { z } from "zod";

/** 拡張機能からの投稿同期リクエスト */
export const extensionSyncSchema = z.object({
  model_account_id: z.string().uuid("有効なモデルアカウントIDを指定してください"),
  posts: z
    .array(
      z.object({
        platform_post_id: z.string().min(1, "投稿IDは必須です"),
        username: z.string().min(1, "ユーザー名は必須です"),
        text: z.string().optional(),
        media_type: z.enum(["text", "image", "carousel", "video"]).optional(),
        posted_at: z.string().datetime().optional(),
        likes: z.number().int().min(0).optional(),
        replies: z.number().int().min(0).optional(),
        reposts: z.number().int().min(0).optional(),
      })
    )
    .min(1, "少なくとも1件の投稿データが必要です")
    .max(100, "一度に同期できる投稿は最大100件です"),
});

export type ExtensionSyncInput = z.infer<typeof extensionSyncSchema>;
