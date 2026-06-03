"use client";

/**
 * リール台本ジェネレーター
 * URL入力 → Claude API → 3パターンの台本を表示
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Sparkles,
  Loader2,
  Copy,
  Check,
  Video,
  Clock,
  MessageCircle,
  Type,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { toast } from "sonner";

type Mode = "standard" | "breaking" | "comparison";
type InputMode = "url" | "text";

interface ReelScript {
  pattern: string;
  patternLabel: string;
  title: string;
  contentPillar: string;
  hook: string;
  problem: string;
  mainContent: string;
  conclusion: string;
  cta: string;
  estimatedDuration: string;
  telopKeywords: string[];
  expectedComments: string[];
}

function formatScriptForCopy(script: ReelScript): string {
  return `■タイトル：${script.title}
■コンテンツ柱：${script.contentPillar}
■冒頭フック（2秒）：
${script.hook}
■問題提起（5秒）：
${script.problem}
■本題（15〜30秒）：
${script.mainContent}
■オチ（5秒）：
${script.conclusion}
■CTA（3秒）：
${script.cta}
■想定尺：${script.estimatedDuration}
■テロップで強調すべきキーワード：${script.telopKeywords.join("、")}
■想定されるコメント：
${script.expectedComments.map((c, i) => `${i + 1}. ${c}`).join("\n")}`;
}

/**
 * 【画面収録: ○○】マーカーをハイライト表示するためにパース
 */
function renderMainContent(text: string) {
  const parts = text.split(/(【画面収録[^】]*】)/g);
  return parts.map((part, i) => {
    if (part.startsWith("【画面収録")) {
      return (
        <span
          key={i}
          className="inline-block my-1 rounded-md border border-blue-300 bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 dark:border-blue-700 dark:bg-blue-950 dark:text-blue-300"
        >
          {part}
        </span>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

function ScriptCard({
  script,
  copiedPattern,
  onCopy,
}: {
  script: ReelScript;
  copiedPattern: string | null;
  onCopy: (pattern: string) => void;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <CardTitle className="text-lg">{script.title}</CardTitle>
            <CardDescription className="flex items-center gap-2">
              <Badge
                variant={
                  script.contentPillar === "衝撃"
                    ? "destructive"
                    : script.contentPillar === "解説"
                      ? "default"
                      : "secondary"
                }
              >
                {script.contentPillar}
              </Badge>
              <span className="flex items-center gap-1 text-xs">
                <Clock className="h-3 w-3" />
                {script.estimatedDuration}
              </span>
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onCopy(script.pattern)}
          >
            {copiedPattern === script.pattern ? (
              <>
                <Check className="mr-1 h-3 w-3 text-green-500" />
                コピー済
              </>
            ) : (
              <>
                <Copy className="mr-1 h-3 w-3" />
                コピー
              </>
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 冒頭フック */}
        <div>
          <p className="mb-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            冒頭フック（2秒）
          </p>
          <p className="rounded-lg border-l-4 border-red-500 bg-red-50 p-3 text-sm font-medium dark:bg-red-950/30">
            {script.hook}
          </p>
        </div>

        {/* 問題提起 */}
        <div>
          <p className="mb-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            問題提起（5秒）
          </p>
          <p className="rounded-lg border-l-4 border-yellow-500 bg-yellow-50 p-3 text-sm dark:bg-yellow-950/30">
            {script.problem}
          </p>
        </div>

        {/* 本題 */}
        <div>
          <p className="mb-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            本題（15〜30秒）
          </p>
          <div className="rounded-lg border-l-4 border-blue-500 bg-blue-50 p-3 text-sm whitespace-pre-wrap dark:bg-blue-950/30">
            {renderMainContent(script.mainContent)}
          </div>
        </div>

        {/* オチ */}
        <div>
          <p className="mb-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            オチ（5秒）
          </p>
          <p className="rounded-lg border-l-4 border-green-500 bg-green-50 p-3 text-sm font-medium dark:bg-green-950/30">
            {script.conclusion}
          </p>
        </div>

        {/* CTA */}
        <div>
          <p className="mb-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            CTA（3秒）
          </p>
          <p className="rounded-lg border-l-4 border-purple-500 bg-purple-50 p-3 text-sm dark:bg-purple-950/30">
            {script.cta}
          </p>
        </div>

        {/* テロップキーワード */}
        <div>
          <p className="mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            <Type className="mr-1 inline h-3 w-3" />
            テロップキーワード
          </p>
          <div className="flex flex-wrap gap-2">
            {script.telopKeywords.map((kw, i) => (
              <Badge key={i} variant="outline">
                {kw}
              </Badge>
            ))}
          </div>
        </div>

        {/* 想定コメント */}
        <div>
          <p className="mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            <MessageCircle className="mr-1 inline h-3 w-3" />
            想定されるコメント
          </p>
          <ul className="space-y-1">
            {script.expectedComments.map((comment, i) => (
              <li
                key={i}
                className="rounded-md bg-muted p-2 text-xs text-muted-foreground"
              >
                💬 {comment}
              </li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}

export function ReelScriptGenerator() {
  const [inputMode, setInputMode] = useState<InputMode>("url");
  const [urlText, setUrlText] = useState("");
  const [manualText, setManualText] = useState("");
  const [mode, setMode] = useState<Mode>("standard");
  const [additionalContext, setAdditionalContext] = useState("");
  const [showContext, setShowContext] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [scripts, setScripts] = useState<ReelScript[]>([]);
  const [copiedPattern, setCopiedPattern] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  const handleGenerate = async () => {
    const urls =
      inputMode === "url"
        ? urlText
            .split("\n")
            .map((u) => u.trim())
            .filter(Boolean)
        : [];
    const text = inputMode === "text" ? manualText.trim() : "";

    if (urls.length === 0 && !text) {
      toast.error(
        inputMode === "url"
          ? "URLを入力してください"
          : "テキストを入力してください"
      );
      return;
    }

    // URL形式の簡易チェック
    if (inputMode === "url") {
      const invalidUrls = urls.filter(
        (u) => !/^https?:\/\/(x\.com|twitter\.com|mobile\.twitter\.com)\//.test(u)
      );
      if (invalidUrls.length > 0) {
        toast.error("X(Twitter)のURLを入力してください");
        return;
      }
    }

    setIsGenerating(true);
    setScripts([]);
    setWarnings([]);

    try {
      const res = await fetch("/api/ai/generate-reel-script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          urls: urls.length > 0 ? urls : undefined,
          manualText: text || undefined,
          mode,
          additionalContext: additionalContext.trim() || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error ?? "生成に失敗しました");
      }

      setScripts(data.data?.scripts ?? []);
      if (data.warnings) {
        setWarnings(data.warnings);
      }

      if (data.data?.scripts?.length > 0) {
        toast.success("台本を3パターン生成しました");
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "リール台本の生成に失敗しました"
      );
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = (pattern: string) => {
    const script = scripts.find((s) => s.pattern === pattern);
    if (!script) return;
    navigator.clipboard.writeText(formatScriptForCopy(script));
    setCopiedPattern(pattern);
    toast.success("台本をコピーしました");
    setTimeout(() => setCopiedPattern(null), 2000);
  };

  return (
    <div className="space-y-6">
      {/* 入力セクション */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">元ネタを入力</CardTitle>
          <CardDescription>
            X(Twitter)の投稿URLを貼り付けるか、テキストを直接入力してください
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 入力モード切替 */}
          <div className="flex gap-2">
            <Button
              variant={inputMode === "url" ? "default" : "outline"}
              size="sm"
              onClick={() => setInputMode("url")}
            >
              URL入力
            </Button>
            <Button
              variant={inputMode === "text" ? "default" : "outline"}
              size="sm"
              onClick={() => setInputMode("text")}
            >
              テキスト直接入力
            </Button>
          </div>

          {/* URL入力 */}
          {inputMode === "url" && (
            <div>
              <Textarea
                placeholder={`https://x.com/username/status/123456789\nhttps://x.com/username/status/987654321\n\n※1行に1つのURLを入力（最大5件）`}
                value={urlText}
                onChange={(e) => setUrlText(e.target.value)}
                className="min-h-[120px] font-mono text-sm"
              />
            </div>
          )}

          {/* テキスト直接入力 */}
          {inputMode === "text" && (
            <div>
              <Textarea
                placeholder="X投稿の内容をここに貼り付けてください..."
                value={manualText}
                onChange={(e) => setManualText(e.target.value)}
                className="min-h-[120px]"
              />
            </div>
          )}

          {/* モード選択 */}
          <div>
            <label className="text-sm font-medium">台本モード</label>
            <Select
              value={mode}
              onValueChange={(v) => setMode(v as Mode)}
            >
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="standard">通常モード</SelectItem>
                <SelectItem value="breaking">
                  速報系（アップデート情報）
                </SelectItem>
                <SelectItem value="comparison">
                  比較系（ChatGPT vs Claude等）
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* 補足コメント（トグル） */}
          <div>
            <button
              type="button"
              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setShowContext(!showContext)}
            >
              {showContext ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
              補足コメントを追加（任意）
            </button>
            {showContext && (
              <Textarea
                placeholder="例: この投稿の中で特に○○の部分が気になった、今週は衝撃系が多かったので解説系にしてほしい..."
                value={additionalContext}
                onChange={(e) => setAdditionalContext(e.target.value)}
                className="mt-2 min-h-[80px]"
              />
            )}
          </div>

          {/* 生成ボタン */}
          <Button
            onClick={handleGenerate}
            disabled={isGenerating}
            className="w-full"
            size="lg"
          >
            {isGenerating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                台本を生成中...（30秒ほどかかります）
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                リール台本を生成
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* 警告表示 */}
      {warnings.length > 0 && (
        <div className="rounded-lg border border-yellow-300 bg-yellow-50 p-3 dark:border-yellow-700 dark:bg-yellow-950/30">
          <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
            一部のURLからテキストを取得できませんでした:
          </p>
          <ul className="mt-1 text-xs text-yellow-700 dark:text-yellow-300">
            {warnings.map((w, i) => (
              <li key={i}>- {w}</li>
            ))}
          </ul>
        </div>
      )}

      {/* 生成結果 */}
      {scripts.length > 0 && (
        <div className="space-y-4">
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <Video className="h-5 w-5 text-purple-500" />
            生成結果（3パターン）
          </h2>

          <Tabs defaultValue="A">
            <TabsList className="grid w-full grid-cols-3">
              {scripts.map((script) => (
                <TabsTrigger key={script.pattern} value={script.pattern}>
                  {script.patternLabel}
                </TabsTrigger>
              ))}
            </TabsList>
            {scripts.map((script) => (
              <TabsContent key={script.pattern} value={script.pattern}>
                <ScriptCard
                  script={script}
                  copiedPattern={copiedPattern}
                  onCopy={handleCopy}
                />
              </TabsContent>
            ))}
          </Tabs>
        </div>
      )}
    </div>
  );
}
