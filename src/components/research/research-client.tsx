"use client";

/**
 * リサーチ画面（キーワード検索・競合アカウント）
 * Metaの審査担当者も読めるよう、画面の文言は日本語と英語を併記する
 */
import { useState } from "react";
import { ExternalLink, Loader2, Search, Users } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Post {
  id: string;
  text: string | null;
  mediaType: string | null;
  permalink: string | null;
  timestamp: string | null;
  username: string | null;
  isQuotePost: boolean;
}

interface Profile {
  username: string;
  name: string | null;
  profilePictureUrl: string | null;
  biography: string | null;
  isVerified: boolean;
  followerCount: number | null;
  likesCount: number | null;
  quotesCount: number | null;
  repostsCount: number | null;
  viewsCount: number | null;
}

const numberFormat = new Intl.NumberFormat("ja-JP");

function formatCount(value: number | null): string {
  return value === null ? "—" : numberFormat.format(value);
}

function formatTime(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleString("ja-JP", { dateStyle: "medium", timeStyle: "short" });
}

async function readError(res: Response, fallback: string): Promise<string> {
  const body = await res.json().catch(() => null);
  return (body as { error?: string } | null)?.error ?? fallback;
}

function ErrorMessage({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
      {message}
    </div>
  );
}

function PostList({ posts }: { posts: Post[] }) {
  if (posts.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        該当する投稿はありません / No posts found.
      </p>
    );
  }

  return (
    <ul className="divide-y rounded-lg border">
      {posts.map((post) => (
        <li key={post.id} className="space-y-1 p-3">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {post.username && <span className="font-medium text-foreground">@{post.username}</span>}
            <span>{formatTime(post.timestamp)}</span>
            {post.mediaType && <Badge variant="outline">{post.mediaType}</Badge>}
            {post.isQuotePost && <Badge variant="outline">QUOTE</Badge>}
          </div>
          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed line-clamp-6">
            {post.text ?? "（本文なし / No text）"}
          </p>
          {post.permalink && (
            <a
              href={post.permalink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              Threadsで開く / Open on Threads
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </li>
      ))}
    </ul>
  );
}

function KeywordSearch() {
  const [query, setQuery] = useState("");
  const [searchType, setSearchType] = useState<"RECENT" | "TOP">("RECENT");
  const [searchMode, setSearchMode] = useState<"KEYWORD" | "TAG">("KEYWORD");
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ q: query.trim(), type: searchType, mode: searchMode });
      const res = await fetch(`/api/research/search?${params}`);
      if (!res.ok) {
        setPosts(null);
        setError(await readError(res, "検索に失敗しました / Search failed."));
        return;
      }
      const body = await res.json();
      setPosts(body.data ?? []);
    } catch {
      setPosts(null);
      setError("通信に失敗しました / Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>キーワード検索 / Keyword search</CardTitle>
        <CardDescription>
          自分の分野の話題を、Threadsの公開投稿から探します。自分の投稿の計画と返信に使います。
          <br />
          Find public Threads posts about topics in your field to plan your own posts and replies.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form
          onSubmit={handleSubmit}
          className="grid items-end gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_170px_200px_auto]"
        >
          <div className="space-y-1.5">
            <Label htmlFor="research-query">キーワード / Keyword</Label>
            <Input
              id="research-query"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="例: Codex / e.g. Codex"
              maxLength={100}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="research-type">並び順 / Sort</Label>
            <Select value={searchType} onValueChange={(value) => setSearchType(value as "RECENT" | "TOP")}>
              <SelectTrigger id="research-type" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="RECENT">新しい順 / Recent</SelectItem>
                <SelectItem value="TOP">人気順 / Top</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="research-mode">検索の種類 / Search by</Label>
            <Select value={searchMode} onValueChange={(value) => setSearchMode(value as "KEYWORD" | "TAG")}>
              <SelectTrigger id="research-mode" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="KEYWORD">キーワード / Keyword</SelectItem>
                <SelectItem value="TAG">トピックタグ / Topic tag</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button type="submit" disabled={loading || !query.trim()}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            検索 / Search
          </Button>
        </form>

        {error && <ErrorMessage message={error} />}
        {posts && <PostList posts={posts} />}
      </CardContent>
    </Card>
  );
}

function CompetitorLookup() {
  const [username, setUsername] = useState("");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!username.trim()) return;

    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ username: username.trim() });
      const res = await fetch(`/api/research/profile?${params}`);
      if (!res.ok) {
        setProfile(null);
        setPosts([]);
        setError(await readError(res, "取得に失敗しました / Lookup failed."));
        return;
      }
      const body = await res.json();
      setProfile(body.data?.profile ?? null);
      setPosts(body.data?.posts ?? []);
    } catch {
      setProfile(null);
      setPosts([]);
      setError("通信に失敗しました / Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const stats: { label: string; value: number | null }[] = profile
    ? [
        { label: "フォロワー / Followers", value: profile.followerCount },
        { label: "閲覧（7日）/ Views (7 days)", value: profile.viewsCount },
        { label: "いいね（7日）/ Likes (7 days)", value: profile.likesCount },
        { label: "再投稿（7日）/ Reposts (7 days)", value: profile.repostsCount },
        { label: "引用（7日）/ Quotes (7 days)", value: profile.quotesCount },
      ]
    : [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>競合アカウント / Competitors</CardTitle>
        <CardDescription>
          同じ分野の公開アカウントのプロフィールと公開投稿を見て、自分の発信と比べます（フォロワー100人以上の公開アカウントのみ）。
          <br />
          Look up public accounts in your field and compare their public numbers and posts with yours (public profiles with at least 100 followers).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={handleSubmit} className="grid items-end gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
          <div className="space-y-1.5">
            <Label htmlFor="research-username">ユーザー名 / Username</Label>
            <Input
              id="research-username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="例: threads / e.g. threads"
              maxLength={31}
            />
          </div>
          <Button type="submit" disabled={loading || !username.trim()}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users className="h-4 w-4" />}
            調べる / Look up
          </Button>
        </form>

        {error && <ErrorMessage message={error} />}

        {profile && (
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              {profile.profilePictureUrl && (
                // 外部のプロフィール画像はそのまま表示する（next/image の許可ドメイン設定を増やさない）
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={profile.profilePictureUrl}
                  alt=""
                  className="h-12 w-12 shrink-0 rounded-full border object-cover"
                />
              )}
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{profile.name ?? profile.username}</span>
                  <span className="text-sm text-muted-foreground">@{profile.username}</span>
                  {profile.isVerified && <Badge variant="secondary">認証済み / Verified</Badge>}
                </div>
                {profile.biography && (
                  <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">
                    {profile.biography}
                  </p>
                )}
              </div>
            </div>

            <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
              {stats.map((stat) => (
                <div key={stat.label} className="rounded-lg border p-3">
                  <dt className="text-xs text-muted-foreground">{stat.label}</dt>
                  <dd className="mt-1 text-lg font-semibold tabular-nums">{formatCount(stat.value)}</dd>
                </div>
              ))}
            </dl>

            <div className="space-y-2">
              <h3 className="text-sm font-medium">最近の公開投稿 / Recent public posts</h3>
              <PostList posts={posts} />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function ResearchClient() {
  return (
    <div className="space-y-4">
      <Tabs defaultValue="keyword">
        {/* 幅の狭い画面（スマホ・タブレット）では英語を省いて1行に収める */}
        <TabsList className="w-full lg:w-fit">
          <TabsTrigger value="keyword">
            <Search className="h-4 w-4" />
            <span className="lg:hidden">キーワード検索</span>
            <span className="hidden lg:inline">キーワード検索 / Keyword search</span>
          </TabsTrigger>
          <TabsTrigger value="competitors">
            <Users className="h-4 w-4" />
            <span className="lg:hidden">競合アカウント</span>
            <span className="hidden lg:inline">競合アカウント / Competitors</span>
          </TabsTrigger>
        </TabsList>
        <TabsContent value="keyword">
          <KeywordSearch />
        </TabsContent>
        <TabsContent value="competitors">
          <CompetitorLookup />
        </TabsContent>
      </Tabs>
      <p className="text-xs text-muted-foreground">
        検索・取得した結果は保存しません。/ Search and lookup results are not stored.
      </p>
    </div>
  );
}
