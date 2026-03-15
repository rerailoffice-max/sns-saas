/**
 * Discord Bot API を使った DM 通知ユーティリティ
 * 承認フローで管理者に下書きプレビューを送信する
 */

const DISCORD_API_BASE = "https://discord.com/api/v10";

interface DraftPreview {
  draftId: string;
  threadPosts: string[];
  articleTitle?: string;
  sourceUrl?: string;
  appUrl?: string;
  scheduledAt?: Date;
}

export interface BatchDraftPreview {
  draftId: string;
  articleTitle: string;
  firstPost: string;
  threadPosts: string[];      // 全スレッド投稿
  jaArticleUrl?: string;
  slotLabel: string;
  slotTime: Date;
}

export interface BatchApprovalResult {
  channelId: string;
  messageId: string;
}

const THREAD_LABELS = ["フック", "要点", "深掘り", "まとめ"];

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
  if (res.status === 204) return true;
  return res.json();
}

async function getOrCreateDMChannel(userId: string): Promise<string | null> {
  const data = await discordFetch("/users/@me/channels", {
    method: "POST",
    body: JSON.stringify({ recipient_id: userId }),
  });
  return data?.id ?? null;
}

export async function sendApprovalDM(preview: DraftPreview): Promise<boolean> {
  const ownerId = process.env.DISCORD_OWNER_ID;
  if (!ownerId || !process.env.DISCORD_BOT_TOKEN) {
    console.warn("Discord DM通知: DISCORD_BOT_TOKEN or DISCORD_OWNER_ID 未設定");
    return false;
  }

  const channelId = await getOrCreateDMChannel(ownerId);
  if (!channelId) return false;

  const postPreview = preview.threadPosts
    .map((p, i) => `**投稿${i + 1}:**\n${p}`)
    .join("\n\n");

  const truncated =
    postPreview.length > 1800
      ? postPreview.slice(0, 1800) + "\n...（省略）"
      : postPreview;

  const approvalUrl = preview.appUrl
    ? `${preview.appUrl}/drafts`
    : "アプリの下書き一覧から確認";

  const embed = {
    title: "AI自動投稿 — 予約完了",
    description: truncated,
    color: 0x22c55e,
    fields: [
      ...(preview.scheduledAt
        ? [{
            name: "投稿予定時刻",
            value: preview.scheduledAt.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" }),
            inline: true,
          }]
        : []),
      ...(preview.articleTitle
        ? [{ name: "元記事", value: preview.articleTitle, inline: true }]
        : []),
      ...(preview.sourceUrl
        ? [{ name: "ソース", value: preview.sourceUrl, inline: true }]
        : []),
      { name: "今すぐ投稿 / キャンセル", value: `[下書き一覧で操作](${approvalUrl})`, inline: false },
    ],
    footer: { text: `Draft ID: ${preview.draftId}` },
    timestamp: new Date().toISOString(),
  };

  const result = await discordFetch(`/channels/${channelId}/messages`, {
    method: "POST",
    body: JSON.stringify({ embeds: [embed] }),
  });

  return !!result;
}

/**
 * 1件の投稿プレビューをフォーマット
 * 各スレッド投稿（フック・要点・深掘り・まとめ）を構造化表示
 */
function formatPostPreview(p: BatchDraftPreview, index: number): string {
  const link = p.jaArticleUrl ? `🔗 ${p.jaArticleUrl}` : "";

  const threadLines = p.threadPosts
    .map((post, i) => {
      const label = THREAD_LABELS[i] ?? `投稿${i + 1}`;
      const truncated = post.length > 300 ? post.slice(0, 300) + "..." : post;
      return `📝 **${i + 1}. ${label}:**\n${truncated}`;
    })
    .join("\n\n");

  return [
    `**━━━ 【${index + 1}】${p.slotLabel}の枠 ━━━**`,
    `📰 **${p.articleTitle}**`,
    link,
    "",
    threadLines,
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * 複数の下書きをまとめてDMに送信する（バッチ承認フロー用）
 * ✅ リアクションで全件承認、❌ で全件却下
 *
 * 4000文字制限対策: 投稿を複数メッセージに分割
 * リアクションは最初のメッセージに追加
 */
export async function sendBatchApprovalDM(
  previews: BatchDraftPreview[],
  appUrl?: string
): Promise<BatchApprovalResult | null> {
  const ownerId = process.env.DISCORD_OWNER_ID;
  if (!ownerId || !process.env.DISCORD_BOT_TOKEN) {
    console.warn("Discord DM通知: DISCORD_BOT_TOKEN or DISCORD_OWNER_ID 未設定");
    return null;
  }

  const channelId = await getOrCreateDMChannel(ownerId);
  if (!channelId) return null;

  const now = new Date();
  const dateLabel = now.toLocaleDateString("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const draftsUrl = appUrl ? `${appUrl}/drafts` : null;
  const urlLine = draftsUrl ? `[📋 下書き一覧で確認](${draftsUrl})` : "";

  // ヘッダーメッセージ（リアクション用）
  const headerContent = [
    `📋 **AI自動投稿 下書き ${previews.length}件** — ${dateLabel}`,
    "",
    "─────────────────────",
    "✅ でまとめて承認してカレンダーに予約",
    "❌ で全件却下",
    "💬 返信で個別修正（例:「1を修正して：〇〇」）",
    urlLine,
  ]
    .filter(Boolean)
    .join("\n");

  const headerResult = await discordFetch(`/channels/${channelId}/messages`, {
    method: "POST",
    body: JSON.stringify({ content: headerContent }),
  });

  if (!headerResult?.id) return null;

  const mainMessageId = headerResult.id;

  // ✅❌ リアクションを追加
  await discordFetch(
    `/channels/${channelId}/messages/${mainMessageId}/reactions/%E2%9C%85/@me`,
    { method: "PUT" }
  );
  await discordFetch(
    `/channels/${channelId}/messages/${mainMessageId}/reactions/%E2%9D%8C/@me`,
    { method: "PUT" }
  );

  // 各投稿を個別メッセージとして送信（文字数制限対策）
  for (let i = 0; i < previews.length; i++) {
    const preview = previews[i];
    const formatted = formatPostPreview(preview, i);

    // 3900文字に収まるよう切り詰め
    const content = formatted.length > 3900
      ? formatted.slice(0, 3900) + "\n...（省略）"
      : formatted;

    const postResult = await discordFetch(`/channels/${channelId}/messages`, {
      method: "POST",
      body: JSON.stringify({ content }),
    });

    // 各投稿にも ✅❌ リアクションを追加
    if (postResult?.id) {
      await discordFetch(
        `/channels/${channelId}/messages/${postResult.id}/reactions/%E2%9C%85/@me`,
        { method: "PUT" }
      );
      await discordFetch(
        `/channels/${channelId}/messages/${postResult.id}/reactions/%E2%9D%8C/@me`,
        { method: "PUT" }
      );
    }
  }

  return {
    channelId,
    messageId: mainMessageId,
  };
}
