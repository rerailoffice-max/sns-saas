"use client";

/**
 * AI分析レポートコンポーネント
 * 基本統計・カテゴリ別エンゲージメント（棒グラフ）・投稿一覧テーブルを表示
 */
import { useState } from "react";
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
                <Button
                  onClick={handleAnalyze}
                  disabled={isAnalyzing || posts.length === 0}
                >
                  <Sparkles className="mr-2 h-4 w-4" />
                  {isAnalyzing ? "分析中..." : "AI分析を実行"}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {analysisResult ? (
                <div className="space-y-6">
                  {/* サマリー */}
                  <div>
                    <h4 className="font-semibold mb-2">分析サマリー</h4>
                    <p className="text-sm text-muted-foreground">
                      {analysisResult.summary}
                    </p>
                  </div>

                  {/* 文体分析 */}
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
                          {analysisResult.writing_style.hook_patterns.length >
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

                  {/* ハッシュタグ戦略 */}
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
                    {analysisResult.hashtag_strategy.top_hashtags.length > 0 && (
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

                  {/* 投稿頻度 */}
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
                          {analysisResult.posting_frequency.peak_days.join(
                            ", "
                          ) || "データなし"}
                        </p>
                      </div>
                      <div className="rounded-lg border p-3">
                        <p className="text-xs text-muted-foreground">
                          投稿が多い時間帯
                        </p>
                        <p className="text-sm font-medium">
                          {analysisResult.posting_frequency.peak_hours.length > 0
                            ? analysisResult.posting_frequency.peak_hours
                                .map((h) => `${h}時`)
                                .join(", ")
                            : "データなし"}
                        </p>
                      </div>
                    </div>
                  </div>

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
      </Tabs>
    </div>
  );
}
