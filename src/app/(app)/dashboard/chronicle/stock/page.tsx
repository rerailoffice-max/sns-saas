/**
 * クロニキ 動画ネタストック (v7.19 / 2026-05-18)
 * ai-lab-bot が収集した動画候補を一覧表示。プレビュー付き。
 * 採用 / 却下 / 時間指定は Phase 2b 操作 API 経由。
 */
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChronicleStockClient } from "@/components/chronicle/stock-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type StockRow = {
  topic_key: string;
  source_url: string | null;
  title: string | null;
  text: string | null;
  author: string | null;
  platform: string | null;
  buzz_score: number;
  media_kind: "video" | "image" | "none";
  preview_url: string | null;
  video_url: string | null;
  status: string;
  created_at: string;
  last_seen_at: string;
};

export default async function ChronicleStockPage() {
  const supabase = await createClient();
  const { data: items, error } = await supabase
    .from("chronicle_topic_stock")
    .select("*")
    .eq("status", "stocked")
    .order("buzz_score", { ascending: false })
    .limit(50);

  const stats = await supabase
    .from("chronicle_topic_stock")
    .select("status", { count: "exact" });

  // status 別件数を集計
  const statusCounts: Record<string, number> = {};
  if (stats.data) {
    for (const row of stats.data as any[]) {
      statusCounts[row.status] = (statusCounts[row.status] || 0) + 1;
    }
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>動画ネタストック</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-destructive text-sm">
            読み込みエラー: {error.message}
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            Supabase に chronicle_topic_stock テーブルが無いか、RLS でアクセス不可です。
            migration <code>00016_chronicle_pipeline.sql</code> を適用してください。
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">📊 統計</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4 text-sm">
            <span>🟢 stocked: <b>{statusCounts.stocked || 0}</b></span>
            <span>✅ adopted: <b>{statusCounts.adopted || 0}</b></span>
            <span>❌ rejected: <b>{statusCounts.rejected || 0}</b></span>
            <span>⏰ expired: <b>{statusCounts.expired || 0}</b></span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            🎬 採用待ち動画候補 ({items?.length || 0} 件 / buzz_score 降順)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {(!items || items.length === 0) ? (
            <p className="text-sm text-muted-foreground">
              候補が空です。次の v5 cron (3:30/7:30/11:30/15:30/19:30 JST) で自動補充されます。
            </p>
          ) : (
            <ChronicleStockClient items={items as StockRow[]} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
