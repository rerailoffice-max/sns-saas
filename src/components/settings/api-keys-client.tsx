/**
 * APIキー管理クライアントコンポーネント
 * APIキーの一覧表示・新規作成・削除
 */
"use client";

import { useState } from "react";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { Plus, Trash2, Copy, Key, Loader2, AlertTriangle } from "lucide-react";
import type { SubscriptionPlan } from "@/types/database";

interface ApiKeyItem {
  id: string;
  name: string;
  key_prefix: string;
  last_used_at: string | null;
  is_active: boolean;
  created_at: string;
}

interface ApiKeysClientProps {
  initialKeys: ApiKeyItem[];
  currentPlan: SubscriptionPlan;
}

/** プラン別上限 */
const PLAN_KEY_LIMITS: Record<SubscriptionPlan, number> = {
  free: 0,
  starter: 1,
  professional: 5,
};

export function ApiKeysClient({ initialKeys, currentPlan }: ApiKeysClientProps) {
  const [keys, setKeys] = useState<ApiKeyItem[]>(initialKeys);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ApiKeyItem | null>(null);
  const [newKeyName, setNewKeyName] = useState("");
  const [createdRawKey, setCreatedRawKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const maxKeys = PLAN_KEY_LIMITS[currentPlan];
  const activeKeys = keys.filter((k) => k.is_active);
  const canCreate = activeKeys.length < maxKeys;

  /** 新規APIキー作成 */
  const handleCreate = async () => {
    if (!newKeyName.trim()) {
      toast.error("キー名を入力してください");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newKeyName.trim() }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "エラーが発生しました");
      }

      // 生のキーを表示
      setCreatedRawKey(data.key.raw_key);

      // 一覧に追加
      setKeys((prev) => [
        {
          id: data.key.id,
          name: data.key.name,
          key_prefix: data.key.key_prefix,
          last_used_at: null,
          is_active: true,
          created_at: data.key.created_at,
        },
        ...prev,
      ]);

      toast.success("APIキーを作成しました");
    } catch (err) {
      toast.error("APIキーの作成に失敗しました", {
        description: err instanceof Error ? err.message : "もう一度お試しください",
      });
    } finally {
      setLoading(false);
    }
  };

  /** APIキー削除 */
  const handleDelete = async () => {
    if (!deleteTarget) return;

    setLoading(true);
    try {
      const res = await fetch("/api/api-keys", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: deleteTarget.id }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "エラーが発生しました");
      }

      setKeys((prev) =>
        prev.map((k) =>
          k.id === deleteTarget.id ? { ...k, is_active: false } : k
        )
      );
      setDeleteOpen(false);
      setDeleteTarget(null);
      toast.success("APIキーを削除しました");
    } catch (err) {
      toast.error("APIキーの削除に失敗しました", {
        description: err instanceof Error ? err.message : "もう一度お試しください",
      });
    } finally {
      setLoading(false);
    }
  };

  /** クリップボードにコピー */
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("クリップボードにコピーしました");
  };

  /** ダイアログを閉じる（作成後のリセット） */
  const handleCloseCreate = () => {
    setCreateOpen(false);
    setNewKeyName("");
    setCreatedRawKey(null);
  };

  return (
    <div className="space-y-6">
      {/* プラン制限メッセージ */}
      {maxKeys === 0 && (
        <Card className="border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950">
          <CardContent className="flex items-center gap-3 pt-6">
            <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
            <div>
              <p className="font-medium text-amber-800 dark:text-amber-200">
                FreeプランではAPI連携を利用できません
              </p>
              <p className="text-sm text-amber-700 dark:text-amber-300">
                Starter以上のプランにアップグレードするとAPIキーを作成できます。
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* APIキー一覧 */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>APIキー</CardTitle>
            <CardDescription>
              外部連携・Chrome拡張で使用するAPIキーの管理
              {maxKeys > 0 && (
                <span className="ml-2">
                  （{activeKeys.length}/{maxKeys}件）
                </span>
              )}
            </CardDescription>
          </div>
          {/* 新規作成ダイアログ */}
          <Dialog open={createOpen} onOpenChange={(open) => {
            if (!open) handleCloseCreate();
            else setCreateOpen(true);
          }}>
            <DialogTrigger asChild>
              <Button disabled={!canCreate || maxKeys === 0} size="sm">
                <Plus className="mr-2 h-4 w-4" />
                新規APIキー発行
              </Button>
            </DialogTrigger>
            <DialogContent>
              {createdRawKey ? (
                // 作成完了画面
                <>
                  <DialogHeader>
                    <DialogTitle>APIキーが作成されました</DialogTitle>
                    <DialogDescription>
                      このキーは一度しか表示されません。安全な場所にコピーして保存してください。
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 rounded-lg border bg-muted p-3">
                      <code className="flex-1 text-sm break-all font-mono">
                        {createdRawKey}
                      </code>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyToClipboard(createdRawKey)}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950">
                      <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                      <p className="text-sm text-amber-700 dark:text-amber-300">
                        このキーはこの画面を閉じると二度と表示できません
                      </p>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button onClick={handleCloseCreate}>閉じる</Button>
                  </DialogFooter>
                </>
              ) : (
                // 作成フォーム
                <>
                  <DialogHeader>
                    <DialogTitle>新規APIキー発行</DialogTitle>
                    <DialogDescription>
                      APIキーにわかりやすい名前を付けてください
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-2">
                    <div className="space-y-2">
                      <Label htmlFor="key-name">キー名</Label>
                      <Input
                        id="key-name"
                        placeholder="例: Chrome拡張用"
                        value={newKeyName}
                        onChange={(e) => setNewKeyName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleCreate();
                        }}
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={handleCloseCreate}>
                      キャンセル
                    </Button>
                    <Button onClick={handleCreate} disabled={loading}>
                      {loading ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Key className="mr-2 h-4 w-4" />
                      )}
                      作成
                    </Button>
                  </DialogFooter>
                </>
              )}
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {activeKeys.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>名前</TableHead>
                  <TableHead>キープレフィックス</TableHead>
                  <TableHead>作成日</TableHead>
                  <TableHead>最終使用日</TableHead>
                  <TableHead className="w-[80px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activeKeys.map((key) => (
                  <TableRow key={key.id}>
                    <TableCell className="font-medium">{key.name}</TableCell>
                    <TableCell>
                      <code className="text-sm text-muted-foreground">
                        {key.key_prefix}...
                      </code>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(key.created_at).toLocaleDateString("ja-JP")}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {key.last_used_at
                        ? new Date(key.last_used_at).toLocaleDateString("ja-JP")
                        : "未使用"}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => {
                          setDeleteTarget(key);
                          setDeleteOpen(true);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Key className="h-10 w-10 text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground">
                {maxKeys === 0
                  ? "APIキーの作成にはStarter以上のプランが必要です"
                  : "APIキーはまだ作成されていません"}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 削除確認ダイアログ */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>APIキーの削除</DialogTitle>
            <DialogDescription>
              「{deleteTarget?.name}」を削除しますか？この操作は取り消せません。
              このキーを使用している連携は動作しなくなります。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDeleteOpen(false);
                setDeleteTarget(null);
              }}
            >
              キャンセル
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-2 h-4 w-4" />
              )}
              削除する
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
