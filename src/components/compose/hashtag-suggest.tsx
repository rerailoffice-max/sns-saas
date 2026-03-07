"use client";

/**
 * ハッシュタグ提案コンポーネント
 * 過去のデータから効果的なハッシュタグをレコメンドし、クリックで挿入
 */
import { Badge } from "@/components/ui/badge";
import { Hash, TrendingUp } from "lucide-react";
import type { HashtagStats } from "@/lib/hashtag-recommend";

interface HashtagSuggestProps {
  suggestions: HashtagStats[];
  onInsert: (tag: string) => void;
}

export function HashtagSuggest({ suggestions, onInsert }: HashtagSuggestProps) {
  if (suggestions.length === 0) return null;

  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <div className="flex items-center gap-2 mb-2">
        <Hash className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground">
          おすすめハッシュタグ
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {suggestions.map((stat) => (
          <Badge
            key={stat.tag}
            variant="secondary"
            className="cursor-pointer hover:bg-primary hover:text-primary-foreground transition-colors text-xs"
            onClick={() => onInsert(stat.tag)}
          >
            {stat.tag}
            <span className="ml-1 opacity-60 flex items-center gap-0.5">
              <TrendingUp className="h-3 w-3" />
              {stat.avgEngagement}
            </span>
          </Badge>
        ))}
      </div>
    </div>
  );
}
