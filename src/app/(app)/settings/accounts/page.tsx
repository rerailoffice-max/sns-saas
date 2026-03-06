/**
 * SNSアカウント管理ページ
 * 接続済みアカウントの表示・新規接続
 * デモモード対応
 */
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Plus, ExternalLink, CheckCircle2, XCircle } from "lucide-react";
import { redirect } from "next/navigation";

/** アカウント一覧表示コンポーネント（デモ・実データ兼用） */
function AccountsView({
  accounts,
  successMsg,
  errorMsg,
}: {
  accounts: any[];
  successMsg?: string;
  errorMsg?: string;
}) {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">SNSアカウント管理</h1>

      {/* 成功メッセージ */}
      {successMsg === "threads_connected" && (
        <Alert>
          <CheckCircle2 className="h-4 w-4" />
          <AlertDescription>Threadsアカウントを接続しました</AlertDescription>
        </Alert>
      )}

      {/* エラーメッセージ */}
      {errorMsg && (
        <Alert variant="destructive">
          <XCircle className="h-4 w-4" />
          <AlertDescription>
            {errorMsg === "invalid_state" && "セッションが無効です。もう一度お試しください"}
            {errorMsg === "no_code" && "認証コードが取得できませんでした"}
            {errorMsg === "oauth_failed" && "OAuth認証に失敗しました"}
            {errorMsg === "db_save_failed" && "アカウント情報の保存に失敗しました"}
            {!["invalid_state", "no_code", "oauth_failed", "db_save_failed"].includes(errorMsg) && `エラー: ${errorMsg}`}
          </AlertDescription>
        </Alert>
      )}

      {/* 接続済みアカウント */}
      <Card>
        <CardHeader>
          <CardTitle>接続済みアカウント</CardTitle>
          <CardDescription>SNSプラットフォームとの接続を管理します</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {accounts && accounts.length > 0 ? (
            <div className="space-y-3">
              {accounts.map((account) => (
                <div
                  key={account.id}
                  className="flex items-center justify-between rounded-lg border p-4"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-lg">
                      {account.platform === "threads" && "🧵"}
                      {account.platform === "instagram" && "📷"}
                      {account.platform === "x" && "𝕏"}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium">
                          @{account.username}
                        </p>
                        <Badge variant="outline" className="text-xs capitalize">
                          {account.platform}
                        </Badge>
                      </div>
                      {account.display_name && (
                        <p className="text-sm text-muted-foreground">{account.display_name}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="default" className="text-xs">
                      接続済み
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-4 text-center">
              接続済みのアカウントはありません
            </p>
          )}

          {/* 新規接続ボタン */}
          <div className="flex gap-2 pt-4 border-t">
            <Button asChild>
              <a href="/api/threads/connect">
                <Plus className="mr-2 h-4 w-4" />
                Threadsを接続
                <ExternalLink className="ml-2 h-3 w-3" />
              </a>
            </Button>
            <Button variant="outline" disabled>
              <Plus className="mr-2 h-4 w-4" />
              Instagram（準備中）
            </Button>
            <Button variant="outline" disabled>
              <Plus className="mr-2 h-4 w-4" />
              X（準備中）
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default async function AccountsSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  const params = await searchParams;
  const successMsg = params?.success;
  const errorMsg = params?.error;

  // デモモード: Supabase未設定時は空のアカウント一覧で表示
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return <AccountsView accounts={[]} successMsg={successMsg} errorMsg={errorMsg} />;
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // 接続済みアカウント取得
  const { data: accounts } = await supabase
    .from("social_accounts")
    .select("*")
    .eq("profile_id", user.id)
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  return <AccountsView accounts={accounts ?? []} successMsg={successMsg} errorMsg={errorMsg} />;
}
