/**
 * 公開プロフィールの取得API（リサーチ画面の競合アカウント）
 * GET /api/research/profile?username=threads
 *
 * threads_profile_discovery を使う。フォロワー数・過去7日間の数字・最近の公開投稿を返す。保存はしない
 */
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { getActiveThreadsToken } from "@/lib/threads-account";
import {
  getPublicProfilePosts,
  lookupPublicProfile,
  normalizeUsername,
  ThreadsDiscoveryError,
} from "@/lib/threads-discovery";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (!user || authError) {
    return NextResponse.json({ error: "認証が必要です / Please log in." }, { status: 401 });
  }

  const username = normalizeUsername(request.nextUrl.searchParams.get("username") ?? "");
  if (!username) {
    return NextResponse.json(
      { error: "ユーザー名を正しく入力してください / Enter a valid Threads username." },
      { status: 400 }
    );
  }

  const accessToken = await getActiveThreadsToken(user.id);
  if (!accessToken) {
    return NextResponse.json(
      {
        error: "Threadsアカウントを接続してください / Connect your Threads account in Settings first.",
        code: "not_connected",
      },
      { status: 400 }
    );
  }

  try {
    const [profile, posts] = await Promise.all([
      lookupPublicProfile(accessToken, username),
      getPublicProfilePosts(accessToken, username, 10),
    ]);
    return NextResponse.json({ data: { profile, posts } });
  } catch (err) {
    if (err instanceof ThreadsDiscoveryError && err.isPermissionError) {
      return NextResponse.json(
        {
          error:
            "このアカウントは取得できません。Metaの承認前は @threads などMetaの公式アカウントだけが対象です。権限を追加したあとは、Threadsに接続し直してください / This account cannot be looked up yet. Before Meta approves threads_profile_discovery, only Meta's official accounts (such as @threads) are available. If the permission was just added, reconnect your Threads account.",
          code: "permission",
        },
        { status: 403 }
      );
    }
    if (err instanceof ThreadsDiscoveryError && err.status === 400) {
      return NextResponse.json(
        {
          error:
            "このアカウントは取得できません（フォロワー100人以上の公開アカウントのみ）/ This account cannot be looked up (only public profiles with at least 100 followers).",
          code: "not_found",
        },
        { status: 404 }
      );
    }
    console.error("[Research Profile] Error:", err);
    return NextResponse.json(
      { error: "取得に失敗しました / Lookup failed. Please try again." },
      { status: 502 }
    );
  }
}
