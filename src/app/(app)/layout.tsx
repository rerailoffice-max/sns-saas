/**
 * アプリ本体レイアウト（認証必須エリア）
 * デスクトップ: サイドバー + ヘッダー + メインコンテンツ
 * モバイル: ヘッダー(ハンバーガー) + メインコンテンツ + ボトムナビ
 */
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { Header } from "@/components/layout/header";
import { MobileBottomNav } from "@/components/layout/mobile-bottom-nav";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return (
      <div className="flex h-[100dvh] overflow-hidden">
        <div className="hidden md:flex">
          <AppSidebar />
        </div>
        <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
          <Header
            user={{
              email: "demo@example.com",
              name: "デモユーザー",
            }}
          />
          <main className="flex-1 overflow-y-auto overflow-x-hidden p-4 md:p-6 pb-20 md:pb-6">
            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              デモモード — Supabase環境変数が未設定のため、モックデータで表示しています。
            </div>
            {children}
          </main>
        </div>
        <MobileBottomNav />
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

  const { data: socialAccounts } = await supabase
    .from("social_accounts")
    .select("platform, username, is_active")
    .eq("profile_id", user.id);

  return (
    <div className="flex h-[100dvh] overflow-hidden">
      <div className="hidden md:flex">
        <AppSidebar />
      </div>
      <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
        <Header
          user={{
            email: user.email,
            name: user.user_metadata?.full_name,
            avatarUrl: user.user_metadata?.avatar_url,
          }}
          socialAccounts={(socialAccounts ?? []).map((a) => ({
            platform: a.platform,
            username: a.username,
            isActive: a.is_active,
          }))}
        />
        <main className="flex-1 overflow-y-auto overflow-x-hidden p-4 md:p-6 pb-20 md:pb-6">{children}</main>
      </div>
      <MobileBottomNav />
    </div>
  );
}
