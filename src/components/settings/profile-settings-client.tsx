"use client";

/**
 * プロフィール設定クライアントコンポーネント
 * 表示名・通知設定のフォーム
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Save, Mail, User } from "lucide-react";
import { toast } from "sonner";

interface ProfileSettingsClientProps {
  profile: {
    display_name: string;
    email: string;
    avatar_url: string | null;
    email_notifications: boolean;
  };
}

export function ProfileSettingsClient({ profile }: ProfileSettingsClientProps) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState(profile.display_name);
  const [emailNotifications, setEmailNotifications] = useState(
    profile.email_notifications
  );
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          display_name: displayName.trim(),
          email_notifications: emailNotifications,
        }),
      });

      if (res.ok) {
        toast.success("プロフィールを更新しました");
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
      {/* 基本情報 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-4 w-4" />
            基本情報
          </CardTitle>
          <CardDescription>表示名やプロフィール情報を設定します</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="displayName">表示名</Label>
            <Input
              id="displayName"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="表示名を入力"
              maxLength={100}
            />
          </div>

          <div className="space-y-2">
            <Label>メールアドレス</Label>
            <div className="flex items-center gap-2">
              <Input value={profile.email} disabled className="bg-muted" />
              <Badge variant="outline" className="whitespace-nowrap">
                変更不可
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              メールアドレスはSupabase Authで管理されています
            </p>
          </div>
        </CardContent>
      </Card>

      {/* 通知設定 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-4 w-4" />
            通知設定
          </CardTitle>
          <CardDescription>メール通知の受信設定を管理します</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5">
              <Label htmlFor="emailNotifications" className="cursor-pointer">
                メール通知
              </Label>
              <p className="text-xs text-muted-foreground">
                投稿の公開完了や失敗時にメールで通知を受け取ります
              </p>
            </div>
            <Switch
              id="emailNotifications"
              checked={emailNotifications}
              onCheckedChange={setEmailNotifications}
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
