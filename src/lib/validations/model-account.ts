/**
 * モデルアカウント関連のZodバリデーションスキーマ
 */

import { z } from "zod";

/** モデルアカウント登録リクエスト */
export const createModelAccountSchema = z.object({
  platform: z.enum(["threads", "x"]),
  username: z
    .string()
    .min(1, "ユーザー名は必須です")
    .max(30, "ユーザー名が長すぎます")
    .regex(
      /^[a-zA-Z0-9_.]+$/,
      "ユーザー名は半角英数字、ピリオド、アンダースコアのみ使用可能です"
    ),
});

/** モデルアカウント更新リクエスト */
export const updateModelAccountSchema = z.object({
  status: z.enum(["active", "paused", "deleted"]).optional(),
});

export type CreateModelAccountInput = z.infer<typeof createModelAccountSchema>;
export type UpdateModelAccountInput = z.infer<typeof updateModelAccountSchema>;
