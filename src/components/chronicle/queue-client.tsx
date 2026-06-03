"use client";
/**
 * クロニキ 予約 queue クライアント UI (v7.19 / 2026-05-18)
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";

type QueueItem = {
  thread_id: string;
  title: string | null;
  topic_source: string | null;
  slot: number | null;
  publish_mode: "slot" | "absolute" | "delay";
  scheduled_at: string | null;
  target_at: string | null;
  status: string;
  posts_count: number;
  media_summary: Array<{ kind: string; preview_url: string | null; source_url: string | null }> | null;
};

function formatJst(iso: string | null) {
  if (!iso) return "?";
  try {
    return new Date(iso).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
  } catch {
    return iso;
  }
}

const MEDIA_EMOJI: Record<string, string> = { video: "🎬", image: "🖼️", none: "📝" };

export function ChronicleQueueClient({ items }: { items: QueueItem[] }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function reschedule(id: string, when: string) {
    setBusy(`${id}:resched`); setMsg(null);
    try {
      const res = await fetch("/api/chronicle/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ thread_id: id, action: "reschedule", when }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `${res.status}`);
      setMsg(`✅ 再スケジュール: ${id} → ${when}`);
      setTimeout(() => window.location.reload(), 1500);
    } catch (e: any) { setMsg(`❌ ${e.message}`); }
    finally { setBusy(null); }
  }

  async function cancel(id: string) {
    if (!confirm(`キャンセル (reject) しますか？\n${id}`)) return;
    setBusy(`${id}:cancel`); setMsg(null);
    try {
      const res = await fetch("/api/chronicle/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ thread_id: id, action: "reject" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `${res.status}`);
      setMsg(`✅ キャンセル: ${id}`);
      setTimeout(() => window.location.reload(), 1500);
    } catch (e: any) { setMsg(`❌ ${e.message}`); }
    finally { setBusy(null); }
  }

  return (
    <div className="space-y-3">
      {msg && (
        <div className={`p-2 rounded text-sm ${msg.startsWith("✅") ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}>
          {msg}
        </div>
      )}
      {items.map((it) => {
        const m0 = it.media_summary?.[0];
        return (
          <div key={it.thread_id} className="border rounded-md p-3 hover:bg-muted/30">
            <div className="flex gap-3">
              {m0?.preview_url && (
                <img src={m0.preview_url} alt="" className="w-32 h-20 object-cover rounded bg-muted flex-shrink-0" loading="lazy" />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2 mb-1">
                  <span className="text-lg">{MEDIA_EMOJI[m0?.kind || "none"]}</span>
                  <code className="text-xs bg-muted px-2 py-0.5 rounded">{it.thread_id}</code>
                  <span className="text-xs text-muted-foreground">
                    {it.publish_mode === "absolute" ? `🎯 ${formatJst(it.target_at)}` : `slot ${it.slot} / ${formatJst(it.scheduled_at)}`}
                  </span>
                  <span className="text-xs text-muted-foreground">{it.posts_count} post</span>
                </div>
                <div className="text-sm font-medium mb-2">{it.title || "(タイトル無し)"}</div>
                <div className="flex flex-wrap gap-1">
                  <Button size="sm" variant="default" disabled={!!busy} onClick={() => reschedule(it.thread_id, "now")}>今すぐ</Button>
                  <Button size="sm" variant="outline" disabled={!!busy} onClick={() => reschedule(it.thread_id, "+30m")}>+30 分</Button>
                  <Button size="sm" variant="outline" disabled={!!busy} onClick={() => reschedule(it.thread_id, "+1h")}>+1 時間</Button>
                  <Button size="sm" variant="outline" disabled={!!busy} onClick={() => {
                    const t = prompt("発火時刻 HH:MM (JST):", "");
                    if (t && /^\d{1,2}:\d{2}$/.test(t)) reschedule(it.thread_id, t);
                  }}>時刻指定</Button>
                  <Button size="sm" variant="destructive" disabled={!!busy} onClick={() => cancel(it.thread_id)}>キャンセル</Button>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
