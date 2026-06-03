"use client";
/**
 * クロニキ 自動投稿コントロール クライアント UI (v7.19 / 2026-05-18)
 */
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type ControlState = {
  paused: boolean;
  paused_reason: string | null;
  paused_at: string | null;
  paused_by: string | null;
  resumed_at: string | null;
  history: Array<{ at: string; action: string; by?: string; reason?: string }>;
};

function formatJst(iso: string | null) {
  if (!iso) return "?";
  try { return new Date(iso).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" }); }
  catch { return iso; }
}

export function ChronicleControlClient({ state }: { state: ControlState }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function toggle(action: "pause" | "resume") {
    setBusy(true); setMsg(null);
    try {
      const reason = action === "pause" ? prompt("停止理由 (任意):", "Web UI から停止") || "Web UI" : undefined;
      const res = await fetch("/api/chronicle/control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reason }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `${res.status}`);
      setMsg(`✅ ${action === "pause" ? "停止" : "再開"} 完了`);
      setTimeout(() => window.location.reload(), 1200);
    } catch (e: any) {
      setMsg(`❌ ${e.message}`);
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            {state.paused ? "🔴 自動投稿: 停止中" : "🟢 自動投稿: 稼働中"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {msg && (
            <div className={`p-2 mb-3 rounded text-sm ${msg.startsWith("✅") ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}>
              {msg}
            </div>
          )}
          <div className="space-y-2 text-sm mb-4">
            {state.paused ? (
              <>
                <div>理由: <b>{state.paused_reason || "(未記入)"}</b></div>
                <div>停止時刻: {formatJst(state.paused_at)}</div>
                <div>停止者: {state.paused_by || "?"}</div>
              </>
            ) : (
              <div>直近の再開: {formatJst(state.resumed_at)}</div>
            )}
          </div>
          <div className="flex gap-2">
            {state.paused ? (
              <Button onClick={() => toggle("resume")} disabled={busy} variant="default" size="lg">
                🟢 自動投稿を再開
              </Button>
            ) : (
              <Button onClick={() => toggle("pause")} disabled={busy} variant="destructive" size="lg">
                🛑 自動投稿を停止
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            停止中も Discord「クロニキ パブリッシュ」コマンドや UI「ストックから今すぐ」での個別操作は機能します。
            21 スロット (4-23 + 翌 0 時) の自動 publish と毎分 absolute-scanner が停止対象。
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">操作履歴 (直近 20 件)</CardTitle>
        </CardHeader>
        <CardContent>
          {(!state.history || state.history.length === 0) ? (
            <p className="text-sm text-muted-foreground">履歴なし</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {state.history.slice(-20).reverse().map((h, i) => (
                <li key={i} className="flex gap-2 text-xs">
                  <span className="text-muted-foreground">{formatJst(h.at)}</span>
                  <span className={h.action === "pause" ? "text-red-600 font-semibold" : "text-green-600 font-semibold"}>
                    {h.action === "pause" ? "🛑 停止" : "🟢 再開"}
                  </span>
                  <span>by {h.by || "?"}</span>
                  {h.reason && <span className="text-muted-foreground">- {h.reason}</span>}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
