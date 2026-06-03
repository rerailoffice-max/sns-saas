/**
 * /api/chronicle/queue (v7.19 / 2026-05-18)
 *  POST: thread 再スケジュール / キャンセル → ai-lab-bot HTTP API 転送
 */
import { NextRequest, NextResponse } from "next/server";

const BOT_API_BASE = process.env.AI_LAB_BOT_API_BASE || "http://localhost:7777";
const BOT_API_SECRET = process.env.AI_LAB_BOT_API_SECRET || "";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body?.thread_id || !body?.action) {
    return NextResponse.json({ error: "thread_id と action は必須" }, { status: 400 });
  }
  const { thread_id, action, when } = body as { thread_id: string; action: "reschedule" | "reject"; when?: string };
  if (!["reschedule", "reject"].includes(action)) {
    return NextResponse.json({ error: `action 不正: ${action}` }, { status: 400 });
  }
  try {
    const res = await fetch(`${BOT_API_BASE}/api/chronicle/queue/${encodeURIComponent(action)}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(BOT_API_SECRET ? { Authorization: `Bearer ${BOT_API_SECRET}` } : {}),
      },
      body: JSON.stringify({ thread_id, when }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return NextResponse.json({ error: `bot API ${res.status}: ${data.error || "unknown"}` }, { status: res.status });
    }
    return NextResponse.json({ ok: true, ...data });
  } catch (e: any) {
    return NextResponse.json({ error: `bot API 接続失敗: ${e.message?.slice(0, 200)}` }, { status: 502 });
  }
}
