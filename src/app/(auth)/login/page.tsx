"use client";

/**
 * ログインページ
 * Supabase Auth メールアドレス＋パスワード認証
 */
import { Suspense, useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import Link from "next/link";
import { login, type AuthState } from "../actions";
import { Loader2 } from "lucide-react";

/** useSearchParamsを使うフォーム本体 */
function LoginForm() {
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect") ?? "";
  const errorParam = searchParams.get("error");

  const [state, formAction, isPending] = useActionState<AuthState, FormData>(login, {});

  return (
    <>
      {/* URLパラメータのエラー表示 */}
      {errorParam && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>
            {errorParam === "auth_callback_failed"
              ? "認証処理に失敗しました。もう一度お試しください"
              : errorParam === "invalid_state"
              ? "セッションが無効です。もう一度お試しください"
              : "エラーが発生しました"}
          </AlertDescription>
        </Alert>
      )}

      {/* Server Actionのエラー表示 */}
      {state.error && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}

      <form action={formAction} className="space-y-4">
        <input type="hidden" name="redirect" value={redirectTo} />
        <div className="space-y-2">
          <Label htmlFor="email">メールアドレス</Label>
          <Input
            id="email"
            name="email"
            type="email"
            placeholder="you@example.com"
            required
            autoComplete="email"
            disabled={isPending}
          />
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">パスワード</Label>
            <Link href="/reset-password" className="text-xs text-primary hover:underline">
              パスワードを忘れた方
            </Link>
          </div>
          <Input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            disabled={isPending}
          />
        </div>
        <Button type="submit" className="w-full" disabled={isPending}>
          {isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ログイン中...
            </>
          ) : (
            "ログイン"
          )}
        </Button>
      </form>
      <div className="mt-6 text-center text-sm text-muted-foreground">
        アカウントをお持ちでない方は{" "}
        <Link href="/signup" className="text-primary hover:underline font-medium">
          新規登録
        </Link>
      </div>
    </>
  );
}

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground font-bold text-lg">
            S
          </div>
          <CardTitle className="text-2xl">ログイン</CardTitle>
          <CardDescription>SNS Managerにログイン</CardDescription>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<div className="h-48 flex items-center justify-center text-muted-foreground">読み込み中...</div>}>
            <LoginForm />
          </Suspense>
        </CardContent>
      </Card>
    </div>
  );
}
