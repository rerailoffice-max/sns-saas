/**
 * テスト用: インフォグラフィック画像生成の動作確認
 * POST /api/test-image
 *
 * デプロイ後に削除すること
 */
import { GoogleGenAI } from "@google/genai";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 120;

export async function POST(request: NextRequest) {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "GOOGLE_AI_API_KEY 未設定" }, { status: 500 });
  }

  try {
    const body = await request.json();
    const { articleTitle } = body;

    const ai = new GoogleGenAI({ apiKey });

    const prompt = `以下のAIニュースをインフォグラフィック画像にしてください。白背景、16:9、コンサルティングファーム風の図解。

タイトル: ${articleTitle || "GPT-5.4が1週間で日5兆トークン処理達成"}

キーポイント:
1. ローンチ1週間で1年前のOpenAI全API処理量を突破
2. 年間売上10億ドル到達
3. 驚異的な普及速度`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-image-generation",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: { responseModalities: ["IMAGE", "TEXT"] },
    });

    const candidates = response.candidates;
    const parts = candidates?.[0]?.content?.parts;

    if (!parts || parts.length === 0) {
      return NextResponse.json({
        error: "partsなし",
        candidatesCount: candidates?.length ?? 0,
        finishReason: candidates?.[0]?.finishReason,
        rawResponse: JSON.stringify(response).slice(0, 500),
      }, { status: 500 });
    }

    // パーツの情報を返す
    const partsInfo = parts.map((p, i) => ({
      index: i,
      hasText: !!p.text,
      textPreview: p.text?.slice(0, 100),
      hasInlineData: !!p.inlineData,
      mimeType: p.inlineData?.mimeType,
      dataLength: p.inlineData?.data?.length,
    }));

    // 画像があるか確認
    const imagePart = parts.find(
      (p) => p.inlineData?.data && p.inlineData.mimeType?.startsWith("image/")
    );

    if (imagePart?.inlineData) {
      return NextResponse.json({
        success: true,
        mimeType: imagePart.inlineData.mimeType,
        dataLengthChars: imagePart.inlineData.data?.length,
        partsInfo,
      });
    }

    return NextResponse.json({
      error: "画像データなし",
      partsInfo,
    }, { status: 500 });
  } catch (err) {
    return NextResponse.json({
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack?.slice(0, 300) : undefined,
    }, { status: 500 });
  }
}
