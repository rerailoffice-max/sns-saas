/**
 * 予約投稿関連のZodバリデーションスキーマ
 */

import { z } from "zod";

/** 予約投稿作成リクエスト */
export const createScheduledPostSchema = z.object({
  draft_id: z.string().uuid("有効な下書きIDを指定してください"),
  account_id: z.string().uuid("有効なアカウントIDを指定してください"),
  scheduled_at: z
    .string()
    .datetime("有効なISO 8601形式の日時を指定してください")
    .refine(
      (val) => new Date(val) > new Date(),
      "予約日時は現在より未来の日時を指定してください"
    ),
});

export type CreateScheduledPostInput = z.infer<typeof createScheduledPostSchema>;
