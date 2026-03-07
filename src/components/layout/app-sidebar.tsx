"use client";

/**
 * アプリケーションサイドバー
 * ダッシュボード内の主要ナビゲーション
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  PenSquare,
  FileText,
  Calendar,
  BarChart3,
  Users,
  Settings,
  CreditCard,
  Key,
  Bell,
  Flame,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { label: "ダッシュボード", href: "/dashboard", icon: LayoutDashboard },
  { label: "投稿作成", href: "/compose", icon: PenSquare },
  { label: "下書き", href: "/drafts", icon: FileText },
  { label: "予約管理", href: "/schedule", icon: Calendar },
  { label: "分析", href: "/analytics", icon: BarChart3 },
  { label: "🔥 バズツール", href: "/buzz", icon: Flame },
  { label: "モデリング", href: "/models", icon: Users },
];

const settingsItems = [
  { label: "プロフィール", href: "/settings", icon: Settings },
  { label: "SNSアカウント", href: "/settings/accounts", icon: Users },
  { label: "課金管理", href: "/settings/billing", icon: CreditCard },
  { label: "APIキー", href: "/settings/api-keys", icon: Key },
  { label: "通知", href: "/settings/notifications", icon: Bell },
];

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-full w-64 flex-col border-r bg-background">
      {/* ロゴ */}
      <div className="flex h-16 items-center border-b px-6">
        <Link href="/dashboard" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold text-sm">
            S
          </div>
          <span className="text-lg font-semibold">SNS Manager</span>
        </Link>
      </div>

      {/* メインナビゲーション */}
      <nav className="flex-1 overflow-y-auto p-4">
        <div className="space-y-1">
          {navItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                  isActive
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </div>

        {/* 設定セクション */}
        <div className="mt-8">
          <p className="mb-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
            設定
          </p>
          <div className="space-y-1">
            {settingsItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                    isActive
                      ? "bg-primary/10 text-primary font-medium"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
      </nav>

      {/* フッター: プラン情報 */}
      <div className="border-t p-4">
        <div className="rounded-lg bg-muted p-3">
          <p className="text-xs text-muted-foreground">現在のプラン</p>
          <p className="text-sm font-medium">Free</p>
          <Link
            href="/settings/billing"
            className="mt-1 text-xs text-primary hover:underline"
          >
            アップグレード →
          </Link>
        </div>
      </div>
    </aside>
  );
}
