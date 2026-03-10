/**
 * スクレイピング分析データインポートAPI
 * POST /api/models/[id]/import-analysis
 *
 * Markdownレポート + 構造化統計データ + 生投稿データを受け取り、
 * model_accounts.analysis_result に保存 + model_posts に upsert
 */
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";
import type { AnalysisResult } from "@/types/database";

interface RawPost {
  id: string;
  permalink?: string;
  date?: string;
  text?: string;
  like_count?: number;
  thread_view_count?: number;
  media_type?: string;
  has_image?: boolean;
  has_video?: boolean;
  has_link?: boolean;
  has_emoji?: boolean;
  total_chars?: number;
  thread_id?: string;
  post_order?: number;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (!user || authError) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  const { data: model, error: modelError } = await supabase
    .from("model_accounts")
    .select("*")
    .eq("id", id)
    .eq("profile_id", user.id)
    .single();

  if (!model || modelError) {
    return NextResponse.json(
      { error: "モデルアカウントが見つかりません" },
      { status: 404 }
    );
  }

  let body: {
    markdown_report?: string;
    structured_data?: Partial<AnalysisResult>;
    raw_posts?: RawPost[];
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "リクエストボディのパースに失敗しました" },
      { status: 400 }
    );
  }

  const { markdown_report, structured_data, raw_posts } = body;

  if (!markdown_report && !structured_data) {
    return NextResponse.json(
      { error: "markdown_report または structured_data が必要です" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // 生投稿データがあれば model_posts に upsert
  let postsImported = 0;
  if (raw_posts && raw_posts.length > 0) {
    const firstPostsOnly = raw_posts.filter(
      (p) => !p.post_order || p.post_order === 1
    );

    const postsToInsert = firstPostsOnly.map((post) => ({
      model_account_id: id,
      platform_post_id: post.id || post.permalink || crypto.randomUUID(),
      text: post.text ?? null,
      hashtags: extractHashtags(post.text ?? ""),
      media_type: post.has_video
        ? "video"
        : post.has_image
          ? "image"
          : "text",
      posted_at: post.date ? new Date(post.date).toISOString() : null,
      likes: post.like_count ?? null,
      replies: null,
      reposts: null,
    }));

    const { error: insertError } = await admin
      .from("model_posts")
      .upsert(postsToInsert, {
        onConflict: "model_account_id,platform_post_id",
        ignoreDuplicates: false,
      });

    if (insertError) {
      console.error("投稿インポートエラー:", insertError);
    } else {
      postsImported = postsToInsert.length;
    }
  }

  // analysis_result を構築
  const existingResult = (model.analysis_result as AnalysisResult | null) ?? {};
  const analysisResult: AnalysisResult = {
    ...(existingResult as AnalysisResult),
    ...(structured_data ?? {}),
    markdown_report: markdown_report ?? (existingResult as AnalysisResult).markdown_report,
    data_source: "scraping" as const,
    total_posts_analyzed: raw_posts?.length ?? structured_data?.total_posts_analyzed ?? 0,
  };

  const { error: updateError } = await admin
    .from("model_accounts")
    .update({
      analysis_result: analysisResult,
      last_analyzed_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (updateError) {
    console.error("分析結果保存エラー:", updateError);
    return NextResponse.json(
      { error: "分析結果の保存に失敗しました" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    data: {
      posts_imported: postsImported,
      has_markdown: !!markdown_report,
      has_structured: !!structured_data,
      total_fields: Object.keys(analysisResult).length,
    },
  });
}

function extractHashtags(text: string): string[] {
  const matches = text.match(/#[\w\u3000-\u9FFF]+/g);
  return matches ? matches.map((tag) => tag.replace("#", "")) : [];
}
