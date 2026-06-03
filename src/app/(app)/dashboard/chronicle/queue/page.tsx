/**
 * クロニキ 予約済 thread 一覧 (v7.19 / 2026-05-18)
 * pending 状態の thread を時刻順に表示。プレビュー + キャンセル機能。
 */
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChronicleQueueClient } from "@/components/chronicle/queue-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ChronicleQueuePage() {
  const supabase = await createClient();
  const { data: items, error } = await supabase
    .from("chronicle_publish_queue")
    .select("*")
    .eq("status", "pending")
    .order("scheduled_at", { ascending: true })
    .limit(50);

  if (error) {
    return (
      <Card>
        <CardHeader><CardTitle>予約済 thread</CardTitle></CardHeader>
        <CardContent>
          <p className="text-destructive text-sm">読み込みエラー: {error.message}</p>
          <p className="text-xs text-muted-foreground mt-2">
            migration <code>00016_chronicle_pipeline.sql</code> 未適用の可能性があります。
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">
          ⏳ 公開待ち ({items?.length || 0} 件 / 時刻昇順)
        </CardTitle>
      </CardHeader>
      <CardContent>
        {(!items || items.length === 0) ? (
          <p className="text-sm text-muted-foreground">
            pending 0 件。v5 cron (3:30/7:30/11:30/15:30/19:30 JST) で自動生成されます。
          </p>
        ) : (
          <ChronicleQueueClient items={items as any[]} />
        )}
      </CardContent>
    </Card>
  );
}
