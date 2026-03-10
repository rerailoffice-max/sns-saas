"use client";

/**
 * AI分析レポートコンポーネント
 * 基本統計・カテゴリ別エンゲージメント（棒グラフ）・投稿一覧テーブルを表示
 */
import { useState } from "react";
import dynamic from "next/dynamic";
import {
  Heart,
  MessageCircle,
  Repeat2,
  FileText,
  Sparkles,
  TrendingUp,
  Download,
  Loader2,
  ArrowRight,
  Zap,
  Calendar,
  Eye,
  BookOpen,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import type { ModelPost, AnalysisResult } from "@/types/database";
import type { CategoryStats, StatsSummary } from "@/app/(app)/models/[id]/page";

const MarkdownRenderer = dynamic(
  () => import("@/components/models/markdown-renderer"),
  { ssr: false, loading: () => <div className="animate-pulse h-64 bg-muted rounded" /> }
);

interface AnalysisReportProps {
  modelId: string;
  stats: StatsSummary;
  posts: ModelPost[];
  analysisResult: AnalysisResult | null;
  lastAnalyzedAt: string | null;
}

/** 数値をコンパクト表示 */
function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

/** 投稿テキストを省略表示 */
function truncateText(text: string | null, maxLength = 60): string {
  if (!text) return "-";
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + "...";
}

/** 日付フォーマット */
function formatDate(dateStr: string | null): string {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function AnalysisReport({
  modelId,
  stats,
  posts,
  analysisResult,
  lastAnalyzedAt,
}: AnalysisReportProps) {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isDeepAnalyzing, setIsDeepAnalyzing] = useState(false);
  const [isFetching, setIsFetching] = useState(false);

  /** 投稿データを取得 */
  const handleFetchPosts = async () => {
    setIsFetching(true);
    try {
      const res = await fetch(`/api/models/${modelId}/fetch-posts`, {
        method: "POST",
      });
      if (!res.ok) {
        const json = await res.json();
        console.error("投稿取得エラー:", json.error);
      }
      window.location.reload();
    } catch (err) {
      console.error("投稿取得リクエストエラー:", err);
    } finally {
      setIsFetching(false);
    }
  };

  /** AI分析を実行 */
  const handleAnalyze = async () => {
    setIsAnalyzing(true);
    try {
      const res = await fetch(`/api/models/${modelId}/analyze`, {
        method: "POST",
      });
      if (!res.ok) {
        const json = await res.json();
        console.error("分析エラー:", json.error);
      }
      // ページを再読み込みして最新の分析結果を反映
      window.location.reload();
    } catch (err) {
      console.error("分析リクエストエラー:", err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  /** 詳細分析（数百件収集）を実行 */
  const handleDeepAnalyze = async () => {
    setIsDeepAnalyzing(true);
    try {
      const res = await fetch(`/api/models/${modelId}/deep-analyze`, {
        method: "POST",
      });
      if (!res.ok) {
        const json = await res.json();
        console.error("詳細分析エラー:", json.error);
      }
      window.location.reload();
    } catch (err) {
      console.error("詳細分析リクエストエラー:", err);
    } finally {
      setIsDeepAnalyzing(false);
    }
  };

  // カテゴリ別グラフ用データ
  const chartData = stats.categoryStats.map((cat) => ({
    name: cat.category,
    いいね: cat.avgLikes,
    リプライ: cat.avgReplies,
    リポスト: cat.avgReposts,
  }));

  return (
    <div className="space-y-6">
      {/* 統計サマリーカード */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              <FileText className="h-3.5 w-3.5" />
              総投稿数
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatNumber(stats.totalPosts)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              <Heart className="h-3.5 w-3.5" />
              平均いいね
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatNumber(stats.avgLikes)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              <MessageCircle className="h-3.5 w-3.5" />
              平均リプライ
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {formatNumber(stats.avgReplies)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              <Repeat2 className="h-3.5 w-3.5" />
              平均リポスト
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {formatNumber(stats.avgReposts)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* タブ: グラフ / 投稿一覧 / AI分析 */}
      <Tabs defaultValue="chart">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <TabsList>
            <TabsTrigger value="chart">
              <TrendingUp className="h-4 w-4 mr-1" />
              カテゴリ分析
            </TabsTrigger>
            <TabsTrigger value="posts">
              <FileText className="h-4 w-4 mr-1" />
              投稿一覧
            </TabsTrigger>
            <TabsTrigger value="ai">
              <Sparkles className="h-4 w-4 mr-1" />
              AI分析
            </TabsTrigger>
            {analysisResult?.markdown_report && (
              <TabsTrigger value="report">
                <BookOpen className="h-4 w-4 mr-1" />
                詳細レポート
              </TabsTrigger>
            )}
          </TabsList>
          <Button
            variant="outline"
            size="sm"
            onClick={handleFetchPosts}
            disabled={isFetching}
          >
            {isFetching ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            {isFetching ? "取得中..." : "投稿を再取得"}
          </Button>
        </div>

        {/* カテゴリ別エンゲージメント棒グラフ */}
        <TabsContent value="chart">
          <Card>
            <CardHeader>
              <CardTitle>カテゴリ別エンゲージメント</CardTitle>
              <CardDescription>
                投稿カテゴリごとの平均エンゲージメント数を比較します
              </CardDescription>
            </CardHeader>
            <CardContent>
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={400}>
                  <BarChart
                    data={chartData}
                    margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar
                      dataKey="いいね"
                      fill="hsl(346, 77%, 49%)"
                      radius={[4, 4, 0, 0]}
                    />
                    <Bar
                      dataKey="リプライ"
                      fill="hsl(217, 91%, 59%)"
                      radius={[4, 4, 0, 0]}
                    />
                    <Bar
                      dataKey="リポスト"
                      fill="hsl(142, 71%, 45%)"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-64 text-muted-foreground">
                  投稿データがないためグラフを表示できません
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* 投稿一覧テーブル */}
        <TabsContent value="posts">
          <Card>
            <CardHeader>
              <CardTitle>投稿一覧</CardTitle>
              <CardDescription>
                直近{posts.length}件の投稿データ
              </CardDescription>
            </CardHeader>
            <CardContent>
              {posts.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[160px]">投稿日時</TableHead>
                      <TableHead>テキスト</TableHead>
                      <TableHead className="w-[80px]">カテゴリ</TableHead>
                      <TableHead className="w-[70px] text-right">
                        いいね
                      </TableHead>
                      <TableHead className="w-[70px] text-right">
                        リプライ
                      </TableHead>
                      <TableHead className="w-[70px] text-right">
                        リポスト
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {posts.map((post) => (
                      <TableRow key={post.id}>
                        <TableCell className="text-xs">
                          {formatDate(post.posted_at)}
                        </TableCell>
                        <TableCell className="max-w-[300px]">
                          <span className="text-sm">
                            {truncateText(post.text)}
                          </span>
                        </TableCell>
                        <TableCell>
                          {post.ai_category ? (
                            <Badge variant="outline" className="text-xs">
                              {post.ai_category}
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              -
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {post.likes ?? 0}
                        </TableCell>
                        <TableCell className="text-right">
                          {post.replies ?? 0}
                        </TableCell>
                        <TableCell className="text-right">
                          {post.reposts ?? 0}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="flex items-center justify-center h-32 text-muted-foreground">
                  投稿データがまだありません
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* AI分析タブ */}
        <TabsContent value="ai">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>AI分析レポート</CardTitle>
                  <CardDescription>
                    投稿傾向・文体・ハッシュタグ戦略をAIが分析します
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    onClick={handleAnalyze}
                    disabled={isAnalyzing || isDeepAnalyzing || posts.length === 0}
                  >
                    <Sparkles className="mr-2 h-4 w-4" />
                    {isAnalyzing ? "分析中..." : "AI分析を実行"}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleDeepAnalyze}
                    disabled={isAnalyzing || isDeepAnalyzing || posts.length === 0}
                  >
                    {isDeepAnalyzing ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Zap className="mr-2 h-4 w-4" />
                    )}
                    {isDeepAnalyzing ? "収集中..." : "詳細分析（数百件収集）"}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {analysisResult ? (
                <div className="space-y-6">
                  {/* サマリー */}
                  {analysisResult.summary && (
                    <div>
                      <h4 className="font-semibold mb-2">分析サマリー</h4>
                      <p className="text-sm text-muted-foreground">
                        {analysisResult.summary}
                      </p>
                    </div>
                  )}

                  {/* 文体分析 */}
                  {analysisResult.writing_style && (
                    <div>
                      <h4 className="font-semibold mb-2">文体分析</h4>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <div className="rounded-lg border p-3">
                          <p className="text-xs text-muted-foreground">トーン</p>
                          <p className="text-sm font-medium">
                            {analysisResult.writing_style.tone}
                          </p>
                        </div>
                        <div className="rounded-lg border p-3">
                          <p className="text-xs text-muted-foreground">
                            平均文字数
                          </p>
                          <p className="text-sm font-medium">
                            {analysisResult.writing_style.avg_length}文字
                          </p>
                        </div>
                        <div className="rounded-lg border p-3">
                          <p className="text-xs text-muted-foreground">
                            絵文字使用
                          </p>
                          <p className="text-sm font-medium">
                            {analysisResult.writing_style.emoji_usage}
                          </p>
                        </div>
                        <div className="rounded-lg border p-3">
                          <p className="text-xs text-muted-foreground">
                            フックパターン
                          </p>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {analysisResult.writing_style.hook_patterns?.length >
                            0 ? (
                              analysisResult.writing_style.hook_patterns.map(
                                (pattern, i) => (
                                  <Badge
                                    key={i}
                                    variant="outline"
                                    className="text-xs"
                                  >
                                    {pattern}
                                  </Badge>
                                )
                              )
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                データなし
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ハッシュタグ戦略 */}
                  {analysisResult.hashtag_strategy && (
                    <div>
                      <h4 className="font-semibold mb-2">ハッシュタグ戦略</h4>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <div className="rounded-lg border p-3">
                          <p className="text-xs text-muted-foreground">
                            平均使用数
                          </p>
                          <p className="text-sm font-medium">
                            {analysisResult.hashtag_strategy.avg_count}個/投稿
                          </p>
                        </div>
                        <div className="rounded-lg border p-3">
                          <p className="text-xs text-muted-foreground">
                            使用パターン
                          </p>
                          <p className="text-sm font-medium">
                            {analysisResult.hashtag_strategy.usage_pattern}
                          </p>
                        </div>
                      </div>
                      {analysisResult.hashtag_strategy.top_hashtags?.length > 0 && (
                        <div className="mt-2">
                          <p className="text-xs text-muted-foreground mb-1">
                            よく使われるハッシュタグ
                          </p>
                          <div className="flex flex-wrap gap-1">
                            {analysisResult.hashtag_strategy.top_hashtags.map(
                              (tag, i) => (
                                <Badge key={i} variant="secondary">
                                  #{tag}
                                </Badge>
                              )
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* 投稿頻度 */}
                  {analysisResult.posting_frequency && (
                    <div>
                      <h4 className="font-semibold mb-2">投稿頻度</h4>
                      <div className="grid gap-2 sm:grid-cols-3">
                        <div className="rounded-lg border p-3">
                          <p className="text-xs text-muted-foreground">
                            週あたり投稿数
                          </p>
                          <p className="text-sm font-medium">
                            {analysisResult.posting_frequency.avg_per_week}回
                          </p>
                        </div>
                        <div className="rounded-lg border p-3">
                          <p className="text-xs text-muted-foreground">
                            投稿が多い曜日
                          </p>
                          <p className="text-sm font-medium">
                            {analysisResult.posting_frequency.peak_days?.join(
                              ", "
                            ) || "データなし"}
                          </p>
                        </div>
                        <div className="rounded-lg border p-3">
                          <p className="text-xs text-muted-foreground">
                            投稿が多い時間帯
                          </p>
                          <p className="text-sm font-medium">
                            {analysisResult.posting_frequency.peak_hours?.length > 0
                              ? analysisResult.posting_frequency.peak_hours
                                  .map((h) => `${h}時`)
                                  .join(", ")
                              : "データなし"}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* エンゲージメントパターン */}
                  {analysisResult.engagement_patterns && (
                    <div>
                      <h4 className="font-semibold mb-2">⚡ バズる投稿の特徴</h4>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {analysisResult.engagement_patterns.common_traits && (
                          <div className="rounded-lg border p-3 sm:col-span-2">
                            <p className="text-xs text-muted-foreground mb-1">共通パターン</p>
                            <div className="flex flex-wrap gap-1">
                              {analysisResult.engagement_patterns.common_traits.map(
                                (trait, i) => (
                                  <Badge key={i} variant="secondary" className="text-xs">
                                    <Zap className="h-3 w-3 mr-1" />
                                    {trait}
                                  </Badge>
                                )
                              )}
                            </div>
                          </div>
                        )}
                        {analysisResult.engagement_patterns.best_performing_format && (
                          <div className="rounded-lg border p-3">
                            <p className="text-xs text-muted-foreground">最もパフォーマンスが良いフォーマット</p>
                            <p className="text-sm font-medium mt-1">
                              {analysisResult.engagement_patterns.best_performing_format}
                            </p>
                          </div>
                        )}
                        {analysisResult.engagement_patterns.optimal_length && (
                          <div className="rounded-lg border p-3">
                            <p className="text-xs text-muted-foreground">最適な文字数</p>
                            <p className="text-sm font-medium mt-1">
                              {analysisResult.engagement_patterns.optimal_length}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* モデリングのコツ */}
                  {analysisResult.modeling_tips &&
                    analysisResult.modeling_tips.length > 0 && (
                      <div>
                        <h4 className="font-semibold mb-2">
                          💡 モデリングのコツ
                        </h4>
                        <div className="space-y-2">
                          {analysisResult.modeling_tips.map((tip, i) => (
                            <div
                              key={i}
                              className="flex items-start gap-2 rounded-lg border p-3"
                            >
                              <ArrowRight className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                              <p className="text-sm">{tip}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                  {/* スレッド構成分析 */}
                  {analysisResult.thread_analysis &&
                    analysisResult.thread_analysis.by_length?.length > 0 && (() => {
                      const hasViews = analysisResult.thread_analysis!.by_length.some((d) => d.avg_views > 0);
                      const chartData = analysisResult.thread_analysis!.by_length.map((d) => ({
                        name: d.length === 1 ? "単発投稿" : `${d.length}投稿`,
                        スレッド数: d.count,
                        平均いいね: d.avg_likes,
                        ...(hasViews ? { 平均表示: d.avg_views } : {}),
                      }));
                      return (
                        <Card>
                          <CardHeader>
                            <div className="flex items-center justify-between">
                              <div>
                                <CardTitle>スレッド構成分析</CardTitle>
                                <CardDescription>
                                  スレッド内の投稿数別にエンゲージメントを比較。最もいいねが伸びるスレッド長がわかります。
                                </CardDescription>
                              </div>
                              {analysisResult.thread_analysis!.optimal_length != null && (
                                <Badge variant="secondary" className="shrink-0">
                                  最適: {analysisResult.thread_analysis!.optimal_length}投稿
                                </Badge>
                              )}
                            </div>
                          </CardHeader>
                          <CardContent>
                            <ResponsiveContainer width="100%" height={320}>
                              <BarChart
                                data={chartData}
                                margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                              >
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="name" />
                                <YAxis yAxisId="left" />
                                <YAxis yAxisId="right" orientation="right" />
                                <Tooltip />
                                <Legend />
                                <Bar
                                  yAxisId="left"
                                  dataKey="平均いいね"
                                  fill="hsl(346, 77%, 49%)"
                                  radius={[4, 4, 0, 0]}
                                />
                                {hasViews && (
                                  <Bar
                                    yAxisId="left"
                                    dataKey="平均表示"
                                    fill="hsl(217, 91%, 59%)"
                                    radius={[4, 4, 0, 0]}
                                  />
                                )}
                                <Bar
                                  yAxisId="right"
                                  dataKey="スレッド数"
                                  fill="hsl(142, 71%, 45%)"
                                  radius={[4, 4, 0, 0]}
                                  opacity={0.5}
                                />
                              </BarChart>
                            </ResponsiveContainer>
                          </CardContent>
                        </Card>
                      );
                    })()}

                  {/* フックパターン分析 */}
                  {analysisResult.hook_analysis &&
                    analysisResult.hook_analysis.patterns?.length > 0 && (
                      <Card>
                        <CardHeader>
                          <CardTitle>フックパターン分析</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <ResponsiveContainer width="100%" height={300}>
                            <BarChart
                              data={analysisResult.hook_analysis.patterns.map(
                                (p) => ({
                                  name: p.type,
                                  平均いいね: p.avg_likes,
                                  平均表示: p.avg_views,
                                })
                              )}
                              margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                            >
                              <CartesianGrid strokeDasharray="3 3" />
                              <XAxis dataKey="name" />
                              <YAxis />
                              <Tooltip />
                              <Legend />
                              <Bar
                                dataKey="平均いいね"
                                fill="hsl(346, 77%, 49%)"
                                radius={[4, 4, 0, 0]}
                              />
                              <Bar
                                dataKey="平均表示"
                                fill="hsl(217, 91%, 59%)"
                                radius={[4, 4, 0, 0]}
                              />
                            </BarChart>
                          </ResponsiveContainer>
                          {analysisResult.hook_analysis.best_pattern && (
                            <div>
                              <p className="text-xs text-muted-foreground mb-2">
                                最良パターン「{analysisResult.hook_analysis.best_pattern}」の例（上位2件）
                              </p>
                              <div className="space-y-2">
                                {analysisResult.hook_analysis.patterns
                                  .find(
                                    (p) => p.type === analysisResult.hook_analysis?.best_pattern
                                  )
                                  ?.examples?.slice(0, 2)
                                  ?.map((ex, i) => (
                                    <div
                                      key={i}
                                      className="rounded-lg border p-3 text-sm"
                                    >
                                      {truncateText(ex, 120)}
                                    </div>
                                  ))}
                              </div>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    )}

                  {/* 文字数×いいね相関 */}
                  {analysisResult.char_correlation &&
                    analysisResult.char_correlation.ranges?.length > 0 && (
                      <Card>
                        <CardHeader>
                          <div className="flex items-center justify-between">
                            <CardTitle>文字数×いいね相関</CardTitle>
                            {analysisResult.char_correlation.optimal_range && (
                              <Badge variant="secondary">
                                最適: {analysisResult.char_correlation.optimal_range}
                              </Badge>
                            )}
                          </div>
                        </CardHeader>
                        <CardContent>
                          <ResponsiveContainer width="100%" height={300}>
                            <BarChart
                              data={analysisResult.char_correlation.ranges.map(
                                (r) => ({
                                  name: r.range,
                                  平均いいね: r.avg_likes,
                                })
                              )}
                              margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                            >
                              <CartesianGrid strokeDasharray="3 3" />
                              <XAxis dataKey="name" />
                              <YAxis />
                              <Tooltip />
                              <Bar
                                dataKey="平均いいね"
                                fill="hsl(346, 77%, 49%)"
                                radius={[4, 4, 0, 0]}
                              />
                            </BarChart>
                          </ResponsiveContainer>
                        </CardContent>
                      </Card>
                    )}

                  {/* バズ投稿TOP10 / 表示回数TOP10 */}
                  {((analysisResult.top_posts && analysisResult.top_posts.length > 0) ||
                    (analysisResult.views_top_posts && analysisResult.views_top_posts.length > 0)) && (
                      <Card>
                        <CardHeader>
                          <CardTitle>バズ投稿ランキング</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <Tabs defaultValue="by-likes">
                            <TabsList className="mb-4">
                              <TabsTrigger value="by-likes">
                                <Heart className="h-3.5 w-3.5 mr-1" />
                                いいね順
                              </TabsTrigger>
                              {analysisResult.views_top_posts && analysisResult.views_top_posts.length > 0 && (
                                <TabsTrigger value="by-views">
                                  <Eye className="h-3.5 w-3.5 mr-1" />
                                  表示回数順
                                </TabsTrigger>
                              )}
                            </TabsList>
                            <TabsContent value="by-likes">
                              {analysisResult.top_posts && analysisResult.top_posts.length > 0 && (
                                <TopPostsTable posts={analysisResult.top_posts} />
                              )}
                            </TabsContent>
                            {analysisResult.views_top_posts && analysisResult.views_top_posts.length > 0 && (
                              <TabsContent value="by-views">
                                <TopPostsTable posts={analysisResult.views_top_posts} />
                              </TabsContent>
                            )}
                          </Tabs>
                        </CardContent>
                      </Card>
                    )}

                  {/* 月別パフォーマンス */}
                  {analysisResult.monthly_performance &&
                    analysisResult.monthly_performance.length > 0 && (
                      <Card>
                        <CardHeader>
                          <CardTitle className="flex items-center gap-2">
                            <Calendar className="h-5 w-5" />
                            月別パフォーマンス
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <ResponsiveContainer width="100%" height={300}>
                            <BarChart
                              data={analysisResult.monthly_performance.map((m) => ({
                                name: m.month,
                                投稿数: m.count,
                                平均いいね: m.avg_likes,
                                ...(m.avg_views > 0 ? { 平均表示: m.avg_views } : {}),
                              }))}
                              margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                            >
                              <CartesianGrid strokeDasharray="3 3" />
                              <XAxis dataKey="name" />
                              <YAxis />
                              <Tooltip />
                              <Legend />
                              <Bar dataKey="投稿数" fill="hsl(217, 91%, 59%)" radius={[4, 4, 0, 0]} />
                              <Bar dataKey="平均いいね" fill="hsl(346, 77%, 49%)" radius={[4, 4, 0, 0]} />
                            </BarChart>
                          </ResponsiveContainer>
                        </CardContent>
                      </Card>
                    )}

                  {/* 曜日別エンゲージメント */}
                  {analysisResult.weekly_performance &&
                    analysisResult.weekly_performance.length > 0 && (
                      <Card>
                        <CardHeader>
                          <CardTitle>曜日別エンゲージメント</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <ResponsiveContainer width="100%" height={300}>
                            <BarChart
                              data={analysisResult.weekly_performance.map((w) => ({
                                name: w.day,
                                投稿数: w.count,
                                平均いいね: w.avg_likes,
                                ...(w.avg_views > 0 ? { 平均表示: w.avg_views } : {}),
                              }))}
                              margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                            >
                              <CartesianGrid strokeDasharray="3 3" />
                              <XAxis dataKey="name" />
                              <YAxis />
                              <Tooltip />
                              <Legend />
                              <Bar dataKey="投稿数" fill="hsl(217, 91%, 59%)" radius={[4, 4, 0, 0]} />
                              <Bar dataKey="平均いいね" fill="hsl(346, 77%, 49%)" radius={[4, 4, 0, 0]} />
                            </BarChart>
                          </ResponsiveContainer>
                        </CardContent>
                      </Card>
                    )}

                  {/* テーマ別投稿分析 */}
                  {analysisResult.theme_analysis &&
                    analysisResult.theme_analysis.length > 0 && (
                      <Card>
                        <CardHeader>
                          <CardTitle>テーマ別投稿分析</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>テーマ</TableHead>
                                <TableHead className="w-[100px] text-right">スレッド数</TableHead>
                                <TableHead className="w-[100px] text-right">平均いいね</TableHead>
                                <TableHead className="w-[100px] text-right">最大いいね</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {analysisResult.theme_analysis.map((theme, i) => (
                                <TableRow key={i}>
                                  <TableCell className="font-medium">{theme.theme}</TableCell>
                                  <TableCell className="text-right">{theme.thread_count}</TableCell>
                                  <TableCell className="text-right">{formatNumber(theme.avg_likes)}</TableCell>
                                  <TableCell className="text-right">{formatNumber(theme.max_likes)}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </CardContent>
                      </Card>
                    )}

                  {/* エンゲージメント分布 */}
                  {analysisResult.engagement_distribution && (
                    <Card>
                      <CardHeader>
                        <CardTitle>エンゲージメント分布（パーセンタイル）</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="grid gap-4 sm:grid-cols-2">
                          <div>
                            <h4 className="text-sm font-semibold mb-3 flex items-center gap-1">
                              <Heart className="h-4 w-4" /> いいね分布
                            </h4>
                            <div className="grid grid-cols-5 gap-2">
                              {(["p25", "p50", "p75", "p90", "max"] as const).map((key) => (
                                <div key={key} className="rounded-lg border p-2 text-center">
                                  <p className="text-xs text-muted-foreground">{key === "max" ? "最大" : key.toUpperCase()}</p>
                                  <p className="text-sm font-bold">
                                    {formatNumber(analysisResult.engagement_distribution!.likes[key])}
                                  </p>
                                </div>
                              ))}
                            </div>
                          </div>
                          {analysisResult.engagement_distribution.views.max > 0 && (
                            <div>
                              <h4 className="text-sm font-semibold mb-3 flex items-center gap-1">
                                <Eye className="h-4 w-4" /> 表示回数分布
                              </h4>
                              <div className="grid grid-cols-5 gap-2">
                                {(["p25", "p50", "p75", "p90", "max"] as const).map((key) => (
                                  <div key={key} className="rounded-lg border p-2 text-center">
                                    <p className="text-xs text-muted-foreground">{key === "max" ? "最大" : key.toUpperCase()}</p>
                                    <p className="text-sm font-bold">
                                      {formatNumber(analysisResult.engagement_distribution!.views[key])}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* データソース表示 */}
                  {analysisResult.data_source &&
                    analysisResult.total_posts_analyzed != null && (
                      <div>
                        <Badge variant="outline">
                          {analysisResult.data_source === "api"
                            ? `API: ${formatNumber(analysisResult.total_posts_analyzed)}件分析`
                            : `スクレイピング: ${formatNumber(analysisResult.total_posts_analyzed)}件分析`}
                        </Badge>
                      </div>
                    )}

                  {/* 最終分析日時 */}
                  {lastAnalyzedAt && (
                    <p className="text-xs text-muted-foreground text-right">
                      最終分析: {formatDate(lastAnalyzedAt)}
                    </p>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-48 text-center">
                  <Sparkles className="h-12 w-12 text-muted-foreground/50 mb-4" />
                  <p className="text-muted-foreground">
                    AI分析がまだ実行されていません
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {posts.length > 0
                      ? "「AI分析を実行」ボタンから分析を開始できます"
                      : "先に投稿データを収集してからAI分析を実行してください"}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* 詳細レポート（Markdown）タブ */}
        {analysisResult?.markdown_report && (
          <TabsContent value="report">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <BookOpen className="h-5 w-5" />
                      詳細分析レポート
                    </CardTitle>
                    <CardDescription>
                      スクレイピングデータに基づく包括的な分析レポート
                    </CardDescription>
                  </div>
                  {analysisResult.data_source && (
                    <Badge variant="outline">
                      {analysisResult.data_source === "scraping" ? "スクレイピング分析" : "API分析"}
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <MarkdownRenderer content={analysisResult.markdown_report} />
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

function TopPostsTable({ posts }: { posts: Array<{ text: string; likes: number; views: number; thread_length: number; date: string }> }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[50px]">順位</TableHead>
          <TableHead className="w-[70px] text-right">いいね</TableHead>
          <TableHead className="w-[70px] text-right">表示</TableHead>
          <TableHead className="w-[80px]">スレッド長</TableHead>
          <TableHead className="w-[120px]">日付</TableHead>
          <TableHead>テキスト</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {posts.slice(0, 10).map((post, i) => (
          <TableRow key={i}>
            <TableCell className="font-medium">{i + 1}</TableCell>
            <TableCell className="text-right">{formatNumber(post.likes)}</TableCell>
            <TableCell className="text-right">{formatNumber(post.views)}</TableCell>
            <TableCell>{post.thread_length}件</TableCell>
            <TableCell className="text-xs">{formatDate(post.date)}</TableCell>
            <TableCell className="max-w-[300px]">
              <span className="text-sm">{truncateText(post.text)}</span>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
