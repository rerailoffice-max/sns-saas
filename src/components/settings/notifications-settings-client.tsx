"use client";

/**
 * 通知設定クライアントコンポーネント
 * 各種通知のトグルスイッチ
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Bell, Save, Mail, AlertTriangle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

interface NotificationsSettingsClientProps {
  emailNotifications: boolean;
}

export function NotificationsSettingsClient({
  emailNotifications: initialEmailNotifications,
}: NotificationsSettingsClientProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  // 通知設定の状態管理
  const [settings, setSettings] = useState({
    emailNotifications: initialEmailNotifications,
    // 将来追加用（現在はUI表示のみ）
    postSuccess: true,
    postFailed: true,
    weeklyReport: false,
    newFeatures: true,
  });

  function updateSetting(key: keyof typeof settings, value: boolean) {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email_notifications: settings.emailNotifications,
        }),
      });

      if (res.ok) {
        toast.success("通知設定を更新しました");
        router.refresh();
      } else {
        toast.error("更新に失敗しました");
      }
    } catch {
      toast.error("エラーが発生しました");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* メール通知マスタースイッチ */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-4 w-4" />
            メール通知
          </CardTitle>
          <CardDescription>メールでの通知受信をまとめて管理します</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5">
              <Label
                htmlFor="emailMaster"
                className="cursor-pointer font-medium"
              >
                メール通知を有効にする
              </Label>
              <p className="text-xs text-muted-foreground">
                OFFにすると、すべてのメール通知が停止されます
              </p>
            </div>
            <Switch
              id="emailMaster"
              checked={settings.emailNotifications}
              onCheckedChange={(v) => updateSetting("emailNotifications", v)}
            />
          </div>
        </CardContent>
      </Card>

      {/* 個別通知設定 */}
      <Card className={!settings.emailNotifications ? "opacity-50" : ""}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-4 w-4" />
            通知の種類
          </CardTitle>
          <CardDescription>受け取りたい通知の種類を選択してください</CardDescription>
        </CardHeader>
        <CardContent className="space-y-1">
          {/* 投稿成功通知 */}
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              <div className="space-y-0.5">
                <Label htmlFor="postSuccess" className="cursor-pointer">
                  投稿成功通知
                </Label>
                <p className="text-xs text-muted-foreground">
                  予約投稿が正常に公開された時に通知
                </p>
              </div>
            </div>
            <Switch
              id="postSuccess"
              checked={settings.postSuccess}
              onCheckedChange={(v) => updateSetting("postSuccess", v)}
              disabled={!settings.emailNotifications}
            />
          </div>

          {/* 投稿失敗通知 */}
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              <div className="space-y-0.5">
                <Label htmlFor="postFailed" className="cursor-pointer">
                  投稿失敗通知
                </Label>
                <p className="text-xs text-muted-foreground">
                  予約投稿の公開に失敗した時に通知
                </p>
              </div>
            </div>
            <Switch
              id="postFailed"
              checked={settings.postFailed}
              onCheckedChange={(v) => updateSetting("postFailed", v)}
              disabled={!settings.emailNotifications}
            />
          </div>

          {/* 週次レポート */}
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="flex items-center gap-3">
              <Mail className="h-4 w-4 text-blue-500" />
              <div className="space-y-0.5">
                <Label htmlFor="weeklyReport" className="cursor-pointer">
                  週次レポート
                </Label>
                <p className="text-xs text-muted-foreground">
                  毎週月曜日にパフォーマンスサマリーを送信
                </p>
              </div>
            </div>
            <Switch
              id="weeklyReport"
              checked={settings.weeklyReport}
              onCheckedChange={(v) => updateSetting("weeklyReport", v)}
              disabled={!settings.emailNotifications}
            />
          </div>

          {/* 新機能のお知らせ */}
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="flex items-center gap-3">
              <Bell className="h-4 w-4 text-primary" />
              <div className="space-y-0.5">
                <Label htmlFor="newFeatures" className="cursor-pointer">
                  新機能のお知らせ
                </Label>
                <p className="text-xs text-muted-foreground">
                  新機能やアップデート情報をお届けします
                </p>
              </div>
            </div>
            <Switch
              id="newFeatures"
              checked={settings.newFeatures}
              onCheckedChange={(v) => updateSetting("newFeatures", v)}
              disabled={!settings.emailNotifications}
            />
          </div>
        </CardContent>
      </Card>

      {/* 保存ボタン */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          <Save className="mr-2 h-4 w-4" />
          {saving ? "保存中..." : "変更を保存"}
        </Button>
      </div>
    </div>
  );
}
