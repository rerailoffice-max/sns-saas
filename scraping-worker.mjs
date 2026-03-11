#!/usr/bin/env node
/**
 * スクレイピングワーカー
 *
 * Supabase の scraping_jobs テーブルをポーリングし、
 * pending ジョブを検出したらスクリプトを実行してデータをDBにアップロードする。
 *
 * 実行: node scraping-worker.js
 * PM2:  pm2 start scraping-worker.js --name scraping-worker
 *
 * 環境変数（.envから自動読み込み）:
 *   NEXT_PUBLIC_SUPABASE_URL — Supabase URL
 *   SUPABASE_SERVICE_ROLE_KEY — service_role キー
 */

import { createClient } from "@supabase/supabase-js";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RESEARCH_DIR = path.join(__dirname, "research");
const POLL_INTERVAL_MS = 30_000;

// .env.local → .env のフォールバック読み込み
function loadEnv() {
  for (const envFile of [".env.local", ".env"]) {
    const envPath = path.join(__dirname, envFile);
    if (fs.existsSync(envPath)) {
      const lines = fs.readFileSync(envPath, "utf-8").split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eqIdx = trimmed.indexOf("=");
        if (eqIdx === -1) continue;
        const key = trimmed.slice(0, eqIdx).trim();
        let val = trimmed.slice(eqIdx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (!process.env[key]) process.env[key] = val;
      }
    }
  }
}

loadEnv();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("❌ NEXT_PUBLIC_SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY が必要です");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

console.log(`\n🔄 スクレイピングワーカー起動`);
console.log(`   Supabase: ${SUPABASE_URL}`);
console.log(`   ポーリング間隔: ${POLL_INTERVAL_MS / 1000}秒`);
console.log(`   研究ディレクトリ: ${RESEARCH_DIR}\n`);

let isProcessing = false;
let lastErrorMsg = "";
let errorSuppressCount = 0;

async function pollJobs() {
  if (isProcessing) return;

  try {
    const { data: jobs, error } = await supabase
      .from("scraping_jobs")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(1);

    if (error) {
      if (error.message !== lastErrorMsg) {
        if (errorSuppressCount > 0) {
          console.error(`  (同一エラー ${errorSuppressCount}回スキップ)`);
        }
        console.error("ジョブ取得エラー:", error.message);
        lastErrorMsg = error.message;
        errorSuppressCount = 0;
      } else {
        errorSuppressCount++;
      }
      return;
    }
    lastErrorMsg = "";
    errorSuppressCount = 0;

    if (!jobs || jobs.length === 0) return;

    const job = jobs[0];
    isProcessing = true;
    console.log(`\n📥 ジョブ検出: @${job.username} (${job.platform}) [${job.id}]`);

    try {
      await processJob(job);
    } finally {
      isProcessing = false;
    }
  } catch (err) {
    console.error("ポーリングエラー:", err.message);
    isProcessing = false;
  }
}

async function processJob(job) {
  // status = running に更新
  await supabase
    .from("scraping_jobs")
    .update({ status: "running", started_at: new Date().toISOString() })
    .eq("id", job.id);

  try {
    // 1. スクレイピング実行
    console.log(`  [1/3] スクレイピング開始...`);
    await runScraping(job.platform, job.username);

    // 2. データをDBにアップロード
    console.log(`  [2/3] データアップロード...`);
    const postsFound = await uploadData(job.model_account_id, job.platform, job.username);

    // 3. ジョブ完了
    await supabase
      .from("scraping_jobs")
      .update({
        status: "completed",
        posts_found: postsFound,
        completed_at: new Date().toISOString(),
      })
      .eq("id", job.id);

    console.log(`  [3/3] ✅ 完了 (${postsFound}件の投稿)`);
  } catch (err) {
    console.error(`  ❌ エラー: ${err.message}`);
    await supabase
      .from("scraping_jobs")
      .update({
        status: "failed",
        error_message: err.message.slice(0, 500),
        completed_at: new Date().toISOString(),
      })
      .eq("id", job.id);
  }
}

/**
 * プラットフォームに応じたスクレイピングスクリプトを実行
 */
async function runScraping(platform, username) {
  if (platform === "threads") {
    await execScript("node", [
      path.join(RESEARCH_DIR, "analyze-account.js"),
      "--user", username,
      "--months", "3",
    ]);
  } else if (platform === "x") {
    // X: 投稿収集 → 分析 (CSV生成)
    await execScript("node", [
      path.join(RESEARCH_DIR, "collect-x-posts.js"),
      "--user", username,
      "--max", "2000",
    ]);
    console.log(`  [1.5/3] X分析 + CSV生成...`);
    await execScript("node", [
      path.join(RESEARCH_DIR, "analyze-x-content.js"),
      "--user", username,
    ]);
  } else {
    throw new Error(`未対応のプラットフォーム: ${platform}`);
  }
}

/**
 * 子プロセスでスクリプトを実行し、完了を待つ
 */
function execScript(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: __dirname,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, NODE_OPTIONS: "" },
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data) => {
      const text = data.toString();
      stdout += text;
      process.stdout.write(`    ${text}`);
    });

    child.stderr.on("data", (data) => {
      const text = data.toString();
      stderr += text;
      process.stderr.write(`    ${text}`);
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(`スクリプト終了 (code ${code}): ${stderr.slice(-300)}`));
      }
    });

    child.on("error", (err) => {
      reject(new Error(`スクリプト起動失敗: ${err.message}`));
    });

    // 1時間タイムアウト
    setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error("タイムアウト（1時間）"));
    }, 3600_000);
  });
}

/**
 * 生成されたCSV/MDデータをSupabaseにアップロード
 */
async function uploadData(modelAccountId, platform, username) {
  const csvFile = findCSV(platform, username);
  const mdFiles = findMarkdowns(username);
  let postsUploaded = 0;

  if (csvFile) {
    const content = fs.readFileSync(path.join(RESEARCH_DIR, csvFile), "utf-8");
    const rows = parseCSV(content);
    const isThreads = isThreadsFormat(Object.keys(rows[0] || {}));

    // スレッドの先頭投稿のみ抽出
    const firstPosts = rows.filter((row) => {
      if (isThreads) {
        const order = row["投稿順"] || "";
        return order.startsWith("1/") || order === "1";
      }
      return row.post_order === "1";
    });

    const postsToInsert = firstPosts.map((row) => mapRowToPost(row, modelAccountId, isThreads));

    // バッチ upsert (200件ずつ)
    for (let i = 0; i < postsToInsert.length; i += 200) {
      const batch = postsToInsert.slice(i, i + 200);
      const { error } = await supabase.from("model_posts").upsert(batch, {
        onConflict: "model_account_id,platform_post_id",
        ignoreDuplicates: false,
      });
      if (error) {
        console.error(`    バッチエラー: ${error.message}`);
      } else {
        postsUploaded += batch.length;
      }
    }
    console.log(`    投稿: ${postsUploaded}/${firstPosts.length}件アップロード`);
  }

  // 分析レポートMDのインポート
  let markdownReport = "";
  for (const mdFile of mdFiles) {
    const content = fs.readFileSync(path.join(RESEARCH_DIR, mdFile), "utf-8");
    markdownReport += `\n\n---\n# ${mdFile}\n\n${content}`;
  }

  if (markdownReport || postsUploaded > 0) {
    const { data: existing } = await supabase
      .from("model_accounts")
      .select("analysis_result")
      .eq("id", modelAccountId)
      .single();

    const existingResult = existing?.analysis_result || {};
    const analysisResult = {
      ...existingResult,
      ...(markdownReport
        ? { markdown_report: markdownReport.trim(), data_source: "scraping_worker" }
        : {}),
      total_posts_analyzed: postsUploaded || existingResult.total_posts_analyzed,
    };

    await supabase
      .from("model_accounts")
      .update({
        analysis_result: analysisResult,
        last_analyzed_at: new Date().toISOString(),
      })
      .eq("id", modelAccountId);
  }

  return postsUploaded;
}

// --- ユーティリティ ---

function findCSV(platform, username) {
  if (!fs.existsSync(RESEARCH_DIR)) return null;
  const files = fs.readdirSync(RESEARCH_DIR);
  const candidates =
    platform === "x"
      ? [`${username}_x_posts.csv`]
      : [`${username}_posts.csv`];
  return candidates.find((c) => files.includes(c)) || null;
}

function findMarkdowns(username) {
  if (!fs.existsSync(RESEARCH_DIR)) return [];
  const files = fs.readdirSync(RESEARCH_DIR);
  const lower = username.toLowerCase();
  return files.filter(
    (f) => f.toLowerCase().startsWith(lower) && f.endsWith(".md") && (f.includes("analysis") || f.includes("content_analysis"))
  );
}

function isThreadsFormat(headers) {
  return headers.some((h) => h === "テキスト" || h === "投稿順" || h === "スレッドNo");
}

function parseCSV(content) {
  const bom = content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;
  const lines = bom.split("\n");
  if (lines.length < 2) return [];
  const headers = parseCSVLine(lines[0]);
  return lines
    .slice(1)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const values = parseCSVLine(line);
      const row = {};
      headers.forEach((h, j) => (row[h] = values[j] ?? ""));
      return row;
    });
}

function parseCSVLine(line) {
  const result = [];
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
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

function mapRowToPost(row, modelAccountId, isThreads) {
  if (isThreads) {
    const hasImage = row["画像"] === "○" || row["画像"] === "◯";
    const hasVideo = row["動画"] === "○" || row["動画"] === "◯";
    return {
      model_account_id: modelAccountId,
      platform_post_id: row.permalink || row.thread_id || crypto.randomUUID(),
      text: row["テキスト"] || null,
      hashtags: extractHashtags(row["テキスト"] || ""),
      media_type: hasVideo ? "video" : hasImage ? "image" : "text",
      posted_at: row["日付"] ? new Date(row["日付"]).toISOString() : null,
      likes: row["いいね"] ? parseInt(row["いいね"]) || null : null,
      replies: null,
      reposts: null,
    };
  }
  const hasImage = row.has_image === "○" || row.has_image === "true";
  const hasVideo = row.has_video === "○" || row.has_video === "true";
  return {
    model_account_id: modelAccountId,
    platform_post_id: row.id || row.permalink || crypto.randomUUID(),
    text: row.text || null,
    hashtags: extractHashtags(row.text || ""),
    media_type: hasVideo ? "video" : hasImage ? "image" : "text",
    posted_at: row.created_at
      ? new Date(row.created_at).toISOString()
      : row.date
        ? new Date(row.date).toISOString()
        : null,
    likes: row.like_count ? parseInt(row.like_count) || null : null,
    replies: row.reply_count ? parseInt(row.reply_count) || null : null,
    reposts: row.retweet_count ? parseInt(row.retweet_count) || null : null,
  };
}

function extractHashtags(text) {
  const matches = text.match(/#[\w\u3000-\u9FFF]+/g);
  return matches ? matches.map((tag) => tag.replace("#", "")) : [];
}

// --- メインループ ---
setInterval(pollJobs, POLL_INTERVAL_MS);
pollJobs(); // 起動時に即チェック

// graceful shutdown
process.on("SIGINT", () => {
  console.log("\n🛑 ワーカー停止");
  process.exit(0);
});
process.on("SIGTERM", () => {
  console.log("\n🛑 ワーカー停止");
  process.exit(0);
});
