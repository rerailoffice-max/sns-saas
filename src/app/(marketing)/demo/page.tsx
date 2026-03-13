/**
 * デモページ（認証不要）
 * ダッシュボード・投稿作成・分析のUIをモックデータで表示
 */
"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  BarChart3, TrendingUp, Users, FileText, Calendar, PenSquare,
  Heart, MessageCircle, Repeat2, Eye, LayoutDashboard, BarChart2,
  Settings, Zap,
} from "lucide-react";
import { FollowersChart } from "@/components/dashboard/followers-chart";
import { EngagementChart } from "@/components/dashboard/engagement-chart";

/** モックフォロワーデータ */
const MOCK_FOLLOWERS = Array.from({ length: 30 }, (_, i) => {
  const d = new Date();
  d.setDate(d.getDate() - 29 + i);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return {
    rawDate: `${y}-${m}-${day}`,
    date: d.toLocaleDateString("ja-JP", { month: "short", day: "numeric" }),
    count: 1200 + Math.floor(Math.random() * 50) + i * 8,
  };
});

/** モックエンゲージメントデータ */
const MOCK_ENGAGEMENT = Array.from({ length: 14 }, (_, i) => {
  const date = new Date();
  date.setDate(date.getDate() - 13 + i);
  return {
    date: date.toLocaleDateString("ja-JP", { month: "short", day: "numeric" }),
    likes: 20 + Math.floor(Math.random() * 40),
    replies: 5 + Math.floor(Math.random() * 15),
    reposts: 3 + Math.floor(Math.random() * 10),
  };
});

/** モック投稿データ */
const MOCK_POSTS = [
  { id: "1", text: "Threadsの新機能について解説します。APIが公開されて...", posted_at: "2025-03-05T10:00:00Z", likes: 45, replies: 12, reposts: 8, impressions: 1200 },
  { id: "2", text: "SNS運用のコツ：投稿時間の最適化について考えてみた。", posted_at: "2025-03-04T18:00:00Z", likes: 38, replies: 9, reposts: 5, impressions: 980 },
  { id: "3", text: "AI活用でSNS運用が変わる。自動分析機能の紹介。", posted_at: "2025-03-03T12:00:00Z", likes: 62, replies: 18, reposts: 15, impressions: 2100 },
  { id: "4", text: "週末のコンテンツ戦略。リーチを最大化するために。", posted_at: "2025-03-02T09:00:00Z", likes: 29, replies: 7, reposts: 4, impressions: 750 },
  { id: "5", text: "フォロワー1000人突破！感謝の気持ちを込めて。", posted_at: "2025-03-01T15:00:00Z", likes: 89, replies: 25, reposts: 20, impressions: 3500 },
];

type DemoView = "dashboard" | "compose" | "analytics" | "settings";

export default function DemoPage() {
  const [view, setView] = useState<DemoView>("dashboard");

  return (
    <div className="min-h-screen bg-background">
      {/* デモバナー */}
      <div className="border-b bg-primary/5 px-4 py-2 text-center text-sm">
        <Zap className="inline h-4 w-4 mr-1 text-primary" />
        デモモード — 実際のアプリではSupabase接続後にリアルデータが表示されます
      </div>

      <div className="flex">
        {/* サイドバー */}
        <aside className="w-56 border-r min-h-[calc(100vh-40px)] p-4 space-y-1 hidden lg:block">
          <div className="flex items-center gap-2 mb-6 px-2">
            <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-bold text-sm">S</div>
            <span className="font-semibold">SNS Manager</span>
          </div>
          <SidebarItem icon={LayoutDashboard} label="ダッシュボード" active={view === "dashboard"} onClick={() => setView("dashboard")} />
          <SidebarItem icon={PenSquare} label="投稿作成" active={view === "compose"} onClick={() => setView("compose")} />
          <SidebarItem icon={BarChart2} label="投稿分析" active={view === "analytics"} onClick={() => setView("analytics")} />
          <SidebarItem icon={Settings} label="設定" active={view === "settings"} onClick={() => setView("settings")} />
        </aside>

        {/* メイン */}
        <main className="flex-1 p-6 max-w-6xl">
          {/* モバイルナビ */}
          <div className="flex gap-2 mb-4 lg:hidden overflow-x-auto">
            <Button variant={view === "dashboard" ? "default" : "outline"} size="sm" onClick={() => setView("dashboard")}>ダッシュボード</Button>
            <Button variant={view === "compose" ? "default" : "outline"} size="sm" onClick={() => setView("compose")}>投稿作成</Button>
            <Button variant={view === "analytics" ? "default" : "outline"} size="sm" onClick={() => setView("analytics")}>分析</Button>
            <Button variant={view === "settings" ? "default" : "outline"} size="sm" onClick={() => setView("settings")}>設定</Button>
          </div>

          {view === "dashboard" && <DashboardDemo />}
          {view === "compose" && <ComposeDemo />}
          {view === "analytics" && <AnalyticsDemo />}
          {view === "settings" && <SettingsDemo />}
        </main>
      </div>
    </div>
  );
}

/** サイドバーアイテム */
function SidebarItem({ icon: Icon, label, active, onClick }: {
  icon: typeof LayoutDashboard; label: string; active: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium w-full transition-colors ${
        active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"
      }`}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}

/** ダッシュボード画面 */
function DashboardDemo() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">ダッシュボード</h1>
        <Badge variant="outline">直近30日</Badge>
      </div>

      {/* サマリーカード */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">フォロワー数</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">1,438</div>
            <p className="text-xs text-green-600">+12.3% 先月比</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">投稿数</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">24</div>
            <p className="text-xs text-muted-foreground">直近30日間</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">平均エンゲージメント</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">11.3</div>
            <p className="text-xs text-muted-foreground">反応数/投稿</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">予約投稿</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">3</div>
            <p className="text-xs text-muted-foreground">待機中</p>
          </CardContent>
        </Card>
      </div>

      {/* チャート */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>フォロワー推移</CardTitle>
            <CardDescription>直近30日間のフォロワー数変化</CardDescription>
          </CardHeader>
          <CardContent className="h-64">
            <FollowersChart data={MOCK_FOLLOWERS} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>エンゲージメント</CardTitle>
            <CardDescription>いいね・リプライ・リポストの推移</CardDescription>
          </CardHeader>
          <CardContent className="h-64">
            <EngagementChart data={MOCK_ENGAGEMENT} />
          </CardContent>
        </Card>
      </div>

      {/* 最近の投稿 */}
      <Card>
        <CardHeader>
          <CardTitle>最近の投稿</CardTitle>
          <CardDescription>直近の投稿とそのパフォーマンス</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {MOCK_POSTS.map((post) => (
              <div key={post.id} className="flex items-start justify-between border-b pb-4 last:border-0 last:pb-0">
                <div className="flex-1 min-w-0 mr-4">
                  <p className="text-sm truncate">{post.text}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {new Date(post.posted_at).toLocaleDateString("ja-JP")}
                  </p>
                </div>
                <div className="flex items-center gap-4 text-xs text-muted-foreground shrink-0">
                  <span className="flex items-center gap-1"><Heart className="h-3 w-3" />{post.likes}</span>
                  <span className="flex items-center gap-1"><MessageCircle className="h-3 w-3" />{post.replies}</span>
                  <span className="flex items-center gap-1"><Repeat2 className="h-3 w-3" />{post.reposts}</span>
                  <span className="flex items-center gap-1"><Eye className="h-3 w-3" />{post.impressions.toLocaleString()}</span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/** 投稿作成画面 */
function ComposeDemo() {
  const [text, setText] = useState("Threadsの新機能について解説します！\n\n#Threads #SNS運用 #AI活用");
  const maxLength = 500;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">投稿作成</h1>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* エディター */}
        <Card>
          <CardHeader>
            <CardTitle>テキスト入力</CardTitle>
            <CardDescription>投稿内容を入力してください</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="w-full min-h-[200px] resize-none rounded-lg border bg-background p-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="投稿内容を入力..."
            />
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className={`h-2 rounded-full ${text.length > maxLength ? 'bg-destructive' : text.length > maxLength * 0.8 ? 'bg-yellow-500' : 'bg-green-500'}`}
                  style={{ width: `${Math.min(100, (text.length / maxLength) * 100)}%`, minWidth: '4px', maxWidth: '120px' }}
                />
                <span className={`text-xs ${text.length > maxLength ? 'text-destructive' : 'text-muted-foreground'}`}>
                  {text.length}/{maxLength}
                </span>
              </div>
              <Badge variant="outline">Threads</Badge>
            </div>
            <div className="flex gap-2">
              <Button className="flex-1">下書き保存</Button>
              <Button variant="outline" className="flex-1">予約投稿</Button>
              <Button variant="default" className="flex-1">今すぐ投稿</Button>
            </div>
          </CardContent>
        </Card>

        {/* プレビュー */}
        <Card>
          <CardHeader>
            <CardTitle>プレビュー</CardTitle>
            <CardDescription>Threadsでの表示イメージ</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-xl border bg-card p-4 space-y-3">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-500" />
                <div>
                  <p className="text-sm font-semibold">your_username</p>
                  <p className="text-xs text-muted-foreground">たった今</p>
                </div>
              </div>
              <p className="text-sm whitespace-pre-wrap">{text || "テキストを入力してください..."}</p>
              <div className="flex items-center gap-6 text-muted-foreground pt-2 border-t">
                <Heart className="h-4 w-4" />
                <MessageCircle className="h-4 w-4" />
                <Repeat2 className="h-4 w-4" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/** 分析画面 */
function AnalyticsDemo() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">投稿分析</h1>

      {/* トップ投稿ランキング */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            トップ投稿ランキング
          </CardTitle>
          <CardDescription>エンゲージメントが高い投稿</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[...MOCK_POSTS].sort((a, b) => (b.likes + b.replies + b.reposts) - (a.likes + a.replies + a.reposts)).map((post, i) => (
              <div key={post.id} className="flex items-center gap-4 rounded-lg border p-3">
                <div className={`flex h-8 w-8 items-center justify-center rounded-full font-bold text-sm ${
                  i === 0 ? 'bg-yellow-100 text-yellow-700' :
                  i === 1 ? 'bg-gray-100 text-gray-700' :
                  i === 2 ? 'bg-orange-100 text-orange-700' :
                  'bg-muted text-muted-foreground'
                }`}>
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate">{post.text}</p>
                </div>
                <div className="flex items-center gap-3 text-xs shrink-0">
                  <span className="flex items-center gap-1"><Heart className="h-3 w-3 text-red-500" />{post.likes}</span>
                  <span className="flex items-center gap-1"><MessageCircle className="h-3 w-3 text-blue-500" />{post.replies}</span>
                  <span className="flex items-center gap-1"><Repeat2 className="h-3 w-3 text-green-500" />{post.reposts}</span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* エンゲージメントチャート */}
      <Card>
        <CardHeader>
          <CardTitle>エンゲージメント推移</CardTitle>
          <CardDescription>日別のエンゲージメント数</CardDescription>
        </CardHeader>
        <CardContent className="h-64">
          <EngagementChart data={MOCK_ENGAGEMENT} />
        </CardContent>
      </Card>
    </div>
  );
}

/** 設定画面 */
function SettingsDemo() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">設定</h1>

      <div className="flex flex-col gap-6 lg:flex-row">
        <nav className="lg:w-56 shrink-0">
          <ul className="flex lg:flex-col gap-1">
            {["プロフィール", "SNSアカウント", "課金管理", "APIキー", "通知設定"].map((label) => (
              <li key={label}>
                <div className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted cursor-pointer whitespace-nowrap">
                  {label}
                </div>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex-1">
          <Card>
            <CardHeader>
              <CardTitle>プロフィール設定</CardTitle>
              <CardDescription>表示名やメール通知を設定します</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">表示名</label>
                <input className="w-full rounded-lg border bg-background px-3 py-2 text-sm" defaultValue="SNS太郎" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">メールアドレス</label>
                <input className="w-full rounded-lg border bg-background px-3 py-2 text-sm text-muted-foreground" defaultValue="taro@example.com" disabled />
              </div>
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div>
                  <p className="text-sm font-medium">メール通知</p>
                  <p className="text-xs text-muted-foreground">投稿結果やレポートの通知</p>
                </div>
                <div className="h-6 w-11 rounded-full bg-primary relative cursor-pointer">
                  <div className="absolute right-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow" />
                </div>
              </div>
              <Button>変更を保存</Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
