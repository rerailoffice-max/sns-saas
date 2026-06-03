/**
 * クロニキ 公開済み履歴 (v7.19 / 2026-05-18)
 * 過去 7 日の published threads と各 post の Threads URL。
 */
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type HistoryRow = {
  thread_id: string;
  title: string | null;
  publish_mode: string;
  published_at: string | null;
  posts_count: number;
  media_summary: Array<{ kind: string; preview_url: string | null }> | null;
  published_posts: Array<{ post_url?: string; platform_post_id?: string }> | null;
};

function formatJst(iso: string | null) {
  if (!iso) return "?";
  try { return new Date(iso).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" }); }
  catch { return iso; }
}

const MEDIA_EMOJI: Record<string, string> = { video: "🎬", image: "🖼️", none: "📝" };

export default async function ChronicleHistoryPage() {
  const supabase = await createClient();
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400 * 1000).toISOString();
  const { data: items, error } = await supabase
    .from("chronicle_publish_queue")
    .select("*")
    .eq("status", "published")
    .gte("published_at", sevenDaysAgo)
    .order("published_at", { ascending: false })
    .limit(100);

  if (error) {
    return (
      <Card>
        <CardHeader><CardTitle>公開済み履歴</CardTitle></CardHeader>
        <CardContent>
          <p className="text-destructive text-sm">読み込みエラー: {error.message}</p>
        </CardContent>
      </Card>
    );
  }

  const list = (items || []) as HistoryRow[];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">
          ✅ 過去 7 日間の公開 ({list.length} 件)
        </CardTitle>
      </CardHeader>
      <CardContent>
        {list.length === 0 ? (
          <p className="text-sm text-muted-foreground">公開実績なし</p>
        ) : (
          <div className="space-y-2">
            {list.map((it) => {
              const m0 = it.media_summary?.[0];
              const firstPostUrl = it.published_posts?.[0]?.post_url;
              return (
                <div key={it.thread_id} className="border rounded-md p-3 flex gap-3 hover:bg-muted/30">
                  {m0?.preview_url && (
                    <img src={m0.preview_url} alt="" className="w-20 h-14 object-cover rounded bg-muted flex-shrink-0" loading="lazy" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 mb-1">
                      <span>{MEDIA_EMOJI[m0?.kind || "none"]}</span>
                      <span className="text-xs text-muted-foreground">{formatJst(it.published_at)}</span>
                      <code className="text-xs bg-muted px-2 py-0.5 rounded">{it.thread_id}</code>
                      <span className="text-xs text-muted-foreground">{it.posts_count} post</span>
                      <span className="text-xs">{it.publish_mode === "absolute" ? "🎯 任意時刻" : "⏰ slot"}</span>
                    </div>
                    <div className="text-sm font-medium mb-1">{it.title || "(タイトル無し)"}</div>
                    {firstPostUrl && (
                      <a href={firstPostUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline">
                        Threads で見る ↗
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
