/**
 * 軽量同期API
 * POST /api/accounts/sync-latest
 * フォロワー数 + 最新投稿インサイトを素早く更新
 */
import { createClient } from "@/lib/supabase/server";
import { quickSync } from "@/lib/sync/quick-sync";
import { NextResponse } from "next/server";

export const maxDuration = 30;

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (!user || authError) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  const result = await quickSync(user.id);
  return NextResponse.json(result);
}
