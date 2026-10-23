/**
 * 公開投稿のキーワード検索API（リサーチ画面）
 * GET /api/research/search?q=Codex&type=RECENT&mode=KEYWORD
 *
 * threads_keyword_search を使う。検索結果は保存しない
 */
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { getActiveThreadsToken } from "@/lib/threads-account";
import {
  searchPublicPosts,
  ThreadsDiscoveryError,
  type SearchMode,
  type SearchType,
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

  const searchParams = request.nextUrl.searchParams;
  const query = (searchParams.get("q") ?? "").trim();
  if (!query || query.length > 100) {
    return NextResponse.json(
      { error: "キーワードを100文字以内で入力してください / Enter a keyword (up to 100 characters)." },
      { status: 400 }
    );
  }

  const searchType: SearchType = searchParams.get("type") === "TOP" ? "TOP" : "RECENT";
  const searchMode: SearchMode = searchParams.get("mode") === "TAG" ? "TAG" : "KEYWORD";

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
    const posts = await searchPublicPosts(accessToken, { query, searchType, searchMode, limit: 25 });
    return NextResponse.json({ data: posts });
  } catch (err) {
    if (err instanceof ThreadsDiscoveryError && err.isPermissionError) {
      return NextResponse.json(
        {
          error:
            "キーワード検索の権限がありません。権限を追加したあとは、Threadsに接続し直してください / The threads_keyword_search permission has not been granted. If it was just added, reconnect your Threads account.",
          code: "permission",
        },
        { status: 403 }
      );
    }
    console.error("[Research Search] Error:", err);
    return NextResponse.json(
      { error: "検索に失敗しました / Search failed. Please try again." },
      { status: 502 }
    );
  }
}
