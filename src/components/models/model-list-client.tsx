"use client";

/**
 * モデルアカウント一覧 - クライアントコンポーネント
 * モデルカードのグリッド表示と新規追加ダイアログを管理
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, AlertCircle, Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ModelCard } from "@/components/models/model-card";
import type { ModelAccount, SubscriptionPlan, Platform } from "@/types/database";

interface ModelListClientProps {
  models: ModelAccount[];
  plan: SubscriptionPlan;
  maxModelAccounts: number;
  postCounts?: Record<string, number>;
}

export function ModelListClient({
  models,
  plan,
  maxModelAccounts,
  postCounts = {},
}: ModelListClientProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [platform, setPlatform] = useState<Platform>("threads");
  const [username, setUsername] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isBulkAnalyzing, setIsBulkAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<"all" | "analyzed" | "unanalyzed">("all");

  // プラン制限に達しているか
  const isLimitReached = models.length >= maxModelAccounts;

  // フィルター適用
  const filteredModels = models.filter((m) => {
    if (filterStatus === "analyzed") return !!m.analysis_result;
    if (filterStatus === "unanalyzed") return !m.analysis_result;
    return true;
  });

  // 未分析モデル数
  const unanalyzedCount = models.filter((m) => !m.analysis_result).length;

  /** 全モデルを一括AI分析 */
  const handleBulkAnalyze = async () => {
    const targets = models.filter((m) => !m.analysis_result);
    if (targets.length === 0) return;
    setIsBulkAnalyzing(true);
    try {
      for (const m of targets) {
        await fetch(`/api/models/${m.id}/analyze`, { method: "POST" });
      }
      router.refresh();
    } catch {
      // エラーは無視（個別のエラーはサーバーログに記録済み）
    } finally {
      setIsBulkAnalyzing(false);
    }
  };

  /** モデルアカウント登録 */
  const handleSubmit = async () => {
    if (!username.trim()) {
      setError("ユーザー名を入力してください");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform, username: username.trim() }),
      });

      const json = await res.json();

      if (!res.ok) {
        setError(json.error ?? "登録に失敗しました");
        return;
      }

      // 成功時: ダイアログを閉じてリスト更新
      setOpen(false);
      setUsername("");
      setPlatform("threads");
      router.refresh();
    } catch {
      setError("ネットワークエラーが発生しました");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">モデリング</h1>
          <p className="text-sm text-muted-foreground mt-1">
            参考にしたいアカウントを登録して、投稿スタイルをAI分析します
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* 一括分析ボタン */}
          {models.length > 0 && unanalyzedCount > 0 && (
            <Button
              variant="outline"
              onClick={handleBulkAnalyze}
              disabled={isBulkAnalyzing}
            >
              {isBulkAnalyzing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="mr-2 h-4 w-4" />
              )}
              {isBulkAnalyzing ? "分析中..." : `一括分析（${unanalyzedCount}件）`}
            </Button>
          )}

          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button disabled={isLimitReached}>
                <Plus className="mr-2 h-4 w-4" />
                アカウント追加
              </Button>
            </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>モデルアカウントを追加</DialogTitle>
              <DialogDescription>
                分析したいアカウントのプラットフォームとユーザー名を入力してください
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {/* プラットフォーム選択 */}
              <div className="space-y-2">
                <Label htmlFor="platform">プラットフォーム</Label>
                <Select
                  value={platform}
                  onValueChange={(v) => setPlatform(v as Platform)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="選択してください" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="threads">Threads</SelectItem>
                    <SelectItem value="instagram" disabled>
                      Instagram（準備中）
                    </SelectItem>
                    <SelectItem value="x" disabled>
                      X（準備中）
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* ユーザー名入力 */}
              <div className="space-y-2">
                <Label htmlFor="username">ユーザー名</Label>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">@</span>
                  <Input
                    id="username"
                    placeholder="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !isSubmitting) {
                        handleSubmit();
                      }
                    }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  半角英数字、ピリオド、アンダースコアのみ使用可能
                </p>
              </div>

              {/* エラーメッセージ */}
              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>エラー</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={isSubmitting}
              >
                キャンセル
              </Button>
              <Button onClick={handleSubmit} disabled={isSubmitting}>
                {isSubmitting ? "登録中..." : "追加する"}
              </Button>
            </DialogFooter>
          </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* フィルター */}
      {models.length > 0 && (
        <div className="flex items-center gap-2">
          <Badge
            variant={filterStatus === "all" ? "default" : "outline"}
            className="cursor-pointer"
            onClick={() => setFilterStatus("all")}
          >
            すべて ({models.length})
          </Badge>
          <Badge
            variant={filterStatus === "analyzed" ? "default" : "outline"}
            className="cursor-pointer"
            onClick={() => setFilterStatus("analyzed")}
          >
            分析済み ({models.length - unanalyzedCount})
          </Badge>
          <Badge
            variant={filterStatus === "unanalyzed" ? "default" : "outline"}
            className="cursor-pointer"
            onClick={() => setFilterStatus("unanalyzed")}
          >
            未分析 ({unanalyzedCount})
          </Badge>
        </div>
      )}

      {/* プラン制限の注意表示 */}
      {isLimitReached && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>登録上限に達しました</AlertTitle>
          <AlertDescription>
            現在のプラン（{plan}）ではモデルアカウントを{maxModelAccounts}
            件まで登録できます。より多くのアカウントを分析するにはプランをアップグレードしてください。
          </AlertDescription>
        </Alert>
      )}

      {/* プラン制限: freeプランは0件 */}
      {maxModelAccounts === 0 && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>モデリング機能はStarterプラン以上で利用できます</AlertTitle>
          <AlertDescription>
            モデルアカウントの登録・AI分析を利用するには、プランをアップグレードしてください。
          </AlertDescription>
        </Alert>
      )}

      {/* モデルカード一覧 */}
      {filteredModels.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredModels.map((model) => (
            <ModelCard key={model.id} model={model} postCount={postCounts[model.id]} />
          ))}
        </div>
      ) : models.length > 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
          <p className="text-muted-foreground">フィルター条件に一致するモデルがありません</p>
        </div>
      ) : (
        maxModelAccounts > 0 && (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
            <div className="text-muted-foreground mb-4">
              <Plus className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p className="text-lg font-medium">
                モデルアカウントがまだ登録されていません
              </p>
              <p className="text-sm mt-1">
                参考にしたいアカウントを追加して、AI分析を始めましょう
              </p>
            </div>
          </div>
        )
      )}

      {/* 登録数表示 */}
      {maxModelAccounts > 0 && (
        <p className="text-xs text-muted-foreground text-right">
          {models.length} / {maxModelAccounts === Infinity ? "無制限" : maxModelAccounts} 件登録済み
        </p>
      )}
    </div>
  );
}
