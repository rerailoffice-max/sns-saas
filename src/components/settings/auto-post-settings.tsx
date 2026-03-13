"use client";

/**
 * 自動投稿設定コンポーネント
 * ai-news-botフローに合致: X収集 + RSS → テーマ選定 → 下書き → 承認 → 投稿
 */

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Rss, Zap, ShieldCheck, Clock, Search, Info } from "lucide-react";
import { toast } from "sonner";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface SocialAccount {
  id: string;
  platform: string;
  username: string;
}

interface AutoPostSettingsProps {
  accounts: SocialAccount[];
}

interface SettingsData {
  is_enabled: boolean;
  account_id: string | null;
  approval_required: boolean;
  schedule_start_hour: number;
  schedule_end_hour: number;
  schedule_interval_minutes: number;
  rss_feeds: Array<{ url: string; source: string }>;
  x_accounts: string[];
}

const INTERVAL_OPTIONS = [
  { value: "30", label: "30分ごと" },
  { value: "60", label: "1時間ごと" },
  { value: "120", label: "2時間ごと" },
  { value: "240", label: "4時間ごと" },
];

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => ({
  value: String(i),
  label: `${String(i).padStart(2, "0")}:00`,
}));

const DEFAULT_RSS_FEEDS = [
  { source: "The Verge", url: "" },
  { source: "TechCrunch", url: "" },
  { source: "Ars Technica", url: "" },
  { source: "VentureBeat", url: "" },
  { source: "WIRED", url: "" },
];

const DEFAULT_X_ACCOUNTS = [
  "@masahirochaen",
  "@SuguruKun_ai",
  "@kajikent",
  "@genel_ai",
  "@kawai_design",
  "@taziku_co",
  "@7_eito_7",
];

function computeScheduleTimes(start: number, end: number, interval: number): string[] {
  const times: string[] = [];
  for (let h = start; h <= end; h++) {
    for (let m = 0; m < 60; m += interval) {
      if (h === start && m === 0) { times.push(`${String(h).padStart(2, "0")}:00`); continue; }
      if (h * 60 + m > end * 60) break;
      if (h * 60 + m >= start * 60) {
        times.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
      }
    }
  }
  if (times[0] !== `${String(start).padStart(2, "0")}:00`) {
    times.unshift(`${String(start).padStart(2, "0")}:00`);
  }
  return [...new Set(times)].sort();
}

export function AutoPostSettings({ accounts }: AutoPostSettingsProps) {
  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch("/api/settings/auto-post");
      if (res.ok) {
        const { data } = await res.json();
        setSettings({
          is_enabled: data.is_enabled ?? false,
          account_id: data.account_id ?? null,
          approval_required: data.approval_required ?? true,
          schedule_start_hour: data.schedule_start_hour ?? 8,
          schedule_end_hour: data.schedule_end_hour ?? 22,
          schedule_interval_minutes: data.schedule_interval_minutes ?? 60,
          rss_feeds: data.rss_feeds ?? [],
          x_accounts: data.x_accounts ?? [],
        });
      }
    } catch {
      /* ignore */
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const saveSettings = async (updates: Partial<SettingsData>) => {
    setIsSaving(true);
    try {
      const res = await fetch("/api/settings/auto-post", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error ?? "保存に失敗しました");
        return;
      }
      const { data } = await res.json();
      setSettings((prev) => prev ? { ...prev, ...data } : data);
      toast.success("設定を保存しました");
    } catch {
      toast.error("通信エラーが発生しました");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const isEnabled = settings?.is_enabled ?? false;
  const scheduleTimes = computeScheduleTimes(
    settings?.schedule_start_hour ?? 8,
    settings?.schedule_end_hour ?? 22,
    settings?.schedule_interval_minutes ?? 60
  );

  return (
    <TooltipProvider>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2">
                <Rss className="h-5 w-5" />
                AI自動投稿
              </CardTitle>
              <CardDescription>
                X参考アカウント + RSSフィードからAIニュースを収集し、テーマ選定・下書き・投稿を自動化します
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {isEnabled && (
                <Badge variant="default" className="bg-green-600">
                  <Zap className="h-3 w-3 mr-1" />
                  稼働中
                </Badge>
              )}
              <Switch
                checked={isEnabled}
                disabled={isSaving || (!isEnabled && !settings?.account_id && accounts.length > 0)}
                onCheckedChange={(checked) => {
                  if (checked && !settings?.account_id) {
                    toast.error("先に投稿先アカウントを選択してください");
                    return;
                  }
                  saveSettings({ is_enabled: checked });
                }}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* 投稿先アカウント */}
          <div className="space-y-2">
            <label className="text-sm font-medium">投稿先アカウント</label>
            {accounts.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                SNSアカウントを接続してください
              </p>
            ) : (
              <Select
                value={settings?.account_id ?? ""}
                onValueChange={(value) => saveSettings({ account_id: value })}
                disabled={isSaving}
              >
                <SelectTrigger>
                  <SelectValue placeholder="アカウントを選択" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((acc) => (
                    <SelectItem key={acc.id} value={acc.id}>
                      @{acc.username} ({acc.platform})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* 承認フロー */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium">承認フロー</label>
              <Tooltip>
                <TooltipTrigger>
                  <Info className="h-3.5 w-3.5 text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-[280px]">
                  <p className="text-xs">ONの場合、AIが生成した下書きを管理者DMに送信し、承認を待ってから投稿します。OFFの場合は生成後すぐに予約投稿されます。</p>
                </TooltipContent>
              </Tooltip>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className={`h-4 w-4 ${settings?.approval_required ? "text-green-600" : "text-muted-foreground"}`} />
                <div>
                  <p className="text-sm font-medium">
                    {settings?.approval_required ? "承認してから投稿" : "自動投稿（承認なし）"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {settings?.approval_required
                      ? "下書き → DM通知 → 承認後に投稿"
                      : "下書き生成後、自動で予約投稿"}
                  </p>
                </div>
              </div>
              <Switch
                checked={settings?.approval_required ?? true}
                onCheckedChange={(checked) => saveSettings({ approval_required: checked })}
                disabled={isSaving}
              />
            </div>
          </div>

          {/* テーマ選定ルール */}
          <div className="rounded-lg border border-amber-200 bg-amber-50/50 dark:bg-amber-950/20 dark:border-amber-900/50 p-3 space-y-1">
            <p className="text-sm font-medium flex items-center gap-1.5">
              <Search className="h-4 w-4 text-amber-600" />
              テーマ選定ルール
            </p>
            <p className="text-xs text-muted-foreground">
              1回の実行で1テーマのみ選定。「公式発表・業界ニュース・データ」のみ投稿対象とし、
              個人の手法・作品・解説記事は自動でネタストックに保存されます。
            </p>
          </div>

          {/* 実行スケジュール */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <label className="text-sm font-medium">実行スケジュール</label>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">開始時刻</label>
                <Select
                  value={String(settings?.schedule_start_hour ?? 8)}
                  onValueChange={(v) => saveSettings({ schedule_start_hour: parseInt(v) })}
                  disabled={isSaving}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {HOUR_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">終了時刻</label>
                <Select
                  value={String(settings?.schedule_end_hour ?? 22)}
                  onValueChange={(v) => saveSettings({ schedule_end_hour: parseInt(v) })}
                  disabled={isSaving}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {HOUR_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">実行間隔</label>
                <Select
                  value={String(settings?.schedule_interval_minutes ?? 60)}
                  onValueChange={(v) => saveSettings({ schedule_interval_minutes: parseInt(v) })}
                  disabled={isSaving}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {INTERVAL_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="rounded-lg bg-muted/50 p-3 space-y-2">
              <div className="flex gap-2 flex-wrap">
                {scheduleTimes.map((t) => (
                  <Badge key={t} variant="outline" className="text-xs font-mono">
                    {t}
                  </Badge>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                上記の時刻（JST）にデータを収集し、AIが1テーマを選定して投稿を生成します
              </p>
            </div>
          </div>

          {/* データソース: X参考アカウント */}
          <div className="rounded-lg bg-muted/50 p-4 space-y-2">
            <p className="text-sm font-medium flex items-center gap-1.5">
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
              X参考アカウント
            </p>
            <div className="flex flex-wrap gap-1.5">
              {(settings?.x_accounts && settings.x_accounts.length > 0
                ? settings.x_accounts
                : DEFAULT_X_ACCOUNTS
              ).map((handle, i) => (
                <Badge key={i} variant="secondary" className="text-xs">
                  {handle}
                </Badge>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              上記アカウントの最新投稿からAI関連のテーマを収集します
            </p>
          </div>

          {/* データソース: RSSフィード */}
          <div className="rounded-lg bg-muted/50 p-4 space-y-2">
            <p className="text-sm font-medium flex items-center gap-1.5">
              <Rss className="h-3.5 w-3.5" />
              RSSフィード
            </p>
            <div className="space-y-1">
              {(settings?.rss_feeds && settings.rss_feeds.length > 0
                ? settings.rss_feeds
                : DEFAULT_RSS_FEEDS
              ).map((feed, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Rss className="h-3 w-3 text-muted-foreground shrink-0" />
                  <span className="text-sm">{feed.source}</span>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              AI関連の英語ニュースフィードから自動取得します
            </p>
          </div>

          {isSaving && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              保存中...
            </div>
          )}
        </CardContent>
      </Card>
    </TooltipProvider>
  );
}
