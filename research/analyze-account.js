#!/usr/bin/env node
/**
 * Threads アカウント分析ワンコマンドスクリプト
 *
 * 使い方:
 *   node research/analyze-account.js --user kudooo_ai
 *   node research/analyze-account.js --user asa_to_ame --months 1
 *   node research/analyze-account.js --user asa_to_ame --step2   (STEP2のみ再実行)
 *   node research/analyze-account.js --user asa_to_ame --analyze (分析+CSV+レポートのみ)
 *
 * 処理フロー:
 *   1. --login でログイン確認（初回のみ手動）
 *   2. scrape-threads-hidden-json.js でSTEP1+STEP2実行
 *   3. 収集データからCSV生成
 *   4. 定量・定性分析レポート生成
 */

import { execSync, spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const RESEARCH = path.join(ROOT, 'research');

const args = process.argv.slice(2);
const rawUser = args.find((a, i) => args[i - 1] === '--user') || '';
const USERNAME = rawUser.replace(/^@/, '');
const MONTHS = args.find((a, i) => args[i - 1] === '--months') || '3';
const ANALYZE_ONLY = args.includes('--analyze');
const STEP2_ONLY = args.includes('--step2');

if (!USERNAME) {
  console.log(`Threads アカウント分析ツール

使い方:
  node research/analyze-account.js --user <username>
  node research/analyze-account.js --user <username> --months 1
  node research/analyze-account.js --user <username> --step2
  node research/analyze-account.js --user <username> --analyze

オプション:
  --user <name>   分析対象のThreadsユーザー名（@不要）
  --months <N>    収集期間（デフォルト3ヶ月）
  --step2         STEP2のみ再実行（STEP1のURLリストを使い回す）
  --analyze       収集済みデータから分析+CSV+レポートのみ生成`);
  process.exit(0);
}

console.log(`\n=== Threads アカウント分析 ===`);
console.log(`対象: @${USERNAME}`);
console.log(`期間: ${MONTHS}ヶ月`);
console.log(`モード: ${ANALYZE_ONLY ? '分析のみ' : STEP2_ONLY ? 'STEP2+分析' : 'フル実行'}`);
console.log();

// ============================================================
// PHASE 1: データ収集（scrape-threads-hidden-json.js）
// ============================================================
if (!ANALYZE_ONLY) {
  console.log('[PHASE 1] データ収集...');
  const scrapeArgs = ['--user', USERNAME, '--months', MONTHS];
  if (STEP2_ONLY) scrapeArgs.push('--step2');

  try {
    execSync(
      `node ${path.join(RESEARCH, 'scrape-threads-hidden-json.js')} ${scrapeArgs.join(' ')}`,
      { stdio: 'inherit', cwd: ROOT, timeout: 3600000 }
    );
  } catch (e) {
    console.error(`収集エラー: ${e.message}`);
    console.log('収集済みデータで分析を続行します...');
  }
}

// ============================================================
// PHASE 2: データ読み込み
// ============================================================
console.log('\n[PHASE 2] データ読み込み...');
const OUTPUT_PATH = path.join(RESEARCH, 'raw-posts-full.json');

if (!fs.existsSync(OUTPUT_PATH)) {
  console.error('データファイルが見つかりません:', OUTPUT_PATH);
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(OUTPUT_PATH, 'utf-8'));
const accountData = data.accounts?.[USERNAME];

if (!accountData || !accountData.posts?.length) {
  console.error(`@${USERNAME} のデータがありません`);
  process.exit(1);
}

const posts = accountData.posts;
console.log(`  投稿数: ${posts.length}件`);

// ============================================================
// PHASE 3: CSV生成
// ============================================================
console.log('\n[PHASE 3] CSV生成...');

const threads = {};
for (const p of posts) {
  const tid = p.thread_id || p.permalink || '';
  if (!threads[tid]) threads[tid] = [];
  threads[tid].push(p);
}

const threadList = Object.entries(threads).map(([tid, tposts]) => {
  tposts.sort((a, b) => (a.post_order || 1) - (b.post_order || 1));
  const totalLikes = tposts.reduce((s, p) => s + (p.like_count || 0), 0);
  const views = tposts.find(p => p.thread_view_count)?.thread_view_count || null;
  return { tid, posts: tposts, totalLikes, viewCount: views, date: tposts[0].date || '' };
});
threadList.sort((a, b) => b.date.localeCompare(a.date));

const csvPath = path.join(RESEARCH, `${USERNAME}_posts.csv`);
const csvHeader = 'No,スレッドNo,スレッド長,投稿順,日付,いいね,スレッド合計いいね,表示回数,文字数,画像,動画,リンク,絵文字,テキスト,permalink,thread_id\n';

let csvBody = '';
let no = 0;
threadList.forEach((thread, threadNo) => {
  for (const p of thread.posts) {
    no++;
    const order = p.post_order || 1;
    const text = (p.text || '').replace(/\n/g, ' ').replace(/\r/g, '').replace(/"/g, '""');
    const row = [
      no, threadNo + 1, thread.posts.length, `${order}/${thread.posts.length}`,
      p.date || '',
      p.like_count || 0,
      order === 1 ? thread.totalLikes : '',
      order === 1 && thread.viewCount ? thread.viewCount : '',
      p.total_chars || 0,
      p.has_image ? '○' : '', p.has_video ? '○' : '',
      p.has_link ? '○' : '', p.has_emoji ? '○' : '',
      `"${text}"`, p.permalink || '', p.thread_id || '',
    ];
    csvBody += row.join(',') + '\n';
  }
});

fs.writeFileSync(csvPath, '\uFEFF' + csvHeader + csvBody, 'utf-8');
console.log(`  CSV: ${csvPath} (${no}件 / ${threadList.length}スレッド)`);

// ============================================================
// PHASE 4: 統計分析
// ============================================================
console.log('\n[PHASE 4] 統計分析...');

const dates = posts.map(p => p.date).filter(Boolean).sort();
const dateRange = `${dates[0]} 〜 ${dates[dates.length - 1]}`;

const views = posts.filter(p => p.thread_view_count).map(p => p.thread_view_count);
const likes = posts.map(p => p.like_count || 0);
const chars = posts.map(p => p.total_chars || 0);

const avg = arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
const median = arr => {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};
const max = arr => arr.length ? Math.max(...arr) : 0;

// スレッド構成別
const byLen = {};
for (const t of threadList) {
  const len = t.posts.length;
  if (!byLen[len]) byLen[len] = [];
  byLen[len].push(t);
}

// フックパターン分類
function classifyHook(text) {
  const t = (text || '').slice(0, 150);
  if (/やばい|ガチで/.test(t)) return 'やばい・ガチ型';
  if (/速報|【速報】/.test(t)) return '速報型';
  if (/あのー/.test(t)) return 'あのー型';
  if (/知ら(ない|ず)|損し/.test(t)) return '損訴求型';
  if (/\d+.*人|\d+.*万|\d+%|\d+億/.test(t)) return '数字型';
  if (/終わっ|これからは/.test(t)) return '断言型';
  if (/[？?]|使った(こと|事)/.test(t)) return '質問型';
  return 'その他';
}

const hookStats = {};
for (const t of threadList) {
  const hook = classifyHook(t.posts[0].text);
  if (!hookStats[hook]) hookStats[hook] = { count: 0, likes: 0, views: 0, viewCount: 0 };
  hookStats[hook].count++;
  hookStats[hook].likes += t.totalLikes;
  if (t.viewCount) { hookStats[hook].views += t.viewCount; hookStats[hook].viewCount++; }
}

// ============================================================
// PHASE 5: レポート生成
// ============================================================
console.log('\n[PHASE 5] レポート生成...');

const report = `# @${USERNAME} Threads投稿 分析レポート

**データ期間**: ${dateRange}
**総投稿数**: ${posts.length}件 / **総スレッド数**: ${threadList.length}スレッド
**生成日時**: ${new Date().toISOString().slice(0, 10)}

---

## 基本統計

| 指標 | 値 |
|------|----|
| 総投稿数 | ${posts.length}件 |
| 総スレッド数 | ${threadList.length}スレッド |
| 平均スレッド長 | ${(posts.length / threadList.length).toFixed(1)}件/スレッド |
| 表示回数取得済み | ${views.length}件（${Math.round(views.length * 100 / posts.length)}%） |
| いいね平均 | ${avg(likes).toFixed(1)}件 |
| いいね最大 | ${max(likes)}件 |
| 表示平均 | ${views.length ? Math.round(avg(views)) : '-'}回 |
| 表示中央値 | ${views.length ? median(views) : '-'}回 |
| 表示最大 | ${views.length ? max(views) : '-'}回 |
| 文字数平均 | ${Math.round(avg(chars))}字 |
| 絵文字あり | ${posts.filter(p => p.has_emoji).length}件（${Math.round(posts.filter(p => p.has_emoji).length * 100 / posts.length)}%） |
| 画像あり | ${posts.filter(p => p.has_image).length}件（${Math.round(posts.filter(p => p.has_image).length * 100 / posts.length)}%） |
| リンクあり | ${posts.filter(p => p.has_link).length}件（${Math.round(posts.filter(p => p.has_link).length * 100 / posts.length)}%） |

## スレッド構成別パフォーマンス

| スレッド長 | 本数 | いいね平均 | 表示平均 |
|-----------|------|-----------|---------|
${Object.keys(byLen).sort((a, b) => a - b).map(len => {
  const ts = byLen[len];
  const avgL = avg(ts.map(t => t.totalLikes));
  const vs = ts.filter(t => t.viewCount).map(t => t.viewCount);
  return `| ${len}件 | ${ts.length}本 | ${avgL.toFixed(1)}件 | ${vs.length ? Math.round(avg(vs)) : '-'}回 |`;
}).join('\n')}

## フックパターン別パフォーマンス

| パターン | 件数 | いいね平均 | 表示平均 |
|---------|------|-----------|---------|
${Object.entries(hookStats).sort((a, b) => (b[1].likes / b[1].count) - (a[1].likes / a[1].count)).map(([hook, s]) => {
  const avgL = s.likes / s.count;
  const avgV = s.viewCount ? Math.round(s.views / s.viewCount) : '-';
  return `| ${hook} | ${s.count}件 | ${avgL.toFixed(1)}件 | ${avgV}回 |`;
}).join('\n')}

## いいね上位10件

| 順位 | いいね | スレ長 | 日付 | フック |
|------|--------|--------|------|-------|
${threadList.sort((a, b) => b.totalLikes - a.totalLikes).slice(0, 10).map((t, i) => {
  const text = (t.posts[0].text || '').replace(/\n/g, ' ').slice(0, 80);
  return `| ${i + 1} | ${t.totalLikes}件 | ${t.posts.length}件 | ${t.date} | ${text} |`;
}).join('\n')}

## 表示回数上位10件

| 順位 | 表示回数 | いいね | スレ長 | 日付 | フック |
|------|---------|--------|--------|------|-------|
${threadList.filter(t => t.viewCount).sort((a, b) => b.viewCount - a.viewCount).slice(0, 10).map((t, i) => {
  const text = (t.posts[0].text || '').replace(/\n/g, ' ').slice(0, 60);
  return `| ${i + 1} | ${t.viewCount}回 | ${t.totalLikes}件 | ${t.posts.length}件 | ${t.date} | ${text} |`;
}).join('\n')}

---
*収集: research/scrape-threads-hidden-json.js*
*分析: research/analyze-account.js*
`;

const reportPath = path.join(RESEARCH, `${USERNAME}_analysis.md`);
fs.writeFileSync(reportPath, report, 'utf-8');
console.log(`  レポート: ${reportPath}`);

// ============================================================
// 完了
// ============================================================
console.log(`\n=== 分析完了 ===`);
console.log(`@${USERNAME}: ${posts.length}件 / ${threadList.length}スレッド`);
console.log(`CSV: ${csvPath}`);
console.log(`レポート: ${reportPath}`);
