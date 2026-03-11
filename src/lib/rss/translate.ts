/**
 * RSS記事タイトル・概要の日本語一括翻訳ユーティリティ
 *
 * Claude APIで最大20件をまとめて翻訳し、DBに保存する。
 */
import Anthropic from "@anthropic-ai/sdk";

interface ArticleToTranslate {
  id: string;
  title: string;
  description: string | null;
}

interface TranslationResult {
  id: string;
  title_ja: string;
  description_ja: string;
}

/**
 * 記事のタイトル・概要を日本語に一括翻訳する。
 * Claude API 1回で最大20件を処理する。
 */
export async function translateArticlesBatch(
  articles: ArticleToTranslate[],
  anthropic: Anthropic
): Promise<TranslationResult[]> {
  if (articles.length === 0) return [];

  const batch = articles.slice(0, 20);

  const articlesInput = batch
    .map(
      (a, i) =>
        `${i + 1}. id: ${a.id}\n   title: ${a.title}\n   description: ${a.description ?? "(none)"}`
    )
    .join("\n\n");

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4000,
      messages: [
        {
          role: "user",
          content: `以下の英語ニュース記事のタイトルと概要を日本語に翻訳してください。
自然で分かりやすい日本語にしてください。固有名詞（会社名・人名・製品名）は英語のままで構いません。

JSON配列で返してください。各要素は {"id": "...", "title_ja": "...", "description_ja": "..."} の形式です。
descriptionが "(none)" の場合、description_ja は空文字 "" にしてください。

${articlesInput}`,
        },
      ],
    });

    const text =
      response.content[0].type === "text" ? response.content[0].text : "[]";

    let jsonStr = text;
    const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      jsonStr = codeBlockMatch[1].trim();
    } else {
      const arrayMatch = text.match(/\[[\s\S]*\]/);
      if (arrayMatch) jsonStr = arrayMatch[0];
    }

    const results = JSON.parse(jsonStr) as TranslationResult[];
    return Array.isArray(results) ? results : [];
  } catch (err) {
    console.error("RSS翻訳エラー:", err);
    return [];
  }
}

/**
 * Supabase admin クライアントを使って、未翻訳の記事を翻訳してDBに保存する。
 */
export async function translateUntranslatedArticles(
  admin: {
    from: (table: string) => ReturnType<ReturnType<typeof import("@/lib/supabase/admin").createAdminClient>["from"]>;
  },
  profileId: string,
  anthropic: Anthropic,
  limit = 20
): Promise<number> {
  const { data: untranslated } = await admin
    .from("rss_articles")
    .select("id, title, description")
    .eq("profile_id", profileId)
    .is("title_ja", null)
    .order("published_at", { ascending: false })
    .limit(limit);

  if (!untranslated || untranslated.length === 0) return 0;

  const results = await translateArticlesBatch(untranslated, anthropic);
  let translated = 0;

  for (const result of results) {
    const { error } = await admin
      .from("rss_articles")
      .update({
        title_ja: result.title_ja,
        description_ja: result.description_ja || null,
      })
      .eq("id", result.id);

    if (!error) translated++;
  }

  return translated;
}
