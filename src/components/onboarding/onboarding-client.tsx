"use client";

/**
 * オンボーディング クライアントコンポーネント
 * ステップウィザード形式で初期設定をガイド
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
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2,
  Circle,
  User,
  Link2,
  PenLine,
  ArrowRight,
  ExternalLink,
  Sparkles,
} from "lucide-react";

interface OnboardingClientProps {
  steps: {
    profileCompleted: boolean;
    accountsConnected: boolean;
    firstDraftCreated: boolean;
  };
  displayName: string;
  connectedAccounts: Array<{
    id: string;
    platform: string;
    username: string | null;
  }>;
  userEmail: string;
}

export function OnboardingClient({
  steps,
  displayName: initialDisplayName,
  connectedAccounts,
  userEmail,
}: OnboardingClientProps) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [saving, setSaving] = useState(false);

  // 現在のアクティブステップを判定
  const currentStep = !steps.profileCompleted
    ? 1
    : !steps.accountsConnected
      ? 2
      : !steps.firstDraftCreated
        ? 3
        : 4; // 全完了

  // 全ステップ完了チェック
  const allCompleted =
    steps.profileCompleted &&
    steps.accountsConnected &&
    steps.firstDraftCreated;

  // プロフィール保存
  async function handleSaveProfile() {
    if (!displayName.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ display_name: displayName.trim() }),
      });
      if (res.ok) {
        router.refresh();
      }
    } catch {
      // エラー時は何もしない
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="text-center space-y-2">
        <div className="flex items-center justify-center gap-2">
          <Sparkles className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-bold">ようこそ！</h1>
        </div>
        <p className="text-muted-foreground">
          SNS Managerを始めるために、3つのステップを完了しましょう
        </p>
      </div>

      {/* プログレスバー */}
      <div className="flex items-center gap-2 justify-center">
        {[1, 2, 3].map((step) => {
          const isCompleted =
            step === 1
              ? steps.profileCompleted
              : step === 2
                ? steps.accountsConnected
                : steps.firstDraftCreated;
          const isActive = step === currentStep;
          return (
            <div key={step} className="flex items-center gap-2">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium transition-colors ${
                  isCompleted
                    ? "bg-primary text-primary-foreground"
                    : isActive
                      ? "bg-primary/20 text-primary border-2 border-primary"
                      : "bg-muted text-muted-foreground"
                }`}
              >
                {isCompleted ? "✓" : step}
              </div>
              {step < 3 && (
                <div
                  className={`h-0.5 w-12 ${
                    isCompleted ? "bg-primary" : "bg-muted"
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Step 1: プロフィール設定 */}
      <Card
        className={
          currentStep === 1
            ? "border-primary shadow-md"
            : steps.profileCompleted
              ? "opacity-70"
              : ""
        }
      >
        <CardHeader>
          <div className="flex items-center gap-3">
            {steps.profileCompleted ? (
              <CheckCircle2 className="h-5 w-5 text-primary" />
            ) : (
              <Circle className="h-5 w-5 text-muted-foreground" />
            )}
            <div className="flex-1">
              <CardTitle className="flex items-center gap-2">
                <User className="h-4 w-4" />
                Step 1: プロフィール設定
              </CardTitle>
              <CardDescription>表示名を設定しましょう</CardDescription>
            </div>
            {steps.profileCompleted && (
              <Badge variant="default">完了</Badge>
            )}
          </div>
        </CardHeader>
        {currentStep === 1 && (
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="displayName">表示名</Label>
              <Input
                id="displayName"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="あなたの表示名を入力"
              />
              <p className="text-xs text-muted-foreground">
                メールアドレス: {userEmail}
              </p>
            </div>
            <Button
              onClick={handleSaveProfile}
              disabled={!displayName.trim() || saving}
            >
              {saving ? "保存中..." : "保存して次へ"}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </CardContent>
        )}
      </Card>

      {/* Step 2: SNSアカウント接続 */}
      <Card
        className={
          currentStep === 2
            ? "border-primary shadow-md"
            : steps.accountsConnected
              ? "opacity-70"
              : ""
        }
      >
        <CardHeader>
          <div className="flex items-center gap-3">
            {steps.accountsConnected ? (
              <CheckCircle2 className="h-5 w-5 text-primary" />
            ) : (
              <Circle className="h-5 w-5 text-muted-foreground" />
            )}
            <div className="flex-1">
              <CardTitle className="flex items-center gap-2">
                <Link2 className="h-4 w-4" />
                Step 2: SNSアカウントを接続
              </CardTitle>
              <CardDescription>
                管理したいSNSアカウントを接続してください
              </CardDescription>
            </div>
            {steps.accountsConnected && (
              <Badge variant="default">完了</Badge>
            )}
          </div>
        </CardHeader>
        {currentStep === 2 && (
          <CardContent className="space-y-4">
            {/* 接続済みアカウント */}
            {connectedAccounts.length > 0 && (
              <div className="space-y-2">
                {connectedAccounts.map((acc) => (
                  <div
                    key={acc.id}
                    className="flex items-center gap-2 rounded-lg border p-3"
                  >
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    <span className="text-sm font-medium capitalize">
                      {acc.platform}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      @{acc.username}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-2">
              <Button asChild>
                <a href="/api/threads/connect">
                  Threadsを接続
                  <ExternalLink className="ml-2 h-3 w-3" />
                </a>
              </Button>
              <Button variant="outline" disabled>
                Instagram（準備中）
              </Button>
            </div>

            {connectedAccounts.length > 0 && (
              <Button
                variant="ghost"
                onClick={() => router.refresh()}
                className="text-sm"
              >
                次のステップへ進む
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            )}
          </CardContent>
        )}
      </Card>

      {/* Step 3: 最初の投稿作成 */}
      <Card
        className={
          currentStep === 3
            ? "border-primary shadow-md"
            : steps.firstDraftCreated
              ? "opacity-70"
              : ""
        }
      >
        <CardHeader>
          <div className="flex items-center gap-3">
            {steps.firstDraftCreated ? (
              <CheckCircle2 className="h-5 w-5 text-primary" />
            ) : (
              <Circle className="h-5 w-5 text-muted-foreground" />
            )}
            <div className="flex-1">
              <CardTitle className="flex items-center gap-2">
                <PenLine className="h-4 w-4" />
                Step 3: 最初の投稿を作成
              </CardTitle>
              <CardDescription>
                下書きを作成して、投稿管理を始めましょう
              </CardDescription>
            </div>
            {steps.firstDraftCreated && (
              <Badge variant="default">完了</Badge>
            )}
          </div>
        </CardHeader>
        {currentStep === 3 && (
          <CardContent>
            <Button asChild>
              <a href="/compose">
                投稿を作成する
                <PenLine className="ml-2 h-4 w-4" />
              </a>
            </Button>
          </CardContent>
        )}
      </Card>

      {/* 全完了時 */}
      {allCompleted && (
        <Card className="border-primary bg-primary/5">
          <CardContent className="py-8 text-center space-y-4">
            <div className="flex items-center justify-center gap-2">
              <Sparkles className="h-6 w-6 text-primary" />
              <h2 className="text-xl font-bold">セットアップ完了！</h2>
            </div>
            <p className="text-muted-foreground">
              すべてのセットアップが完了しました。ダッシュボードでSNS管理を始めましょう！
            </p>
            <Button asChild size="lg">
              <a href="/dashboard">
                ダッシュボードへ
                <ArrowRight className="ml-2 h-4 w-4" />
              </a>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
