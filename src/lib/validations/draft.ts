/**
 * 下書き関連のZodバリデーションスキーマ
 */

import { z } from "zod";

/** 下書き作成リクエスト */
export const createDraftSchema = z.object({
  account_id: z.string().uuid("有効なアカウントIDを指定してください"),
  text: z
    .string()
    .min(1, "投稿テキストは必須です")
    .max(500, "Threadsの文字数制限（500文字）を超えています"),
  hashtags: z.array(z.string()).max(30).optional(),
  media_urls: z.array(z.string().url()).max(10).optional(),
  source: z.enum(["manual", "openclaw", "ai"]).default("manual"),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

/** 下書き更新リクエスト */
export const updateDraftSchema = z.object({
  text: z
    .string()
    .min(1)
    .max(500)
    .optional(),
  hashtags: z.array(z.string()).max(30).optional(),
  media_urls: z.array(z.string().url()).max(10).optional(),
  status: z
    .enum(["draft", "scheduled", "publishing", "published", "failed"])
    .optional(),
});

export type CreateDraftInput = z.infer<typeof createDraftSchema>;
export type UpdateDraftInput = z.infer<typeof updateDraftSchema>;
