/**
 * 最近の投稿テーブル
 * 直近の投稿とそのパフォーマンス表示
 */
import { Badge } from "@/components/ui/badge";
import { Heart, MessageCircle, Repeat2, Eye } from "lucide-react";

interface RecentPost {
  id: string;
  text: string;
  posted_at: string;
  likes: number;
  replies: number;
  reposts: number;
  impressions: number;
}

interface RecentPostsProps {
  posts: RecentPost[];
}

export function RecentPosts({ posts }: RecentPostsProps) {
  if (posts.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-8 text-center">
        投稿データがありません。SNSアカウントを接続して投稿を始めましょう。
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {posts.map((post) => (
        <div
          key={post.id}
          className="flex flex-col gap-2 rounded-lg border p-4"
        >
          {/* 投稿テキスト */}
          <p className="text-sm line-clamp-2">{post.text}</p>

          {/* メトリクス */}
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
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
            <span className="flex items-center gap-1">
              <Eye className="h-3 w-3" />
              {post.impressions.toLocaleString()}
            </span>
            <span className="ml-auto">
              {new Date(post.posted_at).toLocaleDateString("ja-JP", {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
