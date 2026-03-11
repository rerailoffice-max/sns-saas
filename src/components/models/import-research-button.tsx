"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Download, Loader2, CheckCircle } from "lucide-react";
import { toast } from "sonner";

interface ImportResearchButtonProps {
  modelId: string;
}

export function ImportResearchButton({ modelId }: ImportResearchButtonProps) {
  const router = useRouter();
  const [isImporting, setIsImporting] = useState(false);
  const [result, setResult] = useState<{
    posts_imported: number;
    markdowns_imported: number;
  } | null>(null);

  const handleImport = async () => {
    setIsImporting(true);
    try {
      const res = await fetch(`/api/models/${modelId}/import-research`, {
        method: "POST",
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "インポートに失敗しました");
      }

      const data = await res.json();
      setResult(data.data);
      toast.success(
        `${data.data.posts_imported}件の投稿と${data.data.markdowns_imported}件の分析レポートをインポートしました`
      );
      router.refresh();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "インポートに失敗しました"
      );
    } finally {
      setIsImporting(false);
    }
  };

  if (result) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <CheckCircle className="h-4 w-4 text-green-500" />
        <span>
          {result.posts_imported}件の投稿をインポート済み
        </span>
      </div>
    );
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleImport}
      disabled={isImporting}
    >
      {isImporting ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          インポート中...
        </>
      ) : (
        <>
          <Download className="mr-2 h-4 w-4" />
          研究データをインポート
        </>
      )}
    </Button>
  );
}
