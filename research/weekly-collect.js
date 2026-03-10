#!/usr/bin/env node
/**
 * Threads 参考アカウント週次自動収集
 *
 * PM2 cronで毎週月曜4:00 AMに実行。
 * 登録済みアカウントの最新1ヶ月分を収集してCSV+レポートを更新。
 *
 * 使い方:
 *   node research/weekly-collect.js              全アカウント収集
 *   node research/weekly-collect.js --dry-run    実行内容の確認のみ
 *
 * アカウント追加:
 *   ACCOUNTS 配列にユーザー名を追加するだけ
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

// ============================================================
// 監視対象アカウント（ここに追加するだけで自動収集対象になる）
// ============================================================
const ACCOUNTS = [
  'kudooo_ai',
  'asa_to_ame',
];

const DRY_RUN = process.argv.includes('--dry-run');
const LOG_PATH = path.join(ROOT, 'research', 'weekly-collect.log');

function log(msg) {
  const ts = new Date().toISOString().slice(0, 19);
  const line = `[${ts}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_PATH, line + '\n');
}

async function main() {
  log(`=== 週次Threads収集 開始 ===`);
  log(`対象: ${ACCOUNTS.length}アカウント (${ACCOUNTS.join(', ')})`);
  log(`モード: ${DRY_RUN ? 'ドライラン' : '本番実行'}`);

  if (DRY_RUN) {
    log('ドライラン: 実際の収集は行いません');
    for (const user of ACCOUNTS) {
      log(`  [DRY] @${user} → --step2 --months 1 → CSV + レポート`);
    }
    return;
  }

  // SingletonLock削除
  const lockPath = path.join(ROOT, 'research', '.threads-profile', 'SingletonLock');
  try { fs.unlinkSync(lockPath); } catch {}

  const results = [];

  for (const user of ACCOUNTS) {
    log(`\n--- @${user} ---`);
    const start = Date.now();

    try {
      // analyze-account.js で収集+分析+CSV+レポートを一括実行
      // --step2: 既存のURLリストがあればSTEP2のみ（高速）、なければフル実行
      const urlsPath = path.join(ROOT, 'research', 'thread-urls.json');
      let urlsExist = false;
      if (fs.existsSync(urlsPath)) {
        try {
          const urlData = JSON.parse(fs.readFileSync(urlsPath, 'utf-8'));
          urlsExist = urlData.username === user && urlData.urls?.length > 0;
        } catch {}
      }

      // フル実行（STEP1+STEP2）で最新1ヶ月分を取得
      const cmd = `node ${path.join(ROOT, 'research', 'analyze-account.js')} --user ${user} --months 1`;
      log(`実行: ${cmd}`);
      execSync(cmd, { stdio: 'inherit', cwd: ROOT, timeout: 3600000 });

      const elapsed = Math.round((Date.now() - start) / 1000);
      log(`@${user} 完了（${elapsed}秒）`);
      results.push({ user, status: 'ok', elapsed });
    } catch (e) {
      const elapsed = Math.round((Date.now() - start) / 1000);
      log(`@${user} エラー: ${e.message?.slice(0, 100)}`);
      results.push({ user, status: 'error', elapsed, error: e.message?.slice(0, 100) });
    }
  }

  // サマリー
  log(`\n=== 週次収集 完了 ===`);
  for (const r of results) {
    log(`  @${r.user}: ${r.status} (${r.elapsed}秒)${r.error ? ` — ${r.error}` : ''}`);
  }

  // 結果をJSONに保存
  const summaryPath = path.join(ROOT, 'research', 'weekly-collect-summary.json');
  fs.writeFileSync(summaryPath, JSON.stringify({
    run_at: new Date().toISOString(),
    accounts: results,
  }, null, 2));
  log(`サマリー: ${summaryPath}`);
}

main().catch(e => {
  log(`Fatal: ${e.message}`);
  process.exit(1);
});
