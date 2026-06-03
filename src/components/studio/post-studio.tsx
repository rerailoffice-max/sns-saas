"use client";

/**
 * 投稿スタジオ本体（Phase 2a）
 *
 * フロー: 入力(URL/テーマ) → 関連動画リサーチ → 候補選択 → ツリー生成
 *   → プレビュー編集(本文/並べ替え/削除) → 承認(即時 or 予約, 複数アカウント)
 *
 * 生成エンジン:
 *   - cloud（既定）: /api/ai/generate-tree 同期で本文+Gemini図解
 *   - video（オーナー）: /api/ai/generate-tree が ai_generate_jobs へ enqueue →
 *     /api/ai/generate-post?job_id= を 5秒間隔ポーリング（Mac worker 完了待ち）
 */
import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Loader2, Search, Video, ImageIcon, ArrowUp, ArrowDown, Trash2,
  Send, CalendarClock, RefreshCw, Sparkles, ChevronLeft,
} from "lucide-react";

interface Account {
  id: string;
  platform: string;
  username: string;
  display_name: string | null;
}
interface Candidate {
  source_url: string;
  tweet_id: string;
  author_username: string;
  author_name: string;
  text: string;
  has_video: boolean;
  preview_url: string | null;
  like_count: number;
  why: string;
}
interface TreePost {
  order: number;
  text: string;
  media_url: string | null;
}
type Step = "input" | "candidates" | "generating" | "preview";
type Engine = "cloud" | "video";

export function PostStudio({ accounts }: { accounts: Account[] }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("input");
  const [engine, setEngine] = useState<Engine>("cloud");
  const [seed, setSeed] = useState(""); // URL or theme
  const [threadCount, setThreadCount] = useState(4);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selectedSource, setSelectedSource] = useState<Candidate | null>(null);
  const [posts, setPosts] = useState<TreePost[]>([]);

  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [crossPost, setCrossPost] = useState<string[]>([]);
  const [scheduleAt, setScheduleAt] = useState("");

  const isUrl = /^https?:\/\//i.test(seed.trim()) || /(?:x\.com|twitter\.com)\//i.test(seed);

  const apiErr = async (res: Response, fallback: string) => {
    const d = await res.json().catch(() => ({}));
    return d.error ?? fallback;
  };

  // ── 関連動画リサーチ ──
  const handleResearch = useCallback(async () => {
    if (!seed.trim()) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/ai/research-videos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isUrl ? { source_url: seed.trim(), limit: 10 } : { theme: seed.trim(), limit: 10 }),
      });
      if (!res.ok) throw new Error(await apiErr(res, "リサーチに失敗しました"));
      const { data } = await res.json();
      setCandidates(data.candidates ?? []);
      setStep("candidates");
      if ((data.candidates ?? []).length === 0) toast.message("候補が見つかりませんでした。テーマを変えるか直接生成してください。");
    } catch (e) {
      setError(e instanceof Error ? e.message : "リサーチに失敗しました");
    } finally {
      setBusy(false);
    }
  }, [seed, isUrl]);

  // ── ツリー生成（候補 or 直接） ──
  const generate = useCallback(async (cand: Candidate | null) => {
    if (!accountId) { toast.error("投稿アカウントを選択してください"); return; }
    setSelectedSource(cand);
    setStep("generating"); setBusy(true); setError(null); setProgress("生成を開始しています…");

    const useEngine: Engine = engine;
    const sourceUrl = cand?.source_url ?? (isUrl ? seed.trim() : undefined);
    const sourceText = cand?.text ?? (!isUrl ? seed.trim() : undefined);

    try {
      if (useEngine === "video") {
        if (!sourceUrl) throw new Error("動画エンジンには元のX URLが必要です");
        const res = await fetch("/api/ai/generate-tree", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ account_id: accountId, engine: "video", source_url: sourceUrl, thread_count: threadCount, source_text: sourceText }),
        });
        if (!res.ok) throw new Error(await apiErr(res, "ジョブ作成に失敗しました"));
        const { data } = await res.json();
        await pollJob(data.job_id);
      } else {
        const res = await fetch("/api/ai/generate-tree", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            account_id: accountId, engine: "cloud", thread_count: threadCount,
            source_url: sourceUrl, source_text: sourceText, with_image: true,
          }),
        });
        if (!res.ok) throw new Error(await apiErr(res, "生成に失敗しました"));
        const { data } = await res.json();
        setPosts((data.posts ?? []).map((p: TreePost, i: number) => ({ order: i + 1, text: p.text, media_url: p.media_url ?? null })));
        setStep("preview");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "生成に失敗しました");
      setStep(cand ? "candidates" : "input");
    } finally {
      setBusy(false);
    }
  }, [accountId, engine, isUrl, seed, threadCount]);

  // ── 動画ジョブのポーリング ──
  const pollJob = async (jobId: string) => {
    const started = Date.now();
    while (Date.now() - started < 10 * 60 * 1000) {
      await new Promise((r) => setTimeout(r, 5000));
      const res = await fetch(`/api/ai/generate-post?job_id=${jobId}`);
      if (!res.ok) continue;
      const { data: job } = await res.json();
      if (job.progress) setProgress(job.progress);
      if (job.status === "done") {
        const rp = job.result_json?.posts ?? [];
        setPosts(rp.map((p: { text: string; media_url?: string }, i: number) => ({ order: i + 1, text: p.text, media_url: p.media_url ?? null })));
        setStep("preview");
        return;
      }
      if (job.status === "error") throw new Error(job.error ?? "ワーカーでエラーが発生しました");
    }
    throw new Error("生成がタイムアウトしました（10分）");
  };

  // ── プレビュー編集 ──
  const updatePost = (i: number, text: string) => setPosts((ps) => ps.map((p, idx) => (idx === i ? { ...p, text } : p)));
  const movePost = (i: number, dir: -1 | 1) => setPosts((ps) => {
    const j = i + dir; if (j < 0 || j >= ps.length) return ps;
    const next = [...ps]; [next[i], next[j]] = [next[j], next[i]];
    return next.map((p, idx) => ({ ...p, order: idx + 1 }));
  });
  const deletePost = (i: number) => setPosts((ps) => ps.filter((_, idx) => idx !== i).map((p, idx) => ({ ...p, order: idx + 1 })));

  const validPosts = posts.filter((p) => p.text.trim().length > 0);
  const mediaUrls = posts.map((p) => p.media_url).filter((u): u is string => !!u);

  // ── 即時投稿 ──
  const handlePublish = async () => {
    if (validPosts.length === 0 || !accountId) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/posts/publish", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          account_id: accountId,
          thread_posts: validPosts.map((p) => p.text),
          media_urls: mediaUrls,
          media_type: mediaUrls.length > 0 ? "image" : undefined,
          cross_post_accounts: crossPost.length > 0 ? crossPost : undefined,
        }),
      });
      if (!res.ok) throw new Error(await apiErr(res, "投稿に失敗しました"));
      toast.success("投稿しました！");
      router.push("/dashboard");
    } catch (e) {
      setError(e instanceof Error ? e.message : "投稿に失敗しました");
    } finally { setBusy(false); }
  };

  // ── 予約投稿（下書き→scheduled-posts） ──
  const handleSchedule = async () => {
    if (validPosts.length === 0 || !accountId || !scheduleAt) return;
    setBusy(true); setError(null);
    try {
      const draftRes = await fetch("/api/drafts", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          account_id: accountId,
          text: validPosts.map((p) => p.text).join("\n\n"),
          hashtags: [], source: "manual", media_urls: mediaUrls,
          metadata: { thread_posts: validPosts.map((p) => p.text), thread_mode: true, studio: true },
        }),
      });
      if (!draftRes.ok) throw new Error(await apiErr(draftRes, "下書き保存に失敗しました"));
      const draftData = await draftRes.json();
      const draftId = draftData.draft?.id;
      if (!draftId) throw new Error("下書きIDが取得できませんでした");

      const schedRes = await fetch("/api/scheduled-posts", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draft_id: draftId, account_id: accountId, scheduled_at: new Date(scheduleAt).toISOString() }),
      });
      if (!schedRes.ok) throw new Error(await apiErr(schedRes, "予約に失敗しました"));
      toast.success("予約投稿を設定しました");
      router.push("/schedule");
    } catch (e) {
      setError(e instanceof Error ? e.message : "予約に失敗しました");
    } finally { setBusy(false); }
  };

  if (accounts.length === 0) {
    return (
      <Card><CardContent className="py-12 text-center text-muted-foreground">
        投稿アカウントが未連携です。設定 → アカウント連携から Threads を接続してください。
      </CardContent></Card>
    );
  }

  const otherAccounts = accounts.filter((a) => a.id !== accountId);

  return (
    <div className="space-y-5">
      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">{error}</div>
      )}

      {/* アカウント選択（全ステップ共通） */}
      <Card><CardContent className="flex flex-wrap items-end gap-4 py-4">
        <div className="space-y-1">
          <Label>投稿アカウント</Label>
          <Select value={accountId} onValueChange={setAccountId}>
            <SelectTrigger className="w-64"><SelectValue placeholder="アカウント" /></SelectTrigger>
            <SelectContent>
              {accounts.map((a) => (
                <SelectItem key={a.id} value={a.id}>{a.platform} / @{a.username}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {otherAccounts.length > 0 && (
          <div className="space-y-1">
            <Label>同時投稿（任意）</Label>
            <div className="flex flex-wrap gap-3 pt-1">
              {otherAccounts.map((a) => (
                <label key={a.id} className="flex items-center gap-1.5 text-sm">
                  <Checkbox
                    checked={crossPost.includes(a.id)}
                    onCheckedChange={(v) => setCrossPost((c) => v ? [...c, a.id] : c.filter((x) => x !== a.id))}
                  />
                  {a.platform}/@{a.username}
                </label>
              ))}
            </div>
          </div>
        )}
      </CardContent></Card>

      {/* STEP: 入力 */}
      {step === "input" && (
        <Card><CardContent className="space-y-4 py-5">
          <div className="space-y-1">
            <Label>URL または テーマ</Label>
            <Textarea
              value={seed} onChange={(e) => setSeed(e.target.value)}
              placeholder="例: https://x.com/.../status/123 / または「Claude Code 公式プラグイン」"
              rows={2}
            />
            <p className="text-xs text-muted-foreground">
              {isUrl ? "X投稿URLを検出。関連動画をリサーチします。" : "テーマから関連動画をリサーチします。"}
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1">
              <Label>生成エンジン</Label>
              <Select value={engine} onValueChange={(v) => setEngine(v as Engine)}>
                <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cloud"><span className="flex items-center gap-1.5"><ImageIcon className="h-3.5 w-3.5" />画像＋テキスト（クラウド）</span></SelectItem>
                  <SelectItem value="video"><span className="flex items-center gap-1.5"><Video className="h-3.5 w-3.5" />字幕動画ツリー（オーナー）</span></SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>投稿数</Label>
              <Select value={String(threadCount)} onValueChange={(v) => setThreadCount(Number(v))}>
                <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                <SelectContent>{[2, 3, 4, 5, 6].map((n) => <SelectItem key={n} value={String(n)}>{n}本</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleResearch} disabled={busy || !seed.trim()}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
              関連動画をリサーチ
            </Button>
            <Button variant="secondary" onClick={() => generate(null)} disabled={busy || !seed.trim()}>
              <Sparkles className="mr-2 h-4 w-4" />リサーチせず直接生成
            </Button>
          </div>
        </CardContent></Card>
      )}

      {/* STEP: 候補 */}
      {step === "candidates" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">関連動画の候補（{candidates.length}）</h2>
            <Button variant="ghost" size="sm" onClick={() => setStep("input")}><ChevronLeft className="mr-1 h-4 w-4" />戻る</Button>
          </div>
          {candidates.length === 0 && <p className="text-sm text-muted-foreground">候補なし。テーマを変えるか「直接生成」してください。</p>}
          <div className="grid gap-3 sm:grid-cols-2">
            {candidates.map((c) => (
              <Card key={c.tweet_id} className="overflow-hidden">
                <CardContent className="space-y-2 p-3">
                  <div className="flex gap-3">
                    {c.preview_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={c.preview_url} alt="" className="h-20 w-28 flex-shrink-0 rounded object-cover" />
                    )}
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-1.5">
                        {c.has_video && <Badge variant="secondary" className="text-[10px]">動画</Badge>}
                        <span className="truncate text-xs text-muted-foreground">@{c.author_username}</span>
                      </div>
                      <p className="line-clamp-3 text-xs">{c.text}</p>
                      <p className="text-[10px] text-muted-foreground">{c.why}</p>
                    </div>
                  </div>
                  <Button size="sm" className="w-full" onClick={() => generate(c)} disabled={busy}>
                    <Sparkles className="mr-1.5 h-3.5 w-3.5" />この動画で生成
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* STEP: 生成中 */}
      {step === "generating" && (
        <Card><CardContent className="flex flex-col items-center gap-3 py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{progress || "生成中…"}</p>
          {engine === "video" && <p className="text-xs text-muted-foreground">字幕動画は数分かかります（Macワーカー処理中）</p>}
        </CardContent></Card>
      )}

      {/* STEP: プレビュー編集 */}
      {step === "preview" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">ツリープレビュー（{validPosts.length}投稿）</h2>
            <Button variant="ghost" size="sm" onClick={() => generate(selectedSource)} disabled={busy}>
              <RefreshCw className="mr-1 h-4 w-4" />再生成
            </Button>
          </div>
          {posts.map((p, i) => (
            <Card key={i}>
              <CardContent className="space-y-2 py-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">投稿 {i + 1}</span>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => movePost(i, -1)} disabled={i === 0}><ArrowUp className="h-3.5 w-3.5" /></Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => movePost(i, 1)} disabled={i === posts.length - 1}><ArrowDown className="h-3.5 w-3.5" /></Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deletePost(i)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                </div>
                <Textarea value={p.text} onChange={(e) => updatePost(i, e.target.value)} rows={4} />
                <div className="text-right text-[10px] text-muted-foreground">{p.text.length}字</div>
                {p.media_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.media_url} alt="" className="max-h-48 rounded border object-contain" />
                )}
              </CardContent>
            </Card>
          ))}

          {/* 承認アクション */}
          <Card><CardContent className="flex flex-wrap items-end gap-3 py-4">
            <Button onClick={handlePublish} disabled={busy || validPosts.length === 0}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}今すぐ投稿
            </Button>
            <div className="flex items-end gap-2">
              <div className="space-y-1">
                <Label htmlFor="sched">予約日時</Label>
                <Input id="sched" type="datetime-local" value={scheduleAt} onChange={(e) => setScheduleAt(e.target.value)} className="w-56" />
              </div>
              <Button variant="secondary" onClick={handleSchedule} disabled={busy || !scheduleAt || validPosts.length === 0}>
                <CalendarClock className="mr-2 h-4 w-4" />予約
              </Button>
            </div>
            <Button variant="ghost" onClick={() => setStep("input")} disabled={busy}>最初から</Button>
          </CardContent></Card>
        </div>
      )}
    </div>
  );
}
