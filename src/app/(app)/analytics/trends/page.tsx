/**
 * 傾向分析ページ（Server Component）
 * 投稿頻度の推移・文字数vsエンゲージメント・ハッシュタグ効果分析
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
import {
  PostingFrequencyChart,
  type FrequencyData,
} from "@/components/analytics/posting-frequency-chart";
import {
  TextLengthScatter,
  type ScatterData,
} from "@/components/analytics/text-length-scatter";
import {
  HashtagAnalysis,
  type HashtagData,
} from "@/components/analytics/hashtag-analysis";

export default async function TrendsPage() {
  // デモモード: Supabase未設定時は空データで表示
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">傾向分析</h1>
        <Card>
          <CardContent className="py-8">
            <p className="text-sm text-muted-foreground text-center">
              SNSアカウントを接続すると、投稿傾向の詳細な分析を確認できます。
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>投稿頻度の推移</CardTitle>
            <CardDescription>週単位での投稿数の変化（直近90日）</CardDescription>
          </CardHeader>
          <CardContent className="h-64">
            <PostingFrequencyChart data={[]} />
          </CardContent>
        </Card>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>文字数 vs エンゲージメント</CardTitle>
              <CardDescription>投稿の文字数と反応の関係</CardDescription>
            </CardHeader>
            <CardContent className="h-72">
              <TextLengthScatter data={[]} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>ハッシュタグ効果分析</CardTitle>
              <CardDescription>ハッシュタグ数別の平均エンゲージメント比較</CardDescription>
            </CardHeader>
            <CardContent className="h-72">
              <HashtagAnalysis data={[]} />
            </CardContent>
          </Card>
        </div>
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

  let frequencyData: FrequencyData[] = [];
  let scatterData: ScatterData[] = [];
  let hashtagData: HashtagData[] = [];

  if (hasAccounts) {
    const { data: insights } = await supabase
      .from("post_insights")
      .select(
        "id, platform_post_id, posted_at, likes, replies, reposts, text_length, hashtag_count"
      )
      .in("account_id", accountIds)
      .gte("posted_at", startDate.toISOString())
      .order("posted_at", { ascending: true });

    if (insights && insights.length > 0) {
      // ========================================
      // 投稿頻度の推移（週単位で集計）
      // ========================================
      const weekMap = new Map<string, number>();
      insights.forEach((p) => {
        if (!p.posted_at) return;
        const date = new Date(p.posted_at);
        // 週の月曜日を基準にしたラベルを生成
        const dayOfWeek = date.getDay();
        const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
        const monday = new Date(date);
        monday.setDate(date.getDate() + mondayOffset);
        const weekLabel = `${monday.getMonth() + 1}/${monday.getDate()}週`;
        weekMap.set(weekLabel, (weekMap.get(weekLabel) ?? 0) + 1);
      });

      // 週の開始日順でソートするため、元のMapのキーを挿入順で保持
      frequencyData = Array.from(weekMap.entries()).map(([week, count]) => ({
        week,
        count,
      }));

      // ========================================
      // 文字数 vs エンゲージメント（散布図データ）
      // ========================================
      scatterData = insights
        .filter((p) => p.text_length != null && p.text_length > 0)
        .map((p) => ({
          textLength: p.text_length ?? 0,
          engagement: (p.likes ?? 0) + (p.replies ?? 0) + (p.reposts ?? 0),
          text: p.platform_post_id ?? "",
        }));

      // ========================================
      // ハッシュタグ効果分析（ハッシュタグ数の範囲別に集計）
      // ========================================
      const hashtagRanges: Array<{
        label: string;
        min: number;
        max: number;
      }> = [
        { label: "0個", min: 0, max: 0 },
        { label: "1-3個", min: 1, max: 3 },
        { label: "4-6個", min: 4, max: 6 },
        { label: "7-10個", min: 7, max: 10 },
        { label: "11個以上", min: 11, max: Infinity },
      ];

      const hashtagBuckets = new Map<
        string,
        { count: number; totalEngagement: number }
      >();
      hashtagRanges.forEach((range) => {
        hashtagBuckets.set(range.label, { count: 0, totalEngagement: 0 });
      });

      insights.forEach((p) => {
        const htCount = p.hashtag_count ?? 0;
        const engagement =
          (p.likes ?? 0) + (p.replies ?? 0) + (p.reposts ?? 0);

        for (const range of hashtagRanges) {
          if (htCount >= range.min && htCount <= range.max) {
            const bucket = hashtagBuckets.get(range.label)!;
            bucket.count += 1;
            bucket.totalEngagement += engagement;
            break;
          }
        }
      });

      hashtagData = hashtagRanges
        .map((range) => {
          const bucket = hashtagBuckets.get(range.label)!;
          return {
            range: range.label,
            count: bucket.count,
            avgEngagement:
              bucket.count > 0
                ? Math.round(bucket.totalEngagement / bucket.count)
                : 0,
          };
        })
        .filter((d) => d.count > 0); // 投稿がない範囲は除外
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">傾向分析</h1>

      {!hasAccounts && (
        <Card>
          <CardContent className="py-8">
            <p className="text-sm text-muted-foreground text-center">
              SNSアカウントを接続すると、投稿傾向の詳細な分析を確認できます。
            </p>
          </CardContent>
        </Card>
      )}

      {/* 投稿頻度の推移 */}
      <Card>
        <CardHeader>
          <CardTitle>投稿頻度の推移</CardTitle>
          <CardDescription>
            週単位での投稿数の変化（直近90日）
          </CardDescription>
        </CardHeader>
        <CardContent className="h-64">
          <PostingFrequencyChart data={frequencyData} />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* 文字数 vs エンゲージメント */}
        <Card>
          <CardHeader>
            <CardTitle>文字数 vs エンゲージメント</CardTitle>
            <CardDescription>
              投稿の文字数と反応の関係
            </CardDescription>
          </CardHeader>
          <CardContent className="h-72">
            <TextLengthScatter data={scatterData} />
          </CardContent>
        </Card>

        {/* ハッシュタグ効果分析 */}
        <Card>
          <CardHeader>
            <CardTitle>ハッシュタグ効果分析</CardTitle>
            <CardDescription>
              ハッシュタグ数別の平均エンゲージメント比較
            </CardDescription>
          </CardHeader>
          <CardContent className="h-72">
            <HashtagAnalysis data={hashtagData} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
