/**
 * ダッシュボードページ
 * フォロワー推移・エンゲージメント概要・最近の投稿
 * サーバーコンポーネント: Supabaseからデータ取得
 * Supabase未接続時はモックデータで表示
 */
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { TrendingUp, Users, FileText, Calendar, Target } from "lucide-react";
import { getOptimalTimings, type TimingRecommendation } from "@/lib/optimal-timing";
import { PlatformIcon } from "@/components/icons/platform-icon";
import { FollowersChart } from "@/components/dashboard/followers-chart";
import { EngagementChart } from "@/components/dashboard/engagement-chart";
import { RecentPosts } from "@/components/dashboard/recent-posts";
import { PeriodFilter } from "@/components/dashboard/period-filter";
import { RSSNewsFeed } from "@/components/dashboard/rss-news-feed";

// モックデータ（Supabase未接続時用）
const MOCK_FOLLOWERS = Array.from({ length: 30 }, (_, i) => ({
  date: `${Math.floor((i + 1) / 30 * 3) + 1}月${((i + 1) % 28) + 1}日`,
  count: 1200 + Math.floor(i * 8 + (i % 3) * 15),
}));

const MOCK_ENGAGEMENT = Array.from({ length: 14 }, (_, i) => ({
  date: `${Math.floor((i + 1) / 14 * 3) + 1}月${((i + 1) % 28) + 1}日`,
  likes: 15 + (i % 5) * 10,
  replies: 5 + (i % 4) * 3,
  reposts: 3 + (i % 3) * 4,
}));

const MOCK_POSTS = [
  { id: "1", text: "Threadsの新機能について解説します。APIが公開されて...", posted_at: "2025-03-05T10:00:00Z", likes: 45, replies: 12, reposts: 8, impressions: 1200 },
  { id: "2", text: "SNS運用のコツ：投稿時間の最適化について考えてみた。", posted_at: "2025-03-04T08:00:00Z", likes: 38, replies: 9, reposts: 5, impressions: 980 },
  { id: "3", text: "AI活用でSNS運用が変わる。自動分析機能の紹介。", posted_at: "2025-03-03T12:00:00Z", likes: 62, replies: 18, reposts: 15, impressions: 2100 },
  { id: "4", text: "週末のコンテンツ戦略。リーチを最大化するために。", posted_at: "2025-03-02T09:00:00Z", likes: 29, replies: 7, reposts: 4, impressions: 750 },
  { id: "5", text: "フォロワー1000人突破！感謝の気持ちを込めて。", posted_at: "2025-03-01T07:00:00Z", likes: 89, replies: 25, reposts: 20, impressions: 3500 },
];

interface DashboardPageProps {
  searchParams: Promise<{ period?: string }>;
}

export default async function DashboardPage({
  searchParams,
}: DashboardPageProps) {
  // Supabase未接続時はモックデータで表示
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    const mockAvg = (
      MOCK_POSTS.reduce(
        (sum, p) => sum + p.likes + p.replies + p.reposts,
        0
      ) / MOCK_POSTS.length
    ).toFixed(1);

    return (
      <DashboardView
        followerData={MOCK_FOLLOWERS}
        engagementData={MOCK_ENGAGEMENT}
        recentPosts={MOCK_POSTS}
        latestFollowers={MOCK_FOLLOWERS[MOCK_FOLLOWERS.length - 1]?.count ?? 0}
        postCount={MOCK_POSTS.length}
        avgEngagement={mockAvg}
        scheduledCount={3}
        periodDays={30}
        accountCount={1}
        hasAccounts={true}
        accounts={[{ id: "demo", platform: "threads", username: "demo_user", display_name: "デモユーザー" }]}
        optimalTimings={[
          { dayIndex: 2, dayName: "水", hour: 8, avgEngagement: 45, postCount: 3 },
          { dayIndex: 0, dayName: "月", hour: 12, avgEngagement: 38, postCount: 4 },
          { dayIndex: 4, dayName: "金", hour: 19, avgEngagement: 32, postCount: 2 },
        ]}
      />
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const params = await searchParams;
  const periodDays = parseInt(params?.period ?? "30", 10);
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - periodDays);
  const startDateStr = startDate.toISOString().split("T")[0];

  // 接続済みアカウント取得
  const { data: accounts } = await supabase
    .from("social_accounts")
    .select("id, platform, username, display_name")
    .eq("profile_id", user.id)
    .eq("is_active", true);

  const accountIds = accounts?.map((a) => a.id) ?? [];
  const hasAccounts = accountIds.length > 0;

  // フォロワースナップショット取得
  let followerData: Array<{ date: string; count: number }> = [];
  if (hasAccounts) {
    const { data: snapshots } = await supabase
      .from("follower_snapshots")
      .select("follower_count, recorded_at")
      .in("account_id", accountIds)
      .gte("recorded_at", startDateStr)
      .order("recorded_at", { ascending: true });

    if (snapshots) {
      // 日付でグループ化（複数アカウントの場合は合算）
      const dateMap = new Map<string, number>();
      snapshots.forEach((s) => {
        const date = s.recorded_at;
        dateMap.set(date, (dateMap.get(date) ?? 0) + s.follower_count);
      });
      followerData = Array.from(dateMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, count]) => ({
          date: new Date(date).toLocaleDateString("ja-JP", {
            month: "short",
            day: "numeric",
          }),
          count,
        }));
    }
  }

  // 投稿インサイト取得
  let engagementData: Array<{
    date: string;
    likes: number;
    replies: number;
    reposts: number;
  }> = [];
  let recentPosts: Array<{
    id: string;
    text: string;
    posted_at: string;
    likes: number;
    replies: number;
    reposts: number;
    impressions: number;
  }> = [];
  let totalLikes = 0;
  let totalReplies = 0;
  let totalReposts = 0;
  let postCount = 0;

  if (hasAccounts) {
    const { data: insights } = await supabase
      .from("post_insights")
      .select("id, platform_post_id, post_text, posted_at, likes, replies, reposts, impressions")
      .in("account_id", accountIds)
      .gte("posted_at", startDate.toISOString())
      .order("posted_at", { ascending: false });

    if (insights) {
      postCount = insights.length;
      insights.forEach((p) => {
        totalLikes += p.likes ?? 0;
        totalReplies += p.replies ?? 0;
        totalReposts += p.reposts ?? 0;
      });

      // 直近10件
      recentPosts = insights.slice(0, 10).map((p) => ({
        id: p.id,
        text: p.post_text ?? p.platform_post_id ?? "",
        posted_at: p.posted_at ?? new Date().toISOString(),
        likes: p.likes ?? 0,
        replies: p.replies ?? 0,
        reposts: p.reposts ?? 0,
        impressions: p.impressions ?? 0,
      }));

      // 日別エンゲージメント集計
      const engMap = new Map<
        string,
        { likes: number; replies: number; reposts: number }
      >();
      insights.forEach((p) => {
        const date = p.posted_at
          ? new Date(p.posted_at).toISOString().split("T")[0]
          : "";
        if (!date) return;
        const existing = engMap.get(date) ?? {
          likes: 0,
          replies: 0,
          reposts: 0,
        };
        engMap.set(date, {
          likes: existing.likes + (p.likes ?? 0),
          replies: existing.replies + (p.replies ?? 0),
          reposts: existing.reposts + (p.reposts ?? 0),
        });
      });
      engagementData = Array.from(engMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, values]) => ({
          date: new Date(date).toLocaleDateString("ja-JP", {
            month: "short",
            day: "numeric",
          }),
          ...values,
        }));
    }
  }

  // 予約投稿数（アカウント経由で取得）
  let scheduledCountValue = 0;
  if (hasAccounts) {
    const { count } = await supabase
      .from("scheduled_posts")
      .select("id", { count: "exact", head: true })
      .in("account_id", accountIds)
      .eq("status", "pending");
    scheduledCountValue = count ?? 0;
  }

  // 最新フォロワー数（直近のスナップショット合算）
  let latestFollowers = 0;
  if (hasAccounts) {
    for (const accountId of accountIds) {
      const { data: latest } = await supabase
        .from("follower_snapshots")
        .select("follower_count")
        .eq("account_id", accountId)
        .order("recorded_at", { ascending: false })
        .limit(1)
        .single();
      if (latest) {
        latestFollowers += latest.follower_count;
      }
    }
  }

  // 平均エンゲージメント
  const avgEngagement =
    postCount > 0
      ? ((totalLikes + totalReplies + totalReposts) / postCount).toFixed(1)
      : "-";

  // 最適投稿時間レコメンド
  const optimalTimings = hasAccounts
    ? getOptimalTimings(
        recentPosts.map((p) => ({
          posted_at: p.posted_at,
          likes: p.likes,
          replies: p.replies,
          reposts: p.reposts,
        })),
        3
      )
    : [];

  return (
    <DashboardView
      followerData={followerData}
      engagementData={engagementData}
      recentPosts={recentPosts}
      latestFollowers={latestFollowers}
      postCount={postCount}
      avgEngagement={avgEngagement}
      scheduledCount={scheduledCountValue}
      periodDays={periodDays}
      accountCount={accountIds.length}
      hasAccounts={hasAccounts}
      accounts={accounts ?? []}
      optimalTimings={optimalTimings}
    />
  );
}

/** ダッシュボード表示コンポーネント（実データ・デモデータ共通） */
function DashboardView({
  followerData,
  engagementData,
  recentPosts,
  latestFollowers,
  postCount,
  avgEngagement,
  scheduledCount,
  periodDays,
  accountCount,
  hasAccounts,
  accounts = [],
  optimalTimings = [],
}: {
  followerData: Array<{ date: string; count: number }>;
  engagementData: Array<{
    date: string;
    likes: number;
    replies: number;
    reposts: number;
  }>;
  recentPosts: Array<{
    id: string;
    text: string;
    posted_at: string;
    likes: number;
    replies: number;
    reposts: number;
    impressions: number;
  }>;
  latestFollowers: number;
  postCount: number;
  avgEngagement: string;
  scheduledCount: number;
  periodDays: number;
  accountCount: number;
  hasAccounts: boolean;
  accounts?: Array<{ id: string; platform: string; username: string; display_name: string | null }>;
  optimalTimings?: TimingRecommendation[];
}) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">ダッシュボード</h1>
        <Suspense fallback={null}>
          <PeriodFilter />
        </Suspense>
      </div>

      {/* サマリーカード */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">フォロワー数</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {hasAccounts ? latestFollowers.toLocaleString() : "-"}
            </div>
            <div className="text-xs text-muted-foreground">
              {hasAccounts && accounts.length > 0 ? (
                <div className="flex items-center gap-2 flex-wrap">
                  {accounts.map((acc) => (
                    <span key={acc.id} className="flex items-center gap-1">
                      <PlatformIcon platform={acc.platform} size={12} />
                      @{acc.username}
                    </span>
                  ))}
                </div>
              ) : hasAccounts ? (
                `${accountCount}アカウント合計`
              ) : (
                "SNSアカウントを接続してください"
              )}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">投稿数</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{postCount}</div>
            <p className="text-xs text-muted-foreground">
              直近{periodDays}日間
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              平均エンゲージメント
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{avgEngagement}</div>
            <p className="text-xs text-muted-foreground">
              {postCount > 0 ? "反応数/投稿" : "データなし"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">予約投稿</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{scheduledCount}</div>
            <p className="text-xs text-muted-foreground">待機中</p>
          </CardContent>
        </Card>
      </div>

      {/* メインコンテンツ + RSSサイドバー */}
      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        {/* 左カラム: チャート・投稿・おすすめ時間 */}
        <div className="space-y-4 min-w-0">
          {/* チャートエリア */}
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>フォロワー推移</CardTitle>
                <CardDescription>
                  直近{periodDays}日間のフォロワー数変化
                </CardDescription>
              </CardHeader>
              <CardContent className="h-64">
                <FollowersChart data={followerData} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>エンゲージメント</CardTitle>
                <CardDescription>
                  いいね・リプライ・リポストの推移
                </CardDescription>
              </CardHeader>
              <CardContent className="h-64">
                <EngagementChart data={engagementData} />
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {/* 最近の投稿 */}
            <Card>
              <CardHeader>
                <CardTitle>最近の投稿</CardTitle>
                <CardDescription>直近の投稿とそのパフォーマンス</CardDescription>
              </CardHeader>
              <CardContent>
                <RecentPosts posts={recentPosts} />
              </CardContent>
            </Card>

            {/* おすすめ投稿時間 */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Target className="h-5 w-5 text-blue-500" />
                  おすすめ投稿時間
                </CardTitle>
                <CardDescription>
                  過去データから算出した最適な投稿タイミング
                </CardDescription>
              </CardHeader>
              <CardContent>
                {optimalTimings.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    データが蓄積されるとレコメンドが表示されます
                  </p>
                ) : (
                  <div className="space-y-3">
                    {optimalTimings.map((timing, index) => (
                      <div
                        key={`${timing.dayIndex}-${timing.hour}`}
                        className="flex items-center justify-between rounded-lg border p-3"
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-lg font-bold text-primary">
                            {index + 1}
                          </span>
                          <div>
                            <p className="font-medium">
                              {timing.dayName}曜日 {timing.hour}:00
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {timing.postCount}件のデータに基づく
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-bold">{timing.avgEngagement}</p>
                          <p className="text-xs text-muted-foreground">平均反応</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* 右カラム: RSSニュースサイドバー */}
        <div className="xl:sticky xl:top-4 xl:self-start">
          <RSSNewsFeed />
        </div>
      </div>
    </div>
  );
}
