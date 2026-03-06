/**
 * 予約管理ページ（カレンダービュー）
 * Server Component - Supabase からデータ取得後、クライアントコンポーネントに渡す
 * デモモード対応 + profile_idバグ修正（scheduled_postsにprofile_idカラムなし）
 *
 * searchParams:
 *   - month: YYYY-MM 形式（省略時は現在の月）
 */
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { SchedulePageClient } from "@/components/schedule/schedule-page-client";

// ============================================================
// ユーティリティ
// ============================================================

/** 現在の年月をYYYY-MM形式で取得 */
function getCurrentMonth(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

/** YYYY-MM形式から月初・月末のISO文字列を返す */
function getMonthRange(monthStr: string): { from: string; to: string } {
  const [year, month] = monthStr.split("-").map(Number);
  // 前月の最終週（カレンダー表示に必要な範囲）
  const from = new Date(year, month - 1, -6);
  // 翌月の第1週（カレンダー表示に必要な範囲）
  const to = new Date(year, month, 7);
  return {
    from: from.toISOString(),
    to: to.toISOString(),
  };
}

/** YYYY-MM形式のバリデーション */
function isValidMonth(monthStr: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(monthStr);
}

// ============================================================
// ページコンポーネント
// ============================================================

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  // 表示月の決定
  const params = await searchParams;
  const rawMonth = params.month;
  const currentMonth =
    rawMonth && isValidMonth(rawMonth) ? rawMonth : getCurrentMonth();

  // デモモード: Supabase未設定時は空データで表示
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">予約管理</h1>
        </div>
        <SchedulePageClient
          scheduledPosts={[]}
          drafts={[]}
          accounts={[]}
          currentMonth={currentMonth}
        />
      </div>
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 認証チェック
  if (!user) {
    redirect("/login");
  }

  const { from, to } = getMonthRange(currentMonth);

  // まずユーザーのアクティブなアカウントIDを取得
  const { data: accounts } = await supabase
    .from("social_accounts")
    .select("*")
    .eq("profile_id", user.id)
    .eq("is_active", true)
    .order("created_at", { ascending: true });

  const accountIds = accounts?.map((a) => a.id) ?? [];

  // ------------------------------------------
  // データ取得を並行実行
  // ------------------------------------------
  const [scheduledPostsResult, draftsResult] = await Promise.all([
    // 1. 予約投稿一覧（下書き情報付き）— account_id経由でフィルタ
    accountIds.length > 0
      ? supabase
          .from("scheduled_posts")
          .select("*, drafts(*)")
          .in("account_id", accountIds)
          .gte("scheduled_at", from)
          .lte("scheduled_at", to)
          .order("scheduled_at", { ascending: true })
      : Promise.resolve({ data: [] }),

    // 2. 利用可能な下書き（status=draft のみ）
    supabase
      .from("drafts")
      .select("*")
      .eq("profile_id", user.id)
      .eq("status", "draft")
      .order("updated_at", { ascending: false }),
  ]);

  const scheduledPosts = scheduledPostsResult.data ?? [];
  const drafts = draftsResult.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">予約管理</h1>
      </div>

      <SchedulePageClient
        scheduledPosts={scheduledPosts}
        drafts={drafts}
        accounts={accounts ?? []}
        currentMonth={currentMonth}
      />
    </div>
  );
}
