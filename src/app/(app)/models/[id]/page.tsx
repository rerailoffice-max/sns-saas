/**
 * モデルアカウント詳細ページ（Server Component）
 * 対象モデルのプロフィール・投稿データ・集計情報を取得して分析レポートを表示
 */
import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AnalysisReport } from "@/components/models/analysis-report";
import type { ModelAccount, ModelPost } from "@/types/database";

/** プラットフォーム表示名 */
const platformLabels: Record<string, string> = {
  threads: "Threads",
  instagram: "Instagram",
  x: "X",
};

/** カテゴリ別の集計結果の型 */
export interface CategoryStats {
  category: string;
  count: number;
  avgLikes: number;
  avgReplies: number;
  avgReposts: number;
}

/** 統計サマリーの型 */
export interface StatsSummary {
  totalPosts: number;
  avgLikes: number;
  avgReplies: number;
  avgReposts: number;
  categoryStats: CategoryStats[];
}

/** 投稿データから統計サマリーを計算 */
function calcStats(posts: ModelPost[]): StatsSummary {
  if (posts.length === 0) {
    return {
      totalPosts: 0,
      avgLikes: 0,
      avgReplies: 0,
      avgReposts: 0,
      categoryStats: [],
    };
  }

  const totalPosts = posts.length;
  const avgLikes = Math.round(
    posts.reduce((sum, p) => sum + (p.likes ?? 0), 0) / totalPosts
  );
  const avgReplies = Math.round(
    posts.reduce((sum, p) => sum + (p.replies ?? 0), 0) / totalPosts
  );
  const avgReposts = Math.round(
    posts.reduce((sum, p) => sum + (p.reposts ?? 0), 0) / totalPosts
  );

  // カテゴリ別集計
  const categoryMap = new Map<
    string,
    { count: number; likes: number; replies: number; reposts: number }
  >();

  for (const post of posts) {
    const cat = post.ai_category ?? "未分類";
    const current = categoryMap.get(cat) ?? {
      count: 0,
      likes: 0,
      replies: 0,
      reposts: 0,
    };
    categoryMap.set(cat, {
      count: current.count + 1,
      likes: current.likes + (post.likes ?? 0),
      replies: current.replies + (post.replies ?? 0),
      reposts: current.reposts + (post.reposts ?? 0),
    });
  }

  const categoryStats: CategoryStats[] = Array.from(categoryMap.entries())
    .map(([category, data]) => ({
      category,
      count: data.count,
      avgLikes: Math.round(data.likes / data.count),
      avgReplies: Math.round(data.replies / data.count),
      avgReposts: Math.round(data.reposts / data.count),
    }))
    .sort((a, b) => b.count - a.count);

  return { totalPosts, avgLikes, avgReplies, avgReposts, categoryStats };
}

export default async function ModelDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // デモモード: Supabase未設定時はプレースホルダー表示
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return (
      <div className="container mx-auto px-4 py-8 space-y-6">
        <div>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/models">
              <ArrowLeft className="mr-2 h-4 w-4" />
              モデル一覧に戻る
            </Link>
          </Button>
        </div>
        <Card>
          <CardContent className="py-8">
            <p className="text-sm text-muted-foreground text-center">
              デモモードではモデル詳細を表示できません。Supabase環境変数を設定してください。
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (!user || authError) {
    redirect("/login");
  }

  // モデルアカウント取得（所有権チェック込み）
  const { data: model, error: modelError } = await supabase
    .from("model_accounts")
    .select("*")
    .eq("id", id)
    .eq("profile_id", user.id)
    .single();

  if (!model || modelError) {
    notFound();
  }

  const typedModel = model as ModelAccount;

  // モデルの投稿データ取得（直近100件）
  const { data: posts } = await supabase
    .from("model_posts")
    .select("*")
    .eq("model_account_id", id)
    .order("posted_at", { ascending: false })
    .limit(100);

  const typedPosts = (posts as ModelPost[]) ?? [];
  const stats = calcStats(typedPosts);

  // ユーザー名の先頭2文字をアバターフォールバック
  const initials = (typedModel.display_name ?? typedModel.username)
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="container mx-auto px-4 py-8 space-y-6">
      {/* 戻るリンク */}
      <div>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/models">
            <ArrowLeft className="mr-2 h-4 w-4" />
            モデル一覧に戻る
          </Link>
        </Button>
      </div>

      {/* プロフィールヘッダー */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-4">
            <Avatar size="lg">
              {typedModel.avatar_url && (
                <AvatarImage
                  src={typedModel.avatar_url}
                  alt={typedModel.display_name ?? typedModel.username}
                />
              )}
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <CardTitle className="text-xl">
                  {typedModel.display_name ?? typedModel.username}
                </CardTitle>
                {typedModel.is_verified && (
                  <Badge variant="secondary">認証済み</Badge>
                )}
              </div>
              <CardDescription>
                @{typedModel.username} /{" "}
                {platformLabels[typedModel.platform] ?? typedModel.platform}
              </CardDescription>
            </div>
            <Badge
              variant={
                typedModel.status === "active" ? "secondary" : "outline"
              }
            >
              {typedModel.status === "active"
                ? "有効"
                : typedModel.status === "paused"
                  ? "一時停止"
                  : "削除済み"}
            </Badge>
          </div>
        </CardHeader>
      </Card>

      {/* AI分析レポート */}
      <AnalysisReport
        modelId={id}
        stats={stats}
        posts={typedPosts}
        analysisResult={typedModel.analysis_result}
        lastAnalyzedAt={typedModel.last_analyzed_at}
      />
    </div>
  );
}
