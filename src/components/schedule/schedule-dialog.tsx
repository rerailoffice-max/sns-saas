"use client";

/**
 * 予約投稿作成ダイアログ
 * - 下書き一覧からの選択
 * - SNSアカウント選択
 * - 日時ピッカー
 * - 予約投稿の作成
 */

import { useState, useCallback, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, AlertCircle, CalendarPlus } from "lucide-react";
import type { Draft, SocialAccount } from "@/types/database";

// ============================================================
// 型定義
// ============================================================

interface ScheduleDialogProps {
  /** ダイアログの開閉状態 */
  open: boolean;
  /** ダイアログを閉じるコールバック */
  onOpenChange: (open: boolean) => void;
  /** 利用可能な下書き一覧（status=draft のもの） */
  drafts: Draft[];
  /** 接続済みSNSアカウント一覧 */
  accounts: SocialAccount[];
  /** 初期選択日時（YYYY-MM-DD形式、日付クリック時に渡される） */
  defaultDate?: string;
  /** 作成成功時のコールバック */
  onCreated?: () => void;
}

// ============================================================
// ユーティリティ
// ============================================================

/** ローカル日時をISO文字列に変換（datetime-local入力用） */
function toLocalDatetimeString(date: string, time?: string): string {
  if (time) {
    return `${date}T${time}`;
  }
  // デフォルトは翌日の9:00
  return `${date}T09:00`;
}

// ============================================================
// 予約投稿ダイアログコンポーネント
// ============================================================

export function ScheduleDialog({
  open,
  onOpenChange,
  drafts,
  accounts,
  defaultDate,
  onCreated,
}: ScheduleDialogProps) {
  // フォーム状態
  const [selectedDraftId, setSelectedDraftId] = useState<string>("");
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [scheduledAt, setScheduledAt] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // defaultDateが変わったらスケジュール日時を更新
  useEffect(() => {
    if (defaultDate) {
      setScheduledAt(toLocalDatetimeString(defaultDate));
    }
  }, [defaultDate]);

  // ダイアログが開いたときに状態をリセット
  useEffect(() => {
    if (open) {
      setSelectedDraftId("");
      setSelectedAccountId("");
      setError(null);
      if (defaultDate) {
        setScheduledAt(toLocalDatetimeString(defaultDate));
      } else {
        setScheduledAt("");
      }
    }
  }, [open, defaultDate]);

  // 下書き選択時にアカウントを自動設定
  const handleDraftChange = useCallback(
    (draftId: string) => {
      setSelectedDraftId(draftId);
      const draft = drafts.find((d) => d.id === draftId);
      if (draft && draft.account_id) {
        setSelectedAccountId(draft.account_id);
      }
    },
    [drafts]
  );

  // 予約投稿作成
  const handleSubmit = useCallback(async () => {
    setError(null);

    // バリデーション
    if (!selectedDraftId) {
      setError("下書きを選択してください");
      return;
    }
    if (!selectedAccountId) {
      setError("SNSアカウントを選択してください");
      return;
    }
    if (!scheduledAt) {
      setError("予約日時を入力してください");
      return;
    }

    // 未来の日時かチェック
    const scheduledDate = new Date(scheduledAt);
    if (scheduledDate <= new Date()) {
      setError("予約日時は現在より未来の日時を指定してください");
      return;
    }

    setIsSubmitting(true);

    try {
      const res = await fetch("/api/scheduled-posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          draft_id: selectedDraftId,
          account_id: selectedAccountId,
          scheduled_at: scheduledDate.toISOString(),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "予約投稿の作成に失敗しました");
      }

      // 成功: ダイアログを閉じてリロード
      onOpenChange(false);
      onCreated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "予約投稿の作成に失敗しました");
    } finally {
      setIsSubmitting(false);
    }
  }, [selectedDraftId, selectedAccountId, scheduledAt, onOpenChange, onCreated]);

  // 選択中の下書きのプレビュー
  const selectedDraft = drafts.find((d) => d.id === selectedDraftId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarPlus className="h-5 w-5" />
            予約投稿の作成
          </DialogTitle>
          <DialogDescription>
            下書きを選んで投稿日時を設定します。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* エラー表示 */}
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* 下書き選択 */}
          <div className="space-y-2">
            <Label htmlFor="draft-select">下書き</Label>
            {drafts.length > 0 ? (
              <Select value={selectedDraftId} onValueChange={handleDraftChange}>
                <SelectTrigger id="draft-select">
                  <SelectValue placeholder="下書きを選択..." />
                </SelectTrigger>
                <SelectContent>
                  {drafts.map((draft) => (
                    <SelectItem key={draft.id} value={draft.id}>
                      <span className="truncate block max-w-[380px]">
                        {draft.text.slice(0, 60)}
                        {draft.text.length > 60 ? "..." : ""}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <p className="text-sm text-muted-foreground py-2">
                利用可能な下書きがありません。先に投稿を作成してください。
              </p>
            )}
          </div>

          {/* 下書きプレビュー */}
          {selectedDraft && (
            <div className="bg-muted/50 rounded-lg p-3">
              <p className="text-xs font-medium text-muted-foreground mb-1">プレビュー</p>
              <p className="text-sm whitespace-pre-wrap line-clamp-4">{selectedDraft.text}</p>
              {selectedDraft.hashtags && selectedDraft.hashtags.length > 0 && (
                <p className="text-xs text-blue-600 mt-1">
                  {selectedDraft.hashtags.join(" ")}
                </p>
              )}
            </div>
          )}

          {/* SNSアカウント選択 */}
          <div className="space-y-2">
            <Label htmlFor="account-select">投稿先アカウント</Label>
            {accounts.length > 0 ? (
              <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
                <SelectTrigger id="account-select">
                  <SelectValue placeholder="アカウントを選択..." />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      <span className="flex items-center gap-1">
                        <span className="capitalize text-xs text-muted-foreground">
                          [{account.platform}]
                        </span>
                        @{account.username ?? account.display_name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <p className="text-sm text-muted-foreground py-2">
                SNSアカウントが接続されていません。設定から接続してください。
              </p>
            )}
          </div>

          {/* 予約日時 */}
          <div className="space-y-2">
            <Label htmlFor="scheduled-at">予約日時</Label>
            <Input
              id="scheduled-at"
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              min={new Date().toISOString().slice(0, 16)}
            />
            <p className="text-xs text-muted-foreground">
              指定した日時に自動で投稿されます。
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            キャンセル
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || drafts.length === 0 || accounts.length === 0}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                作成中...
              </>
            ) : (
              "予約を作成"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
