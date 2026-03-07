"use client";

/**
 * 設定ページ共通レイアウト
 * 上部タブナビゲーション付きのレイアウト
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { User, Link2, CreditCard, Key, Bell } from "lucide-react";
import { cn } from "@/lib/utils";

/** 設定メニューアイテム */
const SETTINGS_NAV = [
  { href: "/settings", label: "プロフィール", icon: User },
  { href: "/settings/accounts", label: "SNSアカウント", icon: Link2 },
  { href: "/settings/billing", label: "課金管理", icon: CreditCard },
  { href: "/settings/api-keys", label: "APIキー", icon: Key },
  { href: "/settings/notifications", label: "通知設定", icon: Bell },
] as const;

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="space-y-6">
      {/* 上部タブナビゲーション */}
      <div className="border-b">
        <nav className="flex overflow-x-auto -mb-px">
          {SETTINGS_NAV.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors",
                  isActive
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/50"
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* メインコンテンツ */}
      <div>{children}</div>
    </div>
  );
}
