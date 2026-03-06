/**
 * 設定ページ共通レイアウト
 * サイドナビゲーション付きのレイアウト
 */
import Link from "next/link";
import { User, Link2, CreditCard, Key, Bell } from "lucide-react";

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
  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      {/* サイドナビゲーション */}
      <nav className="lg:w-56 shrink-0">
        <ul className="flex lg:flex-col gap-1 overflow-x-auto">
          {SETTINGS_NAV.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground whitespace-nowrap"
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {/* メインコンテンツ */}
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}
