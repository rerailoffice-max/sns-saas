/**
 * 投稿作成ページ
 * 下書き作成 → 即時投稿 or 予約投稿
 * ?draft=<id> で下書き編集モード
 */
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { PostEditor } from "@/components/compose/post-editor";

interface ComposePageProps {
  searchParams: Promise<{ draft?: string }>;
}

export default async function ComposePage({ searchParams }: ComposePageProps) {
  const params = await searchParams;

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

  const { data: accounts } = await supabase
    .from("social_accounts")
    .select("id, platform, username, display_name")
    .eq("profile_id", user.id)
    .eq("is_active", true)
    .order("created_at", { ascending: true });

  let initialDraft: {
    id: string;
    text: string;
    media_urls: string[];
    account_id: string;
    hashtags: string[];
  } | null = null;

  if (params.draft) {
    const { data: draft } = await supabase
      .from("drafts")
      .select("id, text, media_urls, account_id, hashtags")
      .eq("id", params.draft)
      .eq("profile_id", user.id)
      .single();

    if (draft) {
      initialDraft = draft;
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">
        {initialDraft ? "下書きを編集" : "投稿作成"}
      </h1>
      <PostEditor accounts={accounts ?? []} initialDraft={initialDraft} />
    </div>
  );
}
