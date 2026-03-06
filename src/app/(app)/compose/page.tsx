/**
 * 投稿作成ページ
 * 下書き作成 → 即時投稿 or 予約投稿
 * Supabase未接続時はデモアカウントで表示
 */
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { PostEditor } from "@/components/compose/post-editor";

export default async function ComposePage() {
  // Supabase未接続時はデモアカウントで表示
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">投稿作成</h1>
        <PostEditor
          accounts={[
            {
              id: "demo-account",
              platform: "threads",
              username: "demo_user",
              display_name: "デモアカウント",
            },
          ]}
        />
      </div>
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // 接続済みアカウント取得
  const { data: accounts } = await supabase
    .from("social_accounts")
    .select("id, platform, username, display_name")
    .eq("profile_id", user.id)
    .eq("is_active", true)
    .order("created_at", { ascending: true });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">投稿作成</h1>
      <PostEditor accounts={accounts ?? []} />
    </div>
  );
}
