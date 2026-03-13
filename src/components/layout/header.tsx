"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { LogOut, User, Settings, Menu } from "lucide-react";
import Link from "next/link";
import { AppSidebar } from "./app-sidebar";
import { PlatformIcon } from "@/components/icons/platform-icon";

interface SocialAccountLink {
  platform: string;
  username: string;
  isActive: boolean;
}

interface HeaderProps {
  user?: {
    email?: string;
    name?: string;
    avatarUrl?: string;
  };
  socialAccounts?: SocialAccountLink[];
}

const PLATFORM_URLS: Record<string, (username: string) => string> = {
  threads: (u) => `https://www.threads.net/@${u}`,
  x: (u) => `https://x.com/${u}`,
  instagram: (u) => `https://www.instagram.com/${u}`,
};

const ALL_PLATFORMS = ["threads", "x", "instagram"];

export function Header({ user, socialAccounts = [] }: HeaderProps) {
  const initials = user?.name?.slice(0, 2) ?? user?.email?.slice(0, 2) ?? "U";
  const [drawerOpen, setDrawerOpen] = useState(false);

  const accountMap = new Map(
    socialAccounts.filter((a) => a.isActive).map((a) => [a.platform, a])
  );

  return (
    <>
      <header className="flex h-14 md:h-16 shrink-0 items-center justify-between border-b bg-background px-4 md:px-6">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden h-9 w-9"
            onClick={() => setDrawerOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </Button>
          <Link href="/dashboard" className="flex items-center gap-2 md:hidden">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold text-xs">
              S
            </div>
          </Link>
        </div>

        <div className="flex items-center gap-3">
          {/* SNS Account Links */}
          <div className="hidden sm:flex items-center gap-1">
            {ALL_PLATFORMS.map((platform) => {
              const account = accountMap.get(platform);
              if (account) {
                const url = PLATFORM_URLS[platform]?.(account.username);
                return (
                  <a
                    key={platform}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center h-8 w-8 rounded-md hover:bg-accent transition-colors"
                    title={`@${account.username}`}
                  >
                    <PlatformIcon platform={platform} size={18} />
                  </a>
                );
              }
              return (
                <div
                  key={platform}
                  className="flex items-center justify-center h-8 w-8 rounded-md opacity-20 cursor-default"
                  title="未接続"
                >
                  <PlatformIcon platform={platform} size={18} />
                </div>
              );
            })}
          </div>
          <div className="hidden sm:block w-px h-6 bg-border" />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="relative h-9 w-9 rounded-full">
                <Avatar className="h-9 w-9">
                  <AvatarImage src={user?.avatarUrl} alt={user?.name ?? ""} />
                  <AvatarFallback className="text-xs">{initials}</AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56" align="end" forceMount>
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium">{user?.name ?? "ユーザー"}</p>
                  <p className="text-xs text-muted-foreground">{user?.email}</p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/settings" className="flex items-center gap-2">
                  <User className="h-4 w-4" />
                  プロフィール
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/settings/billing" className="flex items-center gap-2">
                  <Settings className="h-4 w-4" />
                  設定
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <form action="/api/auth/signout" method="POST">
                  <button type="submit" className="flex w-full items-center gap-2 text-destructive">
                    <LogOut className="h-4 w-4" />
                    ログアウト
                  </button>
                </form>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent side="left" className="w-64 p-0">
          <SheetHeader className="sr-only">
            <SheetTitle>メニュー</SheetTitle>
          </SheetHeader>
          <div onClick={() => setDrawerOpen(false)}>
            <AppSidebar />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
