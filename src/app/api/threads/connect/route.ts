import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (!user || error) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // CSRF保護用のstateパラメータを生成
  const state = randomBytes(32).toString("hex");

  // stateをセッションに保存（cookieベース）
  const response = NextResponse.redirect(
    `https://threads.net/oauth/authorize?` +
    `client_id=${process.env.THREADS_APP_ID}` +
    `&redirect_uri=${encodeURIComponent(process.env.THREADS_REDIRECT_URI!)}` +
    `&scope=threads_basic,threads_content_publish,threads_manage_insights,threads_manage_replies` +
    `&response_type=code` +
    `&state=${state}`
  );

  response.cookies.set("threads_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600, // 10分
    path: "/",
  });

  return response;
}
