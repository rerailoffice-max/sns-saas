/**
 * Next.js ミドルウェア
 * - 認証チェック（Supabase Auth）
 * - セキュリティヘッダー付与
 * - ルートグループ別アクセス制御
 */
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// ========================================
// ルート定義
// ========================================

/** 認証不要のパブリックルート */
const PUBLIC_ROUTES = [
  "/",
  "/pricing",
  "/terms",
  "/privacy",
];

/** 認証ページ（ログイン済みの場合はダッシュボードへリダイレクト） */
const AUTH_ROUTES = [
  "/login",
  "/signup",
  "/reset-password",
  "/callback",
];

/** 認証必須のアプリルート（プレフィックスマッチ） */
const PROTECTED_PREFIXES = [
  "/dashboard",
  "/compose",
  "/drafts",
  "/schedule",
  "/analytics",
  "/models",
  "/settings",
  "/onboarding",
];

/** CRON_SECRET認証が必要なAPIルート */
const CRON_API_PREFIX = "/api/cron/";

/** APIキー認証が必要な外部APIルート */
const EXTERNAL_API_PREFIX = "/api/v1/";

// ========================================
// セキュリティヘッダー
// ========================================

const SECURITY_HEADERS: Record<string, string> = {
  // クリックジャッキング防止
  "X-Frame-Options": "DENY",
  // MIMEタイプスニッフィング防止
  "X-Content-Type-Options": "nosniff",
  // XSS保護
  "X-XSS-Protection": "1; mode=block",
  // リファラーポリシー
  "Referrer-Policy": "strict-origin-when-cross-origin",
  // HTTPS強制（本番のみ有効）
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  // Permissions Policy
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};

// ========================================
// ヘルパー関数
// ========================================

/**
 * パスがパブリックルートかどうか判定
 */
function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.includes(pathname);
}

/**
 * パスが認証ルートかどうか判定
 */
function isAuthRoute(pathname: string): boolean {
  return AUTH_ROUTES.includes(pathname);
}

/**
 * パスが保護されたルートかどうか判定
 */
function isProtectedRoute(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

/**
 * パスがCRON APIかどうか判定
 */
function isCronApiRoute(pathname: string): boolean {
  return pathname.startsWith(CRON_API_PREFIX);
}

/**
 * パスが外部APIかどうか判定
 */
function isExternalApiRoute(pathname: string): boolean {
  return pathname.startsWith(EXTERNAL_API_PREFIX);
}

/**
 * レスポンスにセキュリティヘッダーを付与
 */
function addSecurityHeaders(response: NextResponse): NextResponse {
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(key, value);
  }
  return response;
}

// ========================================
// メインミドルウェア
// ========================================

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  let response = NextResponse.next({
    request: { headers: request.headers },
  });

  // ------------------------------------------
  // 1. CRON APIルートの認証（CRON_SECRET）
  // ------------------------------------------
  if (isCronApiRoute(pathname)) {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return addSecurityHeaders(
        NextResponse.json(
          { error: "Unauthorized: Invalid CRON secret" },
          { status: 401 }
        )
      );
    }
    return addSecurityHeaders(response);
  }

  // ------------------------------------------
  // 2. 外部API v1ルート（APIキー認証はルートハンドラ内で実施）
  //    ミドルウェアではセキュリティヘッダーのみ付与
  // ------------------------------------------
  if (isExternalApiRoute(pathname)) {
    // CORS設定（外部APIなので必要）
    response.headers.set("Access-Control-Allow-Origin", "*");
    response.headers.set(
      "Access-Control-Allow-Methods",
      "GET, POST, PUT, DELETE, OPTIONS"
    );
    response.headers.set(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization"
    );

    // OPTIONSプリフライトリクエスト
    if (request.method === "OPTIONS") {
      return addSecurityHeaders(
        new NextResponse(null, { status: 204, headers: response.headers })
      );
    }

    return addSecurityHeaders(response);
  }

  // ------------------------------------------
  // 3. その他のAPIルート（内部API）
  //    認証はルートハンドラ内で実施
  // ------------------------------------------
  if (pathname.startsWith("/api/")) {
    return addSecurityHeaders(response);
  }

  // ------------------------------------------
  // 4. パブリックルート: Supabase不要でそのまま通過
  // ------------------------------------------
  if (isPublicRoute(pathname)) {
    return addSecurityHeaders(response);
  }

  // ------------------------------------------
  // 5. Supabase Auth セッションチェック
  //    （認証ルート・保護ルート）
  // ------------------------------------------
  // 環境変数がない場合はスキップ（開発時の初期セットアップ対応）
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return addSecurityHeaders(response);
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({
            request: { headers: request.headers },
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // セッション更新（Supabase SSR推奨パターン）
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // ------------------------------------------
  // 5a. 認証ページ: ログイン済みならダッシュボードへ
  // ------------------------------------------
  if (isAuthRoute(pathname)) {
    if (user) {
      const url = request.nextUrl.clone();
      url.pathname = "/dashboard";
      return addSecurityHeaders(NextResponse.redirect(url));
    }
    return addSecurityHeaders(response);
  }

  // ------------------------------------------
  // 5b. 保護ルート: 未ログインならログインへ
  // ------------------------------------------
  if (isProtectedRoute(pathname)) {
    if (!user) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      // リダイレクト元を保持（ログイン後に戻す用）
      url.searchParams.set("redirect", pathname);
      return addSecurityHeaders(NextResponse.redirect(url));
    }
    return addSecurityHeaders(response);
  }

  // ------------------------------------------
  // 6. その他のルート: そのまま通過
  // ------------------------------------------
  return addSecurityHeaders(response);
}

// ========================================
// ミドルウェア適用パターン
// ========================================
export const config = {
  matcher: [
    /*
     * 以下を除く全ルートにマッチ:
     * - _next/static (静的ファイル)
     * - _next/image (画像最適化)
     * - favicon.ico (ファビコン)
     * - public フォルダのアセット
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
