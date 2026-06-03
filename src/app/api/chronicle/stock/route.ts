/**
 * /api/chronicle/stock (v7.19 / 2026-05-18)
 *  POST: stock 採用/却下 → ai-lab-bot HTTP API (Phase 2b) に転送
 *  GET: 一覧取得（Server Component から直接 Supabase 読む方が速いので、念のため）
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const BOT_API_BASE = process.env.AI_LAB_BOT_API_BASE || "http://localhost:7777";
const BOT_API_SECRET = process.env.AI_LAB_BOT_API_SECRET || "";

export async function GET() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("chronicle_topic_stock")
    .select("*")
    .eq("status", "stocked")
    .order("buzz_score", { ascending: false })
    .limit(100);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data || [] });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body?.topic_key || !body?.action) {
    return NextResponse.json({ error: "topic_key と action は必須" }, { status: 400 });
  }
  const { topic_key, action, when } = body as { topic_key: string; action: "adopt" | "reject"; when?: string };
  if (!["adopt", "reject"].includes(action)) {
    return NextResponse.json({ error: `action 不正: ${action}` }, { status: 400 });
  }

  // ai-lab-bot HTTP API (Phase 2b で実装) に転送
  try {
    const res = await fetch(`${BOT_API_BASE}/api/chronicle/stock/${encodeURIComponent(action)}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(BOT_API_SECRET ? { Authorization: `Bearer ${BOT_API_SECRET}` } : {}),
      },
      body: JSON.stringify({ topic_key, when }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return NextResponse.json(
        { error: `bot API ${res.status}: ${data.error || "unknown"}` },
        { status: res.status }
      );
    }
    return NextResponse.json({ ok: true, ...data });
  } catch (e: any) {
    return NextResponse.json(
      { error: `bot API 接続失敗: ${e.message?.slice(0, 200)}` },
      { status: 502 }
    );
  }
}
