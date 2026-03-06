/**
 * APIキー管理API
 * GET: 一覧取得 / POST: 新規作成 / DELETE: 削除
 */
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { createHash, randomUUID } from "crypto";
import { z } from "zod";

/** APIキーのプレフィックス */
const KEY_PREFIX = "snm_";

/** SHA-256ハッシュを生成 */
function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

/** プラン別APIキー上限 */
const PLAN_API_KEY_LIMITS: Record<string, number> = {
  free: 0,
  starter: 1,
  professional: 5,
};

/**
 * GET: APIキー一覧を取得（key_hashは返さない）
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (!user || authError) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  const { data: keys, error } = await supabase
    .from("api_keys")
    .select("id, name, key_prefix, last_used_at, is_active, created_at")
    .eq("profile_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("APIキー一覧取得エラー:", error);
    return NextResponse.json(
      { error: "APIキーの取得に失敗しました" },
      { status: 500 }
    );
  }

  return NextResponse.json({ keys: keys ?? [] });
}

const createKeySchema = z.object({
  name: z.string().min(1, "名前は必須です").max(100, "名前は100文字以内で入力してください"),
});

/**
 * POST: 新規APIキーを作成
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (!user || authError) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = createKeySchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "バリデーションエラー", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  // プラン制限チェック
  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("plan")
    .eq("profile_id", user.id)
    .single();

  const plan = subscription?.plan ?? "free";
  const maxKeys = PLAN_API_KEY_LIMITS[plan] ?? 0;

  if (maxKeys === 0) {
    return NextResponse.json(
      { error: "現在のプランではAPIキーを作成できません。Starter以上にアップグレードしてください。" },
      { status: 403 }
    );
  }

  // 既存キー数チェック
  const { count } = await supabase
    .from("api_keys")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", user.id)
    .eq("is_active", true);

  if ((count ?? 0) >= maxKeys) {
    return NextResponse.json(
      { error: `APIキーの上限（${maxKeys}件）に達しています` },
      { status: 403 }
    );
  }

  // APIキー生成
  const rawKey = `${KEY_PREFIX}${randomUUID().replace(/-/g, "")}`;
  const keyHash = hashKey(rawKey);
  const keyPrefix = rawKey.slice(0, 12); // 表示用プレフィックス

  const { data: newKey, error } = await supabase
    .from("api_keys")
    .insert({
      profile_id: user.id,
      name: parsed.data.name,
      key_hash: keyHash,
      key_prefix: keyPrefix,
      is_active: true,
    })
    .select("id, name, key_prefix, created_at")
    .single();

  if (error) {
    console.error("APIキー作成エラー:", error);
    return NextResponse.json(
      { error: "APIキーの作成に失敗しました" },
      { status: 500 }
    );
  }

  // 生のキーは作成時のみ返す（以後は参照不可）
  return NextResponse.json({
    key: {
      ...newKey,
      raw_key: rawKey,
    },
  });
}

const deleteKeySchema = z.object({
  id: z.string().uuid("無効なIDです"),
});

/**
 * DELETE: APIキーを削除（無効化）
 */
export async function DELETE(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (!user || authError) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = deleteKeySchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "バリデーションエラー", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { error } = await supabase
    .from("api_keys")
    .update({ is_active: false })
    .eq("id", parsed.data.id)
    .eq("profile_id", user.id);

  if (error) {
    console.error("APIキー削除エラー:", error);
    return NextResponse.json(
      { error: "APIキーの削除に失敗しました" },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
