/**
 * 下書き一覧ページ
 * scheduled_posts をJOINして予約日時も表示
 */
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { DraftsView, type DraftItem } from "@/components/drafts/drafts-view";

const MOCK_DRAFTS: DraftItem[] = [
  {
    id: "1",
    text: "新しいSNS管理ツールを使い始めました。投稿の予約機能が便利すぎる！ #SNS管理",
    status: "draft",
    source: "manual",
    hashtags: ["#SNS管理"],
    media_urls: null,
    metadata: null,
    created_at: "2025-03-05T10:00:00Z",
    updated_at: "2025-03-05T10:00:00Z",
    social_accounts: { username: "demo_user", platform: "threads" },
  },
  {
    id: "2",
    text: "今週のフォロワー分析レポート。成長率が先週比で15%アップ！",
    status: "draft",
    source: "ai",
    hashtags: [],
    media_urls: null,
    metadata: null,
    created_at: "2025-03-04T08:00:00Z",
    updated_at: "2025-03-04T08:00:00Z",
    social_accounts: { username: "demo_user", platform: "threads" },
  },
];

export default async function DraftsPage() {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    return <DraftsView drafts={MOCK_DRAFTS} accountId={null} />;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: drafts } = await supabase
    .from("drafts")
    .select(
      `
      id,
      text,
      status,
      source,
      hashtags,
      media_urls,
      metadata,
      account_id,
      created_at,
      updated_at,
      social_accounts (
        username,
        platform
      ),
      scheduled_posts (
        id,
        scheduled_at,
        status
      )
    `
    )
    .eq("profile_id", user.id)
    .in("status", ["draft", "scheduled"])
    .order("updated_at", { ascending: false });

  const { data: accounts } = await supabase
    .from("social_accounts")
    .select("id")
    .eq("profile_id", user.id)
    .eq("is_active", true)
    .limit(1);

  const primaryAccountId = accounts?.[0]?.id ?? null;

  return (
    <DraftsView
      drafts={(drafts as unknown as DraftItem[]) ?? []}
      accountId={primaryAccountId}
    />
  );
}
