/**
 * 関連動画リサーチ API (Phase 2a / 2026-05-30)
 *
 * 投稿スタジオの起点。URL または テーマ/キーワードを受け取り、
 * X (Twitter) API v2 Recent Search で「関連する動画つき投稿」候補を集めて
 * バズ度・新しさ・Claude関連度でランキングして返す。
 *
 *  - クラウド完結（Mac不要）＝マルチテナント対応
 *  - source_url が X 投稿なら、その本文からキーワードを補完して関連動画を探す
 *  - 動画が見つからない場合も、テキスト候補（記事/投稿）を返す
 *
 * 認証: ログインユーザーのみ（generate-post と同じパターン）
 * 環境変数: X_BEARER_TOKEN
 */
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const X_API_BASE = "https://api.x.com/2";

const requestSchema = z.object({
  source_url: z.string().optional(),
  theme: z.string().max(300).optional(),
  keywords: z.string().max(300).optional(),
  limit: z.number().min(1).max(20).optional().default(10),
});

export interface VideoCandidate {
  source_url: string;
  tweet_id: string;
  author_username: string;
  author_name: string;
  text: string;
  has_video: boolean;
  preview_url: string | null;
  like_count: number;
  reply_count: number;
  retweet_count: number;
  created_at: string;
  claude_relevance: number;
  why: string;
}

// ─────────────────────────────────────────
// Claude/Anthropic 関連度（クロニキは Claude Code 専門ブランド）
// ─────────────────────────────────────────
const CLAUDE_ALLOWLIST = [
  /claude/i, /anthropic/i, /\bMCP\b/i, /model context protocol/i,
  /claude\s?code/i, /agent\s?sdk/i, /\bopus\b/i, /\bsonnet\b/i, /\bhaiku\b/i,
  /subagent/i, /スラッシュコマンド/, /クロード/,
];
function scoreClaudeRelevance(text: string): number {
  let hits = 0;
  for (const re of CLAUDE_ALLOWLIST) if (re.test(text)) hits++;
  if (hits === 0) return 0;
  if (hits === 1) return 0.5;
  if (hits === 2) return 0.7;
  return 1.0;
}

function detectXTweetId(url: string): string | null {
  const m = url.match(/(?:twitter\.com|x\.com)\/(?:\w+\/)?status\/(\d+)/);
  return m ? m[1] : null;
}

// 本文から検索キーワードを抽出（英数・カタカナ固有名詞中心、上位5語）
function extractKeywords(text: string): string {
  const cleaned = text
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[#@][\w_]+/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ");
  const words = cleaned.split(/\s+/).filter((w) => w.length >= 3);
  // 重複除去しつつ順序保持
  const seen = new Set<string>();
  const uniq: string[] = [];
  for (const w of words) {
    const k = w.toLowerCase();
    if (!seen.has(k)) { seen.add(k); uniq.push(w); }
  }
  return uniq.slice(0, 5).join(" ");
}

async function xApiGet(path: string, params: Record<string, string>, bearer: string) {
  const url = new URL(`${X_API_BASE}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${bearer}` },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`X API ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

// X 投稿1件の本文を取得（source_url からキーワード補完用）
async function fetchTweetText(tweetId: string, bearer: string): Promise<string> {
  try {
    const data = await xApiGet(
      `/tweets/${tweetId}`,
      { "tweet.fields": "text" },
      bearer
    );
    return data?.data?.text ?? "";
  } catch {
    return "";
  }
}

// クエリで動画つき投稿を検索
async function searchVideos(query: string, bearer: string, maxResults: number): Promise<VideoCandidate[]> {
  const data = await xApiGet(
    "/tweets/search/recent",
    {
      query,
      max_results: String(Math.min(Math.max(maxResults, 10), 50)),
      sort_order: "relevancy",
      "tweet.fields": "public_metrics,created_at,author_id,attachments",
      expansions: "author_id,attachments.media_keys",
      "user.fields": "username,name",
      "media.fields": "type,preview_image_url,url",
    },
    bearer
  );

  const users = new Map<string, { username: string; name: string }>();
  for (const u of data?.includes?.users ?? []) users.set(u.id, u);
  const media = new Map<string, { type: string; preview_image_url?: string; url?: string }>();
  for (const m of data?.includes?.media ?? []) media.set(m.media_key, m);

  const out: VideoCandidate[] = [];
  for (const t of data?.data ?? []) {
    const u = users.get(t.author_id);
    const username = u?.username ?? "i";
    const mediaKeys: string[] = t.attachments?.media_keys ?? [];
    const attached = mediaKeys.map((k) => media.get(k)).filter(Boolean) as Array<{ type: string; preview_image_url?: string; url?: string }>;
    const videoMedia = attached.find((m) => m.type === "video" || m.type === "animated_gif");
    const previewMedia = videoMedia ?? attached[0];
    const text: string = t.text ?? "";
    const rel = scoreClaudeRelevance(text);
    const pm = t.public_metrics ?? {};
    out.push({
      source_url: `https://x.com/${username}/status/${t.id}`,
      tweet_id: t.id,
      author_username: username,
      author_name: u?.name ?? username,
      text,
      has_video: Boolean(videoMedia),
      preview_url: previewMedia?.preview_image_url ?? previewMedia?.url ?? null,
      like_count: pm.like_count ?? 0,
      reply_count: pm.reply_count ?? 0,
      retweet_count: pm.retweet_count ?? 0,
      created_at: t.created_at ?? "",
      claude_relevance: rel,
      why: "",
    });
  }
  return out;
}

// 候補のランキング: 動画優先 → Claude関連度 → エンゲージ → 新しさ
function rankCandidates(cands: VideoCandidate[]): VideoCandidate[] {
  const now = Date.now();
  const score = (c: VideoCandidate) => {
    const ageH = c.created_at ? (now - new Date(c.created_at).getTime()) / 3600000 : 999;
    const recency = Math.max(0, 1 - ageH / 168); // 7日で0
    return (c.has_video ? 1000 : 0) + c.claude_relevance * 500 + Math.log10(c.like_count + 1) * 100 + recency * 50;
  };
  const sorted = [...cands]
    .map((c) => ({
      ...c,
      why: [
        c.has_video ? "動画あり" : "テキスト",
        c.claude_relevance >= 0.7 ? "Claude関連◎" : c.claude_relevance > 0 ? "Claude関連○" : "関連弱",
        `♥${c.like_count}`,
      ].join(" / "),
    }))
    .sort((a, b) => score(b) - score(a));

  // 候補リストの多様性: 同一著者は上位2件まで（同じ人の動画ばかり並ぶのを防ぐ）
  const perAuthor = new Map<string, number>();
  const diverse: typeof sorted = [];
  const overflow: typeof sorted = [];
  for (const c of sorted) {
    const n = perAuthor.get(c.author_username) ?? 0;
    if (n < 2) { perAuthor.set(c.author_username, n + 1); diverse.push(c); }
    else overflow.push(c);
  }
  return [...diverse, ...overflow]; // 足りなければ overflow で穴埋め
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (!user || authError) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  const bearer = process.env.X_BEARER_TOKEN;
  if (!bearer) {
    return NextResponse.json(
      { error: "X検索が設定されていません（X_BEARER_TOKEN未設定）" },
      { status: 503 }
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "バリデーションエラー", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  let { source_url } = parsed.data;
  const { theme, keywords, limit } = parsed.data;

  if (source_url && !/^https?:\/\//i.test(source_url)) source_url = `https://${source_url}`;

  // キーワードの決定: 明示keywords > theme > source_url(X投稿本文から抽出)
  let searchTerms = (keywords || theme || "").trim();
  let seedText = "";
  if (!searchTerms && source_url) {
    const tid = detectXTweetId(source_url);
    if (tid) {
      seedText = await fetchTweetText(tid, bearer);
      searchTerms = extractKeywords(seedText);
    }
  }
  if (!searchTerms) {
    // 何も手掛かりがなければ Claude Code 全般の最新動画
    searchTerms = "Claude Code";
  }

  // クエリ: キーワード + Claude文脈 + 動画必須 + RT除外（日英両対応のため lang 指定なし）
  const query = `(${searchTerms}) (Claude OR Anthropic OR MCP) has:videos -is:retweet`;

  try {
    let candidates = await searchVideos(query, bearer, limit);

    // 動画ゼロなら has:videos を外して関連投稿（テキスト/画像）でフォールバック
    if (candidates.length === 0) {
      const fallbackQuery = `(${searchTerms}) (Claude OR Anthropic OR MCP) -is:retweet`;
      candidates = await searchVideos(fallbackQuery, bearer, limit);
    }

    // 元URL自身は候補から除外
    if (source_url) {
      const seedId = detectXTweetId(source_url);
      if (seedId) candidates = candidates.filter((c) => c.tweet_id !== seedId);
    }

    const ranked = rankCandidates(candidates).slice(0, limit);

    return NextResponse.json({
      data: {
        query,
        search_terms: searchTerms,
        seed_text: seedText.slice(0, 280),
        count: ranked.length,
        candidates: ranked,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[ai/research-videos] エラー:", msg);
    return NextResponse.json(
      { error: `関連動画リサーチに失敗しました: ${msg.slice(0, 200)}` },
      { status: 500 }
    );
  }
}
