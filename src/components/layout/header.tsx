"use client";

/**
 * アプリケーションヘッダー
 * ユーザー情報・アカウント切替・検索
 */
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
import { LogOut, User, Settings } from "lucide-react";
import Link from "next/link";

interface HeaderProps {
  user?: {
    email?: string;
    name?: string;
    avatarUrl?: string;
  };
}

export function Header({ user }: HeaderProps) {
  const initials = user?.name?.slice(0, 2) ?? user?.email?.slice(0, 2) ?? "U";

  return (
    <header className="flex h-16 items-center justify-between border-b bg-background px-6">
      {/* 左側: ページタイトル等（子コンポーネントで上書き可能） */}
      <div className="flex items-center gap-4">
        <h1 className="text-lg font-semibold">ダッシュボード</h1>
      </div>

      {/* 右側: ユーザーメニュー */}
      <div className="flex items-center gap-4">
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
  );
}
