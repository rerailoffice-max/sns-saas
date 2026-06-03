/**
 * クロニキ運用パイプライン dashboard レイアウト (v7.19 / 2026-05-18)
 * stock / queue / history / control の 4 ページ共通の nav + container
 */
import Link from "next/link";
import { ReactNode } from "react";

const NAV = [
  { href: "/dashboard/chronicle/stock", label: "📦 ストック", desc: "動画候補" },
  { href: "/dashboard/chronicle/queue", label: "⏳ 予約", desc: "公開待ち" },
  { href: "/dashboard/chronicle/history", label: "✅ 履歴", desc: "公開済み" },
  { href: "/dashboard/chronicle/control", label: "🎛 設定", desc: "ON/OFF" },
];

export default function ChronicleLayout({ children }: { children: ReactNode }) {
  return (
    <div className="container mx-auto p-4 max-w-7xl">
      <div className="mb-4">
        <h1 className="text-2xl font-bold mb-1">クロニキ Threads 運用パイプライン</h1>
        <p className="text-sm text-muted-foreground">
          自動投稿の状態確認・動画候補の採用判断・任意時刻投稿の管理
        </p>
      </div>
      <nav className="flex flex-wrap gap-2 mb-6 border-b">
        {NAV.map((n) => (
          <Link
            key={n.href}
            href={n.href}
            className="px-4 py-2 hover:bg-muted rounded-t-md text-sm font-medium border-b-2 border-transparent hover:border-primary transition-colors"
          >
            <div>{n.label}</div>
            <div className="text-xs text-muted-foreground">{n.desc}</div>
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
