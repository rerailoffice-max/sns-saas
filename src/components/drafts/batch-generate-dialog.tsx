"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Loader2, Trash2, Plus } from "lucide-react";
import { toast } from "sonner";

interface BatchGenerateDialogProps {
  accountId: string;
}

export function BatchGenerateDialog({ accountId }: BatchGenerateDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [themesText, setThemesText] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState<{ generated: number; total: number } | null>(null);

  const themes = themesText
    .split("\n")
    .map((t) => t.trim())
    .filter(Boolean);

  const handleGenerate = async () => {
    if (themes.length === 0) {
      toast.error("テーマを1つ以上入力してください");
      return;
    }

    setIsGenerating(true);
    setProgress({ generated: 0, total: themes.length });

    try {
      const res = await fetch("/api/ai/batch-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          themes,
          account_id: accountId,
          thread_count: 4,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "一括生成に失敗しました");
      }

      const data = await res.json();
      setProgress({ generated: data.data.saved, total: themes.length });
      toast.success(`${data.data.saved}件の下書きを生成しました`);
      setOpen(false);
      setThemesText("");
      router.refresh();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "一括生成に失敗しました"
      );
    } finally {
      setIsGenerating(false);
      setProgress(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Sparkles className="mr-2 h-4 w-4" />
          一括生成
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>下書き一括生成</DialogTitle>
          <DialogDescription>
            テーマを1行に1つずつ入力してください（最大15件）。各テーマにつき1つのスレッド下書きが生成されます。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <Textarea
            placeholder={`例:\nClaude Code活用術\nGemini 2.5の新機能\nAI画像生成の最新トレンド\nThreadsアルゴリズム変更\nプロンプトエンジニアリング入門`}
            value={themesText}
            onChange={(e) => setThemesText(e.target.value)}
            className="min-h-[200px]"
            disabled={isGenerating}
          />
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{themes.length}/15 テーマ</span>
            {progress && (
              <Badge variant="secondary">
                {progress.generated}/{progress.total} 生成中...
              </Badge>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={isGenerating}
          >
            キャンセル
          </Button>
          <Button
            onClick={handleGenerate}
            disabled={isGenerating || themes.length === 0 || themes.length > 15}
          >
            {isGenerating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                生成中...
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                {themes.length}件を一括生成
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
