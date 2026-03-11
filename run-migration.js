#!/usr/bin/env node
/**
 * マイグレーション実行スクリプト
 *
 * 使い方:
 *   DATABASE_URL="postgresql://postgres:PASSWORD@db.PROJECT.supabase.co:5432/postgres" node run-migration.js
 *   node run-migration.js --db-url "postgresql://..."
 *
 * 手動で実行する場合:
 *   Supabase Dashboard → SQL Editor → supabase/migrations/00009_scraping_jobs.sql の内容を貼り付けて実行
 */

import pg from "pg";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, "supabase", "migrations");

const dbUrl =
  process.argv.find((a, i) => process.argv[i - 1] === "--db-url") ||
  process.env.DATABASE_URL;

if (!dbUrl) {
  console.error(`
❌ データベースURLが指定されていません。

使い方:
  DATABASE_URL="postgresql://postgres:PASSWORD@db.PROJECT.supabase.co:5432/postgres" node run-migration.js

または手動で:
  Supabase Dashboard → SQL Editor に以下のSQLを貼り付けて実行してください:
`);

  const migrationFile = path.join(MIGRATIONS_DIR, "00009_scraping_jobs.sql");
  if (fs.existsSync(migrationFile)) {
    console.log("--- SQL ここから ---");
    console.log(fs.readFileSync(migrationFile, "utf-8"));
    console.log("--- SQL ここまで ---");
  }
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });

try {
  const sql = fs.readFileSync(
    path.join(MIGRATIONS_DIR, "00009_scraping_jobs.sql"),
    "utf-8"
  );
  await pool.query(sql);
  console.log("✅ マイグレーション成功: scraping_jobs テーブルを作成しました");
} catch (err) {
  if (err.message?.includes("already exists")) {
    console.log("ℹ️  scraping_jobs テーブルは既に存在します");
  } else {
    console.error("❌ マイグレーションエラー:", err.message);
    process.exit(1);
  }
} finally {
  await pool.end();
}
