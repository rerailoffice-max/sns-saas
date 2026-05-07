/**
 * X(Twitter) リンクを投稿テキストから除去するユーティリティ。
 * 「Xリンクは絶対に貼らない」要件のため、生成パスとレスポンス境界で多重に適用する。
 */

const X_URL_RE =
  /https?:\/\/(?:www\.|mobile\.)?(?:x\.com|twitter\.com|t\.co)\/[^\s)]+/gi;

export function stripXLinks(text: string): string {
  return text
    .replace(X_URL_RE, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function containsXLink(text: string): boolean {
  X_URL_RE.lastIndex = 0;
  return X_URL_RE.test(text);
}
