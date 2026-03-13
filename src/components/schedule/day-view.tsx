"use client";

import { useMemo, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, MessageSquareText } from "lucide-react";
import {
  type ScheduledPostWithDetails,
  STATUS_CONFIG,
  formatDate,
  WEEKDAY_LABELS,
} from "./schedule-shared";

interface DayViewProps {
  scheduledPosts: ScheduledPostWithDetails[];
  currentDate: Date;
  onDateChange: (date: Date) => void;
  onDateClick: (date: string) => void;
  onPostClick: (post: ScheduledPostWithDetails) => void;
}

const HOUR_HEIGHT = 72;
const HOURS = Array.from({ length: 24 }, (_, i) => i);

export function DayView({
  scheduledPosts,
  currentDate,
  onDateChange,
  onDateClick,
  onPostClick,
}: DayViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const dateKey = formatDate(currentDate);
  const today = formatDate(new Date());
  const isToday = dateKey === today;
  const dow = currentDate.getDay();

  const dayPosts = useMemo(() => {
    return scheduledPosts
      .filter((p) => new Date(p.scheduled_at).toLocaleDateString("sv-SE") === dateKey)
      .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());
  }, [scheduledPosts, dateKey]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 8 * HOUR_HEIGHT;
    }
  }, []);

  const handlePrevDay = () => {
    const d = new Date(currentDate);
    d.setDate(d.getDate() - 1);
    onDateChange(d);
  };

  const handleNextDay = () => {
    const d = new Date(currentDate);
    d.setDate(d.getDate() + 1);
    onDateChange(d);
  };

  const handleToday = () => onDateChange(new Date());

  const dayLabel = `${currentDate.getFullYear()}年${currentDate.getMonth() + 1}月${currentDate.getDate()}日（${WEEKDAY_LABELS[dow]}）`;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">日別スケジュール</CardTitle>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleToday}>今日</Button>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={handlePrevDay}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className={`text-sm font-medium min-w-[180px] text-center ${dow === 0 ? "text-red-500" : dow === 6 ? "text-blue-500" : ""}`}>
              {dayLabel}
            </span>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={handleNextDay}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="flex items-center gap-3 mt-2 flex-wrap">
          {(Object.entries(STATUS_CONFIG) as [string, (typeof STATUS_CONFIG)[keyof typeof STATUS_CONFIG]][]).map(
            ([status, config]) => (
              <div key={status} className="flex items-center gap-1 text-xs text-muted-foreground">
                <span className={`inline-block h-2.5 w-2.5 rounded-full ${config.dotColor}`} />
                {config.label}
              </div>
            )
          )}
          <span className="text-xs text-muted-foreground ml-auto">{dayPosts.length}件の予約</span>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div ref={scrollRef} className="overflow-y-auto max-h-[600px]">
          <div className="relative" style={{ height: 24 * HOUR_HEIGHT }}>
            {HOURS.map((hour) => (
              <div
                key={hour}
                className="absolute w-full border-b border-muted/50 cursor-pointer hover:bg-accent/30 transition-colors"
                style={{ top: hour * HOUR_HEIGHT, height: HOUR_HEIGHT }}
                onClick={() => onDateClick(dateKey)}
              >
                <span className="absolute left-2 -top-2.5 text-[11px] text-muted-foreground font-medium">
                  {String(hour).padStart(2, "0")}:00
                </span>
              </div>
            ))}

            {/* Posts */}
            {dayPosts.map((post) => {
              const d = new Date(post.scheduled_at);
              const topPx = (d.getHours() * 60 + d.getMinutes()) * (HOUR_HEIGHT / 60);
              const config = STATUS_CONFIG[post.status];
              const meta = post.drafts?.metadata as Record<string, unknown> | null;
              const threadPosts = Array.isArray(meta?.thread_posts) ? (meta.thread_posts as string[]) : null;
              const isThread = threadPosts !== null && threadPosts.length >= 2;

              return (
                <button
                  key={post.id}
                  className={`absolute left-16 right-4 rounded-lg px-3 py-2 border ${config.color} cursor-pointer hover:opacity-80 transition-opacity z-10 text-left`}
                  style={{ top: topPx, minHeight: 40 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onPostClick(post);
                  }}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Badge className={`${config.color} text-[10px] px-1.5 py-0`}>
                      <span className="flex items-center gap-0.5">{config.icon}{config.label}</span>
                    </Badge>
                    <span className="text-xs font-medium">
                      {d.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                    {isThread && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                        <MessageSquareText className="h-2.5 w-2.5 mr-0.5" />
                        {threadPosts.length}件
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm line-clamp-2">{post.drafts?.text ?? "投稿"}</p>
                </button>
              );
            })}

            {/* Current time indicator */}
            {isToday && (() => {
              const now = new Date();
              const topPx = (now.getHours() * 60 + now.getMinutes()) * (HOUR_HEIGHT / 60);
              return (
                <div className="absolute left-12 right-0 h-0.5 bg-red-500 z-20 pointer-events-none" style={{ top: topPx }}>
                  <div className="absolute -left-1 -top-1 h-2.5 w-2.5 rounded-full bg-red-500" />
                </div>
              );
            })()}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
