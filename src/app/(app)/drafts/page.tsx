/**
 * 下書き一覧ページ
 * Supabase未接続時はモックデータで表示
 */
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PenSquare, Clock } from "lucide-react";
import Link from "next/link";

// モックデータ（Supabase未接続時用）
const MOCK_DRAFTS = [
  {
    id: "1",
    text: "新しいSNS管理ツールを使い始めました。投稿の予約機能が便利すぎる！ #SNS管理",
    status: "draft",
    source: "manual",
    hashtags: ["#SNS管理"],
    created_at: "2025-03-05T10:00:00Z",
    updated_at: "2025-03-05T10:00:00Z",
    social_accounts: { username: "demo_user", platform: "threads" },
  },
  {
    id: "2",
    text: "今週のフォロワー分析レポート。成長率が先週比で15%アップ！",
    status: "draft",
    source: "ai",
    hashtags: [],
    created_at: "2025-03-04T08:00:00Z",
    updated_at: "2025-03-04T08:00:00Z",
    social_accounts: { username: "demo_user", platform: "threads" },
  },
  {
    id: "3",
    text: "明日の朝投稿予定：SNS運用の効率化について。自動化ツールの選び方を解説します。",
    status: "scheduled",
    source: "manual",
    hashtags: ["#SNS運用", "#自動化"],
    created_at: "2025-03-03T12:00:00Z",
    updated_at: "2025-03-03T12:00:00Z",
    social_accounts: { username: "demo_user", platform: "threads" },
  },
];

export default async function DraftsPage() {
  // Supabase未接続時はモックデータで表示
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    return <DraftsView drafts={MOCK_DRAFTS} />;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // 下書き取得（draftsテーブル + social_accountsのジョイン）
  const { data: drafts } = await supabase
    .from("drafts")
    .select(
      `
      id,
      text,
      status,
      source,
      hashtags,
      media_urls,
      created_at,
      updated_at,
      social_accounts (
        username,
        platform
      )
    `
    )
    .eq("profile_id", user.id)
    .in("status", ["draft", "scheduled"])
    .order("updated_at", { ascending: false });

  return <DraftsView drafts={drafts ?? []} />;
}

/** 下書き一覧表示コンポーネント（実データ・デモデータ共通） */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function DraftsView({ drafts }: { drafts: any[] }) {
  const statusLabels: Record<
    string,
    { label: string; variant: "default" | "secondary" | "outline" }
  > = {
    draft: { label: "下書き", variant: "secondary" },
    scheduled: { label: "予約済み", variant: "default" },
  };

  const sourceLabels: Record<string, string> = {
    manual: "手動作成",
    openclaw: "OpenClaw",
    ai: "AI生成",
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">下書き</h1>
        <Button asChild>
          <Link href="/compose">
            <PenSquare className="mr-2 h-4 w-4" />
            新規作成
          </Link>
        </Button>
      </div>

      {drafts && drafts.length > 0 ? (
        <div className="space-y-3">
          {drafts.map((draft) => {
            const account = Array.isArray(draft.social_accounts)
              ? draft.social_accounts[0]
              : draft.social_accounts;
            const statusInfo = statusLabels[draft.status] ?? {
              label: draft.status,
              variant: "outline" as const,
            };

            return (
              <Card key={draft.id}>
                <CardContent className="py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 space-y-2">
                      {/* テキスト */}
                      <p className="text-sm line-clamp-3">{draft.text}</p>

                      {/* メタ情報 */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant={statusInfo.variant}>
                          {statusInfo.label}
                        </Badge>
                        {account && (
                          <Badge variant="outline" className="text-xs">
                            @{account.username}
                          </Badge>
                        )}
                        <span className="text-xs text-muted-foreground">
                          {sourceLabels[draft.source] ?? draft.source}
                        </span>
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {new Date(draft.updated_at).toLocaleDateString(
                            "ja-JP",
                            {
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            }
                          )}
                        </span>
                      </div>

                      {/* ハッシュタグ */}
                      {draft.hashtags && draft.hashtags.length > 0 && (
                        <div className="flex gap-1 flex-wrap">
                          {draft.hashtags.map((tag: string, i: number) => (
                            <Badge
                              key={i}
                              variant="secondary"
                              className="text-xs"
                            >
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      )}

                      {/* メディアプレビュー */}
                      {draft.media_urls && draft.media_urls.length > 0 && (
                        <div className="flex gap-2 overflow-x-auto">
                          {draft.media_urls.map((url: string, i: number) => (
                            <img
                              key={i}
                              src={url}
                              alt={`メディア ${i + 1}`}
                              className="h-16 w-16 rounded-md object-cover border shrink-0"
                            />
                          ))}
                        </div>
                      )}
                    </div>

                    {/* アクション */}
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" asChild>
                        <Link href={`/compose?draft=${draft.id}`}>
                          <PenSquare className="h-4 w-4" />
                        </Link>
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <PenSquare className="mx-auto h-12 w-12 text-muted-foreground" />
            <h3 className="mt-4 text-lg font-medium">下書きがありません</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              新しい投稿を作成して下書きに保存しましょう。
            </p>
            <Button className="mt-4" asChild>
              <Link href="/compose">新規作成</Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
