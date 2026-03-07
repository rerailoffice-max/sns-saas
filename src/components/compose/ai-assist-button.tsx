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
import { Sparkles, Loader2, Copy, Check } from "lucide-react";
import { toast } from "sonner";

interface ModelAccount {
  id: string;
  username: string;
  display_name: string | null;
}

interface GeneratedPost {
  text: string;
  style: string;
}

interface AiAssistButtonProps {
  accountId: string;
  onInsert: (text: string) => void;
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

        <div className="space-y-4">
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
        </div>
      </DialogContent>
    </Dialog>
  );
}
