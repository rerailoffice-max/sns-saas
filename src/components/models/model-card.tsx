"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, FileText, Sparkles, Loader2, Trash2 } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import type { ModelAccount } from "@/types/database";

interface ModelCardProps {
  model: ModelAccount;
  postCount?: number;
  onDeleted?: () => void;
}

const platformLabels: Record<string, string> = {
  threads: "Threads",
  instagram: "Instagram",
  x: "X",
};

const platformVariants: Record<string, "default" | "secondary" | "outline"> = {
  threads: "default",
  instagram: "secondary",
  x: "outline",
};

export function ModelCard({ model, postCount, onDeleted }: ModelCardProps) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  const initials = (model.display_name ?? model.username)
    .slice(0, 2)
    .toUpperCase();

  const isRecentlyCreated =
    !model.analysis_result &&
    model.created_at &&
    Date.now() - new Date(model.created_at).getTime() < 5 * 60 * 1000;

  const handleCardClick = () => {
    if (!dialogOpen) {
      router.push(`/models/${model.id}`);
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/models/${model.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `削除に失敗しました (${res.status})`);
      }
      toast.success(`@${model.username} を削除しました`);
      setDialogOpen(false);
      onDeleted?.();
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "削除に失敗しました");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <Card
        className="transition-colors hover:bg-accent/50 cursor-pointer group relative"
        onClick={handleCardClick}
      >
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

            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
              onClick={(e) => {
                e.stopPropagation();
                setDialogOpen(true);
              }}
            >
              <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
            </Button>
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

      <AlertDialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>モデルアカウントを削除</AlertDialogTitle>
            <AlertDialogDescription>
              @{model.username} を削除しますか？分析結果と投稿データも一緒に削除されます。この操作は取り消せません。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>
              キャンセル
            </AlertDialogCancel>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isDeleting}
            >
              {isDeleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  削除中...
                </>
              ) : (
                "削除する"
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
