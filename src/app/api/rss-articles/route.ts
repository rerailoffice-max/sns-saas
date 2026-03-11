/**
 * RSS記事取得API
 * GET /api/rss-articles
 *
 * ダッシュボード・一括生成で使用。
 * DBに記事がない場合はRSSフィードをその場で取得してDBに保存する。
 */
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAllFeeds, DEFAULT_RSS_FEEDS } from "@/lib/rss/parser";
import { translateUntranslatedArticles } from "@/lib/rss/translate";
import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (!user || authError) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "20"), 50);
  const offset = parseInt(searchParams.get("offset") ?? "0");
  const isUsedFilter = searchParams.get("is_used");

  let query = supabase
    .from("rss_articles")
    .select("*", { count: "exact" })
    .eq("profile_id", user.id)
    .order("published_at", { ascending: false, nullsFirst: false })
    .range(offset, offset + limit - 1);

  if (isUsedFilter === "false") {
    query = query.eq("is_used", false);
  } else if (isUsedFilter === "true") {
    query = query.eq("is_used", true);
  }

  const { data: articles, count, error } = await query;

  if (error) {
    return NextResponse.json({ error: "取得に失敗しました" }, { status: 500 });
  }

  // DBに記事がない場合、RSSをその場で取得して保存
  if ((!articles || articles.length === 0) && offset === 0) {
    try {
      const freshArticles = await fetchAllFeeds(DEFAULT_RSS_FEEDS);
      const admin = createAdminClient();

      for (const article of freshArticles) {
        await admin.from("rss_articles").upsert(
          {
            profile_id: user.id,
            title: article.title,
            link: article.link,
            description: article.description,
            source: article.source,
            published_at: article.published_at,
            is_used: false,
          },
          { onConflict: "link", ignoreDuplicates: true }
        );
      }

      // 翻訳
      if (process.env.ANTHROPIC_API_KEY) {
        const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
        await translateUntranslatedArticles(admin, user.id, anthropic);
      }

      // 再取得
      let retryQuery = supabase
        .from("rss_articles")
        .select("*", { count: "exact" })
        .eq("profile_id", user.id)
        .order("published_at", { ascending: false, nullsFirst: false })
        .range(0, limit - 1);

      if (isUsedFilter === "false") {
        retryQuery = retryQuery.eq("is_used", false);
      }

      const { data: retryData, count: retryCount } = await retryQuery;

      return NextResponse.json({
        data: retryData ?? [],
        total: retryCount ?? 0,
        fetched_now: true,
      });
    } catch {
      return NextResponse.json({ data: [], total: 0 });
    }
  }

  // 未翻訳の記事がある場合、その場で翻訳して再取得
  const hasUntranslated = articles?.some((a) => !a.title_ja);
  if (hasUntranslated && process.env.ANTHROPIC_API_KEY) {
    try {
      const admin = createAdminClient();
      const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      await translateUntranslatedArticles(admin, user.id, anthropic);

      // 翻訳済みのデータで再取得
      let refreshQuery = supabase
        .from("rss_articles")
        .select("*", { count: "exact" })
        .eq("profile_id", user.id)
        .order("published_at", { ascending: false, nullsFirst: false })
        .range(offset, offset + limit - 1);

      if (isUsedFilter === "false") {
        refreshQuery = refreshQuery.eq("is_used", false);
      } else if (isUsedFilter === "true") {
        refreshQuery = refreshQuery.eq("is_used", true);
      }

      const { data: refreshed, count: refreshedCount } = await refreshQuery;
      return NextResponse.json({ data: refreshed ?? [], total: refreshedCount ?? 0 });
    } catch {
      // 翻訳失敗時は英語のまま返す
    }
  }

  return NextResponse.json({ data: articles ?? [], total: count ?? 0 });
}
