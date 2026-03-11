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
  title_ja: string | null;
  link: string;
  description: string | null;
  description_ja: string | null;
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
      const res = await fetch("/api/rss-articles?limit=15");
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
    <Card className="flex flex-col xl:max-h-[calc(100vh-6rem)]">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Newspaper className="h-4 w-4 text-orange-500" />
              最新AIニュース
            </CardTitle>
            <CardDescription className="text-xs">
              RSSフィードから取得
            </CardDescription>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={fetchArticles}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex-1 overflow-y-auto pt-0">
        {loading && articles.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="text-center py-6 space-y-2">
            <p className="text-xs text-muted-foreground">{error}</p>
            <Button variant="outline" size="sm" onClick={fetchArticles}>
              再試行
            </Button>
          </div>
        ) : articles.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-6">
            記事がありません。設定でRSS自動取得を有効にしてください。
          </p>
        ) : (
          <div className="space-y-2">
            {articles.map((article) => {
              const displayTitle = article.title_ja || article.title;
              const displayDesc = article.description_ja || article.description;

              return (
                <div
                  key={article.id}
                  className="flex items-start gap-2 rounded-lg border p-2.5 transition-colors hover:bg-accent/30"
                >
                  <div className="flex-1 min-w-0 space-y-1">
                    <a
                      href={article.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-medium hover:underline line-clamp-2 leading-relaxed"
                    >
                      {displayTitle}
                      <ExternalLink className="inline h-2.5 w-2.5 ml-1 text-muted-foreground" />
                    </a>
                    {displayDesc && (
                      <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">
                        {displayDesc}
                      </p>
                    )}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Badge variant="outline" className="text-[9px] px-1 py-0 h-4">
                        {article.source}
                      </Badge>
                      {article.published_at && (
                        <span className="text-[9px] text-muted-foreground">
                          {new Date(article.published_at).toLocaleDateString("ja-JP", {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      )}
                      {article.is_used && (
                        <Badge variant="secondary" className="text-[9px] px-1 py-0 h-4">
                          投稿済み
                        </Badge>
                      )}
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" className="shrink-0 h-7 w-7" asChild>
                    <Link href={`/compose?rss_article_id=${article.id}&rss_title=${encodeURIComponent(displayTitle)}&rss_url=${encodeURIComponent(article.link)}`}>
                      <PenSquare className="h-3.5 w-3.5" />
                    </Link>
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
