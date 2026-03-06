"use client";

/**
 * SNSアカウント切替コンポーネント
 * サイドバーやヘッダーで使用
 */
import { useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface SocialAccount {
  id: string;
  platform: string;
  username: string;
  displayName?: string;
  avatarUrl?: string;
}

interface AccountSwitcherProps {
  accounts: SocialAccount[];
  selectedId?: string;
  onSelect?: (accountId: string) => void;
}

const platformLabels: Record<string, string> = {
  threads: "Threads",
  instagram: "Instagram",
  x: "X",
};

export function AccountSwitcher({ accounts, selectedId, onSelect }: AccountSwitcherProps) {
  const [selected, setSelected] = useState(selectedId ?? accounts[0]?.id ?? "");

  const handleChange = (value: string) => {
    setSelected(value);
    onSelect?.(value);
  };

  if (accounts.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-3 text-center text-sm text-muted-foreground">
        SNSアカウントを接続してください
      </div>
    );
  }

  return (
    <Select value={selected} onValueChange={handleChange}>
      <SelectTrigger className="w-full">
        <SelectValue placeholder="アカウントを選択" />
      </SelectTrigger>
      <SelectContent>
        {accounts.map((account) => (
          <SelectItem key={account.id} value={account.id}>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                {platformLabels[account.platform] ?? account.platform}
              </span>
              <span>@{account.username}</span>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
