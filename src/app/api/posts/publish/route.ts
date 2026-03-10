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
  thread_posts: z.array(z.string().min(1).max(500)).min(2).max(5).optional(),
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

  const hasDraftId = "draft_id" in body && body.draft_id;
  const hasText = "text" in body && body.text;
  const hasThreadPosts =
    "thread_posts" in body &&
    Array.isArray(body.thread_posts) &&
    body.thread_posts.length >= 2;

  if (!hasDraftId && !hasText && !hasThreadPosts) {
    return NextResponse.json(
      { error: "draft_id, text, または thread_posts が必要です" },
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
    } else if (hasThreadPosts && !hasText) {
      draftText = body.thread_posts[0];
      draftMediaUrls = Array.isArray(body.media_urls) ? body.media_urls : [];

      const { data: newDraft, error: createError } = await supabase
        .from("drafts")
        .insert({
          profile_id: user.id,
          account_id: body.account_id,
          text: body.thread_posts.join("\n\n"),
          hashtags: [],
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
    } else {
      const parsed = publishDirectSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { error: "バリデーションエラー", details: parsed.error.flatten() },
          { status: 400 }
        );
      }

      draftText = parsed.data.text;
      draftMediaUrls = Array.isArray(body.media_urls) ? body.media_urls : [];

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

    const adapter = getAdapter(account.platform);
    const threadPosts: string[] | undefined = body.thread_posts;

    if (threadPosts && threadPosts.length >= 2) {
      const results: Array<{ platform_post_id: string; post_url: string; published_at: string }> = [];
      let replyToId: string | undefined;

      for (const postText of threadPosts) {
        const result = await adapter.createPost(accessToken, {
          text: postText,
          media_urls: results.length === 0 ? draftMediaUrls : [],
          reply_to: replyToId,
        });
        results.push(result);
        replyToId = result.platform_post_id;

        if (results.length < threadPosts.length) {
          await new Promise((r) => setTimeout(r, 3000));
        }
      }

      if (draftId) {
        await supabase.from("drafts").update({ status: "published" }).eq("id", draftId);
      }

      for (let i = 0; i < results.length; i++) {
        await adminClient.from("post_insights").upsert(
          {
            account_id: body.account_id,
            platform_post_id: results[i].platform_post_id,
            post_text: threadPosts[i],
            post_url: results[i].post_url,
            likes: 0,
            replies: 0,
            reposts: 0,
            quotes: 0,
            impressions: 0,
            text_length: threadPosts[i].length,
            hashtag_count: (threadPosts[i].match(/#/g) ?? []).length,
            posted_at: results[i].published_at,
            fetched_at: new Date().toISOString(),
          },
          { onConflict: "account_id,platform_post_id" }
        );
      }

      return NextResponse.json({
        data: {
          thread_count: results.length,
          first_post_id: results[0].platform_post_id,
          post_url: results[0].post_url,
          published_at: results[0].published_at,
        },
      });
    }

    const result = await adapter.createPost(accessToken, {
      text: draftText,
      media_urls: draftMediaUrls,
    });

    if (draftId) {
      await supabase.from("drafts").update({ status: "published" }).eq("id", draftId);
    }

    await adminClient.from("post_insights").upsert(
      {
        account_id: body.account_id,
        platform_post_id: result.platform_post_id,
        post_text: draftText,
        post_url: result.post_url,
        likes: 0,
        replies: 0,
        reposts: 0,
        quotes: 0,
        impressions: 0,
        text_length: draftText.length,
        hashtag_count: (draftText.match(/#/g) ?? []).length,
        posted_at: result.published_at,
        fetched_at: new Date().toISOString(),
      },
      { onConflict: "account_id,platform_post_id" }
    );

    return NextResponse.json({
      data: {
        platform_post_id: result.platform_post_id,
        post_url: result.post_url,
        published_at: result.published_at,
      },
    });
  } catch (err) {
    console.error("投稿エラー:", err);
    const message = err instanceof Error ? err.message : "不明なエラー";
    return NextResponse.json(
      { error: `投稿に失敗しました: ${message}` },
      { status: 500 }
    );
  }
}
