"use client";

/**
 * RSS自動投稿設定コンポーネント
 * ON/OFF・投稿先・件数・待機時間を管理
 */

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Rss, Zap } from "lucide-react";
import { toast } from "sonner";

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
  posts_per_cycle: number;
  schedule_delay_minutes: number;
  rss_feeds: Array<{ url: string; source: string }>;
}

const DELAY_OPTIONS = [
  { value: "15", label: "15分後" },
  { value: "30", label: "30分後" },
  { value: "60", label: "1時間後" },
  { value: "120", label: "2時間後" },
];

export function AutoPostSettings({ accounts }: AutoPostSettingsProps) {
  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch("/api/settings/auto-post");
      if (res.ok) {
        const { data } = await res.json();
        setSettings(data);
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
      setSettings(data);
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

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2">
              <Rss className="h-5 w-5" />
              RSS自動投稿
            </CardTitle>
            <CardDescription>
              AIニュースを自動で取得し、スレッド投稿を生成・予約します
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

        {/* 1回あたりの生成数 */}
        <div className="space-y-2">
          <label className="text-sm font-medium">1回あたりの生成数</label>
          <Select
            value={String(settings?.posts_per_cycle ?? 1)}
            onValueChange={(value) =>
              saveSettings({ posts_per_cycle: parseInt(value) })
            }
            disabled={isSaving}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">1件</SelectItem>
              <SelectItem value="2">2件</SelectItem>
              <SelectItem value="3">3件</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            4時間ごとに、この件数のスレッド投稿を自動生成します
          </p>
        </div>

        {/* 投稿までの待機時間 */}
        <div className="space-y-2">
          <label className="text-sm font-medium">生成から投稿までの待機時間</label>
          <Select
            value={String(settings?.schedule_delay_minutes ?? 30)}
            onValueChange={(value) =>
              saveSettings({ schedule_delay_minutes: parseInt(value) })
            }
            disabled={isSaving}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DELAY_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            生成された下書きは確認・編集可能です。待機時間が過ぎると自動投稿されます
          </p>
        </div>

        {/* スケジュール情報 */}
        <div className="rounded-lg bg-muted/50 p-4 space-y-2">
          <p className="text-sm font-medium">実行スケジュール</p>
          <div className="flex gap-2 flex-wrap">
            {["8:00", "12:00", "16:00", "20:00", "0:00"].map((t) => (
              <Badge key={t} variant="outline">
                {t}
              </Badge>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            上記の時刻（JST）にRSSフィードを取得し、AIがトレンド記事をピックアップして投稿を生成します
          </p>
        </div>

        {/* RSSフィード情報 */}
        <div className="rounded-lg bg-muted/50 p-4 space-y-2">
          <p className="text-sm font-medium">取得中のRSSフィード</p>
          <div className="space-y-1">
            {(settings?.rss_feeds && settings.rss_feeds.length > 0
              ? settings.rss_feeds
              : [
                  { source: "The Verge", url: "" },
                  { source: "TechCrunch", url: "" },
                  { source: "Ars Technica", url: "" },
                  { source: "VentureBeat", url: "" },
                  { source: "WIRED", url: "" },
                ]
            ).map((feed, i) => (
              <div key={i} className="flex items-center gap-2">
                <Rss className="h-3 w-3 text-muted-foreground" />
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
  );
}
