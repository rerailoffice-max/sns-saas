import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";
import { getPlanLimits } from "@/lib/stripe/plans";
import Anthropic from "@anthropic-ai/sdk";
import type { SubscriptionPlan } from "@/types/database";
import type { AnalysisResult } from "@/types/database";

const HOOK_TYPES = [
  "速報",
  "問題提起",
  "やばい",
  "数字",
  "断言",
  "質問",
  "その他",
] as const;

type PostRow = {
  id: string;
  text: string | null;
  likes: number | null;
  replies: number | null;
  reposts: number | null;
  posted_at: string | null;
  hashtags: string[] | null;
  media_type: string | null;
};

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

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "AI機能が設定されていません（ANTHROPIC_API_KEY未設定）" },
      { status: 503 }
    );
  }

  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("plan")
    .eq("profile_id", user.id)
    .single();

  const plan = (subscription?.plan ?? "free") as SubscriptionPlan;
  const limits = getPlanLimits(plan);

  if (!limits.aiOptimizationEnabled) {
    return NextResponse.json(
      { error: "AI分析機能はStarterプラン以上で利用できます" },
      { status: 403 }
    );
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

  const { data: posts } = await supabase
    .from("model_posts")
    .select("id, text, likes, replies, reposts, posted_at, hashtags, media_type")
    .eq("model_account_id", id)
    .order("posted_at", { ascending: false })
    .limit(500);

  if (!posts || posts.length === 0) {
    return NextResponse.json(
      {
        error:
          "分析に十分な投稿データがありません。先に「投稿を取得」を実行してください",
      },
      { status: 400 }
    );
  }

  const dataSource: "api" | "scraping" =
    posts.length > 50 ? "scraping" : "api";
  const views = 0;

  const threadGroups = groupByThread(posts as PostRow[]);
  const threadAnalysis = computeThreadAnalysis(threadGroups, views);
  const charCorrelation = computeCharCorrelation(posts as PostRow[]);
  const topByLikes = [...posts]
    .sort((a, b) => (b.likes ?? 0) - (a.likes ?? 0))
    .slice(0, 10);

  const topPosts = topByLikes.map((p) => ({
    text: (p.text ?? "").slice(0, 200),
    likes: p.likes ?? 0,
    views,
    thread_length: 1,
    date: p.posted_at ?? "",
  }));

  const monthly = computeMonthlyPerformance(posts as PostRow[]);
  const weekly = computeWeeklyPerformance(posts as PostRow[]);

  const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });

  const postsText = posts
    .map(
      (p, i) =>
        `${i + 1}. ${p.text ?? "(テキストなし)"}\n   ハッシュタグ: ${(p.hashtags ?? []).map((t: string) => `#${t}`).join(" ") || "なし"}\n   メディア: ${p.media_type ?? "テキスト"}\n   いいね${p.likes ?? 0} リプ${p.replies ?? 0} RP${p.reposts ?? 0}\n   投稿日: ${p.posted_at ?? "不明"}`
    )
    .join("\n\n");

  const hookPrompt = `以下の各投稿の冒頭（最初の1〜2文）を、次のいずれかに分類してください：${HOOK_TYPES.join("、")}。JSON配列で返してください。各要素は {"index": 1-based番号, "type": "分類"} の形式。`;
  const hookResponse = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4000,
    messages: [
      {
        role: "user",
        content: `${hookPrompt}\n\n投稿一覧：\n${posts.slice(0, 200).map((p, i) => `${i + 1}. ${(p.text ?? "").slice(0, 150)}`).join("\n")}`,
      },
    ],
  });

  const hookText =
    hookResponse.content[0].type === "text"
      ? hookResponse.content[0].text
      : "";
  let hookClassifications: { index: number; type: string }[] = [];
  try {
    const hookMatch = hookText.match(/\[[\s\S]*?\]/);
    if (hookMatch) {
      const arr = JSON.parse(hookMatch[0]) as unknown[];
      hookClassifications = Array.isArray(arr)
        ? arr
            .filter(
              (x): x is { index: number; type: string } =>
                x != null &&
                typeof x === "object" &&
                typeof (x as { index: unknown }).index === "number" &&
                typeof (x as { type: unknown }).type === "string"
            )
        : [];
    }
  } catch {
    hookClassifications = [];
  }

  const hookCounts: Record<string, { count: number; likes: number; examples: string[] }> = {};
  for (const t of HOOK_TYPES) {
    hookCounts[t] = { count: 0, likes: 0, examples: [] };
  }
  for (const c of hookClassifications) {
    const type = HOOK_TYPES.includes(c.type as (typeof HOOK_TYPES)[number])
      ? c.type
      : "その他";
    const post = posts[c.index - 1];
    if (post && hookCounts[type]) {
      hookCounts[type].count++;
      hookCounts[type].likes += post.likes ?? 0;
      if (hookCounts[type].examples.length < 3) {
        const ex = (post.text ?? "").slice(0, 80);
        if (ex) hookCounts[type].examples.push(ex);
      }
    }
  }

  const hookPatterns = Object.entries(hookCounts)
    .filter(([, v]) => v.count > 0)
    .map(([type, v]) => ({
      type,
      count: v.count,
      avg_likes: v.count > 0 ? Math.round(v.likes / v.count) : 0,
      avg_views: views,
      examples: v.examples,
    }))
    .sort((a, b) => b.avg_likes - a.avg_likes);

  const bestHook =
    hookPatterns.length > 0 ? hookPatterns[0].type : "その他";
  const hookAnalysis = {
    patterns: hookPatterns,
    best_pattern: bestHook,
  };

  const stylePrompt = `あなたはSNS分析のプロフェッショナルです。以下の投稿データを分析して、このアカウント（@${model.username}）の特徴を詳細にプロファイリングしてください。

以下のJSON形式で返してください：
{
  "writing_style": {
    "tone": "文体の特徴（例: カジュアル、ビジネス、知的、熱血、親しみやすい等）を50字以内で",
    "avg_length": 平均文字数（数値）,
    "emoji_usage": "絵文字の使用傾向（多用/適度/少なめ/不使用）",
    "hook_patterns": ["よく使う冒頭フックパターンTOP5（例: 質問形、数字、断言、体験談等）"]
  },
  "content_themes": [
    {"theme": "テーマ名", "frequency": 出現割合（0-100の数値）}
  ],
  "hashtag_strategy": {
    "avg_count": 1投稿あたりの平均ハッシュタグ数,
    "top_hashtags": ["よく使うタグTOP10（#なし）"],
    "usage_pattern": "ハッシュタグの使い方の特徴"
  },
  "posting_frequency": {
    "avg_per_week": 週平均投稿数,
    "peak_days": ["投稿が多い曜日（月〜日）"],
    "peak_hours": [投稿が多い時間帯の数値配列]
  },
  "engagement_patterns": {
    "avg_likes": 平均いいね数,
    "avg_replies": 平均リプライ数,
    "avg_reposts": 平均リポスト数,
    "top_post_features": ["バズった投稿に共通する特徴5つ"],
    "best_performing_format": "最もエンゲージメントが高い投稿フォーマット"
  },
  "summary": "このアカウントの投稿スタイル総合分析（200字以内）",
  "modeling_tips": [
    "このアカウントの文体をモデリングするためのコツ5つ（各50字以内）"
  ]
}

正確なJSON形式で返してください。コメントや余計なテキストは不要です。`;

  const styleResponse = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4000,
    messages: [
      {
        role: "user",
        content: `@${model.username} の${posts.length}件の投稿を分析してください：\n\n${postsText}`,
      },
    ],
    system: stylePrompt,
  });

  const styleText =
    styleResponse.content[0].type === "text"
      ? styleResponse.content[0].text
      : "";
  let jsonStr = styleText;
  const jsonMatch = styleText.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    jsonStr = jsonMatch[1].trim();
  } else {
    const directMatch = styleText.match(/\{[\s\S]*\}/);
    if (directMatch) jsonStr = directMatch[0];
  }

  const baseResult = JSON.parse(jsonStr) as Omit<
    AnalysisResult,
    "thread_analysis" | "hook_analysis" | "char_correlation" | "top_posts" | "data_source" | "total_posts_analyzed"
  >;

  const analysisResult: AnalysisResult = {
    ...baseResult,
    thread_analysis: threadAnalysis,
    hook_analysis: hookAnalysis,
    char_correlation: charCorrelation,
    top_posts: topPosts,
    data_source: dataSource,
    total_posts_analyzed: posts.length,
  };

  const admin = createAdminClient();
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
    data: analysisResult,
    meta: {
      total_posts_analyzed: posts.length,
      data_source: dataSource,
      monthly,
      weekly,
    },
  });
}

function groupByThread(posts: PostRow[]): PostRow[][] {
  return posts.map((p) => [p]);
}

function computeThreadAnalysis(
  groups: PostRow[][],
  defaultViews: number
): AnalysisResult["thread_analysis"] {
  const byLength: Record<number, { count: number; likes: number; views: number }> = {};
  let totalLength = 0;
  let totalCount = 0;

  for (const g of groups) {
    const len = g.length;
    totalLength += len;
    totalCount++;
    if (!byLength[len]) byLength[len] = { count: 0, likes: 0, views: 0 };
    byLength[len].count++;
    const first = g[0];
    byLength[len].likes += first?.likes ?? 0;
    byLength[len].views += defaultViews;
  }

  const byLengthArr = Object.entries(byLength).map(([len, v]) => ({
    length: parseInt(len, 10),
    count: v.count,
    avg_likes: v.count > 0 ? Math.round(v.likes / v.count) : 0,
    avg_views: v.count > 0 ? Math.round(v.views / v.count) : 0,
  }));

  const best = byLengthArr.reduce((a, b) =>
    a.avg_likes >= b.avg_likes ? a : b
  );

  return {
    avg_thread_length: totalCount > 0 ? totalLength / totalCount : 1,
    by_length: byLengthArr,
    optimal_length: best?.length ?? 1,
  };
}

function computeCharCorrelation(
  posts: PostRow[]
): AnalysisResult["char_correlation"] {
  const ranges = [
    { range: "〜100", min: 0, max: 100 },
    { range: "101〜200", min: 101, max: 200 },
    { range: "201〜300", min: 201, max: 300 },
    { range: "301〜400", min: 301, max: 400 },
    { range: "401〜500", min: 401, max: 500 },
    { range: "501+", min: 501, max: Infinity },
  ];

  const buckets: Record<string, { count: number; likes: number }> = {};
  for (const r of ranges) {
    buckets[r.range] = { count: 0, likes: 0 };
  }

  for (const p of posts) {
    const len = (p.text ?? "").length;
    const r = ranges.find((x) => len >= x.min && len <= x.max);
    const key = r?.range ?? "501+";
    buckets[key].count++;
    buckets[key].likes += p.likes ?? 0;
  }

  const rangesArr = Object.entries(buckets).map(([range, v]) => ({
    range,
    count: v.count,
    avg_likes: v.count > 0 ? Math.round(v.likes / v.count) : 0,
  }));

  const bestRange = rangesArr.reduce((a, b) =>
    a.avg_likes >= b.avg_likes ? a : b
  );

  return {
    ranges: rangesArr,
    optimal_range: bestRange?.range ?? "〜100",
  };
}

function computeMonthlyPerformance(
  posts: PostRow[]
): Record<string, { count: number; avg_likes: number }> {
  const result: Record<string, { count: number; likes: number }> = {};
  for (const p of posts) {
    const m = p.posted_at?.slice(0, 7) ?? "unknown";
    if (!result[m]) result[m] = { count: 0, likes: 0 };
    result[m].count++;
    result[m].likes += p.likes ?? 0;
  }
  return Object.fromEntries(
    Object.entries(result).map(([k, v]) => [
      k,
      { count: v.count, avg_likes: v.count > 0 ? Math.round(v.likes / v.count) : 0 },
    ])
  );
}

function computeWeeklyPerformance(
  posts: PostRow[]
): Record<string, { count: number; avg_likes: number }> {
  const DAY_NAMES = ["日", "月", "火", "水", "木", "金", "土"];
  const result: Record<string, { count: number; likes: number }> = {};
  for (const p of posts) {
    const d = p.posted_at ? new Date(p.posted_at).getDay() : 0;
    const day = DAY_NAMES[d] ?? "?";
    if (!result[day]) result[day] = { count: 0, likes: 0 };
    result[day].count++;
    result[day].likes += p.likes ?? 0;
  }
  return Object.fromEntries(
    Object.entries(result).map(([k, v]) => [
      k,
      { count: v.count, avg_likes: v.count > 0 ? Math.round(v.likes / v.count) : 0 },
    ])
  );
}
