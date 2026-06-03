/**
 * リール台本ジェネレーター
 * X投稿URLからInstagramリール用トーク台本を3パターン生成
 */
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Video } from "lucide-react";
import { ReelScriptGenerator } from "@/components/reel-script/reel-script-generator";

export default async function ReelScriptPage() {
  // デモモード
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <Video className="h-6 w-6 text-purple-500" />
          <h1 className="text-2xl font-bold">リール台本</h1>
        </div>
        <div className="rounded-lg border bg-card p-8">
          <p className="text-sm text-muted-foreground text-center">
            Supabaseを設定するとリール台本生成機能が使えます。
          </p>
        </div>
      </div>
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Video className="h-6 w-6 text-purple-500" />
        <h1 className="text-2xl font-bold">リール台本</h1>
      </div>
      <p className="text-sm text-muted-foreground">
        X(Twitter)の投稿URLを入力すると、Instagramリール用のトーク台本を3パターン生成します。
      </p>
      <ReelScriptGenerator />
    </div>
  );
}
