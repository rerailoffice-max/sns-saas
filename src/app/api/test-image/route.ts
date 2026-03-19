/**
 * テスト用: インフォグラフィック画像生成の動作確認
 * POST /api/test-image
 * Body: { articleTitle, articleSummary }
 *
 * デプロイ後に削除すること
 */
import { generateInfographicImage } from "@/lib/image-generator";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 120;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { articleTitle, articleSummary } = body;

    if (!articleTitle) {
      return NextResponse.json({ error: "articleTitle required" }, { status: 400 });
    }

    console.log("テスト画像生成開始:", articleTitle);

    const result = await generateInfographicImage({
      articleTitle,
      articleSummary: articleSummary || articleTitle,
      threadPosts: [
        `${articleTitle}の最新動向について解説`,
        "①主要ポイント ②影響範囲 ③今後の展望",
        "業界全体への影響と日本市場への示唆",
      ],
    });

    if (!result) {
      return NextResponse.json({ error: "画像生成失敗（null返却）" }, { status: 500 });
    }

    // 画像をbase64で返す
    return NextResponse.json({
      success: true,
      mimeType: result.mimeType,
      sizeBytes: result.buffer.length,
      imageBase64: result.buffer.toString("base64").slice(0, 100) + "...",
    });
  } catch (err) {
    console.error("テスト画像生成エラー:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
