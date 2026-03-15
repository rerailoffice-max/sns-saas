/**
 * RSS自動投稿バッチ承認確認 Cronジョブ
 * GET /api/cron/confirm-autopilot (Vercel Cron)
 *
 * 5分ごとに実行:
 * 1. auto_post_batches から status:"waiting" のバッチを取得
 * 2. ヘッダーメッセージの✅→全件承認、❌→全件却下
 * 3. 個別投稿メッセージの✅→その投稿だけ承認、❌→その投稿だけ却下
 * 4. 全投稿が処理済みになったらバッチも完了
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;

const DISCORD_API_BASE = "https://discord.com/api/v10";
const JST_OFFSET = 9 * 60 * 60 * 1000;

async function discordFetch(path: string, options: RequestInit = {}) {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) throw new Error("DISCORD_BOT_TOKEN が未設定です");

  const res = await fetch(`${DISCORD_API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bot ${token}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error(`Discord API error ${res.status}: ${body}`);
    return null;
  }
  if (res.status === 204) return null;
  return res.json();
}

/**
 * 次の空き投稿スロット時間を計算する（DB参照版）
 */
async function calcNextSlot(
  admin: ReturnType<typeof createAdminClient>,
  accountId: string,
  startHour: number,
  endHour: number,
  intervalMinutes: number,
  alreadyAllocated: Set<string>
): Promise<Date> {
  const now = new Date();
  const nowJst = new Date(now.getTime() + JST_OFFSET);

  const fromDate = new Date(now);
  const toDate = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
  const { data: existingPosts } = await admin
    .from("scheduled_posts")
    .select("scheduled_at")
    .eq("account_id", accountId)
    .in("status", ["pending", "processing"])
    .gte("scheduled_at", fromDate.toISOString())
    .lte("scheduled_at", toDate.toISOString());

  const occupiedTimes = new Set(
    (existingPosts ?? []).map((p) => {
      const d = new Date(p.scheduled_at);
      const dJst = new Date(d.getTime() + JST_OFFSET);
      return `${dJst.getUTCFullYear()}-${dJst.getUTCMonth()}-${dJst.getUTCDate()}-${dJst.getUTCHours()}-${Math.floor(dJst.getUTCMinutes() / intervalMinutes) * intervalMinutes}`;
    })
  );

  for (let dayOffset = 0; dayOffset <= 2; dayOffset++) {
    const checkDate = new Date(nowJst.getTime() + dayOffset * 24 * 60 * 60 * 1000);
    const year = checkDate.getUTCFullYear();
    const month = checkDate.getUTCMonth();
    const date = checkDate.getUTCDate();

    for (let hour = startHour; hour < endHour; hour++) {
      for (let min = 0; min < 60; min += intervalMinutes) {
        const slotJst = new Date(Date.UTC(year, month, date, hour, min, 0));
        const slotUtc = new Date(slotJst.getTime() - JST_OFFSET);
        if (slotUtc <= now) continue;

        const slotKey = `${year}-${month}-${date}-${hour}-${min}`;
        if (!occupiedTimes.has(slotKey) && !alreadyAllocated.has(slotKey)) {
          alreadyAllocated.add(slotKey);
          return slotUtc;
        }
      }
    }
  }

  // フォールバック: 翌日の startHour
  const tomorrow = new Date(nowJst.getTime() + 24 * 60 * 60 * 1000);
  const fallbackJst = new Date(Date.UTC(
    tomorrow.getUTCFullYear(),
    tomorrow.getUTCMonth(),
    tomorrow.getUTCDate(),
    startHour, 0, 0
  ));
  return new Date(fallbackJst.getTime() - JST_OFFSET);
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "認証エラー" }, { status: 401 });
  }

  const admin = createAdminClient();
  const botId = process.env.DISCORD_BOT_ID;
  const stats = { batches_checked: 0, batches_approved: 0, batches_rejected: 0, batches_partial: 0, posts_scheduled: 0, posts_rejected: 0 };

  // waiting状態のバッチを取得（作成から72時間以内のもの）
  const cutoff = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();
  const { data: batches, error } = await admin
    .from("auto_post_batches")
    .select("*")
    .eq("status", "waiting")
    .gte("created_at", cutoff)
    .order("created_at", { ascending: true });

  if (error || !batches || batches.length === 0) {
    return NextResponse.json({ message: "確認待ちバッチなし", stats });
  }

  const checkEmoji = "%E2%9C%85"; // ✅
  const crossEmoji = "%E2%9D%8C"; // ❌

  for (const batch of batches) {
    stats.batches_checked++;

    try {
      // ヘッダーメッセージのリアクションを確認（全件操作）
      const headerCheck = await discordFetch(
        `/channels/${batch.discord_channel_id}/messages/${batch.discord_message_id}/reactions/${checkEmoji}`
      );
      const headerCross = await discordFetch(
        `/channels/${batch.discord_channel_id}/messages/${batch.discord_message_id}/reactions/${crossEmoji}`
      );

      const hasHeaderApproval = hasUserReaction(headerCheck, botId);
      const hasHeaderRejection = hasUserReaction(headerCross, botId);

      if (hasHeaderRejection && !hasHeaderApproval) {
        // ヘッダー❌: 全件却下
        await admin
          .from("drafts")
          .update({ status: "rejected" })
          .in("id", batch.draft_ids);

        await admin
          .from("auto_post_batches")
          .update({ status: "rejected", updated_at: new Date().toISOString() })
          .eq("id", batch.id);

        stats.batches_rejected++;
        console.log(`バッチ ${batch.id}: ヘッダー❌で全件却下`);
        continue;
      }

      if (hasHeaderApproval) {
        // ヘッダー✅: 全件承認
        await approveAllDrafts(admin, batch, stats);
        stats.batches_approved++;
        console.log(`バッチ ${batch.id}: ヘッダー✅で全件承認`);

        // 承認完了をDiscordに通知
        await discordFetch(`/channels/${batch.discord_channel_id}/messages`, {
          method: "POST",
          body: JSON.stringify({
            content: `✅ **承認を確認しました！** ${batch.draft_ids.length}件の投稿をカレンダーに予約しました。`,
            message_reference: { message_id: batch.discord_message_id },
          }),
        }).catch(() => {});
        continue;
      }

      // ヘッダーにリアクションなし → 個別投稿メッセージをチェック
      const previewSlots = (batch.preview_slots ?? []) as Array<{
        draft_id: string;
        slot_label: string;
        slot_time: string;
        discord_message_id?: string;
      }>;

      // discord_message_id が格納されていない旧バッチはスキップ
      const hasIndividualMessages = previewSlots.some((s) => s.discord_message_id);
      if (!hasIndividualMessages) continue;

      let approvedDrafts: string[] = [];
      let rejectedDrafts: string[] = [];
      let pendingDrafts: string[] = [];

      for (const slot of previewSlots) {
        if (!slot.discord_message_id) {
          pendingDrafts.push(slot.draft_id);
          continue;
        }

        const postCheck = await discordFetch(
          `/channels/${batch.discord_channel_id}/messages/${slot.discord_message_id}/reactions/${checkEmoji}`
        );
        const postCross = await discordFetch(
          `/channels/${batch.discord_channel_id}/messages/${slot.discord_message_id}/reactions/${crossEmoji}`
        );

        const postApproved = hasUserReaction(postCheck, botId);
        const postRejected = hasUserReaction(postCross, botId);

        if (postApproved) {
          approvedDrafts.push(slot.draft_id);
        } else if (postRejected) {
          rejectedDrafts.push(slot.draft_id);
        } else {
          pendingDrafts.push(slot.draft_id);
        }
      }

      // 個別で何も操作されていなければスキップ
      if (approvedDrafts.length === 0 && rejectedDrafts.length === 0) continue;

      // 承認された投稿をスケジュール登録
      if (approvedDrafts.length > 0) {
        const { data: setting } = await admin
          .from("auto_post_settings")
          .select("schedule_start_hour, schedule_end_hour, schedule_interval_minutes")
          .eq("account_id", batch.account_id)
          .single();

        const startHour = setting?.schedule_start_hour ?? 8;
        const endHour = setting?.schedule_end_hour ?? 22;
        const intervalMinutes = setting?.schedule_interval_minutes ?? 60;
        const alreadyAllocated = new Set<string>();

        for (const draftId of approvedDrafts) {
          const scheduledAt = await calcNextSlot(
            admin, batch.account_id, startHour, endHour, intervalMinutes, alreadyAllocated
          );

          await admin.from("scheduled_posts").insert({
            draft_id: draftId,
            account_id: batch.account_id,
            scheduled_at: scheduledAt.toISOString(),
            status: "pending",
          });

          await admin.from("drafts").update({ status: "scheduled" }).eq("id", draftId);
          stats.posts_scheduled++;
        }
      }

      // 却下された投稿
      if (rejectedDrafts.length > 0) {
        await admin.from("drafts").update({ status: "rejected" }).in("id", rejectedDrafts);
        stats.posts_rejected += rejectedDrafts.length;
      }

      // 全投稿が処理済みか確認してバッチステータスを更新
      if (pendingDrafts.length === 0) {
        const finalStatus = rejectedDrafts.length === batch.draft_ids.length
          ? "rejected"
          : approvedDrafts.length === batch.draft_ids.length
            ? "approved"
            : "partial";

        await admin
          .from("auto_post_batches")
          .update({ status: finalStatus, updated_at: new Date().toISOString() })
          .eq("id", batch.id);

        if (finalStatus === "partial") stats.batches_partial++;
        else if (finalStatus === "approved") stats.batches_approved++;
        else stats.batches_rejected++;

        console.log(`バッチ ${batch.id}: 個別承認完了 (${finalStatus}) — 承認${approvedDrafts.length}件, 却下${rejectedDrafts.length}件`);

        // 結果通知
        await discordFetch(`/channels/${batch.discord_channel_id}/messages`, {
          method: "POST",
          body: JSON.stringify({
            content: `📊 **個別承認結果:** ✅${approvedDrafts.length}件予約 / ❌${rejectedDrafts.length}件却下`,
            message_reference: { message_id: batch.discord_message_id },
          }),
        }).catch(() => {});
      }
    } catch (err) {
      console.error(`バッチ処理エラー [${batch.id}]:`, err);
    }
  }

  return NextResponse.json({ message: "完了", stats });
}

/**
 * ユーザーのリアクションがあるか（Bot自身のリアクションは除外）
 */
function hasUserReaction(reactions: unknown, botId?: string): boolean {
  if (!Array.isArray(reactions) || reactions.length === 0) return false;
  // Botしかリアクションしていない場合はfalse
  if (botId) {
    return reactions.some((r: { id?: string }) => r.id !== botId);
  }
  // botId未設定の場合: 2人以上リアクションしていれば（Bot+ユーザー）
  return reactions.length >= 2;
}

/**
 * バッチ内の全下書きをスケジュール登録
 */
async function approveAllDrafts(
  admin: ReturnType<typeof createAdminClient>,
  batch: { id: string; account_id: string; draft_ids: string[]; discord_channel_id: string; discord_message_id: string },
  stats: { posts_scheduled: number }
) {
  const { data: setting } = await admin
    .from("auto_post_settings")
    .select("schedule_start_hour, schedule_end_hour, schedule_interval_minutes")
    .eq("account_id", batch.account_id)
    .single();

  const startHour = setting?.schedule_start_hour ?? 8;
  const endHour = setting?.schedule_end_hour ?? 22;
  const intervalMinutes = setting?.schedule_interval_minutes ?? 60;
  const alreadyAllocated = new Set<string>();

  for (const draftId of batch.draft_ids) {
    const scheduledAt = await calcNextSlot(
      admin, batch.account_id, startHour, endHour, intervalMinutes, alreadyAllocated
    );

    await admin.from("scheduled_posts").insert({
      draft_id: draftId,
      account_id: batch.account_id,
      scheduled_at: scheduledAt.toISOString(),
      status: "pending",
    });

    await admin.from("drafts").update({ status: "scheduled" }).eq("id", draftId);
    stats.posts_scheduled++;
  }

  await admin
    .from("auto_post_batches")
    .update({ status: "approved", updated_at: new Date().toISOString() })
    .eq("id", batch.id);
}
