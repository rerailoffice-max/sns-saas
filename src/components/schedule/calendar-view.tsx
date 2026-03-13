"use client";

/**
 * 予約投稿カレンダービューコンポーネント
 * - 月表示カレンダー（自前実装）
 * - 各日付セルに予約投稿のドット/バッジ表示
 * - 日付クリックで新規予約ダイアログ表示
 * - 投稿クリックで詳細表示（編集・削除対応）
 * - ステータス別色分け
 */

import { useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { ChevronLeft, ChevronRight, Clock, AlertCircle, CheckCircle2, Loader2, ExternalLink, Trash2, Save, MessageSquareText } from "lucide-react";
import { toast } from "sonner";
import type { ScheduledPost, Draft, SocialAccount, ScheduledPostStatus } from "@/types/database";

// ============================================================
// 型定義
// ============================================================

/** 予約投稿 + 下書き + アカウント情報の結合型 */
export interface ScheduledPostWithDetails extends ScheduledPost {
  drafts: Draft | null;
  social_accounts?: SocialAccount | null;
}

interface CalendarViewProps {
  /** 予約投稿一覧（下書き情報付き） */
  scheduledPosts: ScheduledPostWithDetails[];
  /** 現在の表示年月（YYYY-MM形式） */
  currentMonth: string;
  /** 月移動時のコールバック */
  onMonthChange: (month: string) => void;
  /** 日付クリック時のコールバック（新規予約ダイアログ表示） */
  onDateClick: (date: string) => void;
  /** 予約投稿が更新/削除された時のリフレッシュ用コールバック */
  onPostChanged?: () => void;
}

// ============================================================
// ステータス設定
// ============================================================

/** ステータスごとの表示設定 */
const STATUS_CONFIG: Record<
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

// ============================================================
// ユーティリティ関数
// ============================================================

/** 年月から月初のDateオブジェクトを生成 */
function parseMonth(monthStr: string): Date {
  const [year, month] = monthStr.split("-").map(Number);
  return new Date(year, month - 1, 1);
}

/** DateオブジェクトからYYYY-MM形式の文字列を生成 */
function formatMonth(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

/** DateオブジェクトからYYYY-MM-DD形式の文字列を生成 */
function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** 月のカレンダー日付配列を生成（前月・翌月の日付も含む） */
function getCalendarDays(year: number, month: number): Date[] {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);

  // 週の開始を日曜日とする（getDay: 0=日曜）
  const startOffset = firstDay.getDay();
  const days: Date[] = [];

  // 前月の日付を埋める
  for (let i = startOffset - 1; i >= 0; i--) {
    days.push(new Date(year, month, -i));
  }

  // 当月の日付
  for (let d = 1; d <= lastDay.getDate(); d++) {
    days.push(new Date(year, month, d));
  }

  // 翌月の日付を埋めて6行分にする
  const remaining = 42 - days.length;
  for (let i = 1; i <= remaining; i++) {
    days.push(new Date(year, month + 1, i));
  }

  return days;
}

// ============================================================
// 曜日ヘッダー
// ============================================================

const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

// ============================================================
// カレンダービューコンポーネント
// ============================================================

export function CalendarView({
  scheduledPosts,
  currentMonth,
  onMonthChange,
  onDateClick,
  onPostChanged,
}: CalendarViewProps) {
  const router = useRouter();
  const [selectedPost, setSelectedPost] = useState<ScheduledPostWithDetails | null>(null);

  // 現在の表示月
  const currentDate = useMemo(() => parseMonth(currentMonth), [currentMonth]);
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  // カレンダー日付配列
  const calendarDays = useMemo(() => getCalendarDays(year, month), [year, month]);

  // 予約投稿を日付でグループ化
  const postsByDate = useMemo(() => {
    const map = new Map<string, ScheduledPostWithDetails[]>();
    for (const post of scheduledPosts) {
      // scheduled_at をローカル日付に変換
      const dateKey = new Date(post.scheduled_at).toLocaleDateString("sv-SE"); // YYYY-MM-DD形式
      if (!map.has(dateKey)) {
        map.set(dateKey, []);
      }
      map.get(dateKey)!.push(post);
    }
    return map;
  }, [scheduledPosts]);

  // 今日の日付
  const today = formatDate(new Date());

  // 月移動ハンドラ
  const handlePrevMonth = useCallback(() => {
    const prev = new Date(year, month - 1, 1);
    onMonthChange(formatMonth(prev));
  }, [year, month, onMonthChange]);

  const handleNextMonth = useCallback(() => {
    const next = new Date(year, month + 1, 1);
    onMonthChange(formatMonth(next));
  }, [year, month, onMonthChange]);

  // 今月へ戻る
  const handleToday = useCallback(() => {
    onMonthChange(formatMonth(new Date()));
  }, [onMonthChange]);

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">投稿カレンダー</CardTitle>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleToday}>
                今月
              </Button>
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={handlePrevMonth}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm font-medium min-w-[120px] text-center">
                {year}年{month + 1}月
              </span>
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={handleNextMonth}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
          {/* ステータス凡例 */}
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            {(Object.entries(STATUS_CONFIG) as [ScheduledPostStatus, typeof STATUS_CONFIG[ScheduledPostStatus]][]).map(
              ([status, config]) => (
                <div key={status} className="flex items-center gap-1 text-xs text-muted-foreground">
                  <span className={`inline-block h-2.5 w-2.5 rounded-full ${config.dotColor}`} />
                  {config.label}
                </div>
              )
            )}
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto overflow-y-hidden">
          <div className="min-w-[500px] md:min-w-0">
          {/* 曜日ヘッダー */}
          <div className="grid grid-cols-7 mb-1">
            {WEEKDAY_LABELS.map((label, i) => (
              <div
                key={label}
                className={`text-center text-xs font-medium py-2 ${
                  i === 0 ? "text-red-500" : i === 6 ? "text-blue-500" : "text-muted-foreground"
                }`}
              >
                {label}
              </div>
            ))}
          </div>

          {/* カレンダーグリッド */}
          <div className="grid grid-cols-7 border-t border-l">
            {calendarDays.map((day, index) => {
              const dateKey = formatDate(day);
              const isCurrentMonth = day.getMonth() === month;
              const isToday = dateKey === today;
              const dayOfWeek = day.getDay();
              const posts = postsByDate.get(dateKey) ?? [];

              return (
                <div
                  key={index}
                  className={`
                    min-h-[80px] md:min-h-[100px] border-r border-b p-1 md:p-1.5 cursor-pointer transition-colors
                    hover:bg-accent/50
                    ${!isCurrentMonth ? "bg-muted/30" : ""}
                    ${isToday ? "bg-blue-50 dark:bg-blue-950/20" : ""}
                  `}
                  onClick={() => onDateClick(dateKey)}
                >
                  {/* 日付番号 */}
                  <div className="flex items-center justify-between mb-1">
                    <span
                      className={`
                        text-xs font-medium leading-none
                        ${!isCurrentMonth ? "text-muted-foreground/50" : ""}
                        ${isToday ? "bg-blue-600 text-white rounded-full w-6 h-6 flex items-center justify-center" : ""}
                        ${dayOfWeek === 0 && !isToday ? "text-red-500" : ""}
                        ${dayOfWeek === 6 && !isToday ? "text-blue-500" : ""}
                      `}
                    >
                      {day.getDate()}
                    </span>
                    {/* 投稿数バッジ（3件以上の場合） */}
                    {posts.length >= 3 && (
                      <span className="text-[10px] text-muted-foreground bg-muted rounded-full px-1.5">
                        {posts.length}件
                      </span>
                    )}
                  </div>

                  {/* 投稿ドット/カード（最大2件表示） */}
                  <div className="space-y-0.5">
                    {posts.slice(0, 2).map((post) => {
                      const config = STATUS_CONFIG[post.status];
                      return (
                        <button
                          key={post.id}
                          className={`
                            w-full text-left text-[10px] leading-tight rounded px-1 py-0.5
                            truncate border ${config.color}
                            hover:opacity-80 transition-opacity
                          `}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedPost(post);
                          }}
                          title={post.drafts?.text ?? ""}
                        >
                          <span className="flex items-center gap-0.5">
                            <span className={`inline-block h-1.5 w-1.5 rounded-full ${config.dotColor} shrink-0`} />
                            <span className="truncate">
                              {new Date(post.scheduled_at).toLocaleTimeString("ja-JP", {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                              {" "}
                              {post.drafts?.text?.slice(0, 15) ?? "投稿"}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                    {/* 3件以上ある場合の省略表示 */}
                    {posts.length > 2 && (
                      <div className="text-[10px] text-muted-foreground pl-1">
                        +{posts.length - 2}件
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          </div>
        </CardContent>
      </Card>

      {/* 投稿詳細ダイアログ */}
      <Dialog open={!!selectedPost} onOpenChange={() => setSelectedPost(null)}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>予約投稿の詳細</DialogTitle>
            <DialogDescription>
              {selectedPost?.status === "pending"
                ? "予約日時・内容の編集、または予約のキャンセルができます。"
                : "予約投稿の情報を確認できます。"}
            </DialogDescription>
          </DialogHeader>
          {selectedPost && (
            <PostDetailContent
              post={selectedPost}
              onClose={() => setSelectedPost(null)}
              onPostChanged={() => {
                setSelectedPost(null);
                onPostChanged?.();
                router.refresh();
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

// ============================================================
// 投稿詳細コンテンツ（編集・削除対応）
// ============================================================

function PostDetailContent({
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
  const threadPosts = Array.isArray(meta?.thread_posts)
    ? (meta.thread_posts as string[])
    : null;
  const isThread = threadPosts !== null && threadPosts.length >= 2;

  const dateChanged =
    editDate !== formatDate(scheduledDate) ||
    editTime !==
      scheduledDate.toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" });

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
      const res = await fetch(`/api/scheduled-posts/${post.id}`, {
        method: "DELETE",
      });

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
      {/* ステータス + 投稿形式 */}
      <div className="flex items-center gap-2">
        <Badge className={config.color}>
          <span className="flex items-center gap-1">
            {config.icon}
            {config.label}
          </span>
        </Badge>
        {isThread && (
          <Badge variant="outline" className="text-xs">
            <MessageSquareText className="h-3 w-3 mr-1" />
            スレッド ({threadPosts.length}件)
          </Badge>
        )}
      </div>

      {/* 予約日時（pending なら編集可能） */}
      <div>
        <p className="text-sm font-medium text-muted-foreground mb-1">予約日時</p>
        {isPending ? (
          <div className="flex items-end gap-2">
            <Input
              type="date"
              value={editDate}
              onChange={(e) => setEditDate(e.target.value)}
              className="flex-1"
            />
            <Input
              type="time"
              value={editTime}
              onChange={(e) => setEditTime(e.target.value)}
              className="w-[120px]"
            />
            {dateChanged && (
              <Button
                size="sm"
                onClick={handleSaveDate}
                disabled={isSavingDate}
              >
                {isSavingDate ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
              </Button>
            )}
          </div>
        ) : (
          <p className="text-sm">
            {scheduledDate.toLocaleString("ja-JP", {
              year: "numeric",
              month: "long",
              day: "numeric",
              weekday: "short",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        )}
      </div>

      {/* 投稿テキスト（スレッドは各投稿を分けて表示） */}
      <div>
        <p className="text-sm font-medium text-muted-foreground mb-1">投稿テキスト</p>
        {isThread ? (
          <div className="space-y-2">
            {threadPosts.map((text, i) => (
              <div key={i} className="bg-muted/50 rounded-lg p-3 relative">
                <span className="absolute top-1.5 right-2 text-[10px] text-muted-foreground">
                  {i + 1}/{threadPosts.length}
                </span>
                <p className="text-sm whitespace-pre-wrap pr-8">{text}</p>
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

      {/* ハッシュタグ */}
      {post.drafts?.hashtags && post.drafts.hashtags.length > 0 && (
        <div>
          <p className="text-sm font-medium text-muted-foreground mb-1">ハッシュタグ</p>
          <div className="flex gap-1 flex-wrap">
            {post.drafts.hashtags.map((tag, i) => (
              <Badge key={i} variant="secondary" className="text-xs">
                {tag}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* 投稿結果（公開済みの場合） */}
      {post.published_at && (
        <div>
          <p className="text-sm font-medium text-muted-foreground mb-1">投稿日時</p>
          <p className="text-sm">
            {new Date(post.published_at).toLocaleString("ja-JP", {
              year: "numeric",
              month: "long",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        </div>
      )}

      {/* エラー情報（失敗の場合） */}
      {post.last_error && (
        <div>
          <p className="text-sm font-medium text-red-600 mb-1">エラー</p>
          <p className="text-sm text-red-600 bg-red-50 rounded-lg p-3">{post.last_error}</p>
        </div>
      )}

      {/* 投稿URL（公開済みの場合） */}
      {post.post_url && (
        <div>
          <p className="text-sm font-medium text-muted-foreground mb-1">投稿リンク</p>
          <a
            href={post.post_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-blue-600 hover:underline break-all"
          >
            {post.post_url}
          </a>
        </div>
      )}

      {/* アクションボタン（pending時のみ） */}
      {isPending && (
        <div className="flex items-center gap-2 pt-2 border-t">
          <Button variant="outline" onClick={handleEditContent} className="flex-1">
            <ExternalLink className="h-4 w-4 mr-1" />
            内容を編集
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm" disabled={isDeleting}>
                {isDeleting ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4 mr-1" />
                )}
                予約をキャンセル
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>予約をキャンセルしますか？</AlertDialogTitle>
                <AlertDialogDescription>
                  この予約投稿を削除します。下書きは保持されます。
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>戻る</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete}>
                  キャンセルする
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}
    </div>
  );
}
