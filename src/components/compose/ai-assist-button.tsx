"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Sparkles, Loader2, Copy, Check, Link2, Code, ChevronDown, Heart, Save } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { HOOK_PATTERNS, THREAD_TEMPLATES } from "@/lib/prompt-engine";

interface ModelAccount {
  id: string;
  username: string;
  display_name: string | null;
}

const STYLE_PRESETS = [
  { id: "breaking", name: "速報型", description: "チャエン型の高頻度速報スタイル", models: ["masahirochaen"], hook: "A" },
  { id: "tips", name: "Tips型", description: "すぐる型の質重視・保存価値スタイル", models: ["SuguruKun_ai"], hook: "G" },
  { id: "explanation", name: "解説型", description: "くどう型の長文あのー・CTA重視", models: ["kudooo_ai"], hook: "B" },
  { id: "short", name: "短文型", description: "アオト型の短文リスト・画像活用", models: ["asa_to_ame"], hook: "C" },
] as const;

interface AiAssistButtonProps {
  accountId: string;
  onInsert: (text: string, mediaUrls?: string[]) => void;
  modelAccounts?: ModelAccount[];
}

export function AiAssistButton({
  accountId,
  onInsert,
  modelAccounts = [],
}: AiAssistButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  // 統合フォーム
  const [theme, setTheme] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [hookPattern, setHookPattern] = useState("auto");
  const [threadCount, setThreadCount] = useState("auto");
  const [selectedResearchModels, setSelectedResearchModels] = useState<string[]>([]);
  const [showHookCards, setShowHookCards] = useState(false);

  // 文体スタイル
  const [style, setStyle] = useState<"default" | "model" | "custom">("default");
  const [selectedModelId, setSelectedModelId] = useState("");
  const [customInstructions, setCustomInstructions] = useState("");

  // 生成結果
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedThread, setGeneratedThread] = useState<string[]>([]);
  const [generatedMediaUrls, setGeneratedMediaUrls] = useState<string[]>([]);
  const [lastSystemPrompt, setLastSystemPrompt] = useState<string | null>(null);
  const [promptOpen, setPromptOpen] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [isSavingDraft, setIsSavingDraft] = useState(false);

  const toggleResearchModel = (username: string) => {
    setSelectedResearchModels((prev) =>
      prev.includes(username) ? prev.filter((u) => u !== username) : [...prev, username]
    );
  };

  const applyPreset = (preset: (typeof STYLE_PRESETS)[number]) => {
    setSelectedResearchModels([...preset.models]);
    setHookPattern(preset.hook);
  };

  const handleGenerate = async () => {
    if (!theme.trim() && !sourceUrl.trim()) {
      toast.error("テーマまたはURLを入力してください");
      return;
    }

    setIsGenerating(true);
    setGeneratedThread([]);
    setGeneratedMediaUrls([]);

    try {
      const isThreadMode = sourceUrl.trim() || threadCount !== "auto" || parseInt(threadCount) > 0;
      const parsedCount = threadCount === "auto" ? undefined : parseInt(threadCount);

      const payload: Record<string, unknown> = {
        theme: theme.trim() || "URL-based",
        account_id: accountId,
        platform: "threads",
        selected_models: selectedResearchModels.length > 0 ? selectedResearchModels : undefined,
      };

      if (sourceUrl.trim()) {
        payload.source_url = sourceUrl;
        payload.thread_mode = true;
        payload.hook_pattern = hookPattern === "auto" ? undefined : hookPattern;
        payload.thread_count = parsedCount;
      } else if (parsedCount && parsedCount >= 2) {
        payload.thread_mode = true;
        payload.hook_pattern = hookPattern === "auto" ? undefined : hookPattern;
        payload.thread_count = parsedCount;
      } else if (parsedCount === 1) {
        payload.thread_mode = true;
        payload.thread_count = 1;
      } else {
        payload.thread_mode = true;
        payload.hook_pattern = hookPattern === "auto" ? undefined : hookPattern;
      }

      if (style === "model" && selectedModelId) {
        payload.style = "model";
        payload.model_account_id = selectedModelId;
      } else if (style === "custom" && customInstructions) {
        payload.style = "custom";
        payload.custom_instructions = customInstructions;
      }

      const res = await fetch("/api/ai/generate-post", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "生成に失敗しました");
      }

      const data = await res.json();
      const threadPosts = data.data.thread_posts ?? data.data.posts?.map((p: { text: string }) => p.text) ?? [];
      setGeneratedThread(threadPosts);
      setGeneratedMediaUrls(data.data.media_urls ?? []);
      setLastSystemPrompt(data.data.system_prompt ?? null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "AI生成に失敗しました");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleInsertThread = () => {
    if (generatedThread.length === 1) {
      onInsert(generatedThread[0], generatedMediaUrls);
    } else {
      onInsert(generatedThread.join("\n\n---\n\n"), generatedMediaUrls);
    }
    setOpen(false);
    toast.success("投稿文を挿入しました");
  };

  const handleSaveDraft = async () => {
    if (generatedThread.length === 0) return;
    setIsSavingDraft(true);

    try {
      const isThread = generatedThread.length >= 2;
      const payload = {
        account_id: accountId,
        text: isThread ? generatedThread.join("\n\n") : generatedThread[0],
        hashtags: [],
        source: "ai" as const,
        media_urls: generatedMediaUrls,
        metadata: isThread
          ? { thread_posts: generatedThread, thread_mode: true, source_url: sourceUrl || undefined }
          : { source_url: sourceUrl || undefined },
      };

      const res = await fetch("/api/drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "保存に失敗しました");
      }

      toast.success("下書きに保存しました");
      setOpen(false);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "下書き保存に失敗しました");
    } finally {
      setIsSavingDraft(false);
    }
  };

  const handleCopy = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Sparkles className="mr-2 h-4 w-4" />
          AIで生成
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>AI投稿生成</DialogTitle>
          <DialogDescription>
            テーマやURLから投稿文を生成。スレッド数や文体を選択できます。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          {/* テーマ + URL 入力 */}
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium">テーマ・キーワード</label>
              <Input
                placeholder="例: AI活用の生産性向上、Claude Code活用術..."
                value={theme}
                onChange={(e) => setTheme(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-medium">URL（任意）</label>
              <div className="relative mt-1">
                <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="https://... 記事URLを入力すると本文を自動取得"
                  value={sourceUrl}
                  onChange={(e) => setSourceUrl(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
          </div>

          {/* スレッド構成選択 */}
          <div>
            <label className="text-sm font-medium">投稿構成</label>
            <div className="grid grid-cols-4 gap-1.5 mt-1">
              {[
                { value: "auto", label: "自動", desc: "AIが判断" },
                { value: "1", label: "単発", desc: "長文1投稿" },
                { value: "2", label: "2件", desc: "フック+解説" },
                { value: "3", label: "3件", desc: "標準" },
                { value: "4", label: "4件", desc: "詳細" },
                { value: "5", label: "5件", desc: "最高効率" },
                { value: "6", label: "6件", desc: "長スレッド" },
              ].map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setThreadCount(opt.value)}
                  className={`rounded-md border p-1.5 text-center text-xs transition-colors hover:bg-accent/50 ${
                    threadCount === opt.value ? "border-primary bg-accent/30" : ""
                  }`}
                >
                  <span className="font-medium block">{opt.label}</span>
                  <span className="text-muted-foreground text-[10px]">{opt.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* スタイルプリセット */}
          <div>
            <label className="text-sm font-medium">スタイルプリセット</label>
            <div className="grid grid-cols-2 gap-1.5 mt-1">
              {STYLE_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => applyPreset(preset)}
                  className={`rounded-md border p-2 text-left text-xs transition-colors hover:bg-accent/50 ${
                    selectedResearchModels.length === preset.models.length &&
                    preset.models.every((m) => selectedResearchModels.includes(m))
                      ? "border-primary bg-accent/30"
                      : ""
                  }`}
                >
                  <span className="font-medium">{preset.name}</span>
                  <p className="text-muted-foreground mt-0.5">{preset.description}</p>
                </button>
              ))}
            </div>
          </div>

          {/* フックパターン */}
          <div>
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">フックパターン</label>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs h-6 px-2"
                onClick={() => setShowHookCards(!showHookCards)}
              >
                {showHookCards ? "ドロップダウン" : "カード表示"}
              </Button>
            </div>
            {showHookCards ? (
              <div className="grid grid-cols-2 gap-1.5 mt-1">
                <button
                  type="button"
                  onClick={() => setHookPattern("auto")}
                  className={`rounded-md border p-2 text-left text-xs transition-colors hover:bg-accent/50 ${
                    hookPattern === "auto" ? "border-primary bg-accent/30" : ""
                  }`}
                >
                  <span className="font-medium">自動</span>
                  <p className="text-muted-foreground mt-0.5">AIが最適パターンを選択</p>
                </button>
                {HOOK_PATTERNS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setHookPattern(p.id)}
                    className={`rounded-md border p-2 text-left text-xs transition-colors hover:bg-accent/50 ${
                      hookPattern === p.id ? "border-primary bg-accent/30" : ""
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{p.id}: {p.name}</span>
                      <span className="flex items-center gap-0.5 text-muted-foreground">
                        <Heart className="h-3 w-3" />{p.avgLikes}
                      </span>
                    </div>
                    <p className="text-muted-foreground mt-0.5 line-clamp-1">{p.examples[0]}</p>
                  </button>
                ))}
              </div>
            ) : (
              <Select value={hookPattern} onValueChange={setHookPattern}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="選択..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">自動</SelectItem>
                  {HOOK_PATTERNS.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.id}: {p.name}（いいね{p.avgLikes}件）
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* 参考モデル */}
          <div>
            <label className="text-sm font-medium">参考モデル（複数選択可）</label>
            <div className="grid grid-cols-2 gap-1.5 mt-1">
              {[
                { username: "kudooo_ai", label: "くどう", sub: "Threads / 解説型" },
                { username: "asa_to_ame", label: "アオト", sub: "Threads / 短文型" },
                { username: "masahirochaen", label: "チャエン", sub: "X / 速報型" },
                { username: "SuguruKun_ai", label: "すぐる", sub: "X / Tips型" },
              ].map((m) => (
                <label
                  key={m.username}
                  className={`flex items-center gap-2 rounded-md border p-2 text-xs cursor-pointer transition-colors hover:bg-accent/50 ${
                    selectedResearchModels.includes(m.username) ? "border-primary bg-accent/30" : ""
                  }`}
                >
                  <Checkbox
                    checked={selectedResearchModels.includes(m.username)}
                    onCheckedChange={() => toggleResearchModel(m.username)}
                  />
                  <div>
                    <span className="font-medium">@{m.username}</span>
                    <p className="text-muted-foreground">{m.sub}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* 文体スタイル */}
          <div>
            <label className="text-sm font-medium">文体スタイル</label>
            <Select value={style} onValueChange={(v) => setStyle(v as "default" | "model" | "custom")}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default">自分のスタイル（デフォルト）</SelectItem>
                {modelAccounts.length > 0 && (
                  <SelectItem value="model">モデルアカウントのスタイル</SelectItem>
                )}
                <SelectItem value="custom">カスタム指示</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {style === "model" && modelAccounts.length > 0 && (
            <Select value={selectedModelId} onValueChange={setSelectedModelId}>
              <SelectTrigger>
                <SelectValue placeholder="モデルを選択..." />
              </SelectTrigger>
              <SelectContent>
                {modelAccounts.map((model) => (
                  <SelectItem key={model.id} value={model.id}>
                    @{model.username}{model.display_name ? ` (${model.display_name})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {style === "custom" && (
            <Textarea
              placeholder="例: です・ます調、絵文字少なめ、問いかけ形式..."
              value={customInstructions}
              onChange={(e) => setCustomInstructions(e.target.value)}
              className="min-h-[80px]"
            />
          )}

          {/* 生成ボタン */}
          <Button
            onClick={handleGenerate}
            disabled={isGenerating || (!theme.trim() && !sourceUrl.trim())}
            className="w-full"
          >
            {isGenerating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                生成中...
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                投稿を生成
              </>
            )}
          </Button>

          {/* 生成結果 */}
          {generatedThread.length > 0 && (
            <div className="space-y-3">
              {generatedMediaUrls.length > 0 && (
                <div>
                  <p className="text-sm font-medium mb-2">取得メディア</p>
                  <div className="flex gap-2 overflow-x-auto">
                    {generatedMediaUrls.map((url, i) => (
                      <img
                        key={i}
                        src={url}
                        alt={`メディア ${i + 1}`}
                        className="h-20 w-20 rounded-md object-cover border shrink-0"
                      />
                    ))}
                  </div>
                </div>
              )}

              <p className="text-sm font-medium">
                生成結果（{generatedThread.length === 1 ? "単発" : `${generatedThread.length}件スレッド`}）
              </p>

              {generatedThread.map((text, index) => (
                <Card key={index}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <Badge variant="outline" className="mb-2 text-xs">
                          {generatedThread.length === 1 ? "単発投稿" : `投稿${index + 1}`}
                        </Badge>
                        <p className="text-sm whitespace-pre-wrap">{text}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{text.length}文字</p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="shrink-0"
                        onClick={() => handleCopy(text, index)}
                      >
                        {copiedIndex === index ? (
                          <Check className="h-4 w-4 text-green-500" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}

              {/* アクションボタン */}
              <div className="grid grid-cols-2 gap-2">
                <Button variant="default" onClick={handleInsertThread}>
                  <Sparkles className="mr-2 h-4 w-4" />
                  エディタに挿入
                </Button>
                <Button
                  variant="outline"
                  onClick={handleSaveDraft}
                  disabled={isSavingDraft}
                >
                  {isSavingDraft ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
                  下書きに保存
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* 使用プロンプト確認 */}
        {lastSystemPrompt && (
          <Collapsible open={promptOpen} onOpenChange={setPromptOpen} className="mt-4 border-t pt-4">
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="w-full justify-between text-muted-foreground">
                <span className="flex items-center gap-2">
                  <Code className="h-4 w-4" />
                  使用プロンプトを確認
                </span>
                <ChevronDown className={`h-4 w-4 transition-transform ${promptOpen ? "rotate-180" : ""}`} />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <pre className="mt-2 max-h-64 overflow-auto rounded-md bg-muted p-3 text-xs whitespace-pre-wrap break-words">
                {lastSystemPrompt}
              </pre>
            </CollapsibleContent>
          </Collapsible>
        )}
      </DialogContent>
    </Dialog>
  );
}
