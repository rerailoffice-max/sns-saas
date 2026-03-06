/**
 * 下書きCRUD API
 * GET /api/drafts - 一覧取得
 * POST /api/drafts - 新規作成
 */
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { createDraftSchema } from "@/lib/validations/draft";

export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (!user || authError) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("drafts")
    .select("*")
    .eq("profile_id", user.id)
    .order("updated_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: "取得に失敗しました" }, { status: 500 });
  }

  return NextResponse.json({ drafts: data });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (!user || authError) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = createDraftSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "入力が不正です", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  // アカウントの所有者確認
  const { data: account } = await supabase
    .from("social_accounts")
    .select("id")
    .eq("id", parsed.data.account_id)
    .eq("profile_id", user.id)
    .single();

  if (!account) {
    return NextResponse.json({ error: "アカウントが見つかりません" }, { status: 404 });
  }

  const { data, error } = await supabase
    .from("drafts")
    .insert({
      profile_id: user.id,
      account_id: parsed.data.account_id,
      text: parsed.data.text,
      hashtags: parsed.data.hashtags ?? [],
      media_urls: parsed.data.media_urls ?? [],
      source: parsed.data.source,
      metadata: parsed.data.metadata ?? {},
      status: "draft",
    })
    .select()
    .single();

  if (error) {
    console.error("下書き作成エラー:", error);
    return NextResponse.json({ error: "保存に失敗しました" }, { status: 500 });
  }

  return NextResponse.json({ draft: data }, { status: 201 });
}
