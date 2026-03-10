"use client";

/**
 * AIアシストボタン
 * Claude APIを使って投稿文を自動生成するUIコンポーネント
 */
import { useState, useEffect } from "react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Sparkles, Loader2, Copy, Check, Link2, Code, ChevronDown, Heart, Eye } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { HOOK_PATTERNS, THREAD_TEMPLATES, type HookPattern } from "@/lib/prompt-engine";

interface ModelAccount {
  id: string;
  username: string;
  display_name: string | null;
}

interface GeneratedPost {
  text: string;
  style: string;
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
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState("");
  const [style, setStyle] = useState<"default" | "model" | "custom">(
    "default"
  );
  const [selectedModelId, setSelectedModelId] = useState("");
  const [customInstructions, setCustomInstructions] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedPosts, setGeneratedPosts] = useState<GeneratedPost[]>([]);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  // URL tab state
  const [sourceUrl, setSourceUrl] = useState("");
  const [hookPattern, setHookPattern] = useState("auto");
  const [threadCount, setThreadCount] = useState("4");
  const [generatedThread, setGeneratedThread] = useState<string[]>([]);
  const [generatedMediaUrls, setGeneratedMediaUrls] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState("theme");
  const [isGeneratingUrl, setIsGeneratingUrl] = useState(false);
  const [copiedUrlIndex, setCopiedUrlIndex] = useState<number | null>(null);
  const [lastSystemPrompt, setLastSystemPrompt] = useState<string | null>(null);
  const [promptOpen, setPromptOpen] = useState(false);
  const [selectedResearchModels, setSelectedResearchModels] = useState<string[]>([]);
  const [showHookCards, setShowHookCards] = useState(false);

  const toggleResearchModel = (username: string) => {
    setSelectedResearchModels((prev) =>
      prev.includes(username)
        ? prev.filter((u) => u !== username)
        : [...prev, username]
    );
  };

  const applyPreset = (preset: (typeof STYLE_PRESETS)[number]) => {
    setSelectedResearchModels([...preset.models]);
    setHookPattern(preset.hook);
  };

  const handleGenerate = async () => {
    if (!theme.trim()) {
      toast.error("テーマを入力してください");
      return;
    }

    setIsGenerating(true);
    setGeneratedPosts([]);

    try {
      const res = await fetch("/api/ai/generate-post", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          theme,
          account_id: accountId,
          style,
          model_account_id:
            style === "model" ? selectedModelId : undefined,
          custom_instructions:
            style === "custom" ? customInstructions : undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "生成に失敗しました");
      }

      const data = await res.json();
      setGeneratedPosts(data.data.posts ?? []);
      setLastSystemPrompt(data.data.system_prompt ?? null);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "AI生成に失敗しました"
      );
    } finally {
      setIsGenerating(false);
    }
  };

  const handleInsert = (text: string) => {
    onInsert(text);
    setOpen(false);
    toast.success("投稿文を挿入しました");
  };

  const handleCopy = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const handleCopyUrl = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedUrlIndex(index);
    setTimeout(() => setCopiedUrlIndex(null), 2000);
  };

  const handleGenerateFromUrl = async () => {
    if (!sourceUrl.trim()) {
      toast.error("URLを入力してください");
      return;
    }

    setIsGeneratingUrl(true);
    setGeneratedThread([]);

    try {
      const res = await fetch("/api/ai/generate-post", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          theme: "URL-based",
          account_id: accountId,
          source_url: sourceUrl,
          hook_pattern: hookPattern === "auto" ? undefined : hookPattern,
          thread_count: parseInt(threadCount),
          selected_models: selectedResearchModels.length > 0 ? selectedResearchModels : undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "生成に失敗しました");
      }

      const data = await res.json();
      setGeneratedThread(data.data.thread_posts ?? []);
      setGeneratedMediaUrls(data.data.media_urls ?? []);
      setLastSystemPrompt(data.data.system_prompt ?? null);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "AI生成に失敗しました"
      );
    } finally {
      setIsGeneratingUrl(false);
    }
  };

  const handleInsertThread = () => {
    onInsert(generatedThread.join("\n\n---\n\n"), generatedMediaUrls);
    setOpen(false);
    toast.success("スレッドを挿入しました");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Sparkles className="mr-2 h-4 w-4" />
          AIで生成
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>✨ AI投稿生成</DialogTitle>
          <DialogDescription>
            テーマを入力すると、バズりやすい投稿文を3パターン生成します
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="theme">テーマから</TabsTrigger>
            <TabsTrigger value="url">URLから</TabsTrigger>
          </TabsList>

          <TabsContent value="theme" className="space-y-4 mt-4">
            {/* テーマ入力 */}
            <div>
              <label className="text-sm font-medium">テーマ・キーワード</label>
              <Input
                placeholder="例: AI活用の生産性向上、Threads運用のコツ..."
                value={theme}
                onChange={(e) => setTheme(e.target.value)}
                className="mt-1"
              />
            </div>

            {/* 文体スタイル選択 */}
            <div>
              <label className="text-sm font-medium">📝 文体スタイル</label>
              <Select
                value={style}
                onValueChange={(v) =>
                  setStyle(v as "default" | "model" | "custom")
                }
              >
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

            {/* モデルアカウント選択 */}
            {style === "model" && modelAccounts.length > 0 && (
              <div>
                <label className="text-sm font-medium">モデルアカウント</label>
                <Select
                  value={selectedModelId}
                  onValueChange={setSelectedModelId}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="モデルを選択..." />
                  </SelectTrigger>
                  <SelectContent>
                    {modelAccounts.map((model) => (
                      <SelectItem key={model.id} value={model.id}>
                        @{model.username}
                        {model.display_name ? ` (${model.display_name})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* カスタム指示 */}
            {style === "custom" && (
              <div>
                <label className="text-sm font-medium">カスタム指示</label>
                <Textarea
                  placeholder="例: です・ます調、絵文字少なめ、問いかけ形式..."
                  value={customInstructions}
                  onChange={(e) => setCustomInstructions(e.target.value)}
                  className="mt-1 min-h-[80px]"
                />
              </div>
            )}

            {/* 生成ボタン */}
            <Button
              onClick={handleGenerate}
              disabled={isGenerating || !theme.trim()}
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
                  投稿文を生成
                </>
              )}
            </Button>

            {/* 生成結果 */}
            {generatedPosts.length > 0 && (
              <div className="space-y-3">
                <p className="text-sm font-medium">生成結果（クリックで挿入）</p>
                {generatedPosts.map((post, index) => (
                  <Card
                    key={index}
                    className="cursor-pointer hover:border-primary transition-colors"
                    onClick={() => handleInsert(post.text)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <Badge variant="outline" className="mb-2 text-xs">
                            {post.style}
                          </Badge>
                          <p className="text-sm whitespace-pre-wrap">
                            {post.text}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {post.text.length}文字
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="shrink-0"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCopy(post.text, index);
                          }}
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
              </div>
            )}
          </TabsContent>

          <TabsContent value="url" className="space-y-4 mt-4">
            {/* URL入力 */}
            <div>
              <label className="text-sm font-medium">URL</label>
              <div className="relative mt-1">
                <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="https://..."
                  value={sourceUrl}
                  onChange={(e) => setSourceUrl(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>

            {/* スタイルプリセット */}
            <div>
              <label className="text-sm font-medium">スタイルプリセット</label>
              <div className="grid grid-cols-2 gap-2 mt-1">
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

            {/* フックパターン選択 */}
            <div>
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">フックパターン</label>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs h-6 px-2"
                  onClick={() => setShowHookCards(!showHookCards)}
                >
                  {showHookCards ? "ドロップダウン表示" : "カード表示"}
                </Button>
              </div>

              {showHookCards ? (
                <div className="grid grid-cols-2 gap-2 mt-1">
                  <button
                    type="button"
                    onClick={() => setHookPattern("auto")}
                    className={`rounded-md border p-2 text-left text-xs transition-colors hover:bg-accent/50 ${
                      hookPattern === "auto" ? "border-primary bg-accent/30" : ""
                    }`}
                  >
                    <span className="font-medium">自動</span>
                    <p className="text-muted-foreground mt-0.5">AIが最適なパターンを選択</p>
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
                        <span className="flex items-center gap-1 text-muted-foreground">
                          <Heart className="h-3 w-3" />
                          {p.avgLikes}
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

            {/* スレッド構成選択 */}
            <div>
              <label className="text-sm font-medium">スレッド構成</label>
              <div className="grid grid-cols-2 gap-2 mt-1">
                {([3, 4, 5, 6] as const).map((count) => {
                  const tmpl = THREAD_TEMPLATES[count];
                  if (!tmpl) return null;
                  return (
                    <button
                      key={count}
                      type="button"
                      onClick={() => setThreadCount(String(count))}
                      className={`rounded-md border p-2 text-left text-xs transition-colors hover:bg-accent/50 ${
                        threadCount === String(count) ? "border-primary bg-accent/30" : ""
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{count}件</span>
                        <Badge variant="secondary" className="text-[10px]">{tmpl.description}</Badge>
                      </div>
                      <div className="mt-1 space-y-0.5">
                        {tmpl.posts.slice(0, 3).map((post, i) => (
                          <p key={i} className="text-muted-foreground truncate">
                            {i + 1}. {post.role}
                          </p>
                        ))}
                        {tmpl.posts.length > 3 && (
                          <p className="text-muted-foreground">...他{tmpl.posts.length - 3}件</p>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 参考モデル選択 */}
            <div>
              <label className="text-sm font-medium">参考モデル（複数選択可）</label>
              <div className="grid grid-cols-2 gap-2 mt-1">
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

            {/* スレッド生成ボタン */}
            <Button
              onClick={handleGenerateFromUrl}
              disabled={isGeneratingUrl || !sourceUrl.trim()}
              className="w-full"
            >
              {isGeneratingUrl ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  生成中...
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  スレッド生成
                </>
              )}
            </Button>

            {/* URL生成結果 */}
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
                <p className="text-sm font-medium">生成結果</p>
                {generatedThread.map((text, index) => (
                  <Card key={index}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <Badge variant="outline" className="mb-2 text-xs">
                            投稿{index + 1}
                          </Badge>
                          <p className="text-sm whitespace-pre-wrap">
                            {text}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {text.length}文字
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="shrink-0"
                          onClick={() => handleCopyUrl(text, index)}
                        >
                          {copiedUrlIndex === index ? (
                            <Check className="h-4 w-4 text-green-500" />
                          ) : (
                            <Copy className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-2 w-full"
                        onClick={() => {
                          handleInsert(text);
                        }}
                      >
                        挿入
                      </Button>
                    </CardContent>
                  </Card>
                ))}
                <Button
                  variant="default"
                  className="w-full"
                  onClick={handleInsertThread}
                >
                  スレッドとして挿入
                </Button>
              </div>
            )}
          </TabsContent>
        </Tabs>

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
