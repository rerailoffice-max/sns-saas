"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
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
import { Clock, AlertCircle, CheckCircle2, Loader2, ExternalLink, Trash2, Save, MessageSquareText } from "lucide-react";
import { toast } from "sonner";
import type { ScheduledPost, Draft, SocialAccount, ScheduledPostStatus } from "@/types/database";

export interface ScheduledPostWithDetails extends ScheduledPost {
  drafts: Draft | null;
  social_accounts?: SocialAccount | null;
}

export const STATUS_CONFIG: Record<
  ScheduledPostStatus,
  { label: string; color: string; dotColor: string; icon: React.ReactNode }
> = {
  pending: {
    label: "待機中",
    color: "bg-yellow-100 text-yellow-800 border-yellow-200",
    dotColor: "bg-yellow-400",
    icon: <Clock className="h-3.5 w-3.5" />,
  },
  processing: {
    label: "投稿中",
    color: "bg-blue-100 text-blue-800 border-blue-200",
    dotColor: "bg-blue-400",
    icon: <Loader2 className="h-3.5 w-3.5 animate-spin" />,
  },
  published: {
    label: "投稿済",
    color: "bg-green-100 text-green-800 border-green-200",
    dotColor: "bg-green-400",
    icon: <CheckCircle2 className="h-3.5 w-3.5" />,
  },
  failed: {
    label: "失敗",
    color: "bg-red-100 text-red-800 border-red-200",
    dotColor: "bg-red-400",
    icon: <AlertCircle className="h-3.5 w-3.5" />,
  },
};

export function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function formatMonth(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

export function PostDetailDialog({
  post,
  onClose,
  onPostChanged,
}: {
  post: ScheduledPostWithDetails | null;
  onClose: () => void;
  onPostChanged: () => void;
}) {
  return (
    <Dialog open={!!post} onOpenChange={() => onClose()}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>予約投稿の詳細</DialogTitle>
          <DialogDescription>
            {post?.status === "pending"
              ? "予約日時・内容の編集、または予約のキャンセルができます。"
              : "予約投稿の情報を確認できます。"}
          </DialogDescription>
        </DialogHeader>
        {post && (
          <PostDetailContent post={post} onClose={onClose} onPostChanged={onPostChanged} />
        )}
      </DialogContent>
    </Dialog>
  );
}

export function PostDetailContent({
  post,
  onClose,
  onPostChanged,
}: {
  post: ScheduledPostWithDetails;
  onClose: () => void;
  onPostChanged: () => void;
}) {
  const router = useRouter();
  const config = STATUS_CONFIG[post.status];
  const isPending = post.status === "pending";

  const [isSavingDate, setIsSavingDate] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const scheduledDate = new Date(post.scheduled_at);
  const [editDate, setEditDate] = useState(formatDate(scheduledDate));
  const [editTime, setEditTime] = useState(
    scheduledDate.toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" })
  );

  const meta = post.drafts?.metadata as Record<string, unknown> | null;
  const threadPosts = Array.isArray(meta?.thread_posts) ? (meta.thread_posts as string[]) : null;
  const isThread = threadPosts !== null && threadPosts.length >= 2;

  const dateChanged =
    editDate !== formatDate(scheduledDate) ||
    editTime !== scheduledDate.toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" });

  const handleSaveDate = async () => {
    setIsSavingDate(true);
    try {
      const newScheduledAt = new Date(`${editDate}T${editTime}:00`);
      if (newScheduledAt <= new Date()) {
        toast.error("予約日時は現在より未来を指定してください");
        setIsSavingDate(false);
        return;
      }
      const res = await fetch(`/api/scheduled-posts/${post.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduled_at: newScheduledAt.toISOString() }),
      });
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error ?? "更新に失敗しました");
        return;
      }
      toast.success("予約日時を更新しました");
      onPostChanged();
    } catch {
      toast.error("通信エラーが発生しました");
    } finally {
      setIsSavingDate(false);
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/scheduled-posts/${post.id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error ?? "削除に失敗しました");
        return;
      }
      toast.success("予約をキャンセルしました");
      onPostChanged();
    } catch {
      toast.error("通信エラーが発生しました");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleEditContent = () => {
    if (post.draft_id) {
      onClose();
      router.push(`/compose?draft=${post.draft_id}`);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Badge className={config.color}>
          <span className="flex items-center gap-1">{config.icon}{config.label}</span>
        </Badge>
        {isThread && (
          <Badge variant="outline" className="text-xs">
            <MessageSquareText className="h-3 w-3 mr-1" />スレッド ({threadPosts.length}件)
          </Badge>
        )}
      </div>

      <div>
        <p className="text-sm font-medium text-muted-foreground mb-1">予約日時</p>
        {isPending ? (
          <div className="flex items-end gap-2">
            <Input type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} className="flex-1" />
            <Input type="time" value={editTime} onChange={(e) => setEditTime(e.target.value)} className="w-[120px]" />
            {dateChanged && (
              <Button size="sm" onClick={handleSaveDate} disabled={isSavingDate}>
                {isSavingDate ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              </Button>
            )}
          </div>
        ) : (
          <p className="text-sm">
            {scheduledDate.toLocaleString("ja-JP", { year: "numeric", month: "long", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit" })}
          </p>
        )}
      </div>

      <div>
        <p className="text-sm font-medium text-muted-foreground mb-1">投稿テキスト</p>
        {isThread ? (
          <div className="space-y-2">
            {threadPosts.map((t, i) => (
              <div key={i} className="bg-muted/50 rounded-lg p-3 relative">
                <span className="absolute top-1.5 right-2 text-[10px] text-muted-foreground">{i + 1}/{threadPosts.length}</span>
                <p className="text-sm whitespace-pre-wrap pr-8">{t}</p>
              </div>
            ))}
          </div>
        ) : (
          post.drafts?.text && (
            <div className="bg-muted/50 rounded-lg p-3">
              <p className="text-sm whitespace-pre-wrap">{post.drafts.text}</p>
            </div>
          )
        )}
      </div>

      {post.drafts?.hashtags && post.drafts.hashtags.length > 0 && (
        <div>
          <p className="text-sm font-medium text-muted-foreground mb-1">ハッシュタグ</p>
          <div className="flex gap-1 flex-wrap">
            {post.drafts.hashtags.map((tag, i) => (
              <Badge key={i} variant="secondary" className="text-xs">{tag}</Badge>
            ))}
          </div>
        </div>
      )}

      {post.published_at && (
        <div>
          <p className="text-sm font-medium text-muted-foreground mb-1">投稿日時</p>
          <p className="text-sm">{new Date(post.published_at).toLocaleString("ja-JP", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })}</p>
        </div>
      )}

      {post.last_error && (
        <div>
          <p className="text-sm font-medium text-red-600 mb-1">エラー</p>
          <p className="text-sm text-red-600 bg-red-50 rounded-lg p-3">{post.last_error}</p>
        </div>
      )}

      {post.post_url && (
        <div>
          <p className="text-sm font-medium text-muted-foreground mb-1">投稿リンク</p>
          <a href={post.post_url} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:underline break-all">{post.post_url}</a>
        </div>
      )}

      {isPending && (
        <div className="flex items-center gap-2 pt-2 border-t">
          <Button variant="outline" onClick={handleEditContent} className="flex-1">
            <ExternalLink className="h-4 w-4 mr-1" />内容を編集
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm" disabled={isDeleting}>
                {isDeleting ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Trash2 className="h-4 w-4 mr-1" />}
                予約をキャンセル
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>予約をキャンセルしますか？</AlertDialogTitle>
                <AlertDialogDescription>この予約投稿を削除します。下書きは保持されます。</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>戻る</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete}>キャンセルする</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}
    </div>
  );
}
