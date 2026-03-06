/**
 * 投稿分析ページ（Server Component）
 * トップ投稿ランキング・エンゲージメントヒートマップ・カテゴリ別分析
 * post_insights テーブルから直近90日のデータを取得・集計
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
import { TopPostsRanking, type RankedPost } from "@/components/analytics/top-posts-ranking";
import { EngagementHeatmap, type HeatmapCell } from "@/components/analytics/engagement-heatmap";
import { CategoryChart, type CategoryData } from "@/components/analytics/category-chart";

export default async function AnalyticsPage() {
  // デモモード: Supabase未設定時は空データで表示
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">投稿分析</h1>
        <Card>
          <CardContent className="py-8">
            <p className="text-sm text-muted-foreground text-center">
              SNSアカウントを接続すると、投稿の詳細な分析を確認できます。
            </p>
          </CardContent>
        </Card>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>トップ投稿</CardTitle>
              <CardDescription>エンゲージメント順ランキング（直近90日）</CardDescription>
            </CardHeader>
            <CardContent className="max-h-[500px] overflow-y-auto">
              <TopPostsRanking posts={[]} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>エンゲージメントヒートマップ</CardTitle>
              <CardDescription>曜日×時間帯別の反応傾向</CardDescription>
            </CardHeader>
            <CardContent>
              <EngagementHeatmap data={[]} />
            </CardContent>
          </Card>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>カテゴリ別分析</CardTitle>
            <CardDescription>投稿カテゴリごとのパフォーマンス比較</CardDescription>
          </CardHeader>
          <CardContent>
            <CategoryChart data={[]} />
          </CardContent>
        </Card>
      </div>
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // 接続済みアカウント取得
  const { data: accounts } = await supabase
    .from("social_accounts")
    .select("id")
    .eq("profile_id", user.id)
    .eq("is_active", true);

  const accountIds = accounts?.map((a) => a.id) ?? [];
  const hasAccounts = accountIds.length > 0;

  // 直近90日の投稿インサイト取得
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 90);

  let rankedPosts: RankedPost[] = [];
  let heatmapData: HeatmapCell[] = [];
  let categoryData: CategoryData[] = [];

  if (hasAccounts) {
    const { data: insights } = await supabase
      .from("post_insights")
      .select(
        "id, platform_post_id, posted_at, likes, replies, reposts, impressions, ai_category"
      )
      .in("account_id", accountIds)
      .gte("posted_at", startDate.toISOString())
      .order("posted_at", { ascending: false });

    if (insights && insights.length > 0) {
      // ========================================
      // トップ投稿ランキング（エンゲージメント合計 DESC でソート、上位20件）
      // ========================================
      rankedPosts = insights
        .map((p) => ({
          id: p.id,
          text: p.platform_post_id ?? "",
          posted_at: p.posted_at ?? new Date().toISOString(),
          likes: p.likes ?? 0,
          replies: p.replies ?? 0,
          reposts: p.reposts ?? 0,
          impressions: p.impressions ?? 0,
          totalEngagement: (p.likes ?? 0) + (p.replies ?? 0) + (p.reposts ?? 0),
        }))
        .sort((a, b) => b.totalEngagement - a.totalEngagement)
        .slice(0, 20);

      // ========================================
      // ヒートマップデータ集計（曜日×時間帯）
      // ========================================
      const heatmapMap = new Map<string, number>();
      insights.forEach((p) => {
        if (!p.posted_at) return;
        const date = new Date(p.posted_at);
        // JavaScriptのgetDay()は0=日曜なので、月曜=0に変換
        const dayOfWeek = date.getDay();
        const dayIndex = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // 0=月, 6=日
        const hour = date.getHours();
        const engagement = (p.likes ?? 0) + (p.replies ?? 0) + (p.reposts ?? 0);
        const key = `${dayIndex}-${hour}`;
        heatmapMap.set(key, (heatmapMap.get(key) ?? 0) + engagement);
      });

      heatmapData = Array.from(heatmapMap.entries()).map(([key, value]) => {
        const [dayIndex, hour] = key.split("-").map(Number);
        return { dayIndex, hour, value };
      });

      // ========================================
      // カテゴリ別集計
      // ========================================
      const categoryMap = new Map<
        string,
        { count: number; totalEngagement: number }
      >();
      insights.forEach((p) => {
        const category = p.ai_category ?? "未分類";
        const engagement = (p.likes ?? 0) + (p.replies ?? 0) + (p.reposts ?? 0);
        const existing = categoryMap.get(category) ?? {
          count: 0,
          totalEngagement: 0,
        };
        categoryMap.set(category, {
          count: existing.count + 1,
          totalEngagement: existing.totalEngagement + engagement,
        });
      });

      categoryData = Array.from(categoryMap.entries())
        .map(([category, values]) => ({
          category,
          count: values.count,
          totalEngagement: values.totalEngagement,
          avgEngagement:
            values.count > 0
              ? Math.round(values.totalEngagement / values.count)
              : 0,
        }))
        .sort((a, b) => b.totalEngagement - a.totalEngagement);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">投稿分析</h1>

      {!hasAccounts && (
        <Card>
          <CardContent className="py-8">
            <p className="text-sm text-muted-foreground text-center">
              SNSアカウントを接続すると、投稿の詳細な分析を確認できます。
            </p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* トップ投稿ランキング */}
        <Card>
          <CardHeader>
            <CardTitle>トップ投稿</CardTitle>
            <CardDescription>
              エンゲージメント順ランキング（直近90日）
            </CardDescription>
          </CardHeader>
          <CardContent className="max-h-[500px] overflow-y-auto">
            <TopPostsRanking posts={rankedPosts} />
          </CardContent>
        </Card>

        {/* エンゲージメントヒートマップ */}
        <Card>
          <CardHeader>
            <CardTitle>エンゲージメントヒートマップ</CardTitle>
            <CardDescription>曜日×時間帯別の反応傾向</CardDescription>
          </CardHeader>
          <CardContent>
            <EngagementHeatmap data={heatmapData} />
          </CardContent>
        </Card>
      </div>

      {/* カテゴリ別分析 */}
      <Card>
        <CardHeader>
          <CardTitle>カテゴリ別分析</CardTitle>
          <CardDescription>
            投稿カテゴリごとのパフォーマンス比較
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CategoryChart data={categoryData} />
        </CardContent>
      </Card>
    </div>
  );
}
