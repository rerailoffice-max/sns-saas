/**
 * Gemini 3.1 Flash Image (Nano Banana 2) を使ったインフォグラフィック画像生成
 *
 * 記事内容からコンサルティングファーム風の図解画像を生成する
 * Gemini 3.1はテキストレンダリングが改善され4K出力対応
 * 失敗時は null を返し、パイプラインを止めない
 */

import { GoogleGenAI } from "@google/genai";

const INFOGRAPHIC_SYSTEM_PROMPT = `あなたは、複雑な情報を一目で理解できるプロフェッショナルな図解に変換する「一流のビジュアルコンサルタント」です。
ユーザーが提供するテキスト情報に基づき、以下の【スタイルガイドライン】を厳守して、清潔感があり、論理構造が明確なインフォグラフィック画像を生成してください。

### 【スタイルガイドライン】 (厳守事項)
1.  **全体的な雰囲気:** 一流コンサルティングファームのプレゼン資料のような、清潔で、信頼感があり、洗練されたデザイン。
2.  **背景とサイズ:** 純粋な白背景。アスペクト比は「16:9」。
3.  **レイアウト構造:**
    * 情報を論理的な塊（パネルやセクション）に分割し、モジュール構造にする。
    * 左から右、あるいは上から下への視線誘導（フロー）を意識する。
    * 矢印（→）を使用して、プロセス、因果関係、変化を明確に示す。
4.  **ビジュアル要素:**
    * **アイコン:** モダンでクリーンなフラットデザインのアイコンを多用し、テキストの視認性を高める。
    * **配色:** 白背景をベースに、青、グレー、水色などを基調とした落ち着いた配色。アクセントカラー（強調やネガティブ要素）にオレンジや赤を控えめに使用。
5.  **テキスト処理:**
    * **タイトル:** 最上部に大きく明確なメインタイトルを配置。
    * **要約:** 長い文章は、本質を損なわない範囲で、短くパンチのある箇条書きやフレーズに「圧縮」する。
    * **フォント:** 可読性が高い、ゴシック体のプロフェッショナルなフォントを使用。

完成した画像のみを出力してください。余計な会話は不要です。`;

interface InfographicParams {
  articleTitle: string;
  articleSummary: string;
  threadPosts: string[];
}

interface InfographicResult {
  buffer: Buffer;
  mimeType: string;
}

export async function generateInfographicImage(
  params: InfographicParams
): Promise<InfographicResult | null> {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) {
    console.warn("GOOGLE_AI_API_KEY 未設定のため画像生成スキップ");
    return null;
  }

  try {
    const ai = new GoogleGenAI({ apiKey });

    // 記事内容からキーポイントを構築
    const keyPoints = params.threadPosts
      .map((post, i) => `${i + 1}. ${post.slice(0, 200)}`)
      .join("\n");

    const userPrompt = `以下の記事内容をインフォグラフィックにしてください。

タイトル: ${params.articleTitle}

要約: ${params.articleSummary.slice(0, 800)}

キーポイント:
${keyPoints}`;

    const response = await ai.models.generateContent({
      model: "gemini-3.1-flash-image-preview",
      contents: [
        {
          role: "user",
          parts: [{ text: INFOGRAPHIC_SYSTEM_PROMPT + "\n\n" + userPrompt }],
        },
      ],
      config: {
        responseModalities: ["IMAGE", "TEXT"],
      },
    });

    // レスポンスから画像データを抽出
    const parts = response.candidates?.[0]?.content?.parts;
    if (!parts) {
      console.warn("Gemini画像生成: レスポンスにpartsなし");
      return null;
    }

    for (const part of parts) {
      if (part.inlineData?.data && part.inlineData.mimeType?.startsWith("image/")) {
        const buffer = Buffer.from(part.inlineData.data, "base64");
        return {
          buffer,
          mimeType: part.inlineData.mimeType,
        };
      }
    }

    console.warn("Gemini画像生成: レスポンスに画像データなし");
    return null;
  } catch (err) {
    console.warn(
      "インフォグラフィック生成エラー:",
      err instanceof Error ? err.message : err
    );
    return null;
  }
}
