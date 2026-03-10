#!/usr/bin/env node
/**
 * Threads Profile Discovery API — 全投稿取得スクリプト (Phase 3)
 *
 * 使用条件:
 *   - Meta App Review で threads_profile_discovery の advanced access が承認済みであること
 *   - .env に THREADS_ACCESS_TOKEN が設定済みであること
 *
 * 実行方法:
 *   node research/fetch-threads-api.js
 *
 * 出力:
 *   research/raw-posts-api.json（API経由で取得した全投稿データ）
 *   research/raw-posts-full.json へのマージ（既存のブラウザ収集データと統合）
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

dotenv.config({ path: path.join(ROOT, '.env') });

const ACCESS_TOKEN = process.env.THREADS_ACCESS_TOKEN;
if (!ACCESS_TOKEN) {
  console.error('ERROR: THREADS_ACCESS_TOKEN が .env に設定されていません');
  process.exit(1);
}

const ACCOUNTS = ['kudooo_ai', 'asa_to_ame'];

// 1年前の日付
const ONE_YEAR_AGO = new Date();
ONE_YEAR_AGO.setFullYear(ONE_YEAR_AGO.getFullYear() - 1);
const SINCE = ONE_YEAR_AGO.toISOString().slice(0, 10); // YYYY-MM-DD

const FIELDS = [
  'id', 'text', 'timestamp', 'media_type', 'media_url',
  'permalink', 'username', 'thumbnail_url', 'children',
  'is_quote_post', 'link_attachment_url', 'topic_tag'
].join(',');

async function fetchWithRetry(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        console.error(`HTTP ${res.status}:`, JSON.stringify(err));
        if (res.status === 429) {
          console.log('レート制限: 60秒待機...');
          await new Promise(r => setTimeout(r, 60000));
          continue;
        }
        throw new Error(`HTTP ${res.status}`);
      }
      return await res.json();
    } catch (e) {
      console.error(`リトライ ${i + 1}/${retries}:`, e.message);
      await new Promise(r => setTimeout(r, 3000));
    }
  }
  throw new Error('最大リトライ回数に達しました');
}

async function fetchAllPosts(username) {
  console.log(`\n=== @${username} の投稿取得開始 ===`);
  const posts = [];
  let pageCount = 0;
  let cursor = null;

  while (true) {
    pageCount++;
    const params = new URLSearchParams({
      access_token: ACCESS_TOKEN,
      username,
      fields: FIELDS,
      since: SINCE,
      limit: '100',
    });
    if (cursor) params.set('after', cursor);

    const url = `https://graph.threads.net/v1.0/profile_posts?${params}`;
    console.log(`  ページ ${pageCount} 取得中...`);

    const data = await fetchWithRetry(url);

    if (!data.data || data.data.length === 0) {
      console.log(`  投稿なし。終了。`);
      break;
    }

    for (const post of data.data) {
      const ts = new Date(post.timestamp);
      if (ts < ONE_YEAR_AGO) {
        console.log(`  ${ts.toISOString().slice(0, 10)} より古い投稿が出現。終了。`);
        return posts;
      }
      posts.push({
        id: post.id,
        permalink: post.permalink || '',
        text: post.text || '',
        date: post.timestamp,
        media_type: post.media_type,
        media_url: post.media_url || null,
        thumbnail_url: post.thumbnail_url || null,
        link_attachment_url: post.link_attachment_url || null,
        is_quote_post: post.is_quote_post || false,
        topic_tag: post.topic_tag || null,
        has_image: ['IMAGE', 'CAROUSEL_ALBUM', 'VIDEO'].includes(post.media_type),
        has_link: !!(post.link_attachment_url),
        has_emoji: /[\u{1F300}-\u{1FAFF}]/u.test(post.text || ''),
        has_title_line: /^[【「『]/.test((post.text || '').trim()),
        total_chars: (post.text || '').length,
      });
    }

    console.log(`  取得済み: ${posts.length} 件`);

    // ページネーション
    if (data.paging?.cursors?.after) {
      cursor = data.paging.cursors.after;
    } else {
      console.log(`  最後のページ。終了。`);
      break;
    }

    // レート制限対策: 1秒待機
    await new Promise(r => setTimeout(r, 1000));
  }

  return posts;
}

async function main() {
  console.log('Threads API 全投稿取得スクリプト');
  console.log(`取得期間: ${SINCE} 〜 現在`);
  console.log('注意: threads_profile_discovery の advanced access が必要です\n');

  const result = {
    collected_at: new Date().toISOString(),
    collection_method: 'threads_api_profile_discovery',
    since: SINCE,
    accounts: {}
  };

  for (const username of ACCOUNTS) {
    try {
      const posts = await fetchAllPosts(username);
      result.accounts[username] = {
        url: `https://www.threads.net/@${username}`,
        posts_collected: posts.length,
        posts,
      };
      console.log(`@${username}: ${posts.length} 件取得完了`);
    } catch (e) {
      console.error(`@${username} の取得失敗:`, e.message);
      result.accounts[username] = {
        url: `https://www.threads.net/@${username}`,
        posts_collected: 0,
        posts: [],
        error: e.message,
      };
    }
  }

  // API取得結果を保存
  const apiOutputPath = path.join(ROOT, 'research', 'raw-posts-api.json');
  fs.writeFileSync(apiOutputPath, JSON.stringify(result, null, 2), 'utf-8');
  console.log(`\nAPI取得結果保存: ${apiOutputPath}`);

  // ブラウザ収集結果とマージ
  const fullOutputPath = path.join(ROOT, 'research', 'raw-posts-full.json');
  let merged = { ...result, collection_method: 'merged_browser_and_api' };

  if (fs.existsSync(fullOutputPath)) {
    try {
      const existing = JSON.parse(fs.readFileSync(fullOutputPath, 'utf-8'));
      console.log('\nブラウザ収集データとマージ中...');
      for (const username of ACCOUNTS) {
        const existingPosts = existing.accounts?.[username]?.posts || [];
        const apiPosts = result.accounts[username]?.posts || [];

        // permalink をキーに重複排除
        const seenPermalinks = new Set(apiPosts.map(p => p.permalink));
        const uniqueBrowserPosts = existingPosts.filter(p => {
          const key = p.permalink || p.post_number;
          if (seenPermalinks.has(key)) return false;
          seenPermalinks.add(key);
          return true;
        });

        merged.accounts[username] = {
          ...merged.accounts[username],
          posts: [...apiPosts, ...uniqueBrowserPosts],
          posts_collected: apiPosts.length + uniqueBrowserPosts.length,
          browser_posts: uniqueBrowserPosts.length,
          api_posts: apiPosts.length,
        };
        console.log(`@${username}: API ${apiPosts.length}件 + ブラウザ固有 ${uniqueBrowserPosts.length}件 = 合計 ${merged.accounts[username].posts_collected}件`);
      }
    } catch (e) {
      console.warn('既存ファイルのマージ失敗:', e.message);
    }
  }

  fs.writeFileSync(fullOutputPath, JSON.stringify(merged, null, 2), 'utf-8');
  console.log(`マージ済み結果保存: ${fullOutputPath}`);

  // サマリー表示
  console.log('\n=== 取得サマリー ===');
  for (const username of ACCOUNTS) {
    const acc = merged.accounts[username];
    console.log(`@${username}: ${acc.posts_collected} 件`);
  }
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
