"use client";

/**
 * モデルカードコンポーネント
 * モデルアカウントの概要をカード形式で表示
 */
import Link from "next/link";
import { Users, ExternalLink, FileText, Sparkles, Loader2 } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import type { ModelAccount } from "@/types/database";

interface ModelCardProps {
  model: ModelAccount;
  postCount?: number;
}

/** プラットフォーム表示名のマッピング */
const platformLabels: Record<string, string> = {
  threads: "Threads",
  instagram: "Instagram",
  x: "X",
};

/** プラットフォームごとのBadgeカラー */
const platformVariants: Record<string, "default" | "secondary" | "outline"> = {
  threads: "default",
  instagram: "secondary",
  x: "outline",
};

/** フォロワー数のフォーマット */
function formatFollowerCount(count: number | null | undefined): string {
  if (!count) return "-";
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return count.toLocaleString();
}

export function ModelCard({ model, postCount }: ModelCardProps) {
  // ユーザー名の先頭2文字をアバターフォールバックに使用
  const initials = (model.display_name ?? model.username)
    .slice(0, 2)
    .toUpperCase();

  // 登録から5分以内で未分析の場合は「分析中」表示
  const isRecentlyCreated =
    !model.analysis_result &&
    model.created_at &&
    Date.now() - new Date(model.created_at).getTime() < 5 * 60 * 1000;

  return (
    <Link href={`/models/${model.id}`}>
      <Card className="transition-colors hover:bg-accent/50 cursor-pointer">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3">
            <Avatar size="lg">
              {model.avatar_url && (
                <AvatarImage
                  src={model.avatar_url}
                  alt={model.display_name ?? model.username}
                />
              )}
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-semibold truncate">
                  {model.display_name ?? model.username}
                </p>
                {model.is_verified && (
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                    認証済み
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground truncate">
                @{model.username}
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex items-center justify-between">
            <Badge variant={platformVariants[model.platform] ?? "outline"}>
              {platformLabels[model.platform] ?? model.platform}
            </Badge>
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              {postCount !== undefined && postCount > 0 && (
                <div className="flex items-center gap-1">
                  <FileText className="h-3.5 w-3.5" />
                  <span>{postCount}件</span>
                </div>
              )}
              {model.analysis_result ? (
                <div className="flex items-center gap-1 text-primary">
                  <Sparkles className="h-3.5 w-3.5" />
                  <span className="text-xs">分析済み</span>
                </div>
              ) : isRecentlyCreated ? (
                <div className="flex items-center gap-1 text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span className="text-xs">投稿取得・AI分析中...</span>
                </div>
              ) : null}
            </div>
          </div>

          {/* ステータスと分析状態 */}
          <div className="flex items-center justify-between mt-3 pt-3 border-t">
            <Badge
              variant={model.status === "active" ? "secondary" : "outline"}
              className="text-xs"
            >
              {model.status === "active"
                ? "有効"
                : model.status === "paused"
                  ? "一時停止"
                  : "削除済み"}
            </Badge>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              {model.last_analyzed_at ? (
                <span>
                  最終分析:{" "}
                  {new Date(model.last_analyzed_at).toLocaleDateString("ja-JP")}
                </span>
              ) : (
                <span>未分析</span>
              )}
              <ExternalLink className="h-3 w-3" />
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
