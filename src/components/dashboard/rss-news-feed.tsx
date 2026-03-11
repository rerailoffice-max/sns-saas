"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Newspaper, ExternalLink, Loader2, RefreshCw, PenSquare } from "lucide-react";
import Link from "next/link";

interface RSSArticle {
  id: string;
  title: string;
  link: string;
  description: string | null;
  source: string;
  published_at: string | null;
  is_used: boolean;
}

export function RSSNewsFeed() {
  const [articles, setArticles] = useState<RSSArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchArticles = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/rss-articles?limit=10");
      if (!res.ok) throw new Error("取得に失敗しました");
      const data = await res.json();
      setArticles(data.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "取得に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchArticles();
  }, []);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Newspaper className="h-5 w-5 text-orange-500" />
              最新AIニュース
            </CardTitle>
            <CardDescription>
              RSSフィードから取得した最新記事
            </CardDescription>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={fetchArticles}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading && articles.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="text-center py-8 space-y-2">
            <p className="text-sm text-muted-foreground">{error}</p>
            <Button variant="outline" size="sm" onClick={fetchArticles}>
              再試行
            </Button>
          </div>
        ) : articles.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            記事がありません。設定でRSS自動取得を有効にしてください。
          </p>
        ) : (
          <div className="space-y-3">
            {articles.map((article) => (
              <div
                key={article.id}
                className="flex items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-accent/30"
              >
                <div className="flex-1 min-w-0 space-y-1">
                  <a
                    href={article.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-medium hover:underline line-clamp-2 flex items-start gap-1"
                  >
                    {article.title}
                    <ExternalLink className="h-3 w-3 shrink-0 mt-0.5 text-muted-foreground" />
                  </a>
                  {article.description && (
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {article.description}
                    </p>
                  )}
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                      {article.source}
                    </Badge>
                    {article.published_at && (
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(article.published_at).toLocaleDateString("ja-JP", {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    )}
                    {article.is_used && (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                        投稿済み
                      </Badge>
                    )}
                  </div>
                </div>
                <Button variant="ghost" size="icon" className="shrink-0" asChild>
                  <Link href={`/compose?rss_article_id=${article.id}&rss_title=${encodeURIComponent(article.title)}&rss_url=${encodeURIComponent(article.link)}`}>
                    <PenSquare className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
