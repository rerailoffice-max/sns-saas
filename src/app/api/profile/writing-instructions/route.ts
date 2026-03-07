/**
 * カスタムライティング指示API
 * PUT /api/profile/writing-instructions
 *
 * ユーザーのカスタムライティング指示をprofilesテーブルに保存
 */
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const requestSchema = z.object({
  custom_writing_instructions: z.string().max(2000).nullable(),
});

export async function PUT(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (!user || authError) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "バリデーションエラー" },
      { status: 400 }
    );
  }

  const { error: updateError } = await supabase
    .from("profiles")
    .update({
      custom_writing_instructions: parsed.data.custom_writing_instructions,
    })
    .eq("id", user.id);

  if (updateError) {
    console.error("ライティング指示保存エラー:", updateError);
    return NextResponse.json(
      { error: "保存に失敗しました" },
      { status: 500 }
    );
  }

  return NextResponse.json({ data: { success: true } });
}
