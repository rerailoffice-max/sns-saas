"use client";

/**
 * 投稿エディタコンポーネント
 * テキスト入力・文字数カウント・アカウント選択・下書き保存
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { CharCounter } from "./char-counter";
import { PostPreview } from "./post-preview";
import { AiAssistButton } from "./ai-assist-button";
import { HashtagSuggest } from "./hashtag-suggest";
import { Save, Send, Loader2, AlertCircle, X, Plus } from "lucide-react";
import { toast } from "sonner";
import type { HashtagStats } from "@/lib/hashtag-recommend";

interface Account {
  id: string;
  platform: string;
  username: string;
  display_name: string | null;
}

interface ModelAccount {
  id: string;
  username: string;
  display_name: string | null;
}

interface PostEditorProps {
  accounts: Account[];
  hashtagSuggestions?: HashtagStats[];
  modelAccounts?: ModelAccount[];
}

const MAX_CHARS = 500; // Threads文字数制限

export function PostEditor({ accounts, hashtagSuggestions = [], modelAccounts = [] }: PostEditorProps) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [threadMode, setThreadMode] = useState(false);
  const [threadPosts, setThreadPosts] = useState<string[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState(accounts[0]?.id ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const charCount = text.length;
  const isOverLimit = charCount > MAX_CHARS;
  const threadCanSubmit =
    threadPosts.length > 0 &&
    threadPosts.every((p) => p.trim().length > 0) &&
    threadPosts.every((p) => p.length <= MAX_CHARS) &&
    selectedAccountId;
  const canSubmit = threadMode
    ? threadCanSubmit
    : text.trim().length > 0 && selectedAccountId && !isOverLimit;

  // ハッシュタグ抽出
  const contentForHashtags = threadMode ? threadPosts.join(" ") : text;
  const hashtags = contentForHashtags.match(/#[\w\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]+/g) ?? [];

  const handleThreadModeChange = (checked: boolean) => {
    setThreadMode(checked);
    if (checked) {
      if (text.trim()) {
        setThreadPosts([text]);
        setText("");
      } else if (threadPosts.length === 0) {
        setThreadPosts([""]);
      }
    } else {
      if (threadPosts.length > 0) {
        setText(threadPosts.join("\n\n"));
        setThreadPosts([]);
      }
    }
  };

  const handleAiInsert = (generatedText: string) => {
    if (generatedText.includes("---")) {
      const parts = generatedText
        .split("---")
        .map((p) => p.trim())
        .filter(Boolean);
      if (parts.length > 0) {
        setThreadMode(true);
        setThreadPosts(parts);
        setText("");
      } else {
        setText(generatedText);
      }
    } else {
      setText(generatedText);
    }
  };

  /** 下書き保存 */
  const handleSaveDraft = async () => {
    if (!canSubmit) return;
    setIsSaving(true);
    setError(null);

    const payload = threadMode
      ? {
          account_id: selectedAccountId,
          text: threadPosts.join("\n\n"),
          hashtags,
          source: "manual" as const,
          thread_posts: threadPosts,
        }
      : {
          account_id: selectedAccountId,
          text,
          hashtags,
          source: "manual" as const,
        };

    try {
      const res = await fetch("/api/drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "保存に失敗しました");
      }

      toast.success("下書きを保存しました");
      router.push("/drafts");
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存に失敗しました");
    } finally {
      setIsSaving(false);
    }
  };

  /** 即時投稿 */
  const handlePublish = async () => {
    if (!canSubmit) return;
    setIsPublishing(true);
    setError(null);

    const payload = threadMode
      ? { account_id: selectedAccountId, thread_posts: threadPosts }
      : { account_id: selectedAccountId, text, hashtags };

    try {
      const res = await fetch("/api/posts/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "投稿に失敗しました");
      }

      toast.success("投稿しました！");
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "投稿に失敗しました");
    } finally {
      setIsPublishing(false);
    }
  };

  if (accounts.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <AlertCircle className="mx-auto h-12 w-12 text-muted-foreground" />
          <h3 className="mt-4 text-lg font-medium">SNSアカウントが接続されていません</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            投稿するには、まずSNSアカウントを接続してください。
          </p>
          <Button
            variant="outline"
            className="mt-4"
            onClick={() => router.push("/settings/accounts")}
          >
            アカウントを接続
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* エディタ */}
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">投稿内容</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* アカウント選択 */}
            <div>
              <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
                <SelectTrigger>
                  <SelectValue placeholder="投稿するアカウントを選択" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      <span className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs capitalize">
                          {account.platform}
                        </Badge>
                        @{account.username}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* スレッドモード切替 */}
            <div className="flex items-center justify-between">
              <label htmlFor="thread-mode" className="text-sm font-medium cursor-pointer">
                スレッドモード
              </label>
              <Switch
                id="thread-mode"
                checked={threadMode}
                onCheckedChange={handleThreadModeChange}
              />
            </div>

            {/* テキスト入力 */}
            {threadMode ? (
              <div className="space-y-4">
                {threadPosts.map((post, index) => (
                  <div key={index} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">投稿{index + 1}</span>
                      <div className="flex items-center gap-2">
                        {index === 0 && post.length > 100 && (
                          <Badge variant="destructive" className="text-xs">
                            フック100字超過
                          </Badge>
                        )}
                        <CharCounter current={post.length} max={MAX_CHARS} />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0"
                          onClick={() =>
                            setThreadPosts((prev) => prev.filter((_, i) => i !== index))
                          }
                          disabled={threadPosts.length <= 1}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    <Textarea
                      placeholder={`投稿${index + 1}の内容`}
                      value={post}
                      onChange={(e) =>
                        setThreadPosts((prev) => {
                          const next = [...prev];
                          next[index] = e.target.value;
                          return next;
                        })
                      }
                      className="min-h-[120px] resize-none"
                    />
                  </div>
                ))}
                {threadPosts.length < 5 && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => setThreadPosts((prev) => [...prev, ""])}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    投稿を追加
                  </Button>
                )}
                <div className="flex gap-1">
                  {hashtags.map((tag, i) => (
                    <Badge key={i} variant="secondary" className="text-xs">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </div>
            ) : (
              <div>
                <Textarea
                  placeholder="いま何を考えていますか？"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  className="min-h-[200px] resize-none"
                />
                <div className="mt-2 flex items-center justify-between">
                  <div className="flex gap-1">
                    {hashtags.map((tag, i) => (
                      <Badge key={i} variant="secondary" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                  <CharCounter current={charCount} max={MAX_CHARS} />
                </div>
              </div>
            )}

            {/* AIアシスト & ハッシュタグ提案 */}
            <div className="flex items-center gap-2">
              <AiAssistButton
                accountId={selectedAccountId}
                onInsert={handleAiInsert}
                modelAccounts={modelAccounts}
              />
            </div>

            {/* ハッシュタグ提案 */}
            {hashtagSuggestions.length > 0 && (
              <HashtagSuggest
                suggestions={hashtagSuggestions
                  .filter(
                    (s) =>
                      !contentForHashtags.toLowerCase().includes(s.tag.toLowerCase())
                  )
                  .slice(0, 5)}
                onInsert={(tag) => {
                  if (threadMode) {
                    setThreadPosts((prev) => {
                      const last = prev.length - 1;
                      if (last >= 0) {
                        const next = [...prev];
                        next[last] = (next[last] || "") + " " + tag;
                        return next;
                      }
                      return prev;
                    });
                  } else {
                    setText((prev) => prev + " " + tag);
                  }
                }}
              />
            )}

            {/* エラー表示 */}
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {/* アクションボタン */}
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={handleSaveDraft}
                disabled={!canSubmit || isSaving || isPublishing}
              >
                {isSaving ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                下書き保存
              </Button>
              <Button
                onClick={handlePublish}
                disabled={!canSubmit || isSaving || isPublishing}
              >
                {isPublishing ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Send className="mr-2 h-4 w-4" />
                )}
                {threadMode ? "スレッド投稿する" : "投稿する"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* プレビュー */}
      <div>
        <PostPreview
          text={threadMode ? threadPosts.join("\n\n") : text}
          username={accounts.find((a) => a.id === selectedAccountId)?.username ?? "user"}
          displayName={accounts.find((a) => a.id === selectedAccountId)?.display_name ?? "ユーザー"}
        />
      </div>
    </div>
  );
}
