/**
 * トップ投稿ランキングコンポーネント
 * エンゲージメント（いいね+リプライ+リポスト）順に投稿を表示
 */
import { Badge } from "@/components/ui/badge";
import { Heart, MessageCircle, Repeat2, Eye } from "lucide-react";

/** ランキングに表示する投稿データ型 */
export interface RankedPost {
  id: string;
  text: string;
  posted_at: string;
  likes: number;
  replies: number;
  reposts: number;
  impressions: number;
  /** いいね+リプライ+リポストの合計（ソート済み） */
  totalEngagement: number;
}

interface TopPostsRankingProps {
  posts: RankedPost[];
}

/** ランクに応じたメダル/数字を返す */
function rankLabel(rank: number): string {
  if (rank === 1) return "\u{1F947}";
  if (rank === 2) return "\u{1F948}";
  if (rank === 3) return "\u{1F949}";
  return `${rank}`;
}

export function TopPostsRanking({ posts }: TopPostsRankingProps) {
  if (posts.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-8 text-center">
        投稿データがありません
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {posts.map((post, index) => {
        const rank = index + 1;
        return (
          <div
            key={post.id}
            className="flex items-start gap-3 rounded-lg border p-3"
          >
            {/* ランクバッジ */}
            <Badge
              variant={rank <= 3 ? "default" : "secondary"}
              className="shrink-0 text-sm min-w-[2rem] justify-center"
            >
              {rankLabel(rank)}
            </Badge>

            <div className="flex-1 min-w-0 space-y-1.5">
              {/* 投稿テキスト（truncate） */}
              <p className="text-sm line-clamp-2">{post.text}</p>

              {/* 投稿日時 + メトリクス */}
              <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                <span>
                  {new Date(post.posted_at).toLocaleDateString("ja-JP", {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
                <span className="flex items-center gap-1">
                  <Heart className="h-3 w-3" />
                  {post.likes.toLocaleString()}
                </span>
                <span className="flex items-center gap-1">
                  <MessageCircle className="h-3 w-3" />
                  {post.replies.toLocaleString()}
                </span>
                <span className="flex items-center gap-1">
                  <Repeat2 className="h-3 w-3" />
                  {post.reposts.toLocaleString()}
                </span>
                {post.impressions > 0 && (
                  <span className="flex items-center gap-1">
                    <Eye className="h-3 w-3" />
                    {post.impressions.toLocaleString()}
                  </span>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
