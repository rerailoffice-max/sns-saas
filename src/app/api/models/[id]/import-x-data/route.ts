/**
 * X投稿データインポートAPI
 * POST /api/models/[id]/import-x-data
 *
 * ローカルマシンで xurl search API で取得したデータをインポートする。
 * upload-analysis.js または xurl 連携スクリプトから呼び出される。
 */
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const importSchema = z.object({
  posts: z.array(
    z.object({
      platform_post_id: z.string(),
      text: z.string().nullable(),
      likes: z.number().default(0),
      replies: z.number().default(0),
      reposts: z.number().default(0),
      views: z.number().default(0),
      bookmarks: z.number().default(0),
      media_type: z.string().default("text"),
      posted_at: z.string().nullable(),
    })
  ),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (!user || authError) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  const { id } = await params;

  const { data: model } = await supabase
    .from("model_accounts")
    .select("id, platform")
    .eq("id", id)
    .eq("profile_id", user.id)
    .single();

  if (!model) {
    return NextResponse.json(
      { error: "モデルアカウントが見つかりません" },
      { status: 404 }
    );
  }

  const body = await request.json();
  const parsed = importSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "バリデーションエラー", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const postsToInsert = parsed.data.posts.map((post) => ({
    model_account_id: id,
    platform_post_id: post.platform_post_id,
    text: post.text,
    likes: post.likes,
    replies: post.replies,
    reposts: post.reposts,
    views: post.views,
    bookmarks: post.bookmarks,
    media_type: post.media_type,
    posted_at: post.posted_at,
    hashtags: extractHashtags(post.text ?? ""),
  }));

  const { error } = await supabase.from("model_posts").upsert(postsToInsert, {
    onConflict: "model_account_id,platform_post_id",
    ignoreDuplicates: false,
  });

  if (error) {
    console.error("X投稿データインポートエラー:", error);
    return NextResponse.json(
      { error: "インポートに失敗しました" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    data: { imported: postsToInsert.length },
  });
}

function extractHashtags(text: string): string[] {
  const matches = text.match(/#[\w\u3000-\u9FFF]+/g);
  return matches ? matches.map((tag) => tag.replace("#", "")) : [];
}
