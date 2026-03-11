/**
 * RSS/Atom フィードパーサー
 * ai-news-bot/index.js のパースロジックをTypeScriptに移植
 */
import { XMLParser } from "fast-xml-parser";

export interface RSSArticle {
  title: string;
  link: string;
  description: string;
  published_at: string | null;
  source: string;
}

export interface RSSFeed {
  url: string;
  source: string;
}

export const DEFAULT_RSS_FEEDS: RSSFeed[] = [
  { url: "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml", source: "The Verge" },
  { url: "https://techcrunch.com/category/artificial-intelligence/feed/", source: "TechCrunch" },
  { url: "https://arstechnica.com/ai/feed/", source: "Ars Technica" },
  { url: "https://venturebeat.com/category/ai/feed/", source: "VentureBeat" },
  { url: "https://www.wired.com/feed/tag/ai/latest/rss", source: "WIRED" },
];

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
});

function extractLink(item: Record<string, unknown>): string {
  const link = item.link;
  if (typeof link === "string") return link;
  if (Array.isArray(link)) {
    const alt = link.find(
      (l: Record<string, string>) => l["@_rel"] === "alternate"
    );
    return (
      (alt as Record<string, string>)?.["@_href"] ??
      (link[0] as Record<string, string>)?.["@_href"] ??
      String(link[0] ?? "")
    );
  }
  if (link && typeof link === "object") {
    return (link as Record<string, string>)["@_href"] ?? "";
  }
  return "";
}

function extractTitle(item: Record<string, unknown>): string {
  const title = item.title;
  if (typeof title === "string") return title.replace(/<[^>]*>/g, "").trim();
  if (title && typeof title === "object") {
    return String((title as Record<string, string>)["#text"] ?? title)
      .replace(/<[^>]*>/g, "")
      .trim();
  }
  return String(title ?? "").trim();
}

function extractDescription(item: Record<string, unknown>): string {
  const raw = item.description ?? item.summary ?? item.content;
  const text =
    typeof raw === "string"
      ? raw
      : raw && typeof raw === "object"
        ? String((raw as Record<string, string>)["#text"] ?? "")
        : "";
  return text
    .replace(/<[^>]*>/g, "")
    .replace(/&[a-z]+;/gi, " ")
    .substring(0, 300)
    .trim();
}

function extractDate(item: Record<string, unknown>): string | null {
  const raw =
    (item.pubDate as string) ??
    (item["dc:date"] as string) ??
    (item.published as string) ??
    (item.updated as string) ??
    null;
  if (!raw) return null;
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * 単一のRSSフィードを取得してパース
 */
export async function fetchRSSFeed(feed: RSSFeed): Promise<RSSArticle[]> {
  try {
    const response = await fetch(feed.url, {
      headers: {
        "User-Agent": "SNS-Manager-Bot/1.0",
        Accept: "application/rss+xml, application/xml, text/xml",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) return [];

    const xml = await response.text();
    const result = parser.parse(xml);

    const channel = result?.rss?.channel;
    const atomFeed = result?.feed;

    let rawItems: Record<string, unknown>[] = [];

    if (channel) {
      const items = channel.item;
      rawItems = Array.isArray(items) ? items : items ? [items] : [];
    } else if (atomFeed) {
      const entries = atomFeed.entry;
      rawItems = Array.isArray(entries) ? entries : entries ? [entries] : [];
    } else {
      return [];
    }

    return rawItems
      .filter(Boolean)
      .slice(0, 10)
      .map((item) => ({
        title: extractTitle(item),
        link: extractLink(item).trim(),
        description: extractDescription(item),
        published_at: extractDate(item),
        source: feed.source,
      }))
      .filter((a) => a.title && a.link);
  } catch {
    return [];
  }
}

/**
 * 複数フィードを並列取得して統合
 */
export async function fetchAllFeeds(
  feeds: RSSFeed[]
): Promise<RSSArticle[]> {
  const results = await Promise.allSettled(
    feeds.map((feed) => fetchRSSFeed(feed))
  );

  const articles: RSSArticle[] = [];
  const seenTitles = new Set<string>();

  for (const result of results) {
    if (result.status !== "fulfilled") continue;
    for (const article of result.value) {
      const key = article.title.substring(0, 30);
      if (seenTitles.has(key)) continue;
      seenTitles.add(key);
      articles.push(article);
    }
  }

  return articles.sort((a, b) => {
    const da = a.published_at ? new Date(a.published_at).getTime() : 0;
    const db = b.published_at ? new Date(b.published_at).getTime() : 0;
    return db - da;
  });
}
