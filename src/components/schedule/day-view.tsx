"use client";

import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, MessageSquareText, CalendarClock } from "lucide-react";
import { DndContext, useDraggable, useDroppable, DragEndEvent, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { toast } from "sonner";
import {
  type ScheduledPostWithDetails,
  STATUS_CONFIG,
  PostDetailContent,
  formatDate,
  WEEKDAY_LABELS,
} from "./schedule-shared";

interface DayViewProps {
  scheduledPosts: ScheduledPostWithDetails[];
  currentDate: Date;
  onDateChange: (date: Date) => void;
  onDateClick: (date: string) => void;
  onPostChanged?: () => void;
}

const HOUR_HEIGHT = 120;
const SLOT_MINUTES = 10;
const HOURS = Array.from({ length: 24 }, (_, i) => i);

function DraggablePost({ post, topPx, children }: { post: ScheduledPostWithDetails; topPx: number; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: post.id,
    data: { post },
    disabled: post.status !== "pending",
  });
  const style: React.CSSProperties = {
    top: topPx,
    minHeight: 36,
    transform: transform ? `translate(${transform.x}px, ${transform.y}px)` : undefined,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : 10,
    cursor: post.status === "pending" ? "grab" : "pointer",
  };
  return (
    <div ref={setNodeRef} {...listeners} {...attributes} className="absolute left-16 right-4" style={style}>
      {children}
    </div>
  );
}

function DroppableSlot({ dateKey, hour, minute }: { dateKey: string; hour: number; minute: number }) {
  const id = `day-${dateKey}-${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  const { setNodeRef, isOver } = useDroppable({ id, data: { dateKey, hour, minute } });
  const timeLabel = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  return (
    <div
      ref={setNodeRef}
      className={`absolute left-16 right-4 transition-colors group/slot ${
        isOver
          ? "bg-primary/15 rounded border border-primary/30"
          : "hover:bg-accent/40 rounded"
      }`}
      style={{ top: (hour * 60 + minute) * (HOUR_HEIGHT / 60), height: SLOT_MINUTES * (HOUR_HEIGHT / 60) }}
      title={timeLabel}
    >
      <span className="hidden group-hover/slot:inline-block absolute right-1 top-0 text-[9px] text-muted-foreground/70 leading-[20px]">
        {timeLabel}
      </span>
    </div>
  );
}

export function DayView({
  scheduledPosts,
  currentDate,
  onDateChange,
  onDateClick,
  onPostChanged,
}: DayViewProps) {
  const router = useRouter();
  const scrollRef = useRef<HTMLDivElement>(null);
  const dateKey = formatDate(currentDate);
  const today = formatDate(new Date());
  const isToday = dateKey === today;
  const dow = currentDate.getDay();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const [selectedPost, setSelectedPost] = useState<ScheduledPostWithDetails | null>(null);

  const dayPosts = useMemo(() => {
    return scheduledPosts
      .filter((p) => new Date(p.scheduled_at).toLocaleDateString("sv-SE") === dateKey)
      .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());
  }, [scheduledPosts, dateKey]);

  useEffect(() => {
    if (scrollRef.current) {
      const firstPostHour = dayPosts.length > 0
        ? new Date(dayPosts[0].scheduled_at).getHours()
        : 8;
      scrollRef.current.scrollTop = Math.max(0, (firstPostHour - 1)) * HOUR_HEIGHT;
    }
  }, [dateKey, dayPosts]);

  const handlePrevDay = () => {
    const d = new Date(currentDate);
    d.setDate(d.getDate() - 1);
    setSelectedPost(null);
    onDateChange(d);
  };

  const handleNextDay = () => {
    const d = new Date(currentDate);
    d.setDate(d.getDate() + 1);
    setSelectedPost(null);
    onDateChange(d);
  };

  const handleToday = () => { setSelectedPost(null); onDateChange(new Date()); };

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over?.data?.current) return;
    const post = active.data.current?.post as ScheduledPostWithDetails;
    if (!post || post.status !== "pending") return;
    const { dateKey: dk, hour, minute } = over.data.current as { dateKey: string; hour: number; minute: number };
    const newScheduledAt = new Date(`${dk}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`);
    if (newScheduledAt <= new Date()) {
      toast.error("過去の時間には移動できません");
      return;
    }
    try {
      const res = await fetch(`/api/scheduled-posts/${post.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduled_at: newScheduledAt.toISOString() }),
      });
      if (!res.ok) { toast.error("時間の変更に失敗しました"); return; }
      toast.success(`${hour}:${String(minute).padStart(2, "0")}に変更しました`);
      onPostChanged?.();
    } catch { toast.error("通信エラーが発生しました"); }
  }, [onPostChanged]);

  const handlePostChanged = useCallback(() => {
    setSelectedPost(null);
    onPostChanged?.();
    router.refresh();
  }, [onPostChanged, router]);

  const dayLabel = `${currentDate.getFullYear()}年${currentDate.getMonth() + 1}月${currentDate.getDate()}日（${WEEKDAY_LABELS[dow]}）`;

  return (
    <div className="flex gap-4">
      {/* Left: Timeline */}
      <Card className="flex-1 min-w-0">
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
          <div ref={scrollRef} className="overflow-y-auto max-h-[700px]">
            <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
            <div className="relative" style={{ height: 24 * HOUR_HEIGHT }}>
              {/* Hour lines + sub-lines */}
              {HOURS.map((hour) => {
                const slotH = HOUR_HEIGHT / 6;
                return (
                  <div
                    key={hour}
                    className="absolute w-full border-b border-muted"
                    style={{ top: hour * HOUR_HEIGHT, height: HOUR_HEIGHT }}
                  >
                    <span className="absolute left-1.5 -top-2.5 text-[11px] text-muted-foreground font-medium w-12 text-right pr-1">
                      {String(hour).padStart(2, "0")}:00
                    </span>
                    {/* 10-min sub-lines: :10, :20 */}
                    <div className="absolute left-16 right-0 border-b border-dotted border-muted/20" style={{ top: slotH }} />
                    <div className="absolute left-16 right-0 border-b border-dotted border-muted/20" style={{ top: slotH * 2 }} />
                    {/* 30-min line */}
                    <div className="absolute left-16 right-0 border-b border-dashed border-muted/40" style={{ top: HOUR_HEIGHT / 2 }} />
                    <span className="absolute left-1.5 text-[10px] text-muted-foreground/50 w-12 text-right pr-1" style={{ top: HOUR_HEIGHT / 2 - 6 }}>
                      {String(hour).padStart(2, "0")}:30
                    </span>
                    {/* 10-min sub-lines: :40, :50 */}
                    <div className="absolute left-16 right-0 border-b border-dotted border-muted/20" style={{ top: slotH * 4 }} />
                    <div className="absolute left-16 right-0 border-b border-dotted border-muted/20" style={{ top: slotH * 5 }} />
                  </div>
                );
              })}

              {/* Droppable 10-min slots */}
              {HOURS.map((h) =>
                [0, 10, 20, 30, 40, 50].map((m) => (
                  <DroppableSlot key={`${dateKey}-${h}-${m}`} dateKey={dateKey} hour={h} minute={m} />
                ))
              )}

              {/* Posts */}
              {dayPosts.map((post) => {
                const d = new Date(post.scheduled_at);
                const topPx = (d.getHours() * 60 + d.getMinutes()) * (HOUR_HEIGHT / 60);
                const config = STATUS_CONFIG[post.status];
                const meta = post.drafts?.metadata as Record<string, unknown> | null;
                const threadPosts = Array.isArray(meta?.thread_posts) ? (meta.thread_posts as string[]) : null;
                const isThread = threadPosts !== null && threadPosts.length >= 2;
                const isSelected = selectedPost?.id === post.id;

                return (
                  <DraggablePost key={post.id} post={post} topPx={topPx}>
                    <div
                      className={`rounded-lg px-3 py-2 border ${config.color} hover:opacity-80 transition-all text-left ${isSelected ? "ring-2 ring-primary shadow-md" : ""}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedPost(post);
                      }}
                    >
                      <div className="flex items-center gap-2 mb-0.5">
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
                    </div>
                  </DraggablePost>
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
            </DndContext>
          </div>
        </CardContent>
      </Card>

      {/* Right: Detail sidebar */}
      <Card className="hidden lg:block w-[360px] shrink-0 self-start sticky top-0 overflow-hidden">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <CalendarClock className="h-4 w-4" />
            投稿詳細
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-y-auto max-h-[calc(100vh-200px)]">
          {selectedPost ? (
            <PostDetailContent
              post={selectedPost}
              onClose={() => setSelectedPost(null)}
              onPostChanged={handlePostChanged}
            />
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <CalendarClock className="h-10 w-10 mb-3 opacity-30" />
              <p className="text-sm text-center">投稿をクリックすると<br />ここに詳細が表示されます</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
