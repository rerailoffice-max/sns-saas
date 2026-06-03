"use client";
/**
 * クロニキ動画ストック クライアント側 UI (v7.19 / 2026-05-18)
 * 各候補の表示・採用/却下/時間指定ボタン。
 * 操作 API は /api/chronicle/stock POST。
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";

type StockItem = {
  topic_key: string;
  source_url: string | null;
  title: string | null;
  text: string | null;
  author: string | null;
  platform: string | null;
  buzz_score: number;
  media_kind: "video" | "image" | "none";
  preview_url: string | null;
  video_url: string | null;
  status: string;
};

const MEDIA_EMOJI: Record<string, string> = { video: "🎬", image: "🖼️", none: "📝" };

export function ChronicleStockClient({ items }: { items: StockItem[] }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function act(topicKey: string, action: string, when?: string) {
    if (busy) return;
    setBusy(`${topicKey}:${action}`);
    setMsg(null);
    try {
      const res = await fetch("/api/chronicle/stock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic_key: topicKey, action, when }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `${res.status}`);
      setMsg(`✅ ${action}${when ? ` (${when})` : ""} 完了: ${topicKey.slice(0, 50)}`);
      // 1.5 秒後にリロード
      setTimeout(() => window.location.reload(), 1500);
    } catch (e: any) {
      setMsg(`❌ ${e.message}`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3">
      {msg && (
        <div className={`p-2 rounded text-sm ${msg.startsWith("✅") ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}>
          {msg}
        </div>
      )}
      {items.map((it) => (
        <div key={it.topic_key} className="border rounded-md p-3 hover:bg-muted/30">
          <div className="flex gap-3">
            {it.preview_url && (
              <img
                src={it.preview_url}
                alt=""
                className="w-32 h-20 object-cover rounded flex-shrink-0 bg-muted"
                loading="lazy"
              />
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2 mb-1">
                <span className="text-lg">{MEDIA_EMOJI[it.media_kind] || "📝"}</span>
                <span className="font-semibold text-xs px-2 py-0.5 bg-orange-100 text-orange-800 rounded">
                  buzz {it.buzz_score}
                </span>
                <span className="text-xs text-muted-foreground">
                  @{it.author || "?"}
                </span>
                {it.source_url && (
                  <a
                    href={it.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-600 hover:underline"
                  >
                    元投稿 ↗
                  </a>
                )}
              </div>
              <div className="text-sm font-medium mb-1">{it.title || "(タイトル無し)"}</div>
              <div className="text-xs text-muted-foreground line-clamp-2 mb-2">
                {it.text || ""}
              </div>
              <div className="flex flex-wrap gap-1">
                <Button
                  size="sm"
                  variant="default"
                  disabled={!!busy}
                  onClick={() => act(it.topic_key, "adopt", "now")}
                >
                  今すぐ
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!!busy}
                  onClick={() => act(it.topic_key, "adopt", "+30m")}
                >
                  +30 分
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!!busy}
                  onClick={() => act(it.topic_key, "adopt", "+1h")}
                >
                  +1 時間
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!!busy}
                  onClick={() => {
                    const t = prompt("発火時刻 HH:MM (JST) を入力:", "");
                    if (t && /^\d{1,2}:\d{2}$/.test(t)) act(it.topic_key, "adopt", t);
                  }}
                >
                  時刻指定
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={!!busy}
                  onClick={() => {
                    if (confirm(`却下しますか？\n${it.title}`)) act(it.topic_key, "reject");
                  }}
                >
                  却下
                </Button>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
