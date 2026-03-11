"use client";

import { useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CalendarView, type ScheduledPostWithDetails } from "@/components/schedule/calendar-view";
import { ScheduleDialog } from "@/components/schedule/schedule-dialog";
import { Button } from "@/components/ui/button";
import { CalendarPlus } from "lucide-react";
import type { Draft, SocialAccount } from "@/types/database";

interface SchedulePageClientProps {
  scheduledPosts: ScheduledPostWithDetails[];
  drafts: Draft[];
  accounts: SocialAccount[];
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

  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | undefined>(undefined);

  const handleMonthChange = useCallback(
    (month: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("month", month);
      router.push(`/schedule?${params.toString()}`);
    },
    [router, searchParams]
  );

  const handleDateClick = useCallback((date: string) => {
    setSelectedDate(date);
    setDialogOpen(true);
  }, []);

  const handleCreated = useCallback(() => {
    router.refresh();
  }, [router]);

  const handleNewSchedule = useCallback(() => {
    setSelectedDate(undefined);
    setDialogOpen(true);
  }, []);

  return (
    <>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">予約管理</h1>
        <Button onClick={handleNewSchedule}>
          <CalendarPlus className="mr-2 h-4 w-4" />
          新規予約
        </Button>
      </div>

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
