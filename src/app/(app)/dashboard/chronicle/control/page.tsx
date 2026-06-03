/**
 * クロニキ 自動投稿 コントロールパネル (v7.19 / 2026-05-18)
 * 自動投稿 ON/OFF トグル、停止理由表示、操作履歴。
 */
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChronicleControlClient } from "@/components/chronicle/control-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const PROFILE_ID = "51cf47ef-ba5b-4a21-8062-77e7102a2847";

type ControlRow = {
  profile_id: string;
  paused: boolean;
  paused_reason: string | null;
  paused_at: string | null;
  paused_by: string | null;
  resumed_at: string | null;
  history: Array<{ at: string; action: string; by?: string; reason?: string }>;
  updated_at: string;
};

export default async function ChronicleControlPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("chronicle_publish_control")
    .select("*")
    .eq("profile_id", PROFILE_ID)
    .maybeSingle();

  if (error) {
    return (
      <Card>
        <CardHeader><CardTitle>自動投稿コントロール</CardTitle></CardHeader>
        <CardContent>
          <p className="text-destructive text-sm">読み込みエラー: {error.message}</p>
        </CardContent>
      </Card>
    );
  }

  const state = (data as ControlRow | null) || {
    profile_id: PROFILE_ID,
    paused: false,
    paused_reason: null,
    paused_at: null,
    paused_by: null,
    resumed_at: null,
    history: [],
    updated_at: new Date().toISOString(),
  };

  return <ChronicleControlClient state={state} />;
}
