/**
 * Brave Search API クライアント
 * 英語RSS記事に対応する日本語記事を検索する
 */

const BRAVE_API_BASE = "https://api.search.brave.com/res/v1/web/search";

const TRUSTED_JA_DOMAINS = [
  "itmedia.co.jp",
  "gigazine.net",
  "jp.techcrunch.com",
  "japan.cnet.com",
  "forest.watch.impress.co.jp",
  "pc.watch.impress.co.jp",
  "cloud.watch.impress.co.jp",
  "internet.watch.impress.co.jp",
  "k-tai.watch.impress.co.jp",
  "av.watch.impress.co.jp",
  "gizmodo.jp",
  "japanese.engadget.com",
  "wired.jp",
  "ainow.ai",
  "ledge.ai",
  "ascii.jp",
  "atmarkit.itmedia.co.jp",
  "news.yahoo.co.jp",
  "nikkei.com",
  "businessinsider.jp",
  "forbesjapan.com",
];

interface BraveSearchResult {
  url: string;
  title: string;
}

interface BraveWebResult {
  url: string;
  title: string;
  description: string;
}

interface BraveSearchResponse {
  web?: {
    results?: BraveWebResult[];
  };
}

// 英語タイトルから固有名詞・数値を含む主要キーワードを抽出
function extractKeywords(title: string): string {
  return title
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2)
    .slice(0, 5)
    .join(" ");
}

// 日本語検索クエリを構築
// 英語固有名詞をそのまま活かしつつ「報道」を付加することで日本語メディアにヒットさせる
function buildJapaneseQuery(englishTitle: string): string {
  const keywords = extractKeywords(englishTitle);
  return `${keywords} 報道`;
}

export async function searchJapaneseArticle(
  englishTitle: string,
  source: string
): Promise<BraveSearchResult | null> {
  const apiKey = process.env.BRAVE_SEARCH_API_KEY;
  if (!apiKey) return null;

  const query = buildJapaneseQuery(englishTitle);

  const params = new URLSearchParams({
    q: query,
    search_lang: "jp",
    country: "jp",
    count: "10",
    // freshness制限なし（日本語記事は英語より掲載が遅れることがあるため）
  });

  const res = await fetch(`${BRAVE_API_BASE}?${params}`, {
    headers: {
      Accept: "application/json",
      "Accept-Encoding": "gzip",
      "X-Subscription-Token": apiKey,
    },
  });

  if (!res.ok) {
    console.error(`Brave Search API error: ${res.status}`);
    return null;
  }

  const data: BraveSearchResponse = await res.json();
  const results = data.web?.results ?? [];

  // 信頼できる日本語メディアからの結果を優先
  const trusted = results.find((r) =>
    TRUSTED_JA_DOMAINS.some((d) => r.url.includes(d))
  );

  if (trusted) {
    return { url: trusted.url, title: trusted.title };
  }

  // 日本語タイトルを含む結果にフォールバック
  const jaResult = results.find(
    (r) => /[\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf]/.test(r.title)
  );

  if (jaResult) {
    return { url: jaResult.url, title: jaResult.title };
  }

  return null;
}
