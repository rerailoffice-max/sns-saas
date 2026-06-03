/**
 * 投稿スタジオ（Phase 2a）
 * URL/テーマ → 関連動画リサーチ → 候補選択 → ツリー型生成（図解/字幕動画）
 * → プレビュー編集 → 承認 → 即時/予約投稿（複数アカウント対応）
 */
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { PostStudio } from "@/components/studio/post-studio";

export default async function StudioPage() {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">投稿スタジオ</h1>
        <p className="text-sm text-muted-foreground">
          環境変数が未設定です（NEXT_PUBLIC_SUPABASE_URL / ANON_KEY）。
        </p>
      </div>
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: accounts } = await supabase
    .from("social_accounts")
    .select("id, platform, username, display_name")
    .eq("profile_id", user.id)
    .eq("is_active", true)
    .order("created_at", { ascending: true });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">投稿スタジオ</h1>
        <p className="text-sm text-muted-foreground">
          URLやテーマから関連動画をリサーチし、図解つきツリーを作って投稿します。
        </p>
      </div>
      <PostStudio accounts={accounts ?? []} />
    </div>
  );
}
