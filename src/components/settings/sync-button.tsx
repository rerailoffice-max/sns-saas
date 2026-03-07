"use client";

/**
 * データ同期ボタン
 * アカウントの投稿データを手動で再同期する
 */
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function SyncButton({ accountId }: { accountId: string }) {
  const [isSyncing, setIsSyncing] = useState(false);
  const router = useRouter();

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      const res = await fetch(`/api/accounts/${accountId}/sync`, {
        method: "POST",
      });

      if (!res.ok) {
        throw new Error("同期に失敗しました");
      }

      // ページをリフレッシュして最新の同期ステータスを表示
      router.refresh();
    } catch (err) {
      console.error("同期エラー:", err);
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleSync}
      disabled={isSyncing}
    >
      <RefreshCw className={`mr-1 h-3 w-3 ${isSyncing ? "animate-spin" : ""}`} />
      {isSyncing ? "同期中..." : "データ同期"}
    </Button>
  );
}
