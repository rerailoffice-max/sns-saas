export interface UrlContent {
  source: string;
  title?: string;
  text: string;
  url: string;
  mediaUrls: string[];
  /** X変種から抽出したMP4動画URL（deepモード用、サイズ別に降順ソート） */
  videoUrls?: string[];
  /** Xの場合の著者ハンドル（@なし） */
  authorHandle?: string;
  /** Xの場合の投稿日時 (ISO 8601) */
  postedAt?: string;
  /** X APIで取得したスレッド全投稿テキスト（xurl経由の場合のみ）*/
  xThreadTexts?: string[];
  error?: string;
}

export type UrlTypeResult =
  | { type: "x"; tweetId: string; url: string }
  | { type: "youtube"; videoId: string; url: string }
  | { type: "threads"; url: string }
  | { type: "article"; url: string }
  | { type: "unknown"; url: string };

const TIMEOUT_MS = 15000;
const USER_AGENT =
  "Mozilla/5.0 (compatible; SNS-SaaS/1.0; +https://example.com/bot)";

const X_API_BASE = "https://api.twitter.com/2";

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

  // YouTube: youtube.com/watch?v=, youtu.be/, youtube.com/shorts/
  const ytMatch =
    normalized.match(/(?:youtube\.com\/watch\?[^"]*?v=|youtu\.be\/|youtube\.com\/shorts\/|youtube\.com\/embed\/)([A-Za-z0-9_-]{11})/);
  if (ytMatch) {
    return { type: "youtube", videoId: ytMatch[1], url: normalized };
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
      // X Bearer Tokenがあればv2 APIで画像・スレッド全文を取得、なければoEmbedフォールバック
      if (process.env.X_BEARER_TOKEN) {
        return fetchXPostWithMedia(detected.tweetId, detected.url);
      }
      return fetchXPostOembed(detected.tweetId, detected.url);
    case "youtube":
      return fetchYouTubeMeta(detected.videoId, detected.url);
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

/**
 * YouTube動画のメタ情報のみ取得（実ダウンロードは ai-lab-bot 側 yt-dlp で実施）
 * - oEmbed APIでタイトル・著者・サムネを取得
 * - videoUrls には canonical URL を入れて worker 側で yt-dlp 解決
 */
async function fetchYouTubeMeta(
  videoId: string,
  originalUrl: string
): Promise<UrlContent> {
  const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(watchUrl)}&format=json`,
      { signal: AbortSignal.timeout(TIMEOUT_MS) }
    );
    if (!res.ok) {
      return {
        source: "youtube",
        text: "",
        url: originalUrl,
        mediaUrls: [],
        videoUrls: [watchUrl],
        error: `YouTube oEmbed failed: ${res.status}`,
      };
    }
    const data = (await res.json()) as {
      title?: string;
      author_name?: string;
      thumbnail_url?: string;
    };
    const text = [data.title, data.author_name && `投稿者: ${data.author_name}`]
      .filter(Boolean)
      .join("\n");
    return {
      source: "youtube",
      title: data.title,
      text,
      url: originalUrl,
      mediaUrls: data.thumbnail_url ? [data.thumbnail_url] : [],
      videoUrls: [watchUrl],
      authorHandle: data.author_name,
    };
  } catch (err) {
    return {
      source: "youtube",
      text: "",
      url: originalUrl,
      mediaUrls: [],
      videoUrls: [watchUrl],
      error: err instanceof Error ? err.message : "Failed to fetch YouTube meta",
    };
  }
}

/**
 * X API v2 を使ってツイートの画像・動画・スレッド全文を取得
 * Bearer Token が必要（X_BEARER_TOKEN 環境変数）
 */
export async function fetchXPostWithMedia(
  tweetId: string,
  originalUrl: string
): Promise<UrlContent> {
  const bearerToken = process.env.X_BEARER_TOKEN;
  if (!bearerToken) {
    return fetchXPostOembed(tweetId, originalUrl);
  }

  const headers = {
    Authorization: `Bearer ${bearerToken}`,
  };

  try {
    // メインツイートを取得（メディア・会話ID含む）
    const tweetUrl = new URL(`${X_API_BASE}/tweets/${tweetId}`);
    tweetUrl.searchParams.set(
      "tweet.fields",
      "text,author_id,conversation_id,attachments,created_at,entities"
    );
    tweetUrl.searchParams.set(
      "expansions",
      "author_id,attachments.media_keys"
    );
    tweetUrl.searchParams.set("media.fields", "url,type,preview_image_url,variants");
    tweetUrl.searchParams.set("user.fields", "username,name");

    const tweetRes = await fetch(tweetUrl.toString(), {
      headers,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!tweetRes.ok) {
      console.warn(`[url-fetcher] X API v2 error: status=${tweetRes.status}${tweetRes.status === 429 ? " (RATE LIMITED)" : ""}, fallback to oEmbed`);
      return fetchXPostOembed(tweetId, originalUrl);
    }

    const tweetData = (await tweetRes.json()) as {
      data?: {
        id: string;
        text: string;
        author_id?: string;
        conversation_id?: string;
        created_at?: string;
        attachments?: { media_keys?: string[] };
        entities?: {
          urls?: Array<{
            url: string;
            expanded_url: string;
            display_url: string;
            title?: string;
            description?: string;
          }>;
        };
      };
      includes?: {
        users?: Array<{ id: string; username: string; name: string }>;
        media?: Array<{
          media_key: string;
          type: string;
          url?: string;
          preview_image_url?: string;
          variants?: Array<{
            content_type: string;
            url: string;
            bit_rate?: number;
          }>;
        }>;
      };
    };

    if (!tweetData.data) {
      return fetchXPostOembed(tweetId, originalUrl);
    }

    const mainTweet = tweetData.data;
    const authorUsername =
      tweetData.includes?.users?.find((u) => u.id === mainTweet.author_id)
        ?.username ?? "";

    // メディアURL取得（画像優先、動画はpreview_image_url + MP4 variantを抽出）
    const mediaUrls: string[] = [];
    const videoUrls: string[] = [];
    if (tweetData.includes?.media) {
      for (const m of tweetData.includes.media) {
        if (m.type === "photo" && m.url) {
          mediaUrls.push(m.url);
        } else if (
          (m.type === "video" || m.type === "animated_gif")
        ) {
          if (m.preview_image_url) mediaUrls.push(m.preview_image_url);
          // MP4 variantから 720p相当（bit_rate <= 2.5Mbps）を最優先で選び、なければ最高ビットレートを使う
          const mp4s = (m.variants ?? []).filter(
            (v) => v.content_type === "video/mp4"
          );
          const sorted = [...mp4s].sort(
            (a, b) => (b.bit_rate ?? 0) - (a.bit_rate ?? 0)
          );
          const safe =
            sorted.find((v) => (v.bit_rate ?? 0) <= 2_500_000) ??
            sorted[sorted.length - 1] ??
            sorted[0];
          if (safe?.url) videoUrls.push(safe.url);
        }
      }
    }

    // ツイート内のリンク先コンテンツを取得（ツイート本文がリンクのみの場合に重要）
    let linkedContent = "";
    const allEntityUrls = mainTweet.entities?.urls ?? [];

    // ツイート本文がほぼURLのみ（非URL部分が50文字未満）の場合、リンク先を自動取得
    const textWithoutUrls = mainTweet.text
      .replace(/https?:\/\/\S+/g, "")
      .trim();
    const shouldFetchLinks = textWithoutUrls.length < 50 && allEntityUrls.length > 0;

    console.log(`[url-fetcher] entities: ${JSON.stringify(allEntityUrls.map((u) => ({ expanded: u.expanded_url, title: u.title, desc: u.description?.slice(0, 50) })))}`);

    if (shouldFetchLinks) {
      console.log(`[url-fetcher] ツイート本文がリンク中心（非URL部分: ${textWithoutUrls.length}文字）、リンク先を自動取得`);

      for (const linkEntity of allEntityUrls.slice(0, 2)) {
        // 1. entitiesにtitle/descriptionがあればそれを使う（X Article等で有効）
        if (linkEntity.title || linkEntity.description) {
          linkedContent += `\n\n--- ${linkEntity.title ?? linkEntity.display_url} ---\n${linkEntity.description ?? ""}`;
          console.log(`[url-fetcher] entities metadata使用: title=${linkEntity.title}, descLen=${linkEntity.description?.length ?? 0}`);
          continue;
        }

        // 2. 外部URLの場合、HTMLをフェッチ
        const isXUrl = linkEntity.expanded_url.includes("x.com/") || linkEntity.expanded_url.includes("twitter.com/");
        if (!isXUrl) {
          try {
            const linked = await fetchArticle(linkEntity.expanded_url);
            if (linked.text && !linked.error) {
              const title = linked.title ?? linkEntity.display_url;
              linkedContent += `\n\n--- リンク先: ${title} ---\n${linked.text.slice(0, 2000)}`;
              console.log(`[url-fetcher] リンク先取得成功: ${linkEntity.expanded_url}, textLen=${linked.text.length}`);
            }
          } catch {
            console.warn(`[url-fetcher] リンク先取得失敗: ${linkEntity.expanded_url}`);
          }
          continue;
        }

        // 3. X内URL（X Article等）でentitiesにメタデータなし → t.coリダイレクト先を確認してoEmbedを試行
        try {
          const oembedUrl = `https://publish.twitter.com/oembed?url=${encodeURIComponent(linkEntity.expanded_url)}`;
          const oembedRes = await fetch(oembedUrl, { signal: AbortSignal.timeout(TIMEOUT_MS) });
          if (oembedRes.ok) {
            const oembedData = (await oembedRes.json()) as { html?: string; author_name?: string };
            if (oembedData.html) {
              const oembedText = oembedData.html
                .replace(/<[^>]*>/g, " ")
                .replace(/\s+/g, " ")
                .trim();
              if (oembedText.length > 30) {
                linkedContent += `\n\n--- ${oembedData.author_name ?? linkEntity.display_url} ---\n${oembedText}`;
                console.log(`[url-fetcher] X内URL oEmbed取得成功: ${linkEntity.expanded_url}, textLen=${oembedText.length}`);
              }
            }
          }
        } catch {
          console.warn(`[url-fetcher] X内URL oEmbed取得失敗: ${linkEntity.expanded_url}`);
        }
      }
    }

    // スレッド全文を取得（conversation_id + from:username、ページネーション対応）
    // スレッド内の画像・動画も全て取得
    const xThreadTexts: string[] = [mainTweet.text + linkedContent];

    if (mainTweet.conversation_id && authorUsername) {
      try {
        const MAX_THREAD_PAGES = 5; // 最大5ページ（100件/ページ × 5 = 最大500投稿）
        let nextToken: string | null = null;

        for (let page = 0; page < MAX_THREAD_PAGES; page++) {
          const searchUrl = new URL(`${X_API_BASE}/tweets/search/recent`);
          searchUrl.searchParams.set(
            "query",
            `conversation_id:${mainTweet.conversation_id} from:${authorUsername}`
          );
          searchUrl.searchParams.set("tweet.fields", "text,author_id,created_at,attachments");
          searchUrl.searchParams.set("expansions", "attachments.media_keys");
          searchUrl.searchParams.set("media.fields", "url,type,preview_image_url,variants");
          searchUrl.searchParams.set("max_results", "100");
          if (nextToken) searchUrl.searchParams.set("next_token", nextToken);

          const searchRes = await fetch(searchUrl.toString(), {
            headers,
            signal: AbortSignal.timeout(TIMEOUT_MS),
          });

          if (!searchRes.ok) break;

          const searchData = (await searchRes.json()) as {
            data?: Array<{ id: string; text: string; attachments?: { media_keys?: string[] } }>;
            includes?: {
              media?: Array<{
                media_key: string;
                type: string;
                url?: string;
                preview_image_url?: string;
                variants?: Array<{
                  content_type: string;
                  url: string;
                  bit_rate?: number;
                }>;
              }>;
            };
            meta?: { next_token?: string; result_count?: number };
          };

          if (searchData.data && searchData.data.length > 0) {
            // スレッド内のメディアURLを取得
            if (searchData.includes?.media) {
              for (const m of searchData.includes.media) {
                if (m.type === "photo" && m.url) {
                  mediaUrls.push(m.url);
                } else if (
                  (m.type === "video" || m.type === "animated_gif")
                ) {
                  if (m.preview_image_url) mediaUrls.push(m.preview_image_url);
                  const mp4s = (m.variants ?? []).filter(
                    (v) => v.content_type === "video/mp4"
                  );
                  const sorted = [...mp4s].sort(
                    (a, b) => (b.bit_rate ?? 0) - (a.bit_rate ?? 0)
                  );
                  const safe =
                    sorted.find((v) => (v.bit_rate ?? 0) <= 2_500_000) ??
                    sorted[sorted.length - 1] ??
                    sorted[0];
                  if (safe?.url) videoUrls.push(safe.url);
                }
              }
            }

            // メインツイート以外のスレッド投稿を追加（リプライ除外: @で始まるものを除く）
            const threadReplies = searchData.data
              .filter(
                (t) =>
                  t.id !== tweetId &&
                  !t.text.startsWith("@") &&
                  t.text.trim().length > 0
              )
              .map((t) => t.text);

            xThreadTexts.push(...threadReplies);
          }

          // 次のページがあれば継続、なければ終了
          if (searchData.meta?.next_token) {
            nextToken = searchData.meta.next_token;
          } else {
            break;
          }
        }
      } catch {
        // スレッド取得失敗はメインツイートのみで続行
      }
    }

    // メディアURLの重複を除去
    const uniqueMediaUrls = [...new Set(mediaUrls)];
    const uniqueVideoUrls = [...new Set(videoUrls)];

    const fullText = xThreadTexts.join("\n\n---\n\n");

    console.log(`[url-fetcher] X API v2 success: tweetId=${tweetId}, author=@${authorUsername}, textLen=${fullText.length}, threadPosts=${xThreadTexts.length}, media=${uniqueMediaUrls.length}, videos=${uniqueVideoUrls.length}`);
    console.log(`[url-fetcher] X API v2 text preview: ${fullText.slice(0, 200)}`);

    return {
      source: "x",
      title: authorUsername ? `@${authorUsername}` : undefined,
      text: fullText,
      url: originalUrl,
      mediaUrls: uniqueMediaUrls,
      videoUrls: uniqueVideoUrls.length > 0 ? uniqueVideoUrls : undefined,
      authorHandle: authorUsername || undefined,
      postedAt: mainTweet.created_at,
      xThreadTexts,
    };
  } catch (err) {
    console.warn(
      "[url-fetcher] fetchXPostWithMedia failed, fallback to oEmbed:",
      err instanceof Error ? err.message : err
    );
    return fetchXPostOembed(tweetId, originalUrl);
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

    console.log(`[url-fetcher] oEmbed fallback: tweetId=${tweetId}, textLen=${text.length}, author=${data.author_name ?? "unknown"}`);
    console.log(`[url-fetcher] oEmbed text preview: ${text.slice(0, 200)}`);

    // oEmbedテキストからリンクを抽出して内容を取得（ツイートがリンクのみの場合）
    let enrichedText = text;
    const tcoMatches = html.matchAll(/href=["'](https?:\/\/t\.co\/[^"']+)["']/gi);
    const tcoUrls = [...tcoMatches].map((m) => m[1]);

    const textOnlyContent = text.replace(/https?:\/\/\S+/g, "").replace(/[—@()\d,.\s]/g, "").trim();
    if (textOnlyContent.length < 30 && tcoUrls.length > 0) {
      console.log(`[url-fetcher] oEmbed: ツイートがリンク中心、t.coリンクを解決: ${tcoUrls.join(", ")}`);
      for (const tco of tcoUrls.slice(0, 2)) {
        try {
          // t.coのリダイレクト先を確認
          const redirectRes = await fetch(tco, { redirect: "manual", signal: AbortSignal.timeout(5000) });
          const redirectUrl = redirectRes.headers.get("location");
          if (!redirectUrl) continue;

          console.log(`[url-fetcher] t.co解決: ${tco} → ${redirectUrl}`);

          const isXUrl = redirectUrl.includes("x.com/") || redirectUrl.includes("twitter.com/");
          if (!isXUrl) {
            // 外部URLの場合、HTMLをフェッチ
            const linked = await fetchArticle(redirectUrl);
            if (linked.text && !linked.error) {
              enrichedText += `\n\n--- リンク先: ${linked.title ?? redirectUrl} ---\n${linked.text.slice(0, 2000)}`;
              console.log(`[url-fetcher] oEmbed リンク先取得成功: ${redirectUrl}, textLen=${linked.text.length}`);
            }
          }
          // X内URL（X Article等）の場合はoEmbedでは追加情報を取得しにくいためスキップ
        } catch {
          console.warn(`[url-fetcher] oEmbed t.coリンク解決失敗: ${tco}`);
        }
      }
    }

    if (enrichedText === text && textOnlyContent.length < 30) {
      return {
        source: "x",
        title: data.author_name,
        text: enrichedText,
        url: data.url ?? originalUrl,
        mediaUrls,
        error: `ツイートの内容を十分に取得できませんでした。リンクのみのツイートの可能性があります。`,
      };
    }

    return {
      source: "x",
      title: data.author_name,
      text: enrichedText,
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
