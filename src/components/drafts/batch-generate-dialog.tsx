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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Sparkles, Loader2, Lightbulb, PenLine } from "lucide-react";
import { toast } from "sonner";

interface SuggestedTheme {
  theme: string;
  reason: string;
  source_username: string;
}

interface BatchGenerateDialogProps {
  accountId: string;
}

export function BatchGenerateDialog({ accountId }: BatchGenerateDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<string>("auto");

  // 自動提案
  const [suggestions, setSuggestions] = useState<SuggestedTheme[]>([]);
  const [selectedThemes, setSelectedThemes] = useState<Set<string>>(new Set());
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [suggestError, setSuggestError] = useState<string | null>(null);

  // 手動入力
  const [themesText, setThemesText] = useState("");

  // 生成
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState<{
    generated: number;
    total: number;
  } | null>(null);

  const manualThemes = themesText
    .split("\n")
    .map((t) => t.trim())
    .filter(Boolean);

  const activeThemes =
    tab === "auto"
      ? Array.from(selectedThemes)
      : manualThemes;

  const handleSuggest = async () => {
    setIsSuggesting(true);
    setSuggestError(null);
    try {
      const res = await fetch("/api/ai/suggest-themes", { method: "POST" });
      // #region agent log
      fetch('http://127.0.0.1:7744/ingest/110127fe-ae5b-4a90-a338-ca8c289a899e',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'e11e43'},body:JSON.stringify({sessionId:'e11e43',location:'batch-generate-dialog.tsx:suggest-response',message:'suggest-themes response',data:{status:res.status,statusText:res.statusText,ok:res.ok},timestamp:Date.now(),hypothesisId:'ALL'})}).catch(()=>{});
      // #endregion
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        // #region agent log
        fetch('http://127.0.0.1:7744/ingest/110127fe-ae5b-4a90-a338-ca8c289a899e',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'e11e43'},body:JSON.stringify({sessionId:'e11e43',location:'batch-generate-dialog.tsx:suggest-error-body',message:'suggest-themes error body',data:{status:res.status,body:data},timestamp:Date.now(),hypothesisId:'ALL'})}).catch(()=>{});
        // #endregion
        throw new Error(data.error ?? "テーマ提案に失敗しました");
      }
      const data = await res.json();
      // #region agent log
      fetch('http://127.0.0.1:7744/ingest/110127fe-ae5b-4a90-a338-ca8c289a899e',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'e11e43'},body:JSON.stringify({sessionId:'e11e43',location:'batch-generate-dialog.tsx:suggest-success',message:'suggest-themes success',data:{themeCount:data.data?.themes?.length,postCount:data.data?.post_count,modelCount:data.data?.model_count},timestamp:Date.now(),hypothesisId:'ALL'})}).catch(()=>{});
      // #endregion
      const themes: SuggestedTheme[] = data.data?.themes ?? [];
      setSuggestions(themes);
      setSelectedThemes(new Set(themes.map((t) => t.theme)));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "テーマ提案に失敗しました";
      // #region agent log
      fetch('http://127.0.0.1:7744/ingest/110127fe-ae5b-4a90-a338-ca8c289a899e',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'e11e43'},body:JSON.stringify({sessionId:'e11e43',location:'batch-generate-dialog.tsx:suggest-catch',message:'suggest-themes caught error',data:{errorMessage:msg,errorType:err?.constructor?.name},timestamp:Date.now(),hypothesisId:'ALL'})}).catch(()=>{});
      // #endregion
      setSuggestError(msg);
      toast.error(msg);
    } finally {
      setIsSuggesting(false);
    }
  };

  const toggleTheme = (theme: string) => {
    setSelectedThemes((prev) => {
      const next = new Set(prev);
      if (next.has(theme)) {
        next.delete(theme);
      } else {
        next.add(theme);
      }
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedThemes.size === suggestions.length) {
      setSelectedThemes(new Set());
    } else {
      setSelectedThemes(new Set(suggestions.map((t) => t.theme)));
    }
  };

  const handleGenerate = async () => {
    if (activeThemes.length === 0) {
      toast.error("テーマを1つ以上選択してください");
      return;
    }

    setIsGenerating(true);
    setProgress({ generated: 0, total: activeThemes.length });

    try {
      const res = await fetch("/api/ai/batch-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          themes: activeThemes.slice(0, 15),
          account_id: accountId,
          thread_count: 4,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "一括生成に失敗しました");
      }

      const data = await res.json();
      setProgress({
        generated: data.data.saved,
        total: activeThemes.length,
      });
      toast.success(`${data.data.saved}件の下書きを生成しました`);
      setOpen(false);
      resetState();
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

  const resetState = () => {
    setSuggestions([]);
    setSelectedThemes(new Set());
    setSuggestError(null);
    setThemesText("");
    setTab("auto");
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) resetState();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">
          <Sparkles className="mr-2 h-4 w-4" />
          一括生成
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>下書き一括生成</DialogTitle>
          <DialogDescription>
            AIが提案するテーマから選択するか、手動でテーマを入力して一括生成できます。
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab} className="flex-1 min-h-0">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="auto">
              <Lightbulb className="mr-1.5 h-3.5 w-3.5" />
              自動提案
            </TabsTrigger>
            <TabsTrigger value="manual">
              <PenLine className="mr-1.5 h-3.5 w-3.5" />
              手動入力
            </TabsTrigger>
          </TabsList>

          <TabsContent value="auto" className="space-y-3 mt-3 overflow-y-auto max-h-[50vh]">
            {suggestions.length === 0 && !isSuggesting && !suggestError && (
              <div className="text-center py-8 space-y-3">
                <Lightbulb className="mx-auto h-10 w-10 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  登録モデルアカウントの最新投稿を分析し、<br />
                  今バズりそうなテーマをAIが提案します。
                </p>
                <Button onClick={handleSuggest} disabled={isSuggesting}>
                  <Sparkles className="mr-2 h-4 w-4" />
                  テーマを提案してもらう
                </Button>
              </div>
            )}

            {isSuggesting && (
              <div className="text-center py-8 space-y-3">
                <Loader2 className="mx-auto h-8 w-8 animate-spin text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  モデルアカウントの投稿を分析中...
                </p>
              </div>
            )}

            {suggestError && suggestions.length === 0 && (
              <div className="text-center py-8 space-y-3">
                <p className="text-sm text-destructive">{suggestError}</p>
                <Button variant="outline" onClick={handleSuggest}>
                  再試行
                </Button>
              </div>
            )}

            {suggestions.length > 0 && (
              <>
                <div className="flex items-center justify-between px-1">
                  <button
                    type="button"
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                    onClick={toggleAll}
                  >
                    {selectedThemes.size === suggestions.length
                      ? "すべて解除"
                      : "すべて選択"}
                  </button>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">
                      {selectedThemes.size}/{suggestions.length} 選択中
                    </Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleSuggest}
                      disabled={isSuggesting}
                      className="text-xs h-7"
                    >
                      {isSuggesting ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        "再提案"
                      )}
                    </Button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  {suggestions.map((s, i) => (
                    <label
                      key={i}
                      className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                        selectedThemes.has(s.theme)
                          ? "border-primary bg-accent/40"
                          : "border-border hover:bg-accent/20"
                      }`}
                    >
                      <Checkbox
                        checked={selectedThemes.has(s.theme)}
                        onCheckedChange={() => toggleTheme(s.theme)}
                        className="mt-0.5"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{s.theme}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-muted-foreground">
                            {s.reason}
                          </span>
                          {s.source_username && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                              @{s.source_username}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              </>
            )}
          </TabsContent>

          <TabsContent value="manual" className="space-y-3 mt-3">
            <Textarea
              placeholder={`テーマを1行に1つずつ入力（最大15件）\n\n例:\nClaude Code活用術\nGemini 2.5の新機能\nAI画像生成の最新トレンド\nThreadsアルゴリズム変更`}
              value={themesText}
              onChange={(e) => setThemesText(e.target.value)}
              className="min-h-[200px]"
              disabled={isGenerating}
            />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{manualThemes.length}/15 テーマ</span>
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter className="flex items-center justify-between sm:justify-between">
          <div className="text-xs text-muted-foreground">
            {progress && (
              <Badge variant="secondary">
                {progress.generated}/{progress.total} 生成中...
              </Badge>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isGenerating}
            >
              キャンセル
            </Button>
            <Button
              onClick={handleGenerate}
              disabled={
                isGenerating ||
                activeThemes.length === 0 ||
                activeThemes.length > 15
              }
            >
              {isGenerating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  生成中...
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  {activeThemes.length}件を一括生成
                </>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
