/**
 * 研究データインポートAPI
 * POST /api/models/[id]/import-research
 *
 * research/ フォルダのCSV投稿データと分析レポートMDを読み取り、
 * model_posts に upsert + model_accounts.analysis_result に保存する。
 */
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const RESEARCH_DIR = path.join(process.cwd(), "research");
const BATCH_SIZE = 200;

interface ThreadsRow {
  テキスト?: string;
  投稿順?: string;
  日付?: string;
  いいね?: string;
  表示回数?: string;
  permalink?: string;
  thread_id?: string;
  画像?: string;
  動画?: string;
}

interface XRow {
  id?: string;
  text?: string;
  post_order?: string;
  date?: string;
  created_at?: string;
  like_count?: string;
  reply_count?: string;
  retweet_count?: string;
  impression_count?: string;
  has_image?: string;
  has_video?: string;
  permalink?: string;
}

function parseCSV(content: string): Record<string, string>[] {
  const bom = content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;
  const lines = bom.split("\n");
  if (lines.length < 2) return [];

  const headers = parseCSVLine(lines[0]);
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const values = parseCSVLine(line);
    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = values[j] ?? "";
    }
    rows.push(row);
  }
  return rows;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        result.push(current);
        current = "";
      } else {
        current += ch;
      }
    }
  }
  result.push(current);
  return result;
}

function isThreadsFormat(headers: string[]): boolean {
  return headers.some(
    (h) => h === "テキスト" || h === "投稿順" || h === "スレッドNo"
  );
}

function findResearchFiles(username: string): {
  csv: string | null;
  markdowns: string[];
} {
  if (!fs.existsSync(RESEARCH_DIR)) {
    return { csv: null, markdowns: [] };
  }

  const files = fs.readdirSync(RESEARCH_DIR);
  const lowerUsername = username.toLowerCase();

  const csvCandidates = [
    `${username}_posts.csv`,
    `${username}_x_posts.csv`,
  ];
  const csv =
    csvCandidates.find((c) => files.includes(c)) ?? null;

  const markdowns = files.filter(
    (f) =>
      f.toLowerCase().startsWith(lowerUsername) &&
      f.endsWith(".md") &&
      (f.includes("analysis") || f.includes("content_analysis"))
  );

  return { csv, markdowns };
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (!user || authError) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  const { data: model } = await supabase
    .from("model_accounts")
    .select("*")
    .eq("id", id)
    .eq("profile_id", user.id)
    .single();

  if (!model) {
    return NextResponse.json(
      { error: "モデルアカウントが見つかりません" },
      { status: 404 }
    );
  }

  const { csv, markdowns } = findResearchFiles(model.username);

  if (!csv && markdowns.length === 0) {
    return NextResponse.json(
      { error: `${model.username} の研究データが見つかりません` },
      { status: 404 }
    );
  }

  const admin = createAdminClient();
  let postsImported = 0;

  // CSV投稿データのインポート
  if (csv) {
    const csvPath = path.join(RESEARCH_DIR, csv);
    const content = fs.readFileSync(csvPath, "utf-8");
    const allRows = parseCSV(content);
    const headers = Object.keys(allRows[0] ?? {});
    const isThreads = isThreadsFormat(headers);

    // スレッドの1投稿目のみ抽出
    const firstPosts = allRows.filter((row) => {
      if (isThreads) {
        const order = (row as ThreadsRow)["投稿順"] ?? "";
        return order.startsWith("1/") || order === "1";
      } else {
        return (row as XRow).post_order === "1";
      }
    });

    const postsToInsert = firstPosts.map((row) => {
      if (isThreads) {
        const r = row as ThreadsRow;
        const hasImage = r["画像"] === "○" || r["画像"] === "◯";
        const hasVideo = r["動画"] === "○" || r["動画"] === "◯";
        return {
          model_account_id: id,
          platform_post_id: r.permalink ?? r.thread_id ?? crypto.randomUUID(),
          text: r["テキスト"] ?? null,
          hashtags: extractHashtags(r["テキスト"] ?? ""),
          media_type: hasVideo ? "video" : hasImage ? "image" : "text",
          posted_at: r["日付"] ? new Date(r["日付"]).toISOString() : null,
          likes: r["いいね"] ? parseInt(r["いいね"]) || null : null,
          replies: null,
          reposts: null,
        };
      } else {
        const r = row as XRow;
        const hasImage = r.has_image === "○" || r.has_image === "true";
        const hasVideo = r.has_video === "○" || r.has_video === "true";
        return {
          model_account_id: id,
          platform_post_id: r.id ?? r.permalink ?? crypto.randomUUID(),
          text: r.text ?? null,
          hashtags: extractHashtags(r.text ?? ""),
          media_type: hasVideo ? "video" : hasImage ? "image" : "text",
          posted_at: r.created_at
            ? new Date(r.created_at).toISOString()
            : r.date
              ? new Date(r.date).toISOString()
              : null,
          likes: r.like_count ? parseInt(r.like_count) || null : null,
          replies: r.reply_count ? parseInt(r.reply_count) || null : null,
          reposts: r.retweet_count ? parseInt(r.retweet_count) || null : null,
        };
      }
    });

    // バッチ upsert
    for (let i = 0; i < postsToInsert.length; i += BATCH_SIZE) {
      const batch = postsToInsert.slice(i, i + BATCH_SIZE);
      const { error } = await admin.from("model_posts").upsert(batch, {
        onConflict: "model_account_id,platform_post_id",
        ignoreDuplicates: false,
      });
      if (!error) {
        postsImported += batch.length;
      } else {
        console.error("投稿インポートバッチエラー:", error.message);
      }
    }
  }

  // 分析レポートMDのインポート
  let markdownReport = "";
  for (const mdFile of markdowns) {
    const mdPath = path.join(RESEARCH_DIR, mdFile);
    const content = fs.readFileSync(mdPath, "utf-8");
    markdownReport += `\n\n---\n# ${mdFile}\n\n${content}`;
  }

  if (markdownReport || postsImported > 0) {
    const existingResult =
      (model.analysis_result as Record<string, unknown>) ?? {};
    const analysisResult = {
      ...existingResult,
      ...(markdownReport
        ? {
            markdown_report: markdownReport.trim(),
            data_source: "research_import",
          }
        : {}),
      total_posts_analyzed: postsImported || existingResult.total_posts_analyzed,
    };

    await admin
      .from("model_accounts")
      .update({
        analysis_result: analysisResult,
        last_analyzed_at: new Date().toISOString(),
      })
      .eq("id", id);
  }

  return NextResponse.json({
    data: {
      posts_imported: postsImported,
      markdowns_imported: markdowns.length,
      csv_file: csv,
      markdown_files: markdowns,
    },
  });
}

function extractHashtags(text: string): string[] {
  const matches = text.match(/#[\w\u3000-\u9FFF]+/g);
  return matches ? matches.map((tag) => tag.replace("#", "")) : [];
}
