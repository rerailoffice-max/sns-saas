"use client";

/**
 * 新規登録ページ
 * Supabase Auth メール＋パスワード認証
 */
import { useActionState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import Link from "next/link";
import { signup, type AuthState } from "../actions";
import { Loader2, CheckCircle2 } from "lucide-react";

export default function SignupPage() {
  const [state, formAction, isPending] = useActionState<AuthState, FormData>(signup, {});

  // 登録成功時の表示
  if (state.success) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center space-y-4 text-center">
              <CheckCircle2 className="h-12 w-12 text-green-500" />
              <h2 className="text-xl font-semibold">メールを確認してください</h2>
              <p className="text-sm text-muted-foreground">{state.success}</p>
              <Link href="/login">
                <Button variant="outline">ログインページへ</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground font-bold text-lg">
            S
          </div>
          <CardTitle className="text-2xl">アカウント作成</CardTitle>
          <CardDescription>無料でSNS Managerを始めましょう</CardDescription>
        </CardHeader>
        <CardContent>
          {state.error && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}

          <form action={formAction} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">表示名</Label>
              <Input
                id="name"
                name="name"
                type="text"
                placeholder="表示名"
                autoComplete="name"
                disabled={isPending}
              />
            </div>
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
              <Label htmlFor="password">パスワード</Label>
              <Input
                id="password"
                name="password"
                type="password"
                placeholder="8文字以上"
                required
                minLength={8}
                autoComplete="new-password"
                disabled={isPending}
              />
            </div>
            <Button type="submit" className="w-full" disabled={isPending}>
              {isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  作成中...
                </>
              ) : (
                "アカウントを作成"
              )}
            </Button>
          </form>
          <p className="mt-4 text-center text-xs text-muted-foreground">
            アカウント作成により、
            <Link href="/terms" className="text-primary hover:underline">利用規約</Link>
            と
            <Link href="/privacy" className="text-primary hover:underline">プライバシーポリシー</Link>
            に同意したものとみなします。
          </p>
          <div className="mt-4 text-center text-sm text-muted-foreground">
            すでにアカウントをお持ちの方は{" "}
            <Link href="/login" className="text-primary hover:underline font-medium">
              ログイン
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
