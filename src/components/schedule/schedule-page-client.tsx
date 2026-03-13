"use client";

import { useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CalendarView } from "@/components/schedule/calendar-view";
import { WeekView } from "@/components/schedule/week-view";
import { DayView } from "@/components/schedule/day-view";
import { PostDetailDialog, type ScheduledPostWithDetails } from "@/components/schedule/schedule-shared";
import { ScheduleDialog } from "@/components/schedule/schedule-dialog";
import { Button } from "@/components/ui/button";
import { CalendarPlus, Calendar, CalendarDays, CalendarRange } from "lucide-react";
import type { Draft, SocialAccount } from "@/types/database";

type ViewMode = "month" | "week" | "day";

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

  const [viewMode, setViewMode] = useState<ViewMode>("month");
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | undefined>(undefined);
  const [selectedPost, setSelectedPost] = useState<ScheduledPostWithDetails | null>(null);

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

  const handlePostClick = useCallback((post: ScheduledPostWithDetails) => {
    setSelectedPost(post);
  }, []);

  const handlePostChanged = useCallback(() => {
    setSelectedPost(null);
    router.refresh();
  }, [router]);

  const handleDateChange = useCallback((date: Date) => {
    setCurrentDate(date);
  }, []);

  const viewButtons: { mode: ViewMode; label: string; icon: React.ReactNode }[] = [
    { mode: "month", label: "月", icon: <Calendar className="h-3.5 w-3.5" /> },
    { mode: "week", label: "週", icon: <CalendarRange className="h-3.5 w-3.5" /> },
    { mode: "day", label: "日", icon: <CalendarDays className="h-3.5 w-3.5" /> },
  ];

  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">予約管理</h1>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border p-0.5 bg-muted/50">
            {viewButtons.map((v) => (
              <button
                key={v.mode}
                onClick={() => setViewMode(v.mode)}
                className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  viewMode === v.mode
                    ? "bg-background shadow-sm text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {v.icon}
                {v.label}
              </button>
            ))}
          </div>
          <Button onClick={handleNewSchedule} size="sm">
            <CalendarPlus className="mr-2 h-4 w-4" />
            新規予約
          </Button>
        </div>
      </div>

      {viewMode === "month" && (
        <CalendarView
          scheduledPosts={scheduledPosts}
          currentMonth={currentMonth}
          onMonthChange={handleMonthChange}
          onDateClick={handleDateClick}
          onPostChanged={handleCreated}
        />
      )}

      {viewMode === "week" && (
        <WeekView
          scheduledPosts={scheduledPosts}
          currentDate={currentDate}
          onDateChange={handleDateChange}
          onDateClick={handleDateClick}
          onPostClick={handlePostClick}
          onPostChanged={handleCreated}
        />
      )}

      {viewMode === "day" && (
        <DayView
          scheduledPosts={scheduledPosts}
          currentDate={currentDate}
          onDateChange={handleDateChange}
          onDateClick={handleDateClick}
          onPostClick={handlePostClick}
        />
      )}

      <PostDetailDialog
        post={selectedPost}
        onClose={() => setSelectedPost(null)}
        onPostChanged={handlePostChanged}
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
