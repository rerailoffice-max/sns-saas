export interface UrlContent {
  source: string;
  title?: string;
  text: string;
  url: string;
  mediaUrls: string[];
  error?: string;
}

export type UrlTypeResult =
  | { type: "x"; tweetId: string; url: string }
  | { type: "threads"; url: string }
  | { type: "article"; url: string }
  | { type: "unknown"; url: string };

const TIMEOUT_MS = 15000;
const USER_AGENT =
  "Mozilla/5.0 (compatible; SNS-SaaS/1.0; +https://example.com/bot)";

export function detectUrlType(url: string): UrlTypeResult {
  let normalized: string;
  try {
    const parsed = new URL(url);
    normalized = parsed.href;
  } catch {
    return { type: "unknown", url };
  }

  const xMatch = normalized.match(
    /(?:twitter\.com|x\.com)\/(?:\w+\/)?status\/(\d+)/
  );
  if (xMatch) {
    return { type: "x", tweetId: xMatch[1], url: normalized };
  }

  if (
    normalized.includes("threads.net") ||
    normalized.includes("thread.net")
  ) {
    return { type: "threads", url: normalized };
  }

  if (
    normalized.startsWith("http://") ||
    normalized.startsWith("https://")
  ) {
    return { type: "article", url: normalized };
  }

  return { type: "unknown", url: normalized };
}

export async function fetchUrlContent(url: string): Promise<UrlContent> {
  const detected = detectUrlType(url);

  switch (detected.type) {
    case "x":
      return fetchXPostOembed(detected.tweetId, detected.url);
    case "threads":
      return fetchThreadsPost(detected.url);
    case "article":
      return fetchArticle(detected.url);
    default:
      return {
        source: "unknown",
        text: "",
        url: detected.url,
        mediaUrls: [],
        error: "Unsupported or invalid URL",
      };
  }
}

async function fetchXPostOembed(
  tweetId: string,
  originalUrl: string
): Promise<UrlContent> {
  const oembedUrl = `https://publish.twitter.com/oembed?url=${encodeURIComponent(
    originalUrl.startsWith("https://x.com")
      ? `https://x.com/i/status/${tweetId}`
      : `https://twitter.com/i/status/${tweetId}`
  )}`;

  try {
    const res = await fetch(oembedUrl, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!res.ok) {
      return {
        source: "x",
        text: "",
        url: originalUrl,
        mediaUrls: [],
        error: `oEmbed request failed: ${res.status}`,
      };
    }

    const data = (await res.json()) as {
      html?: string;
      author_name?: string;
      url?: string;
    };

    const html = data.html ?? "";
    const text = html
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    const mediaUrls: string[] = [];
    const imgMatches = html.matchAll(/<img[^>]+src=["']([^"']+)["']/gi);
    for (const m of imgMatches) {
      if (m[1] && !m[1].startsWith("data:")) {
        mediaUrls.push(m[1]);
      }
    }

    return {
      source: "x",
      title: data.author_name,
      text,
      url: data.url ?? originalUrl,
      mediaUrls,
    };
  } catch (err) {
    return {
      source: "x",
      text: "",
      url: originalUrl,
      mediaUrls: [],
      error: err instanceof Error ? err.message : "Failed to fetch X post",
    };
  }
}

async function fetchArticle(url: string): Promise<UrlContent> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!res.ok) {
      return {
        source: "article",
        text: "",
        url,
        mediaUrls: [],
        error: `Request failed: ${res.status}`,
      };
    }

    const html = await res.text();
    const title = extractMeta(html, "title") ?? extractOg(html, "og:title");
    const description =
      extractOg(html, "og:description") ?? extractMeta(html, "description");
    const paragraphs = extractParagraphs(html);
    const bodyText = paragraphs.length > 0 ? paragraphs.join("\n\n") : "";
    const text = description || bodyText || title || "";

    const mediaUrls: string[] = [];
    const ogImage = extractOg(html, "og:image");
    if (ogImage) mediaUrls.push(ogImage);

    return {
      source: "article",
      title: title ?? undefined,
      text: text.trim(),
      url,
      mediaUrls,
    };
  } catch (err) {
    return {
      source: "article",
      text: "",
      url,
      mediaUrls: [],
      error: err instanceof Error ? err.message : "Failed to fetch article",
    };
  }
}

async function fetchThreadsPost(url: string): Promise<UrlContent> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!res.ok) {
      return {
        source: "threads",
        text: "",
        url,
        mediaUrls: [],
        error: `Request failed: ${res.status}`,
      };
    }

    const html = await res.text();
    const title = extractOg(html, "og:title");
    const description = extractOg(html, "og:description");
    const text = description || title || "";

    const mediaUrls: string[] = [];
    const ogImage = extractOg(html, "og:image");
    if (ogImage) mediaUrls.push(ogImage);

    return {
      source: "threads",
      title: title ?? undefined,
      text: text.trim(),
      url,
      mediaUrls,
    };
  } catch (err) {
    return {
      source: "threads",
      text: "",
      url,
      mediaUrls: [],
      error:
        err instanceof Error ? err.message : "Failed to fetch Threads post",
    };
  }
}

function extractOg(html: string, property: string): string | null {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(
    `<meta[^>]*(?:property|name)=["']${escaped}["'][^>]*content=["']([^"']*)["']`,
    "i"
  );
  const m = html.match(re);
  if (m) return m[1].trim() || null;
  const re2 = new RegExp(
    `<meta[^>]*content=["']([^"']*)["'][^>]*(?:property|name)=["']${escaped}["']`,
    "i"
  );
  const m2 = html.match(re2);
  return m2 ? m2[1].trim() || null : null;
}

function extractMeta(html: string, name: "title" | "description"): string | null {
  if (name === "title") {
    const m = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    return m ? m[1].trim() || null : null;
  }
  const m = html.match(
    new RegExp(
      `<meta[^>]*(?:name)=["']${name}["'][^>]*content=["']([^"']*)["']`,
      "i"
    )
  );
  if (m) return m[1].trim() || null;
  const m2 = html.match(
    new RegExp(
      `<meta[^>]*content=["']([^"']*)["'][^>]*(?:name)=["']${name}["']`,
      "i"
    )
  );
  return m2 ? m2[1].trim() || null : null;
}

function extractParagraphs(html: string): string[] {
  const articleMatch = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
  const scope = articleMatch ? articleMatch[1] : html;
  const matches = scope.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi);
  const result: string[] = [];
  for (const m of matches) {
    const text = m[1]
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (text.length > 0) result.push(text);
  }
  return result;
}
