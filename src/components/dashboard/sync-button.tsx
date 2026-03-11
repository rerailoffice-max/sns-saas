"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface SyncButtonProps {
  lastSyncedAt?: string | null;
}

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "たった今";
  if (mins < 60) return `${mins}分前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}時間前`;
  return `${Math.floor(hours / 24)}日前`;
}

export function SyncButton({ lastSyncedAt }: SyncButtonProps) {
  const router = useRouter();
  const [isSyncing, setIsSyncing] = useState(false);

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      const res = await fetch("/api/accounts/sync-latest", { method: "POST" });
      const data = await res.json();

      if (data.skipped) {
        toast.info("最新のデータです");
      } else if (data.synced) {
        toast.success("データを更新しました");
      } else if (data.error) {
        toast.error(data.error);
      }

      router.refresh();
    } catch {
      toast.error("同期に失敗しました");
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      {lastSyncedAt && (
        <span className="text-xs text-muted-foreground hidden sm:inline">
          最終同期: {formatRelativeTime(lastSyncedAt)}
        </span>
      )}
      <Button
        variant="outline"
        size="sm"
        onClick={handleSync}
        disabled={isSyncing}
        className="h-8 gap-1.5"
      >
        <RefreshCw className={cn("h-3.5 w-3.5", isSyncing && "animate-spin")} />
        <span className="hidden sm:inline">{isSyncing ? "同期中..." : "同期"}</span>
      </Button>
    </div>
  );
}
