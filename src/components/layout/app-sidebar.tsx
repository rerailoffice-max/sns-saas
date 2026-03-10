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
  Flame,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { label: "ダッシュボード", href: "/dashboard", icon: LayoutDashboard },
  { label: "投稿作成", href: "/compose", icon: PenSquare },
  { label: "下書き", href: "/drafts", icon: FileText },
  { label: "予約管理", href: "/schedule", icon: Calendar },
  { label: "分析", href: "/analytics", icon: BarChart3 },
  { label: "バズツール", href: "/buzz", icon: Flame },
  { label: "モデリング", href: "/models", icon: Users },
  { label: "設定", href: "/settings", icon: Settings },
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
            const isActive =
              pathname === item.href ||
              pathname.startsWith(item.href + "/") ||
              (item.href === "/settings" && pathname.startsWith("/settings"));
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
      </nav>
    </aside>
  );
}
