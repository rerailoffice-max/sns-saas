/**
 * APIキー関連のZodバリデーションスキーマ
 */

import { z } from "zod";

/** APIキー作成リクエスト */
export const createApiKeySchema = z.object({
  name: z
    .string()
    .min(1, "APIキー名は必須です")
    .max(50, "APIキー名は50文字以内で入力してください")
    .default("Default"),
});

export type CreateApiKeyInput = z.infer<typeof createApiKeySchema>;
