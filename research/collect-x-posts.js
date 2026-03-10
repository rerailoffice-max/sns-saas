#!/usr/bin/env node
/**
 * X (Twitter) 投稿収集スクリプト
 *
 * xurl API でユーザーの全ツイートを取得し、スレッド構造付きで保存。
 *
 * 実行例:
 *   node research/collect-x-posts.js --user masahirochaen
 *   node research/collect-x-posts.js --user masahirochaen --max 500
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const OUTPUT_PATH = path.join(ROOT, 'research', 'x-raw-posts.json');
const XURL = '/Users/OpenClaw/.local/bin/xurl';

const args = process.argv;
const rawUser = args.find((a, i) => args[i - 1] === '--user') || 'masahirochaen';
const username = rawUser.replace(/^@/, '');
const maxPosts = parseInt(args.find((a, i) => args[i - 1] === '--max') || '2000');

console.log(`\n=== X 投稿収集スクリプト ===`);
console.log(`対象: @${username}`);
console.log(`上限: ${maxPosts}件`);

// ユーザーID取得
function getUserId(username) {
  const cmd = `${XURL} user ${username} 2>&1`;
  const result = JSON.parse(execSync(cmd, { encoding: 'utf-8' }));
  if (result.errors) {
    console.error(`ユーザー @${username} が見つかりません:`, result.errors);
    process.exit(1);
  }
  const user = result.data;
  console.log(`ユーザー: ${user.name} (@${user.username}) / ID: ${user.id}`);
  return user;
}

// ツイートをページネーションで取得
function fetchTweets(userId, maxResults) {
  const allTweets = [];
  const allMedia = {};
  let nextToken = null;
  let page = 0;

  const fields = [
    'tweet.fields=created_at,public_metrics,conversation_id,entities,attachments,referenced_tweets,in_reply_to_user_id,author_id',
    'expansions=attachments.media_keys,referenced_tweets.id',
    'media.fields=type,url,preview_image_url,duration_ms',
    'max_results=100',
  ].join('&');

  // Phase 1: オリジナルツイート（スレッドの先頭含む）
  console.log(`\nPhase 1: オリジナルツイート取得中...`);
  while (allTweets.length < maxResults) {
    page++;
    const tokenParam = nextToken ? `&pagination_token=${nextToken}` : '';
    const url = `/2/users/${userId}/tweets?${fields}${tokenParam}`;
    const cmd = `${XURL} '${url}' 2>&1`;

    let result;
    try {
      result = JSON.parse(execSync(cmd, { encoding: 'utf-8', timeout: 60000 }));
    } catch (e) {
      console.error(`API エラー (ページ ${page}):`, e.message);
      break;
    }

    if (result.errors && !result.data) {
      console.error('API エラー:', result.errors);
      break;
    }

    const tweets = result.data || [];
    if (tweets.length === 0) break;

    if (result.errors) {
      console.log(`  (${result.errors.length}件の参照エラーをスキップ)`);
    }

    // メディア情報を保存
    for (const m of result.includes?.media || []) {
      allMedia[m.media_key] = m;
    }

    // RTと他者へのリプライを除外（自己リプライ=スレッド継続は含める）
    for (const t of tweets) {
      const isRT = t.referenced_tweets?.some((r) => r.type === 'retweeted');
      if (isRT) continue;

      // 他者へのリプライは除外（自己リプライ=スレッドは保持）
      if (t.in_reply_to_user_id && t.in_reply_to_user_id !== userId) continue;

      allTweets.push(t);
    }

    console.log(`  ページ${page}: ${tweets.length}件取得（累計 ${allTweets.length}件）`);

    nextToken = result.meta?.next_token;
    if (!nextToken) break;

    // レート制限対策
    if (page % 5 === 0) {
      console.log('  (レート制限対策: 2秒待機)');
      execSync('sleep 2');
    }
  }

  // Phase 2: スレッド内の自己リプライを取得
  console.log(`\nPhase 2: スレッド内リプライ取得中...`);
  const conversationIds = [...new Set(allTweets.map((t) => t.conversation_id))];
  const threadStarters = allTweets.filter(
    (t) => t.id === t.conversation_id || !t.referenced_tweets?.length
  );
  const threadConvIds = new Set(
    allTweets
      .filter((t) => t.referenced_tweets?.some((r) => r.type === 'replied_to'))
      .map((t) => t.conversation_id)
  );

  // exclude=replies で取れなかったリプライを conversation_id 検索で補完
  const existingIds = new Set(allTweets.map((t) => t.id));
  let replyCount = 0;

  const replyFields = [
    'tweet.fields=created_at,public_metrics,conversation_id,entities,attachments,referenced_tweets',
    'expansions=attachments.media_keys',
    'media.fields=type,url,preview_image_url,duration_ms',
    'max_results=100',
  ].join('&');

  for (const convId of threadConvIds) {
    const query = `conversation_id:${convId} from:${username}`;
    const url = `/2/tweets/search/recent?query=${encodeURIComponent(query)}&${replyFields}`;
    const cmd = `${XURL} '${url}' 2>&1`;

    try {
      const result = JSON.parse(execSync(cmd, { encoding: 'utf-8', timeout: 60000 }));
      for (const m of result.includes?.media || []) {
        allMedia[m.media_key] = m;
      }
      for (const t of result.data || []) {
        if (!existingIds.has(t.id)) {
          allTweets.push(t);
          existingIds.add(t.id);
          replyCount++;
        }
      }
    } catch (e) {
      // search endpoint のレート制限等
    }
  }

  console.log(`  スレッド内リプライ: ${replyCount}件追加`);
  return { tweets: allTweets, media: allMedia };
}

// スレッドグループ化 & ソート
function groupIntoThreads(tweets, media) {
  const threads = {};
  for (const t of tweets) {
    const convId = t.conversation_id;
    if (!threads[convId]) threads[convId] = [];
    threads[convId].push(t);
  }

  // 各スレッド内を時系列ソート
  for (const group of Object.values(threads)) {
    group.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  }

  // 正規化
  const posts = [];
  for (const [convId, group] of Object.entries(threads)) {
    for (let i = 0; i < group.length; i++) {
      const t = group[i];
      const mediaKeys = t.attachments?.media_keys || [];
      const mediaItems = mediaKeys.map((k) => media[k]).filter(Boolean);

      posts.push({
        id: t.id,
        conversation_id: convId,
        post_order: i + 1,
        thread_length: group.length,
        date: t.created_at?.slice(0, 10),
        created_at: t.created_at,
        text: t.text || '',
        total_chars: (t.text || '').length,
        like_count: t.public_metrics?.like_count ?? 0,
        retweet_count: t.public_metrics?.retweet_count ?? 0,
        reply_count: t.public_metrics?.reply_count ?? 0,
        quote_count: t.public_metrics?.quote_count ?? 0,
        bookmark_count: t.public_metrics?.bookmark_count ?? 0,
        impression_count: t.public_metrics?.impression_count ?? 0,
        has_image: mediaItems.some((m) => m.type === 'photo'),
        has_video: mediaItems.some((m) => m.type === 'video' || m.type === 'animated_gif'),
        has_link: (t.entities?.urls || []).some((u) =>
          u.expanded_url && !u.expanded_url.includes('x.com/' + username + '/status')
        ),
        images: mediaItems.filter((m) => m.type === 'photo').map((m) => m.url),
        videos: mediaItems.filter((m) => m.type === 'video').map((m) => ({
          preview: m.preview_image_url,
          duration_ms: m.duration_ms,
        })),
        urls: (t.entities?.urls || [])
          .filter((u) => u.expanded_url && !u.expanded_url.includes('pic.x.com'))
          .map((u) => u.expanded_url),
        permalink: `https://x.com/${username}/status/${t.id}`,
        is_thread_start: i === 0,
        referenced_tweets: t.referenced_tweets || [],
      });
    }
  }

  posts.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  return posts;
}

// 実行
const user = getUserId(username);
const { tweets, media } = fetchTweets(user.id, maxPosts);
const posts = groupIntoThreads(tweets, media);

const threadCount = new Set(posts.map((p) => p.conversation_id)).size;

// 保存
let existing = {};
if (fs.existsSync(OUTPUT_PATH)) {
  existing = JSON.parse(fs.readFileSync(OUTPUT_PATH, 'utf-8'));
}
if (!existing.accounts) existing.accounts = {};
existing.accounts[username] = {
  user_id: user.id,
  name: user.name,
  username: user.username,
  url: `https://x.com/${username}`,
  posts_collected: posts.length,
  threads_collected: threadCount,
  collected_at: new Date().toISOString(),
  posts,
};

fs.writeFileSync(OUTPUT_PATH, JSON.stringify(existing, null, 2), 'utf-8');

console.log(`\n=== 収集完了 ===`);
console.log(`投稿数: ${posts.length}件`);
console.log(`スレッド数: ${threadCount}本`);
console.log(`保存先: ${OUTPUT_PATH}`);

const dates = posts.map((p) => p.date).filter(Boolean).sort();
if (dates.length > 0) {
  console.log(`期間: ${dates[0]} 〜 ${dates[dates.length - 1]}`);
}

const cost = (posts.length * 0.005).toFixed(2);
console.log(`推定API費用: $${cost}`);
