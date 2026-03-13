"use client";

import { useMemo, useRef, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DndContext, useDraggable, useDroppable, DragEndEvent, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { toast } from "sonner";
import {
  type ScheduledPostWithDetails,
  STATUS_CONFIG,
  formatDate,
  WEEKDAY_LABELS,
} from "./schedule-shared";

interface WeekViewProps {
  scheduledPosts: ScheduledPostWithDetails[];
  currentDate: Date;
  onDateChange: (date: Date) => void;
  onDateClick: (date: string) => void;
  onPostClick: (post: ScheduledPostWithDetails) => void;
  onPostChanged?: () => void;
}

const HOUR_HEIGHT = 60;
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
    minHeight: 22,
    transform: transform ? `translate(${transform.x}px, ${transform.y}px)` : undefined,
    opacity: isDragging ? 0.6 : 1,
    zIndex: isDragging ? 50 : 10,
    cursor: post.status === "pending" ? "grab" : "pointer",
  };
  return (
    <div ref={setNodeRef} {...listeners} {...attributes} className="absolute left-0.5 right-0.5" style={style}>
      {children}
    </div>
  );
}

function DroppableSlot({ dateKey, hour, minute, children }: { dateKey: string; hour: number; minute: number; children?: React.ReactNode }) {
  const id = `${dateKey}-${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  const { setNodeRef, isOver } = useDroppable({ id, data: { dateKey, hour, minute } });
  return (
    <div
      ref={setNodeRef}
      className={`absolute w-full transition-colors ${isOver ? "bg-primary/10" : ""}`}
      style={{ top: (hour * 60 + minute) * (HOUR_HEIGHT / 60), height: SLOT_MINUTES * (HOUR_HEIGHT / 60) }}
    >
      {children}
    </div>
  );
}

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getWeekDays(weekStart: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });
}

export function WeekView({
  scheduledPosts,
  currentDate,
  onDateChange,
  onDateClick,
  onPostClick,
  onPostChanged,
}: WeekViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const weekStart = useMemo(() => getWeekStart(currentDate), [currentDate]);
  const weekDays = useMemo(() => getWeekDays(weekStart), [weekStart]);
  const today = formatDate(new Date());
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const postsByDate = useMemo(() => {
    const map = new Map<string, ScheduledPostWithDetails[]>();
    for (const post of scheduledPosts) {
      const dateKey = new Date(post.scheduled_at).toLocaleDateString("sv-SE");
      if (!map.has(dateKey)) map.set(dateKey, []);
      map.get(dateKey)!.push(post);
    }
    return map;
  }, [scheduledPosts]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 8 * HOUR_HEIGHT;
    }
  }, []);

  const handlePrevWeek = () => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() - 7);
    onDateChange(d);
  };

  const handleNextWeek = () => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + 7);
    onDateChange(d);
  };

  const handleToday = () => onDateChange(new Date());

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over?.data?.current) return;
    const post = active.data.current?.post as ScheduledPostWithDetails;
    if (!post || post.status !== "pending") return;
    const { dateKey, hour, minute } = over.data.current as { dateKey: string; hour: number; minute: number };
    const newScheduledAt = new Date(`${dateKey}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`);
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

  const weekLabel = (() => {
    const end = new Date(weekStart);
    end.setDate(end.getDate() + 6);
    const sy = weekStart.getFullYear();
    const sm = weekStart.getMonth() + 1;
    const sd = weekStart.getDate();
    const em = end.getMonth() + 1;
    const ed = end.getDate();
    return `${sy}年 ${sm}/${sd} - ${em}/${ed}`;
  })();

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">週間スケジュール</CardTitle>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleToday}>今週</Button>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={handlePrevWeek}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-medium min-w-[160px] text-center">{weekLabel}</span>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={handleNextWeek}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="flex items-center gap-3 mt-2 flex-wrap">
          {(Object.entries(STATUS_CONFIG) as [string, (typeof STATUS_CONFIG)[keyof typeof STATUS_CONFIG]][] ).map(
            ([status, config]) => (
              <div key={status} className="flex items-center gap-1 text-xs text-muted-foreground">
                <span className={`inline-block h-2.5 w-2.5 rounded-full ${config.dotColor}`} />
                {config.label}
              </div>
            )
          )}
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {/* Day headers */}
        <div className="grid border-b" style={{ gridTemplateColumns: "56px repeat(7, 1fr)" }}>
          <div className="border-r" />
          {weekDays.map((day) => {
            const dateKey = formatDate(day);
            const isToday = dateKey === today;
            const dow = day.getDay();
            return (
              <div
                key={dateKey}
                className={`text-center py-2 border-r text-xs font-medium cursor-pointer hover:bg-accent/50 transition-colors ${
                  isToday ? "bg-blue-50 dark:bg-blue-950/20" : ""
                } ${dow === 0 ? "text-red-500" : dow === 6 ? "text-blue-500" : ""}`}
                onClick={() => onDateClick(dateKey)}
              >
                <div>{WEEKDAY_LABELS[dow]}</div>
                <div className={`text-lg leading-tight ${isToday ? "bg-blue-600 text-white rounded-full w-7 h-7 flex items-center justify-center mx-auto" : ""}`}>
                  {day.getDate()}
                </div>
              </div>
            );
          })}
        </div>

        {/* Time grid */}
        <div ref={scrollRef} className="overflow-y-auto max-h-[600px]">
          <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
          <div className="relative" style={{ height: 24 * HOUR_HEIGHT }}>
            {HOURS.map((hour) => (
              <div
                key={hour}
                className="absolute w-full border-b border-muted/50"
                style={{ top: hour * HOUR_HEIGHT, height: HOUR_HEIGHT }}
              >
                <span className="absolute left-1 -top-2.5 text-[10px] text-muted-foreground w-[48px] text-right pr-2">
                  {String(hour).padStart(2, "0")}:00
                </span>
              </div>
            ))}

            <div className="absolute inset-0 grid" style={{ gridTemplateColumns: "56px repeat(7, 1fr)" }}>
              <div className="border-r" />
              {weekDays.map((day) => {
                const dk = formatDate(day);
                const posts = postsByDate.get(dk) ?? [];
                const isTodayCol = dk === today;
                return (
                  <div
                    key={dk}
                    className={`relative border-r ${isTodayCol ? "bg-blue-50/30 dark:bg-blue-950/10" : ""}`}
                    onClick={() => onDateClick(dk)}
                  >
                    {/* Droppable 10-min slots */}
                    {HOURS.map((h) =>
                      [0, 10, 20, 30, 40, 50].map((m) => (
                        <DroppableSlot key={`${dk}-${h}-${m}`} dateKey={dk} hour={h} minute={m} />
                      ))
                    )}
                    {/* Posts */}
                    {posts.map((post) => {
                      const d = new Date(post.scheduled_at);
                      const topPx = (d.getHours() * 60 + d.getMinutes()) * (HOUR_HEIGHT / 60);
                      const config = STATUS_CONFIG[post.status];
                      return (
                        <DraggablePost key={post.id} post={post} topPx={topPx}>
                          <div
                            className={`rounded px-1 py-0.5 text-[10px] leading-tight border ${config.color} hover:opacity-80 transition-opacity text-left overflow-hidden`}
                            onClick={(e) => { e.stopPropagation(); onPostClick(post); }}
                            title={post.drafts?.text ?? ""}
                          >
                            <span className="flex items-center gap-0.5">
                              <span className={`inline-block h-1.5 w-1.5 rounded-full ${config.dotColor} shrink-0`} />
                              <span className="truncate">
                                {d.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}{" "}
                                {post.drafts?.text?.slice(0, 12) ?? "投稿"}
                              </span>
                            </span>
                          </div>
                        </DraggablePost>
                      );
                    })}
                  </div>
                );
              })}
            </div>

            {/* Current time indicator */}
            {weekDays.some((d) => formatDate(d) === today) && (() => {
              const now = new Date();
              const topPx = (now.getHours() * 60 + now.getMinutes()) * (HOUR_HEIGHT / 60);
              const todayIndex = weekDays.findIndex((d) => formatDate(d) === today);
              return (
                <div
                  className="absolute h-0.5 bg-red-500 z-20 pointer-events-none"
                  style={{
                    top: topPx,
                    left: `calc(56px + ${todayIndex} * ((100% - 56px) / 7))`,
                    width: `calc((100% - 56px) / 7)`,
                  }}
                >
                  <div className="absolute -left-1 -top-1 h-2.5 w-2.5 rounded-full bg-red-500" />
                </div>
              );
            })()}
          </div>
          </DndContext>
        </div>
      </CardContent>
    </Card>
  );
}
