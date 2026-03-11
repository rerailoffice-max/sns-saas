"use client";

/**
 * 予約管理ページのクライアントコンポーネント
 * CalendarView と ScheduleDialog を統合
 * 月移動時はURLのsearchParamsを更新
 */

import { useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CalendarView, type ScheduledPostWithDetails } from "@/components/schedule/calendar-view";
import { ScheduleDialog } from "@/components/schedule/schedule-dialog";
import type { Draft, SocialAccount } from "@/types/database";

interface SchedulePageClientProps {
  /** 予約投稿一覧（下書き情報付き） */
  scheduledPosts: ScheduledPostWithDetails[];
  /** 利用可能な下書き一覧 */
  drafts: Draft[];
  /** 接続済みSNSアカウント一覧 */
  accounts: SocialAccount[];
  /** 現在の表示月（YYYY-MM形式） */
  currentMonth: string;
}

export function SchedulePageClient({
  scheduledPosts,
  drafts,
  accounts,
  currentMonth,
}: SchedulePageClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // 新規予約ダイアログの状態
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | undefined>(undefined);

  // 月移動ハンドラ（searchParamsを更新してServer Componentを再レンダリング）
  const handleMonthChange = useCallback(
    (month: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("month", month);
      router.push(`/schedule?${params.toString()}`);
    },
    [router, searchParams]
  );

  // 日付クリック → 新規予約ダイアログを表示
  const handleDateClick = useCallback((date: string) => {
    setSelectedDate(date);
    setDialogOpen(true);
  }, []);

  // 予約作成成功 → ページをリロード
  const handleCreated = useCallback(() => {
    router.refresh();
  }, [router]);

  return (
    <>
      <CalendarView
        scheduledPosts={scheduledPosts}
        currentMonth={currentMonth}
        onMonthChange={handleMonthChange}
        onDateClick={handleDateClick}
        onPostChanged={handleCreated}
      />

      <ScheduleDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        drafts={drafts}
        accounts={accounts}
        defaultDate={selectedDate}
        onCreated={handleCreated}
      />
    </>
  );
}
