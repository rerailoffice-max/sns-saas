/**
 * テスト用: インフォグラフィック画像生成 → アップロード → Discord送信
 * POST /api/test-image
 *
 * テスト後に削除すること
 */
import { generateInfographicImage } from "@/lib/image-generator";
import { uploadBufferImage } from "@/lib/media-uploader";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 120;

const DISCORD_API_BASE = "https://discord.com/api/v10";

async function discordFetch(path: string, options: RequestInit = {}) {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) throw new Error("DISCORD_BOT_TOKEN 未設定");
  const res = await fetch(`${DISCORD_API_BASE}${path}`, {
    ...options,
    headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json", ...options.headers },
  });
  if (!res.ok) return null;
  if (res.status === 204) return true;
  return res.json();
}

export async function POST(request: NextRequest) {
  const steps: string[] = [];

  try {
    const body = await request.json();
    const articleTitle = body.articleTitle || "GPT-5.4がローンチ1週間で日5兆トークン処理達成";
    const articleSummary = body.articleSummary || "OpenAIの最新モデルGPT-5.4が1年前のOpenAI全API処理量を1週間で超え、年間売上10億ドル到達。驚異的な普及速度を記録。";

    // Step 1: 画像生成
    steps.push("1. 画像生成開始...");
    const imgResult = await generateInfographicImage({
      articleTitle,
      articleSummary,
      threadPosts: [
        `${articleTitle}の最新動向`,
        "①ローンチ1週間でAPI処理量を突破 ②年間売上10億ドル ③普及速度が過去最速",
        "AI業界全体への影響と日本市場への示唆",
        "あなたのビジネスにどう活用する？",
      ],
    });

    if (!imgResult) {
      return NextResponse.json({ error: "画像生成失敗", steps }, { status: 500 });
    }
    steps.push(`2. 画像生成完了: ${imgResult.mimeType}, ${imgResult.buffer.length} bytes`);

    // Step 2: Supabaseアップロード
    const tempDraftId = `test_${Date.now()}`;
    const imageUrl = await uploadBufferImage(imgResult.buffer, imgResult.mimeType, tempDraftId);
    if (!imageUrl) {
      return NextResponse.json({ error: "アップロード失敗", steps }, { status: 500 });
    }
    steps.push(`3. Supabaseアップロード完了: ${imageUrl}`);

    // Step 3: Discord DM送信
    const ownerId = process.env.DISCORD_OWNER_ID;
    if (!ownerId || !process.env.DISCORD_BOT_TOKEN) {
      return NextResponse.json({ success: true, imageUrl, steps: [...steps, "4. Discord未設定のためDMスキップ"] });
    }

    const channelData = await discordFetch("/users/@me/channels", {
      method: "POST",
      body: JSON.stringify({ recipient_id: ownerId }),
    });
    const channelId = channelData?.id;
    if (!channelId) {
      return NextResponse.json({ success: true, imageUrl, steps: [...steps, "4. DMチャンネル作成失敗"] });
    }

    const embed = {
      title: "🧪 インフォグラフィック生成テスト",
      description: `**${articleTitle}**\n\n${articleSummary}`,
      color: 0x3b82f6,
      image: { url: imageUrl },
      fields: [
        { name: "モデル", value: "gemini-2.5-flash-image (Nano Banana)", inline: true },
        { name: "サイズ", value: `${(imgResult.buffer.length / 1024).toFixed(0)} KB`, inline: true },
        { name: "形式", value: imgResult.mimeType, inline: true },
      ],
      footer: { text: "テスト用 — 次回のrss-autopilotサイクルから自動で画像付きドラフトが生成されます" },
      timestamp: new Date().toISOString(),
    };

    const msgResult = await discordFetch(`/channels/${channelId}/messages`, {
      method: "POST",
      body: JSON.stringify({ embeds: [embed] }),
    });

    steps.push(msgResult ? "4. Discord DM送信完了 ✅" : "4. Discord DM送信失敗");

    return NextResponse.json({ success: true, imageUrl, steps });
  } catch (err) {
    return NextResponse.json({
      error: err instanceof Error ? err.message : String(err),
      steps,
    }, { status: 500 });
  }
}
