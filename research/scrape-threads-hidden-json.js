#!/usr/bin/env node
/**
 * Threads 投稿収集スクリプト（2段階方式）
 *
 * STEP 1: プロフィールページをスクロール → GraphQL傍受でスレッド一覧取得（1投稿目のみ）
 * STEP 2: 各スレッドのパーマリンクを開く → 隠しJSONから全投稿を取得（2/3, 3/3等も含む）
 *
 * 実行方法:
 *   node research/scrape-threads-hidden-json.js
 *   node research/scrape-threads-hidden-json.js --user kudooo_ai
 *   node research/scrape-threads-hidden-json.js --user kudooo_ai --months 3
 *   node research/scrape-threads-hidden-json.js --user kudooo_ai --scrolls 150
 *   node research/scrape-threads-hidden-json.js --resume   ← 途中から再開（STEP1スキップ）
 *
 * --months N  : 取得したい月数（デフォルト3）。1ヶ月≒50スクロールで自動換算。
 *              --scrolls を明示した場合はそちらが優先。
 * --user NAME : --username の短縮エイリアス（@ 記号は自動除去）
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const args = process.argv;

// --user は --username の短縮エイリアス。@ 記号を自動除去
const rawUser =
  args.find((a, i) => args[i - 1] === '--user') ||
  args.find((a, i) => args[i - 1] === '--username') ||
  'kudooo_ai';
const TARGET_USERNAME = rawUser.replace(/^@/, '');

// --months N → 1ヶ月あたり50スクロールで換算（--scrolls が明示されていればそちら優先）
const MONTHS = parseInt(args.find((a, i) => args[i - 1] === '--months') || '3', 10);
const SCROLLS_PER_MONTH = 50;
const DEFAULT_SCROLLS = MONTHS * SCROLLS_PER_MONTH;
const MAX_SCROLLS = parseInt(
  args.find((a, i) => args[i - 1] === '--scrolls') || String(DEFAULT_SCROLLS),
  10,
);
const RESUME_MODE = args.includes('--resume');
const OUTPUT_PATH = path.join(ROOT, 'research', 'raw-posts-full.json');
const URLS_PATH = path.join(ROOT, 'research', 'thread-urls.json');
const PROFILE_DIR = path.join(ROOT, 'research', '.threads-profile');
const SCROLL_WAIT_MS = 5000;
const NO_NEW_LIMIT = 8;
const PAGE_OPEN_DELAY = 5000;
const CHECKPOINT_INTERVAL = 20;
const BACKOFF_MS = 60000;
const STEP2_ONLY = args.includes('--step2');
const LOGIN_MODE = args.includes('--login');

// ======================================================
// ユーティリティ
// ======================================================
function findThreadItems(obj, depth = 0) {
  if (depth > 25 || !obj || typeof obj !== 'object') return [];
  const results = [];
  if (Array.isArray(obj)) {
    for (const item of obj) results.push(...findThreadItems(item, depth + 1));
    return results;
  }
  if ('thread_items' in obj && Array.isArray(obj.thread_items)) {
    results.push(...obj.thread_items);
  }
  for (const key of Object.keys(obj)) {
    if (key === 'thread_items') continue;
    results.push(...findThreadItems(obj[key], depth + 1));
  }
  return results;
}

function parsePost(item, targetUsername) {
  const post = item.post || item;
  if (!post) return null;
  const user = post.user || {};
  const username = user.username || '';
  if (targetUsername && username && username !== targetUsername) return null;

  const code = post.code || '';
  const text = post.caption?.text || post.text || '';
  const timestamp = post.taken_at || post.timestamp || 0;
  if (!code && !text) return null;

  const images = [];
  if (post.image_versions2?.candidates?.length) images.push(post.image_versions2.candidates[0].url);
  if (post.carousel_media) {
    for (const m of post.carousel_media) {
      if (m.image_versions2?.candidates?.length) images.push(m.image_versions2.candidates[0].url);
    }
  }
  const videos = (post.video_versions || []).map(v => v.url);
  const permalink = code ? `https://www.threads.net/@${username}/post/${code}` : '';
  const dateStr = typeof timestamp === 'number' && timestamp > 0
    ? new Date(timestamp * 1000).toISOString().slice(0, 10)
    : String(timestamp).slice(0, 10);

  return {
    id: post.id || post.pk || code,
    permalink,
    date: dateStr,
    text,
    like_count: post.like_count ?? null,
    thread_view_count: null, // スレッドページ開封時に付与
    media_type: post.media_type || null,
    has_image: images.length > 0,
    has_video: videos.length > 0,
    has_link: /https?:\/\//.test(text),
    has_emoji: /[\u{1F300}-\u{1FAFF}]/u.test(text),
    has_title_line: /^[【「『]/.test(text.trim()),
    total_chars: text.length,
    images,
    videos,
  };
}

// ======================================================
// 隠しJSONから投稿抽出（スレッドページ用）
// ======================================================
async function extractFromHiddenJson(page, targetUsername, threadUrl = null) {
  const rawDataList = await page.evaluate(() => {
    const scripts = document.querySelectorAll('script[type="application/json"][data-sjs]');
    const results = [];
    for (const s of scripts) {
      try {
        const text = s.textContent || '';
        if (!text.includes('thread_items')) continue;
        results.push(text);
      } catch (_) {}
    }
    return results;
  });

  const posts = [];
  const seen = new Set();
  for (const raw of rawDataList) {
    let data;
    try { data = JSON.parse(raw); } catch (_) { continue; }
    const items = findThreadItems(data);
    for (const item of items) {
      const post = parsePost(item, targetUsername);
      if (!post || !post.permalink) continue;
      if (seen.has(post.permalink)) continue;
      seen.add(post.permalink);
      posts.push(post);
    }
  }

  // thread_id と post_order を付与
  // thread_id = スレッドURL（= 1投稿目のパーマリンク）のポストコード部分
  if (threadUrl) {
    const codeMatch = threadUrl.match(/\/post\/([^/]+)/);
    const threadId = codeMatch ? codeMatch[1] : threadUrl;
    posts.forEach((p, i) => {
      p.thread_id = threadId;
      p.post_order = i + 1;
    });
  }

  return posts;
}

// ======================================================
// 途中保存
// ======================================================
function saveCheckpoint(existing, username, posts) {
  const sorted = [...posts].sort((a, b) => b.date.localeCompare(a.date));
  existing.accounts[username] = {
    url: `https://www.threads.net/@${username}`,
    posts_collected: sorted.length,
    collection_method: 'two_step_thread_open',
    collected_at: new Date().toISOString(),
    posts: sorted,
  };
  existing.collected_at = new Date().toISOString();
  existing.collection_method = 'two_step_thread_open';
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(existing, null, 2), 'utf-8');
}

// ======================================================
// STEP 1: プロフィールページをスクロールしてスレッドURLを収集
// ======================================================
async function collectThreadUrls(initialPage, context, targetUsername, maxScrolls) {
  console.log('\n[STEP 1] プロフィールページスクロール → スレッドURL収集');

  const threadUrls = new Set();
  const collectedPosts = [];
  const collectedPermalinks = new Set();
  const responseQueue = [];
  let rateLimited = false;

  let page = initialPage;

  function attachResponseHandler(p) {
    p.on('response', async (response) => {
      if (response.status() === 429) {
        rateLimited = true;
        return;
      }
      const url = response.url();
      if (!url.includes('/graphql/query')) return;
      try {
        const body = await response.text();
        if (body.includes('thread_items')) responseQueue.push(body);
      } catch (_) {}
    });
  }

  attachResponseHandler(page);

  const profileUrl = `https://www.threads.com/@${targetUsername}`;
  await page.goto(profileUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);

  // 初回隠しJSONからも収集
  const initialPosts = await extractFromHiddenJson(page, targetUsername);
  for (const p of initialPosts) {
    if (p.permalink && !collectedPermalinks.has(p.permalink)) {
      threadUrls.add(p.permalink);
      collectedPermalinks.add(p.permalink);
      collectedPosts.push(p);
    }
  }

  // 初回GraphQLも処理
  while (responseQueue.length > 0) {
    const raw = responseQueue.shift();
    let data;
    try { data = JSON.parse(raw); } catch (_) { continue; }
    const items = findThreadItems(data);
    for (const item of items) {
      const post = parsePost(item, targetUsername);
      if (post?.permalink && !collectedPermalinks.has(post.permalink)) {
        threadUrls.add(post.permalink);
        collectedPermalinks.add(post.permalink);
        collectedPosts.push(post);
      }
    }
  }

  let noNewCount = 0;

  for (let i = 0; i < maxScrolls; i++) {
    // 429レート制限検知 → バックオフ
    if (rateLimited) {
      process.stdout.write(`\n  [429検知] ${BACKOFF_MS / 1000}秒待機中...\n`);
      await new Promise(r => setTimeout(r, BACKOFF_MS));
      rateLimited = false;
    }

    // ページが閉じていたら新しいタブを開いて復旧
    try {
      if (page.isClosed()) {
        process.stdout.write(`\n  [WARN] タブが閉じられました。新しいタブで再接続します...\n`);
        page = await context.newPage();
        attachResponseHandler(page);
        await page.goto(profileUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await new Promise(r => setTimeout(r, 5000));
      }
    } catch (_) {}

    try {
      const currentUrl = page.url();
      if (!currentUrl.includes(targetUsername)) {
        await page.goto(profileUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
        try { await page.waitForTimeout(2000); } catch (_) {}
      }
    } catch (_) {}

    try {
      await page.evaluate(() => window.scrollBy(0, window.innerHeight * 4));
    } catch (_) { continue; }
    // waitForTimeout はページが閉じると例外を投げるため try/catch で保護
    try { await page.waitForTimeout(SCROLL_WAIT_MS); } catch (_) {}

    let added = 0;
    while (responseQueue.length > 0) {
      const raw = responseQueue.shift();
      let data;
      try { data = JSON.parse(raw); } catch (_) { continue; }
      const items = findThreadItems(data);
      for (const item of items) {
        const post = parsePost(item, targetUsername);
        if (post?.permalink && !collectedPermalinks.has(post.permalink)) {
          threadUrls.add(post.permalink);
          collectedPermalinks.add(post.permalink);
          collectedPosts.push(post);
          added++;
        }
      }
    }

    process.stdout.write(
      `\r  スクロール ${i + 1}/${maxScrolls} | スレッド数: ${threadUrls.size}件 | 今回追加: ${added}件   `
    );

    if (added === 0) {
      noNewCount++;
      if (noNewCount >= NO_NEW_LIMIT) {
        console.log(`\n  新規0が${NO_NEW_LIMIT}回連続 → URL収集終了`);
        break;
      }
    } else {
      noNewCount = 0;
    }
  }

  const urlList = [...threadUrls];
  console.log(`\n  収集したスレッドURL数: ${urlList.length} | 投稿データ: ${collectedPosts.length}件`);

  // URLリストをファイルに保存（STEP2で使用するため）
  fs.writeFileSync(URLS_PATH, JSON.stringify({ username: targetUsername, urls: urlList, collected_at: new Date().toISOString() }, null, 2), 'utf-8');
  console.log(`  URLリスト保存先: ${URLS_PATH}`);

  return { urls: urlList, posts: collectedPosts };
}

// ======================================================
// ブラウザからクッキーを取得
// ======================================================
async function extractCookies(context) {
  const cookies = await context.cookies('https://www.threads.net');
  const cookies2 = await context.cookies('https://www.threads.com');
  const merged = new Map();
  for (const c of [...cookies, ...cookies2]) merged.set(c.name, c.value);
  return [...merged.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}

// ======================================================
// Node.js fetchでスレッドページHTMLを取得（ブラウザ不要）
// ======================================================
const FETCH_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

async function fetchThreadHtml(url, cookieString) {
  const resp = await fetch(url, {
    headers: {
      'Cookie': cookieString,
      'User-Agent': FETCH_UA,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'ja,en;q=0.9',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
    },
    redirect: 'follow',
  });
  return { status: resp.status, html: resp.ok ? await resp.text() : '' };
}

// ======================================================
// HTMLテキストから隠しJSON + 表示回数を抽出（ブラウザ不要）
// ======================================================
function extractPostsFromHtml(html, targetUsername, threadUrl) {
  const posts = [];
  const seen = new Set();

  const regex = /<script[^>]*type="application\/json"[^>]*data-sjs[^>]*>([\s\S]*?)<\/script>/g;
  let match;
  while ((match = regex.exec(html)) !== null) {
    const text = match[1];
    if (!text.includes('thread_items')) continue;
    try {
      const data = JSON.parse(text);
      const items = findThreadItems(data);
      for (const item of items) {
        const post = parsePost(item, targetUsername);
        if (!post || !post.permalink) continue;
        if (seen.has(post.permalink)) continue;
        seen.add(post.permalink);
        posts.push(post);
      }
    } catch (_) {}
  }

  if (threadUrl) {
    const codeMatch = threadUrl.match(/\/post\/([^/]+)/);
    const threadId = codeMatch ? codeMatch[1] : threadUrl;
    posts.forEach((p, i) => {
      p.thread_id = threadId;
      p.post_order = i + 1;
    });
  }

  const viewMatch = html.match(/表示([\d,]+)回/);
  const viewCount = viewMatch ? parseInt(viewMatch[1].replace(/,/g, ''), 10) : null;

  return { posts, viewCount };
}

// ======================================================
// STEP 2: Node.js fetchで各スレッドHTML取得→隠しJSON解析
// ======================================================
async function fetchAllPostsFromThreadPages(cookieString, targetUsername, threadUrls, existingPermalinks, existing) {
  console.log(`\n[STEP 2] Node.js fetch で各スレッドHTML取得 (${threadUrls.length}件)`);
  console.log(`  ※ ブラウザ不使用。タブクラッシュは発生しません。\n`);

  const shouldResume = RESUME_MODE || STEP2_ONLY;
  const allPosts = shouldResume
    ? [...(existing.accounts[targetUsername]?.posts || [])]
    : [];
  const allPermalinks = new Set(existingPermalinks);

  const skipUrls = new Set(
    allPosts.map(p => {
      const m = p.permalink?.match(/\/post\/([^/]+)/);
      return m ? `https://www.threads.net/@${targetUsername}/post/${m[1]}` : null;
    }).filter(Boolean)
  );

  const remainingUrls = shouldResume
    ? threadUrls.filter(u => !skipUrls.has(u))
    : threadUrls;

  if (shouldResume) {
    console.log(`  既存投稿: ${allPosts.length}件 | スキップURL: ${skipUrls.size}件 | 残り処理: ${remainingUrls.length}件`);
  }

  let processed = 0;
  let newPostCount = 0;
  let consecutiveErrors = 0;
  let currentBackoff = BACKOFF_MS;

  for (const threadUrl of remainingUrls) {
    processed++;

    try {
      const { status, html } = await fetchThreadHtml(threadUrl, cookieString);

      if (status === 429) {
        consecutiveErrors++;
        if (consecutiveErrors >= 5) {
          process.stdout.write(`  [429] 連続${consecutiveErrors}回。途中保存して終了します。\n`);
          saveCheckpoint(existing, targetUsername, allPosts);
          process.stdout.write(`  [途中保存] ${allPosts.length}件（${processed}/${remainingUrls.length}処理済み）\n`);
          process.stdout.write(`  再開: node research/scrape-threads-hidden-json.js --user ${targetUsername} --step2\n`);
          return allPosts;
        }
        process.stdout.write(`  [429 ${consecutiveErrors}/5] ${currentBackoff / 1000}秒待機...\n`);
        await new Promise(r => setTimeout(r, currentBackoff));
        currentBackoff = Math.min(currentBackoff * 2, 300000);
        continue;
      }

      if (status !== 200 || !html) {
        process.stdout.write(`  [WARN] ${processed}/${remainingUrls.length} HTTP ${status}\n`);
        await new Promise(r => setTimeout(r, 3000));
        continue;
      }

      consecutiveErrors = 0;
      currentBackoff = BACKOFF_MS;

      const { posts, viewCount } = extractPostsFromHtml(html, targetUsername, threadUrl);
      let added = 0;
      for (const p of posts) {
        if (!allPermalinks.has(p.permalink)) {
          allPermalinks.add(p.permalink);
          if (viewCount !== null) p.thread_view_count = viewCount;
          allPosts.push(p);
          added++;
          newPostCount++;
        }
      }

      if (processed % 20 === 0 || added > 0) {
        process.stdout.write(
          `  ${processed}/${remainingUrls.length} | 新規: ${newPostCount}件 | +${added}件${viewCount !== null ? ` | 表示${viewCount}回` : ''}\n`
        );
      }

      const prevCheckpoint = Math.floor((newPostCount - added) / CHECKPOINT_INTERVAL);
      const currCheckpoint = Math.floor(newPostCount / CHECKPOINT_INTERVAL);
      if (currCheckpoint > prevCheckpoint && newPostCount > 0) {
        saveCheckpoint(existing, targetUsername, allPosts);
        process.stdout.write(`  [途中保存] ${allPosts.length}件保存済み\n`);
      }
    } catch (e) {
      process.stdout.write(`  [WARN] ${processed}/${remainingUrls.length} ${e.message?.slice(0, 60)}\n`);
    }

    // 2〜4秒のランダム待機（人間的なアクセスパターン）
    const delay = 2000 + Math.random() * 2000;
    await new Promise(r => setTimeout(r, delay));
  }

  console.log(`\n  全スレッド取得完了。新規投稿: ${newPostCount}件`);
  return allPosts;
}

// ======================================================
// Playwrightブラウザ起動（独自プロファイル、CDP不使用）
// ======================================================
async function launchBrowser(headless = false) {
  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    args: [
      '--disable-blink-features=AutomationControlled',
      '--disable-features=IsolateOrigins,site-per-process',
    ],
    viewport: { width: 1280, height: 900 },
  });
  return context;
}

// ======================================================
// STEP2の結果をマージして保存
// ======================================================
function saveFinalResults(existing, username, posts) {
  const merged = [...posts].sort((a, b) => b.date.localeCompare(a.date));
  const byDate = {};
  for (const p of merged) byDate[p.date] = (byDate[p.date] || 0) + 1;
  const sortedDates = Object.entries(byDate).sort(([a], [b]) => a.localeCompare(b));
  console.log('\n--- 日付別件数（全体）---');
  for (const [d, n] of sortedDates.slice(-15)) {
    console.log(`  ${d}: ${n}件`);
  }
  existing.accounts[username] = {
    url: `https://www.threads.net/@${username}`,
    posts_collected: merged.length,
    collection_method: 'two_step_thread_open',
    collected_at: new Date().toISOString(),
    posts: merged,
  };
  existing.collected_at = new Date().toISOString();
  existing.collection_method = 'two_step_thread_open';
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(existing, null, 2), 'utf-8');
  console.log(`\n=== 保存完了 ===`);
  console.log(`@${username} 合計: ${merged.length} 件`);
  console.log(`保存先: ${OUTPUT_PATH}`);
}

// ======================================================
// メイン
// ======================================================
async function main() {
  console.log(`\n=== Threads スクレイパー ===`);
  console.log(`対象: @${TARGET_USERNAME}`);
  console.log(`取得期間: 約${MONTHS}ヶ月分（STEP1最大スクロール: ${MAX_SCROLLS}回）`);
  console.log(`プロファイル: ${PROFILE_DIR}`);
  if (STEP2_ONLY) console.log(`モード: STEP2のみ（--step2）`);
  if (LOGIN_MODE) console.log(`モード: ログイン（--login）`);
  console.log();

  // --login: ブラウザをヘッドフルで起動してログインだけ行う
  if (LOGIN_MODE) {
    console.log('ブラウザを起動します。Threadsにログインしてください。');
    console.log('ログイン完了後、ブラウザを閉じると保存されます。\n');
    const ctx = await launchBrowser(false);
    const page = ctx.pages()[0] || await ctx.newPage();
    await page.goto('https://www.threads.com/login', { waitUntil: 'domcontentloaded' });
    // ブラウザが閉じられるまで待機（ユーザーが手動でログイン）
    await new Promise(resolve => {
      ctx.on('close', resolve);
    });
    console.log('ブラウザが閉じられました。ログイン情報はプロファイルに保存されています。');
    return;
  }

  let existing = { accounts: {} };
  if (fs.existsSync(OUTPUT_PATH)) {
    try { existing = JSON.parse(fs.readFileSync(OUTPUT_PATH, 'utf-8')); } catch (_) {}
  }
  if (!existing.accounts) existing.accounts = {};

  let threadUrlList;
  let cookieString;

  if (STEP2_ONLY) {
    // STEP2のみ: URLリスト読み込み + ブラウザからクッキーだけ取得して閉じる
    if (!fs.existsSync(URLS_PATH)) {
      console.error(`URLリストファイルが見つかりません: ${URLS_PATH}`);
      process.exit(1);
    }
    const urlData = JSON.parse(fs.readFileSync(URLS_PATH, 'utf-8'));
    threadUrlList = urlData.urls;
    console.log(`[STEP2モード] URLリスト読み込み: ${threadUrlList.length}件`);

    console.log('クッキー取得のためブラウザを一時起動（headless）...');
    const ctx = await launchBrowser(true);
    cookieString = await extractCookies(ctx);
    await ctx.close();
    console.log(`クッキー取得完了（${cookieString.length}文字）。ブラウザ閉じました。`);
  } else {
    // STEP 1: ブラウザでスクロール → URL収集 → クッキー取得 → ブラウザ閉じる
    const context = await launchBrowser();
    console.log('ブラウザ起動成功');

    const page = context.pages()[0] || await context.newPage();
    const result = await collectThreadUrls(page, context, TARGET_USERNAME, MAX_SCROLLS);
    threadUrlList = result.urls;
    console.log(`\n[STEP 1 完了] URL: ${threadUrlList.length}件`);

    cookieString = await extractCookies(context);
    await context.close();
    console.log(`クッキー取得完了（${cookieString.length}文字）。ブラウザ閉じました。`);
  }

  if (!cookieString || cookieString.length < 10) {
    console.error('クッキーが取得できませんでした。--login でログインしてから再実行してください。');
    process.exit(1);
  }

  // STEP 2: Node.js fetch（ブラウザ不使用）
  const existingPosts = existing.accounts[TARGET_USERNAME]?.posts || [];
  const existingPermalinks = new Set(existingPosts.map(p => p.permalink).filter(Boolean));

  const newPosts = await fetchAllPostsFromThreadPages(
    cookieString, TARGET_USERNAME, threadUrlList, existingPermalinks, existing
  );

  saveFinalResults(existing, TARGET_USERNAME, newPosts);
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
