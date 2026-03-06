/**
 * アプリ本体レイアウト（認証必須エリア）
 * サイドバー + ヘッダー + メインコンテンツ
 * Supabase未接続時はデモモードで表示
 */
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { Header } from "@/components/layout/header";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Supabase未設定時はデモモードで表示
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return (
      <div className="flex h-screen">
        <AppSidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <Header
            user={{
              email: "demo@example.com",
              name: "デモユーザー",
            }}
          />
          <main className="flex-1 overflow-y-auto p-6">
            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              ⚠️ デモモード — Supabase環境変数が未設定のため、モックデータで表示しています。
              <code className="mx-1 rounded bg-amber-100 px-1">.env.local</code>を設定してください。
            </div>
            {children}
          </main>
        </div>
      </div>
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="flex h-screen">
      <AppSidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header
          user={{
            email: user.email,
            name: user.user_metadata?.full_name,
            avatarUrl: user.user_metadata?.avatar_url,
          }}
        />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
