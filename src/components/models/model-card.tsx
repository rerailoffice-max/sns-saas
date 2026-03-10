"use client";

/**
 * モデルカードコンポーネント
 * モデルアカウントの概要をカード形式で表示
 */
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ExternalLink, FileText, Sparkles, Loader2, Trash2 } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import type { ModelAccount } from "@/types/database";

interface ModelCardProps {
  model: ModelAccount;
  postCount?: number;
  onDeleted?: () => void;
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

export function ModelCard({ model, postCount, onDeleted }: ModelCardProps) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);

  const initials = (model.display_name ?? model.username)
    .slice(0, 2)
    .toUpperCase();

  const isRecentlyCreated =
    !model.analysis_result &&
    model.created_at &&
    Date.now() - new Date(model.created_at).getTime() < 5 * 60 * 1000;

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/models/${model.id}`, { method: "DELETE" });
      if (res.ok) {
        onDeleted?.();
        router.refresh();
      }
    } catch {
      // サイレント — ユーザーがリトライ可能
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Link href={`/models/${model.id}`}>
      <Card className="transition-colors hover:bg-accent/50 cursor-pointer group relative">
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

            {/* 削除ボタン */}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
                >
                  <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}>
                <AlertDialogHeader>
                  <AlertDialogTitle>モデルアカウントを削除</AlertDialogTitle>
                  <AlertDialogDescription>
                    @{model.username} を削除しますか？分析結果と投稿データも一緒に削除されます。この操作は取り消せません。
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel onClick={(e) => { e.stopPropagation(); }}>
                    キャンセル
                  </AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDelete}
                    disabled={isDeleting}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {isDeleting ? "削除中..." : "削除する"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
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
