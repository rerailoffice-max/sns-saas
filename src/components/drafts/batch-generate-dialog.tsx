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
import { Sparkles, Loader2, Lightbulb, PenLine, Newspaper } from "lucide-react";
import { toast } from "sonner";

interface SuggestedTheme {
  theme: string;
  reason: string;
  source_username: string;
}

interface RSSArticle {
  id: string;
  title: string;
  title_ja: string | null;
  link: string;
  description: string | null;
  description_ja: string | null;
  source: string;
  published_at: string | null;
  is_used: boolean;
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

  // RSS記事
  const [rssArticles, setRssArticles] = useState<RSSArticle[]>([]);
  const [selectedRssIds, setSelectedRssIds] = useState<Set<string>>(new Set());
  const [isLoadingRss, setIsLoadingRss] = useState(false);
  const [rssError, setRssError] = useState<string | null>(null);

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
      : tab === "manual"
        ? manualThemes
        : [];

  const selectedArticles = rssArticles.filter((a) => selectedRssIds.has(a.id));

  const handleLoadRss = async () => {
    setIsLoadingRss(true);
    setRssError(null);
    try {
      const res = await fetch("/api/rss-articles?limit=30&is_used=false");
      if (!res.ok) throw new Error("RSS記事の取得に失敗しました");
      const data = await res.json();
      const articles: RSSArticle[] = data.data ?? [];
      setRssArticles(articles);
      setSelectedRssIds(new Set(articles.slice(0, 5).map((a) => a.id)));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "RSS記事の取得に失敗しました";
      setRssError(msg);
      toast.error(msg);
    } finally {
      setIsLoadingRss(false);
    }
  };

  const toggleRssArticle = (id: string) => {
    setSelectedRssIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleAllRss = () => {
    if (selectedRssIds.size === rssArticles.length) {
      setSelectedRssIds(new Set());
    } else {
      setSelectedRssIds(new Set(rssArticles.map((a) => a.id)));
    }
  };

  const handleSuggest = async () => {
    setIsSuggesting(true);
    setSuggestError(null);
    try {
      const res = await fetch("/api/ai/suggest-themes", { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "テーマ提案に失敗しました");
      }
      const data = await res.json();
      const themes: SuggestedTheme[] = data.data?.themes ?? [];
      setSuggestions(themes);
      setSelectedThemes(new Set(themes.map((t) => t.theme)));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "テーマ提案に失敗しました";
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
    const isRssMode = tab === "rss";

    if (!isRssMode && activeThemes.length === 0) {
      toast.error("テーマを1つ以上選択してください");
      return;
    }
    if (isRssMode && selectedArticles.length === 0) {
      toast.error("RSS記事を1つ以上選択してください");
      return;
    }

    const total = isRssMode ? selectedArticles.length : activeThemes.length;
    setIsGenerating(true);
    setProgress({ generated: 0, total });

    try {
      const payload: Record<string, unknown> = {
        account_id: accountId,
        thread_count: 4,
      };

      if (isRssMode) {
        payload.rss_articles = selectedArticles.slice(0, 15).map((a) => ({
          id: a.id,
          title: a.title,
          link: a.link,
          description: a.description ?? undefined,
          source: a.source,
        }));
      } else {
        payload.themes = activeThemes.slice(0, 15);
      }

      const res = await fetch("/api/ai/batch-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
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
    setRssArticles([]);
    setSelectedRssIds(new Set());
    setRssError(null);
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
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="auto">
              <Lightbulb className="mr-1.5 h-3.5 w-3.5" />
              自動提案
            </TabsTrigger>
            <TabsTrigger value="rss">
              <Newspaper className="mr-1.5 h-3.5 w-3.5" />
              RSSニュース
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

          <TabsContent value="rss" className="space-y-3 mt-3 overflow-y-auto max-h-[50vh]">
            {rssArticles.length === 0 && !isLoadingRss && !rssError && (
              <div className="text-center py-8 space-y-3">
                <Newspaper className="mx-auto h-10 w-10 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  RSSフィードから未使用のAIニュース記事を取得し、<br />
                  選択した記事からスレッド投稿を自動生成します。
                </p>
                <Button onClick={handleLoadRss} disabled={isLoadingRss}>
                  <Newspaper className="mr-2 h-4 w-4" />
                  RSS記事を読み込む
                </Button>
              </div>
            )}

            {isLoadingRss && (
              <div className="text-center py-8 space-y-3">
                <Loader2 className="mx-auto h-8 w-8 animate-spin text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  RSS記事を取得中...
                </p>
              </div>
            )}

            {rssError && rssArticles.length === 0 && (
              <div className="text-center py-8 space-y-3">
                <p className="text-sm text-destructive">{rssError}</p>
                <Button variant="outline" onClick={handleLoadRss}>
                  再試行
                </Button>
              </div>
            )}

            {rssArticles.length > 0 && (
              <>
                <div className="flex items-center justify-between px-1">
                  <button
                    type="button"
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                    onClick={toggleAllRss}
                  >
                    {selectedRssIds.size === rssArticles.length
                      ? "すべて解除"
                      : "すべて選択"}
                  </button>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">
                      {selectedRssIds.size}/{rssArticles.length} 選択中
                    </Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleLoadRss}
                      disabled={isLoadingRss}
                      className="text-xs h-7"
                    >
                      {isLoadingRss ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        "再取得"
                      )}
                    </Button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  {rssArticles.map((article) => (
                    <label
                      key={article.id}
                      className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                        selectedRssIds.has(article.id)
                          ? "border-primary bg-accent/40"
                          : "border-border hover:bg-accent/20"
                      }`}
                    >
                      <Checkbox
                        checked={selectedRssIds.has(article.id)}
                        onCheckedChange={() => toggleRssArticle(article.id)}
                        className="mt-0.5"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium line-clamp-2">{article.title_ja || article.title}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                            {article.source}
                          </Badge>
                          {article.published_at && (
                            <span className="text-[10px] text-muted-foreground">
                              {new Date(article.published_at).toLocaleDateString("ja-JP", {
                                month: "short",
                                day: "numeric",
                              })}
                            </span>
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
                (tab === "rss"
                  ? selectedArticles.length === 0 || selectedArticles.length > 15
                  : activeThemes.length === 0 || activeThemes.length > 15)
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
                  {tab === "rss" ? selectedArticles.length : activeThemes.length}件を一括生成
                </>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
