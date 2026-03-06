/**
 * 即時投稿API
 * POST /api/posts/publish
 *
 * 2パターン対応:
 * 1. { draft_id, account_id } — 既存の下書きを投稿
 * 2. { text, account_id, hashtags? } — テキストを直接投稿（内部で下書き→投稿）
 */
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";
import { getAdapter } from "@/lib/adapters/factory";
import { decrypt } from "@/lib/encryption";
import { z } from "zod";

// 既存の下書きを投稿
const publishDraftSchema = z.object({
  draft_id: z.string().uuid(),
  account_id: z.string().uuid(),
  text: z.undefined().optional(),
});

// テキストを直接投稿（内部で下書き作成→投稿）
const publishDirectSchema = z.object({
  text: z.string().min(1, "投稿テキストは必須です").max(500, "500文字以内で入力してください"),
  account_id: z.string().uuid(),
  hashtags: z.array(z.string()).optional(),
  draft_id: z.undefined().optional(),
});

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

  // パターン判定: draft_id があれば既存下書き投稿、text があれば直接投稿
  const hasDraftId = "draft_id" in body && body.draft_id;
  const hasText = "text" in body && body.text;

  if (!hasDraftId && !hasText) {
    return NextResponse.json(
      { error: "draft_id または text が必要です" },
      { status: 400 }
    );
  }

  try {
    let draftText: string;
    let draftMediaUrls: string[] = [];
    let draftId: string | null = null;

    if (hasDraftId) {
      // パターン1: 既存の下書きを投稿
      const parsed = publishDraftSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: "バリデーションエラー", details: parsed.error.flatten() },
          { status: 400 }
        );
      }

      const { data: draft, error: draftError } = await supabase
        .from("drafts")
        .select("*")
        .eq("id", body.draft_id)
        .eq("profile_id", user.id)
        .single();

      if (!draft || draftError) {
        return NextResponse.json(
          { error: "下書きが見つかりません" },
          { status: 404 }
        );
      }

      draftText = draft.text;
      draftMediaUrls = draft.media_urls ?? [];
      draftId = draft.id;
    } else {
      // パターン2: テキストを直接投稿（内部で下書きを作成）
      const parsed = publishDirectSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: "バリデーションエラー", details: parsed.error.flatten() },
          { status: 400 }
        );
      }

      draftText = parsed.data.text;

      // 内部下書きを作成（投稿の記録として）
      const { data: newDraft, error: createError } = await supabase
        .from("drafts")
        .insert({
          profile_id: user.id,
          account_id: body.account_id,
          text: parsed.data.text,
          hashtags: parsed.data.hashtags ?? [],
          source: "manual",
          status: "publishing",
        })
        .select()
        .single();

      if (createError || !newDraft) {
        console.error("下書き作成エラー:", createError);
        return NextResponse.json(
          { error: "投稿の準備に失敗しました" },
          { status: 500 }
        );
      }

      draftId = newDraft.id;
    }

    // SNSアカウント取得（暗号化トークン含む、RLSバイパス）
    const adminClient = createAdminClient();
    const { data: account, error: accountError } = await adminClient
      .from("social_accounts")
      .select("*")
      .eq("id", body.account_id)
      .eq("profile_id", user.id)
      .eq("is_active", true)
      .single();

    if (!account || accountError) {
      return NextResponse.json(
        { error: "有効なSNSアカウントが見つかりません" },
        { status: 404 }
      );
    }

    // トークン復号化
    const accessToken = decrypt(account.access_token_enc);

    // SNSアダプターで投稿
    const adapter = getAdapter(account.platform);
    const result = await adapter.createPost(accessToken, {
      text: draftText,
      media_urls: draftMediaUrls,
    });

    // 下書きステータスを「published」に更新
    if (draftId) {
      await supabase
        .from("drafts")
        .update({ status: "published" })
        .eq("id", draftId);
    }

    return NextResponse.json({
      data: {
        platform_post_id: result.platform_post_id,
        post_url: result.post_url,
        published_at: result.published_at,
      },
    });
  } catch (err) {
    console.error("投稿エラー:", err);
    return NextResponse.json(
      { error: "投稿に失敗しました" },
      { status: 500 }
    );
  }
}
