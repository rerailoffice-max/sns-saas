"use client";

/**
 * 投稿エディタコンポーネント
 * テキスト入力・文字数カウント・アカウント選択・下書き保存
 */
import { useState, useRef, useCallback } from "react";
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
import { EngagementScore } from "./engagement-score";
import { AiAssistButton } from "./ai-assist-button";
import { HashtagSuggest } from "./hashtag-suggest";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Save, Send, Loader2, AlertCircle, X, Plus, ImagePlus, Share2, CalendarClock } from "lucide-react";
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

interface InitialDraft {
  id: string;
  text: string;
  media_urls: string[];
  account_id: string;
  hashtags: string[];
  thread_posts?: string[];
}

interface PostEditorProps {
  accounts: Account[];
  hashtagSuggestions?: HashtagStats[];
  modelAccounts?: ModelAccount[];
  initialDraft?: InitialDraft | null;
}

const MAX_CHARS = 500; // Threads文字数制限

export function PostEditor({ accounts, hashtagSuggestions = [], modelAccounts = [], initialDraft }: PostEditorProps) {
  const router = useRouter();
  const [draftId, setDraftId] = useState<string | null>(initialDraft?.id ?? null);
  const hasInitialThread = !!(initialDraft?.thread_posts && initialDraft.thread_posts.length > 0);
  const [text, setText] = useState(hasInitialThread ? "" : (initialDraft?.text ?? ""));
  const [threadMode, setThreadMode] = useState(hasInitialThread);
  const [threadPosts, setThreadPosts] = useState<string[]>(
    hasInitialThread ? initialDraft!.thread_posts! : []
  );
  const [mediaUrls, setMediaUrls] = useState<string[]>(initialDraft?.media_urls ?? []);
  const [mediaTypes, setMediaTypes] = useState<string[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState(
    initialDraft?.account_id ?? accounts[0]?.id ?? ""
  );
  const [isSaving, setIsSaving] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isScheduling, setIsScheduling] = useState(false);
  const [schedulePopoverOpen, setSchedulePopoverOpen] = useState(false);
  const [scheduleDate, setScheduleDate] = useState(() => {
    const d = new Date();
    d.setHours(d.getHours() + 1);
    d.setMinutes(0, 0, 0);
    const offset = d.getTimezoneOffset();
    const local = new Date(d.getTime() - offset * 60 * 1000);
    return local.toISOString().slice(0, 16);
  });
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [crossPostAccounts, setCrossPostAccounts] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadFiles = useCallback(async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;

    setIsUploading(true);
    setError(null);

    try {
      const newUrls: string[] = [];
      const newTypes: string[] = [];
      for (const file of fileArray) {
        // Step 1: 署名付きアップロードURLを取得
        const metaRes = await fetch("/api/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileName: file.name,
            fileType: file.type,
            fileSize: file.size,
          }),
        });
        if (!metaRes.ok) {
          let errMsg = "アップロードに失敗しました";
          try {
            const errData = await metaRes.json();
            errMsg = errData.error ?? errMsg;
          } catch {
            errMsg = `アップロードに失敗しました (${metaRes.status})`;
          }
          throw new Error(errMsg);
        }
        const { signedUrl, publicUrl, type } = await metaRes.json();

        // Step 2: Supabase Storageに直接アップロード
        const uploadRes = await fetch(signedUrl, {
          method: "PUT",
          headers: { "Content-Type": file.type },
          body: file,
        });
        if (!uploadRes.ok) {
          throw new Error("ファイルのアップロードに失敗しました");
        }

        newUrls.push(publicUrl);
        newTypes.push(type ?? "image");
      }
      setMediaUrls((prev) => [...prev, ...newUrls]);
      setMediaTypes((prev) => [...prev, ...newTypes]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "アップロードに失敗しました");
    } finally {
      setIsUploading(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files.length > 0) {
      uploadFiles(e.dataTransfer.files);
    }
  }, [uploadFiles]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const files: File[] = [];
    for (const item of Array.from(items)) {
      if (item.kind === "file" && item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) files.push(file);
      }
    }
    if (files.length > 0) {
      e.preventDefault();
      uploadFiles(files);
    }
  }, [uploadFiles]);

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
        const parts = text.split(/\n\n+/).map((p) => p.trim()).filter(Boolean);
        setThreadPosts(parts.length > 1 ? parts : [text]);
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

  const handleAiInsert = (generatedText: string, newMediaUrls?: string[]) => {
    if (newMediaUrls && newMediaUrls.length > 0) {
      setMediaUrls(newMediaUrls);
    }
    if (generatedText.includes("---")) {
      const parts = generatedText
        .split("---")
        .map((p) => p.trim())
        .filter(Boolean);
      if (parts.length >= 2) {
        setThreadMode(true);
        setThreadPosts(parts);
        setText("");
      } else {
        setText(parts[0] || generatedText);
      }
    } else {
      if (threadMode) {
        setThreadPosts([generatedText]);
      } else {
        setText(generatedText);
      }
    }
  };

  /** 下書き保存 */
  const handleSaveDraft = async () => {
    if (!canSubmit) return;
    setIsSaving(true);
    setError(null);

    const validDraftThreadPosts = threadPosts.filter((p) => p.trim().length > 0);
    const useDraftThread = threadMode && validDraftThreadPosts.length >= 2;

    const payload = useDraftThread
      ? {
          account_id: selectedAccountId,
          text: validDraftThreadPosts.join("\n\n"),
          hashtags,
          source: "manual" as const,
          media_urls: mediaUrls,
          metadata: { thread_posts: validDraftThreadPosts, thread_mode: true },
        }
      : {
          account_id: selectedAccountId,
          text: threadMode && validDraftThreadPosts.length === 1 ? validDraftThreadPosts[0] : text,
          hashtags,
          source: "manual" as const,
          media_urls: mediaUrls,
          metadata: {},
        };

    try {
      const url = draftId ? `/api/drafts/${draftId}` : "/api/drafts";
      const method = draftId ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "保存に失敗しました");
      }

      const data = await res.json();
      if (!draftId && data.draft?.id) {
        setDraftId(data.draft.id);
      }

      toast.success(draftId ? "下書きを更新しました" : "下書きを保存しました");
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

    const allAccounts = [selectedAccountId, ...crossPostAccounts];

    const detectedMediaType = mediaTypes.includes("video") ? "video" : mediaUrls.length > 1 ? "carousel" : mediaUrls.length === 1 ? "image" : undefined;

    const validThreadPosts = threadPosts.filter((p) => p.trim().length > 0);
    const useThread = threadMode && validThreadPosts.length >= 2;

    const payload = useThread
      ? { account_id: selectedAccountId, thread_posts: validThreadPosts, media_urls: mediaUrls, media_type: detectedMediaType, cross_post_accounts: crossPostAccounts.length > 0 ? crossPostAccounts : undefined }
      : { account_id: selectedAccountId, text: useThread ? validThreadPosts[0] : text, hashtags, media_urls: mediaUrls, media_type: detectedMediaType, cross_post_accounts: crossPostAccounts.length > 0 ? crossPostAccounts : undefined };

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

      toast.success(
        allAccounts.length > 1
          ? `${allAccounts.length}アカウントに投稿しました！`
          : "投稿しました！"
      );
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "投稿に失敗しました");
    } finally {
      setIsPublishing(false);
    }
  };

  /** 予約投稿 */
  const handleSchedule = async () => {
    if (!canSubmit || !scheduleDate) return;
    setIsScheduling(true);
    setError(null);

    try {
      // 1. 下書き保存（自動）
      const scheduleThreadPosts = threadPosts.filter((p) => p.trim().length > 0);
      const useScheduleThread = threadMode && scheduleThreadPosts.length >= 2;

      const draftPayload = useScheduleThread
        ? {
            account_id: selectedAccountId,
            text: scheduleThreadPosts.join("\n\n"),
            hashtags,
            source: "manual" as const,
            media_urls: mediaUrls,
            metadata: { thread_posts: scheduleThreadPosts, thread_mode: true },
          }
        : {
            account_id: selectedAccountId,
            text: threadMode && scheduleThreadPosts.length === 1 ? scheduleThreadPosts[0] : text,
            hashtags,
            source: "manual" as const,
            media_urls: mediaUrls,
            metadata: {},
          };

      const draftUrl = draftId ? `/api/drafts/${draftId}` : "/api/drafts";
      const draftMethod = draftId ? "PUT" : "POST";
      const draftRes = await fetch(draftUrl, {
        method: draftMethod,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draftPayload),
      });

      if (!draftRes.ok) {
        const data = await draftRes.json();
        throw new Error(data.error ?? "下書き保存に失敗しました");
      }

      const draftData = await draftRes.json();
      const savedDraftId = draftId ?? draftData.draft?.id;
      if (!savedDraftId) throw new Error("下書きIDが取得できませんでした");
      if (!draftId) setDraftId(savedDraftId);

      // 2. 予約投稿作成
      const utcDate = new Date(scheduleDate).toISOString();
      const scheduleRes = await fetch("/api/scheduled-posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          draft_id: savedDraftId,
          account_id: selectedAccountId,
          scheduled_at: utcDate,
        }),
      });

      if (!scheduleRes.ok) {
        const data = await scheduleRes.json().catch(() => ({}));
        throw new Error(data.error ?? "予約に失敗しました");
      }

      toast.success("予約投稿を設定しました");
      setSchedulePopoverOpen(false);
      router.push("/schedule");
    } catch (err) {
      setError(err instanceof Error ? err.message : "予約に失敗しました");
    } finally {
      setIsScheduling(false);
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
    <div className="grid gap-6 lg:grid-cols-2 min-w-0" onPaste={handlePaste}>
      {/* エディタ */}
      <div className="space-y-4 min-w-0">
        <Card className="overflow-hidden">
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

            {/* クロスポスト */}
            {accounts.length > 1 && (
              <div className="rounded-md border p-3 space-y-2">
                <label className="text-xs font-medium flex items-center gap-1.5 text-muted-foreground">
                  <Share2 className="h-3.5 w-3.5" />
                  クロスポスト（同時投稿先）
                </label>
                <div className="flex flex-wrap gap-2">
                  {accounts
                    .filter((a) => a.id !== selectedAccountId)
                    .map((a) => (
                      <label
                        key={a.id}
                        className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs cursor-pointer transition-colors ${
                          crossPostAccounts.includes(a.id)
                            ? "border-primary bg-accent/30"
                            : "hover:bg-accent/50"
                        }`}
                      >
                        <Checkbox
                          checked={crossPostAccounts.includes(a.id)}
                          onCheckedChange={(checked) => {
                            setCrossPostAccounts((prev) =>
                              checked
                                ? [...prev, a.id]
                                : prev.filter((id) => id !== a.id)
                            );
                          }}
                        />
                        <Badge variant="outline" className="text-[10px] capitalize">
                          {a.platform}
                        </Badge>
                        @{a.username}
                      </label>
                    ))}
                </div>
              </div>
            )}

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

            {/* メディアアップロード & プレビュー */}
            <div>
              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onClick={() => fileInputRef.current?.click()}
                className={`relative flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-4 cursor-pointer transition-colors ${
                  isDragging
                    ? "border-primary bg-primary/5"
                    : "border-muted-foreground/25 hover:border-muted-foreground/50"
                }`}
              >
                {isUploading ? (
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                ) : (
                  <ImagePlus className="h-6 w-6 text-muted-foreground" />
                )}
                <p className="text-sm text-muted-foreground">
                  {isUploading
                    ? "アップロード中..."
                    : "画像・動画をドラッグ&ドロップ、またはクリックして選択"}
                </p>
                <p className="text-xs text-muted-foreground/60">
                  画像: 8MB以下 / 動画: 25MB以下（JPEG, PNG, GIF, WebP, MP4）
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/quicktime"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files) uploadFiles(e.target.files);
                    e.target.value = "";
                  }}
                />
              </div>

              {mediaUrls.length > 0 && (
                <div className="mt-3">
                  <p className="text-sm font-medium mb-2">添付メディア</p>
                  <div className="flex gap-2 overflow-x-auto overflow-y-hidden max-w-full">
                    {mediaUrls.map((url, i) => {
                      const isVideo = /\.(mp4|mov)$/i.test(url) || url.includes("video");
                      return (
                        <div key={i} className="relative shrink-0">
                          {isVideo ? (
                            <video
                              src={url}
                              className="h-24 w-24 rounded-md object-cover border"
                              muted
                            />
                          ) : (
                            <img
                              src={url}
                              alt={`メディア ${i + 1}`}
                              className="h-24 w-24 rounded-md object-cover border"
                            />
                          )}
                          <button
                            type="button"
                            className="absolute -top-1 -right-1 rounded-full bg-destructive text-destructive-foreground h-5 w-5 flex items-center justify-center text-xs"
                            onClick={(e) => {
                              e.stopPropagation();
                              setMediaUrls((prev) => prev.filter((_, idx) => idx !== i));
                              setMediaTypes((prev) => prev.filter((_, idx) => idx !== i));
                            }}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

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
            <div className="flex gap-2 flex-wrap">
              <Button
                variant="outline"
                onClick={handleSaveDraft}
                disabled={!canSubmit || isSaving || isPublishing || isScheduling}
              >
                {isSaving ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                下書き保存
              </Button>

              <Popover open={schedulePopoverOpen} onOpenChange={setSchedulePopoverOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    disabled={!canSubmit || isSaving || isPublishing || isScheduling}
                  >
                    {isScheduling ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <CalendarClock className="mr-2 h-4 w-4" />
                    )}
                    予約投稿
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-72 p-4" align="start">
                  <div className="space-y-3">
                    <Label htmlFor="schedule-at">投稿日時</Label>
                    <Input
                      id="schedule-at"
                      type="datetime-local"
                      value={scheduleDate}
                      onChange={(e) => setScheduleDate(e.target.value)}
                      min={new Date().toISOString().slice(0, 16)}
                    />
                    <Button
                      className="w-full"
                      onClick={handleSchedule}
                      disabled={isScheduling || !scheduleDate}
                    >
                      {isScheduling ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <CalendarClock className="mr-2 h-4 w-4" />
                      )}
                      この日時で予約する
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>

              <Button
                onClick={handlePublish}
                disabled={!canSubmit || isSaving || isPublishing || isScheduling}
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

      {/* プレビュー + エンゲージメント予測 */}
      <div className="space-y-4">
        <PostPreview
          text={threadMode ? threadPosts.join("\n\n") : text}
          username={accounts.find((a) => a.id === selectedAccountId)?.username ?? "user"}
          displayName={accounts.find((a) => a.id === selectedAccountId)?.display_name ?? "ユーザー"}
        />
        <EngagementScore
          text={threadMode ? "" : text}
          threadPosts={threadMode ? threadPosts : undefined}
          hasMedia={mediaUrls.length > 0}
          platform={(accounts.find((a) => a.id === selectedAccountId)?.platform as "threads" | "x") ?? "threads"}
        />
      </div>
    </div>
  );
}
