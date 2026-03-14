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
    title: "AI自動投稿 — 承認待ち",
    description: truncated,
    color: 0xf59e0b,
    fields: [
      ...(preview.articleTitle
        ? [{ name: "元記事", value: preview.articleTitle, inline: true }]
        : []),
      ...(preview.sourceUrl
        ? [{ name: "ソース", value: preview.sourceUrl, inline: true }]
        : []),
      { name: "承認方法", value: `[下書き一覧で承認/却下](${approvalUrl})`, inline: false },
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
