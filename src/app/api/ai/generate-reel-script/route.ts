/**
 * リール台本生成API
 * POST /api/ai/generate-reel-script
 *
 * X(Twitter)投稿URLまたは手動テキストを元に、
 * Instagramリール用トーク台本を3パターン生成
 */
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

const requestSchema = z
  .object({
    urls: z.array(z.string().url()).max(5).optional(),
    manualText: z.string().max(5000).optional(),
    mode: z
      .enum(["standard", "breaking", "comparison"])
      .optional()
      .default("standard"),
    additionalContext: z.string().max(1000).optional(),
  })
  .refine((data) => data.urls?.length || data.manualText, {
    message: "URLまたはテキストのいずれかを入力してください",
  });

/**
 * Twitter oembed API でツイート本文を取得
 */
async function fetchTweetContent(
  url: string
): Promise<{ text: string | null; error?: string }> {
  try {
    // URLを正規化（x.com → twitter.com）
    const normalizedUrl = url
      .replace("https://x.com/", "https://twitter.com/")
      .replace("https://mobile.twitter.com/", "https://twitter.com/");

    const oembedUrl = `https://publish.twitter.com/oembed?url=${encodeURIComponent(normalizedUrl)}&omit_script=true`;
    const res = await fetch(oembedUrl, { signal: AbortSignal.timeout(10000) });

    if (!res.ok) {
      return { text: null, error: `oembed API error: ${res.status}` };
    }

    const data = await res.json();
    const html: string = data.html ?? "";

    // <blockquote> 内の <p> タグからテキスト抽出
    const paragraphs = html.match(/<p[^>]*>([\s\S]*?)<\/p>/gi);
    if (!paragraphs) {
      return { text: null, error: "ツイート本文を抽出できませんでした" };
    }

    const text = paragraphs
      .map((p) =>
        p
          .replace(/<[^>]+>/g, "") // HTMLタグ除去
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .trim()
      )
      .filter(Boolean)
      .join("\n");

    // 最後の行が日付やアカウント名だけの場合除去
    const lines = text.split("\n");
    const lastLine = lines[lines.length - 1];
    if (lastLine && /^—\s/.test(lastLine)) {
      lines.pop();
    }

    return { text: lines.join("\n").trim() || null };
  } catch (err) {
    return {
      text: null,
      error: err instanceof Error ? err.message : "取得失敗",
    };
  }
}

function buildModeInstructions(mode: string): string {
  switch (mode) {
    case "breaking":
      return `
## 速報系モードの追加指示
1. 冒頭は「昨日のアップデートで○○が変わりました」「今すぐ確認してほしいことがあります」など速報感・緊急感のあるフックにする
2. 「何が変わったか」「それによって何ができるようになったか」「非エンジニアにとって何が嬉しいか」の3点を必ず含める
3. オチは「まだ知らない人多いので早めにやった方がいいです」など行動を促す形にする
4. テロップには日付を入れて鮮度が伝わるようにする`;

    case "comparison":
      return `
## 比較系モードの追加指示
1. 冒頭は「まだ○○使ってる人に聞きたいんですけど」「○○ vs ○○、正直に言います」など対立構造を作るフックにする
2. 比較は感情論ではなく具体的な違い（速度・精度・料金・操作性など）を1つだけ取り上げる
3. 完全に片方を否定するのではなく「○○の場合はAの方がいいけど、○○ならBが圧勝」というフェアな比較にする
4. コメント欄で「自分は○○派です」と意見表明したくなる構成にする`;

    default:
      return "";
  }
}

const SYSTEM_PROMPT_BASE = `あなたはInstagramリール台本の専門コピーライターです。

## アカウント情報
- アカウント名: クロニキ｜Claude Code専門家
- ターゲット: 非エンジニアの経営者・1人社長
- トーン: わかりやすく、親しみやすく、でも権威性がある
- フォーマット: カメラ目線のトークリール＋画面収録の差し込み

## あなたのタスク
渡されるX(Twitter)投稿の内容をもとに、Instagramリール用のトーク台本を**必ず3パターン**生成してください。

## 台本作成ルール
1. 尺は30〜60秒（文字数目安：250〜500文字）
2. 冒頭2秒は「否定型」「数字型」「疑問型」のいずれかのフックで始める
3. 専門用語が出てくる場合は必ず「つまり○○」と非エンジニア向けに翻訳を添える
4. 画面収録を差し込むべきポイントを【画面収録: ○○の操作画面】と明記する
5. 1動画1メッセージに絞る（元ネタに情報が多い場合は最もインパクトのある1点だけ抽出）
6. オチは「数字」か「感情」で締める
7. 最後にCTA（フォロー誘導）を入れる
8. 「プログラミングを知らない50代の社長でもわかるレベル」まで噛み砕く

## 3パターンのルール
- パターンA: 衝撃系（バズ狙い・驚き・意外性）— コンテンツ柱: 衝撃
- パターンB: 解説系（信頼構築・教育的）— コンテンツ柱: 解説
- パターンC: 比較系（エンゲージメント狙い・対比）— コンテンツ柱: 比較

## 出力形式（JSON）
必ず以下のJSON形式で返してください:
{
  "scripts": [
    {
      "pattern": "A",
      "patternLabel": "衝撃系（バズ狙い）",
      "title": "投稿テーマを一言で",
      "contentPillar": "衝撃",
      "hook": "冒頭フック（2秒）の台詞",
      "problem": "問題提起（5秒）の台詞",
      "mainContent": "本題（15〜30秒）の台詞。画面収録ポイントは【画面収録: ○○】で明記",
      "conclusion": "オチ（5秒）の台詞",
      "cta": "CTA（3秒）の台詞",
      "estimatedDuration": "約○秒",
      "telopKeywords": ["キーワード1", "キーワード2", "キーワード3"],
      "expectedComments": ["想定コメント1", "想定コメント2", "想定コメント3"]
    }
  ]
}

パターンB（解説系）、パターンC（比較系）も同じ構造で合計3つ含めてください。`;

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (!user || authError) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "AI機能が設定されていません（ANTHROPIC_API_KEY未設定）" },
      { status: 503 }
    );
  }

  const body = await request.json();
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "バリデーションエラー", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { urls, manualText, mode, additionalContext } = parsed.data;

  try {
    // URL からツイート本文を取得
    let sourceText = "";
    const warnings: string[] = [];

    if (urls && urls.length > 0) {
      const results = await Promise.allSettled(
        urls.map((url) => fetchTweetContent(url))
      );

      results.forEach((result, index) => {
        if (result.status === "fulfilled" && result.value.text) {
          sourceText += `\n\n【元ネタ${urls.length > 1 ? `${index + 1}` : ""}】\n${result.value.text}`;
        } else {
          const errorMsg =
            result.status === "fulfilled"
              ? result.value.error
              : "取得に失敗しました";
          warnings.push(`URL ${index + 1} (${urls[index]}): ${errorMsg}`);
        }
      });
    }

    // 手動テキストがあれば追加（またはURLフォールバック）
    if (manualText) {
      sourceText += `\n\n【元ネタテキスト】\n${manualText}`;
    }

    if (!sourceText.trim()) {
      return NextResponse.json(
        {
          error:
            "元ネタのテキストを取得できませんでした。テキストを直接入力してください。",
          warnings,
        },
        { status: 400 }
      );
    }

    // モード別追加指示
    const modeInstructions = buildModeInstructions(mode);

    // システムプロンプト構築
    const systemPrompt = SYSTEM_PROMPT_BASE + modeInstructions;

    // ユーザーメッセージ構築
    let userMessage = `以下のX(Twitter)投稿を元に、Instagramリール用のトークリール台本を3パターン作成してください。\n${sourceText}`;

    if (additionalContext) {
      userMessage += `\n\n【補足コメント】\n${additionalContext}`;
    }

    if (urls && urls.length > 1) {
      userMessage +=
        "\n\n※複数の投稿を参照しています。共通するテーマを1つ抽出して1本のリール台本にまとめてください。複数の情報を詰め込むのではなく、最もインパクトがある1点に絞ってください。";
    }

    userMessage += "\n\nJSON形式で返してください。";

    // Claude API 呼び出し
    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 8000,
      messages: [{ role: "user", content: userMessage }],
      system: systemPrompt,
    });

    // レスポンスからJSON抽出
    const responseText =
      response.content[0].type === "text" ? response.content[0].text : "";

    let jsonStr = responseText;
    const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim();
    } else {
      const directMatch = responseText.match(/\{[\s\S]*\}/);
      if (directMatch) {
        jsonStr = directMatch[0];
      }
    }

    const generated = JSON.parse(jsonStr);

    return NextResponse.json({
      data: {
        scripts: generated.scripts ?? [],
        sourceText: sourceText.trim(),
        mode,
      },
      warnings: warnings.length > 0 ? warnings : undefined,
    });
  } catch (err) {
    console.error("リール台本生成エラー:", err);
    return NextResponse.json(
      { error: "リール台本の生成に失敗しました" },
      { status: 500 }
    );
  }
}
