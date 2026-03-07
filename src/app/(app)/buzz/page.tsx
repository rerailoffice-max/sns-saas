/**
 * 🔥 バズダッシュボード
 * バズツール専用ページ — スコアランキング・パターン分析・最適時間・AIアシスト
 */
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Flame, Target, Zap, Clock, TrendingUp } from "lucide-react";
import { calculateBuzzScore, getBuzzRank } from "@/lib/buzz-score";
import { getOptimalTimings } from "@/lib/optimal-timing";
import { analyzeBuzzPatterns } from "@/lib/buzz-patterns";
import { analyzeHashtags } from "@/lib/hashtag-recommend";
import { BuzzPatterns } from "@/components/analytics/buzz-patterns";

const DAY_NAMES = ["月", "火", "水", "木", "金", "土", "日"];

export default async function BuzzPage() {
  // デモモード
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <Flame className="h-6 w-6 text-orange-500" />
          <h1 className="text-2xl font-bold">バズツール</h1>
        </div>
        <Card>
          <CardContent className="py-8">
            <p className="text-sm text-muted-foreground text-center">
              SNSアカウントを接続してデータが蓄積されると、バズ分析が表示されます。
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // 接続アカウント取得
  const { data: accounts } = await supabase
    .from("social_accounts")
    .select("id")
    .eq("profile_id", user.id)
    .eq("is_active", true);

  const accountIds = accounts?.map((a) => a.id) ?? [];

  // 直近90日の投稿データ取得
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 90);

  const { data: insights } = await supabase
    .from("post_insights")
    .select(
      "id, platform_post_id, post_text, post_url, posted_at, likes, replies, reposts, quotes, impressions, media_type"
    )
    .in("account_id", accountIds)
    .gte("posted_at", startDate.toISOString())
    .order("posted_at", { ascending: false });

  const posts = insights ?? [];
  const hasData = posts.length > 0;

  // バズスコア算出
  const postsWithScore = posts.map((p) => ({
    ...p,
    buzzScore: calculateBuzzScore({
      likes: p.likes ?? 0,
      replies: p.replies ?? 0,
      reposts: p.reposts ?? 0,
      quotes: p.quotes ?? 0,
      impressions: p.impressions ?? 0,
    }),
  }));

  const allScores = postsWithScore.map((p) => p.buzzScore);
  const rankedPosts = postsWithScore
    .map((p) => ({
      ...p,
      rank: getBuzzRank(p.buzzScore, allScores),
    }))
    .sort((a, b) => b.buzzScore - a.buzzScore)
    .slice(0, 20);

  // 最適投稿時間
  const timings = getOptimalTimings(
    posts.map((p) => ({
      posted_at: p.posted_at,
      likes: p.likes ?? 0,
      replies: p.replies ?? 0,
      reposts: p.reposts ?? 0,
    })),
    5
  );

  // バズパターン分析
  const buzzPattern = analyzeBuzzPatterns(
    posts.map((p) => ({
      post_text: p.post_text,
      posted_at: p.posted_at,
      likes: p.likes ?? 0,
      replies: p.replies ?? 0,
      reposts: p.reposts ?? 0,
      media_type: p.media_type,
    }))
  );

  // ハッシュタグ分析
  const hashtagStats = analyzeHashtags(
    posts.map((p) => ({
      post_text: p.post_text,
      likes: p.likes ?? 0,
      replies: p.replies ?? 0,
      reposts: p.reposts ?? 0,
    })),
    10
  );

  // サマリー統計
  const avgBuzzScore =
    allScores.length > 0
      ? Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length)
      : 0;
  const sRankCount = rankedPosts.filter(
    (p) => p.rank.rank === "S"
  ).length;
  const aRankCount = rankedPosts.filter(
    (p) => p.rank.rank === "A"
  ).length;

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center gap-2">
        <Flame className="h-6 w-6 text-orange-500" />
        <h1 className="text-2xl font-bold">バズツール</h1>
      </div>

      {!hasData && (
        <Card>
          <CardContent className="py-8">
            <p className="text-sm text-muted-foreground text-center">
              投稿データが蓄積されると、バズ分析が表示されます。まずは投稿を続けましょう！
            </p>
          </CardContent>
        </Card>
      )}

      {/* サマリーカード */}
      {hasData && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                平均バズスコア
              </CardTitle>
              <Zap className="h-4 w-4 text-yellow-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{avgBuzzScore}</div>
              <p className="text-xs text-muted-foreground">
                直近90日の全投稿平均
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                S・Aランク投稿
              </CardTitle>
              <Flame className="h-4 w-4 text-red-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {sRankCount + aRankCount}件
              </div>
              <p className="text-xs text-muted-foreground">
                S: {sRankCount}件 / A: {aRankCount}件
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                おすすめ投稿時間
              </CardTitle>
              <Target className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {timings.length > 0
                  ? `${timings[0].dayName}曜 ${timings[0].hour}時`
                  : "-"}
              </div>
              <p className="text-xs text-muted-foreground">
                最もエンゲージメントが高い時間
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                分析投稿数
              </CardTitle>
              <TrendingUp className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{posts.length}件</div>
              <p className="text-xs text-muted-foreground">直近90日間</p>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* バズスコアランキング */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Flame className="h-5 w-5 text-orange-500" />
              バズスコアランキング
            </CardTitle>
            <CardDescription>
              エンゲージメント効率順の投稿ランキング
            </CardDescription>
          </CardHeader>
          <CardContent className="max-h-[500px] overflow-y-auto">
            {rankedPosts.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                データなし
              </p>
            ) : (
              <div className="space-y-3">
                {rankedPosts.map((post, index) => (
                  <div
                    key={post.id}
                    className="flex items-start gap-3 rounded-lg border p-3"
                  >
                    <span className="text-lg font-bold text-muted-foreground w-6 text-right">
                      {index + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge
                          variant={
                            post.rank.rank === "S"
                              ? "destructive"
                              : post.rank.rank === "A"
                                ? "default"
                                : "secondary"
                          }
                          className="text-xs"
                        >
                          {post.rank.rank} {post.rank.label}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          スコア: {post.buzzScore}
                        </span>
                      </div>
                      <p className="text-sm line-clamp-2">
                        {post.post_text ?? post.platform_post_id ?? ""}
                      </p>
                      <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
                        <span>❤️ {post.likes ?? 0}</span>
                        <span>💬 {post.replies ?? 0}</span>
                        <span>🔁 {post.reposts ?? 0}</span>
                        {post.impressions ? (
                          <span>👁 {post.impressions.toLocaleString()}</span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* おすすめ投稿時間 & ハッシュタグ */}
        <div className="space-y-4">
          {/* おすすめ投稿時間 */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-blue-500" />
                おすすめ投稿時間 TOP5
              </CardTitle>
              <CardDescription>
                過去データから算出した最適な投稿タイミング
              </CardDescription>
            </CardHeader>
            <CardContent>
              {timings.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  データなし
                </p>
              ) : (
                <div className="space-y-2">
                  {timings.map((timing, index) => (
                    <div
                      key={`${timing.dayIndex}-${timing.hour}`}
                      className="flex items-center justify-between rounded-lg border p-3"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-lg font-bold text-muted-foreground">
                          {index + 1}
                        </span>
                        <div>
                          <p className="font-medium">
                            {timing.dayName}曜日 {timing.hour}:00
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {timing.postCount}件の投稿データ
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-primary">
                          {timing.avgEngagement}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          平均反応数
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* 効果的なハッシュタグ */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                # 効果的なハッシュタグ
              </CardTitle>
              <CardDescription>
                高いエンゲージメントを獲得したハッシュタグ
              </CardDescription>
            </CardHeader>
            <CardContent>
              {hashtagStats.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  データなし
                </p>
              ) : (
                <div className="space-y-2">
                  {hashtagStats.map((stat) => (
                    <div
                      key={stat.tag}
                      className="flex items-center justify-between rounded-lg border p-2"
                    >
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">{stat.tag}</Badge>
                        <span className="text-xs text-muted-foreground">
                          ×{stat.count}回使用
                        </span>
                      </div>
                      <span className="text-sm font-medium">
                        平均 {stat.avgEngagement} 反応
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* バズパターン分析 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-yellow-500" />
            バズパターン分析
          </CardTitle>
          <CardDescription>
            バズった投稿に共通する特徴と傾向
          </CardDescription>
        </CardHeader>
        <CardContent>
          <BuzzPatterns pattern={buzzPattern} />
        </CardContent>
      </Card>
    </div>
  );
}
