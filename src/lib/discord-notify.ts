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
  firstPost: string;        // 投稿1の冒頭200字
  jaArticleUrl?: string;    // 日本語記事URL
  slotLabel: string;        // 表示用スロット文字列（例: "14:00"）
  slotTime: Date;           // 実際の予定時刻
}

export interface BatchApprovalResult {
  channelId: string;
  messageId: string;
}

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
 * 複数の下書きをまとめて1通のDMに送信する（バッチ承認フロー用）
 * ✅ リアクションで全件承認、❌ で全件却下
 * dev-remote-bot への返信でAI修正指示も受け付ける
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

  // 各投稿の概要を列挙
  const postLines = previews.map((p, i) => {
    const firstLine = p.firstPost.slice(0, 120).replace(/\n/g, " ");
    const link = p.jaArticleUrl ? `\n🔗 ${p.jaArticleUrl}` : "";
    return `**【${i + 1}】${p.slotLabel}の枠 — ${p.articleTitle}**\n「${firstLine}...」${link}`;
  });

  const draftsUrl = appUrl ? `${appUrl}/drafts` : null;
  const urlLine = draftsUrl ? `\n\n[📋 下書き一覧で確認](${draftsUrl})` : "";

  const description = [
    `📋 **AI自動投稿 下書き ${previews.length}件** — ${dateLabel}`,
    "",
    postLines.join("\n\n"),
    "",
    "─────────────────────",
    "✅ でまとめて承認してカレンダーに予約",
    "❌ で全件却下",
    "💬 「1を修正して：〇〇」「2について別の記事を検索して」と返信で個別修正",
    urlLine,
  ]
    .join("\n")
    .slice(0, 3900);

  const result = await discordFetch(`/channels/${channelId}/messages`, {
    method: "POST",
    body: JSON.stringify({
      content: description,
    }),
  });

  if (!result?.id) return null;

  return {
    channelId,
    messageId: result.id,
  };
}
