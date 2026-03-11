"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  PenSquare,
  FileText,
  Calendar,
  MoreHorizontal,
} from "lucide-react";
import { cn } from "@/lib/utils";

const tabs = [
  { label: "ホーム", href: "/dashboard", icon: LayoutDashboard },
  { label: "下書き", href: "/drafts", icon: FileText },
  { label: "作成", href: "/compose", icon: PenSquare, accent: true },
  { label: "予約", href: "/schedule", icon: Calendar },
  { label: "その他", href: "/settings", icon: MoreHorizontal },
];

export function MobileBottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:hidden">
      <div className="flex items-center justify-around pb-[env(safe-area-inset-bottom)]">
        {tabs.map((tab) => {
          const isActive =
            pathname === tab.href ||
            pathname.startsWith(tab.href + "/");

          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "flex flex-col items-center gap-0.5 px-3 py-2 min-w-0 flex-1 transition-colors",
                isActive
                  ? "text-primary"
                  : "text-muted-foreground active:text-foreground"
              )}
            >
              {tab.accent ? (
                <div className={cn(
                  "flex items-center justify-center rounded-full w-10 h-10 -mt-3 shadow-lg",
                  isActive ? "bg-primary text-primary-foreground" : "bg-primary/90 text-primary-foreground"
                )}>
                  <tab.icon className="h-5 w-5" />
                </div>
              ) : (
                <tab.icon className={cn("h-5 w-5", isActive && "stroke-[2.5]")} />
              )}
              <span className="text-[10px] leading-tight">{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
