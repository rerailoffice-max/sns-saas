#!/usr/bin/env node
/**
 * X (Twitter) 投稿 全文詳細分析 + 運用ノウハウ完全抽出
 *
 * x-raw-posts.json からユーザーの全投稿を読み込み、
 * 投稿順別の定量分析・スレッド全体構成・本文構造・文体・ノウハウを8章構成で出力。
 *
 * 実行例:
 *   node research/analyze-x-content.js --user masahirochaen
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const INPUT_PATH = path.join(ROOT, 'research', 'x-raw-posts.json');

const args = process.argv;
const rawUser = args.find((a, i) => args[i - 1] === '--user') || null;

if (!fs.existsSync(INPUT_PATH)) {
  console.error(`データファイルが見つかりません: ${INPUT_PATH}`);
  process.exit(1);
}

const raw = JSON.parse(fs.readFileSync(INPUT_PATH, 'utf-8'));
const allUsernames = Object.keys(raw.accounts || {});
const targets = rawUser ? [rawUser.replace(/^@/, '')] : allUsernames;

if (targets.length === 0) {
  console.error('分析対象のユーザーがありません。');
  process.exit(1);
}

// ============================================================
// ユーティリティ
// ============================================================
const avg = (arr) => (arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0);
const median = (arr) => {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};
const fmt = (n) => (Number.isFinite(n) ? Math.round(n * 10) / 10 : 0);
const fmtN = (n) => n?.toLocaleString() ?? '0';
const tableRow = (...cells) => `| ${cells.join(' | ')} |`;
const table = (headers, rows) => {
  const sep = headers.map(() => '---');
  return [tableRow(...headers), tableRow(...sep), ...rows.map((r) => tableRow(...r))].join('\n');
};

// ============================================================
// スレッドグループ化（conversation_id ベース）
// ============================================================
function groupByThread(posts) {
  const map = {};
  for (const p of posts) {
    const cid = p.conversation_id;
    if (!map[cid]) map[cid] = [];
    map[cid].push(p);
  }
  for (const g of Object.values(map)) {
    g.sort((a, b) => (a.post_order ?? 1) - (b.post_order ?? 1));
  }
  return Object.values(map);
}

// ============================================================
// 投稿の「役割」を推定
// ============================================================
const CTA_KEYWORDS = [
  'フォロー', 'LINE', 'こちら▼', 'はこちら', '受け取って', '登録', 'オプチャ',
  'プレゼント', '無料配布', '限定公開', 'リンク', 'プロフ', 'RT', 'リポスト',
];
const LIST_PATTERNS = [/[①②③④⑤⑥⑦⑧⑨⑩]/, /^[■●・]/m, /^[1-9][.．)）]/m];
const TRANSITION_ENDINGS = ['▼', '↓', 'っていうと', 'どうすればいいか', '👇'];

function classifyPostRole(text, postOrder, threadLen) {
  if (!text) return 'その他';
  const t = text.trim();
  const len = t.length;

  if (postOrder === 1 && threadLen > 1 && len <= 140) return 'フック（短文）';
  if (postOrder === 1 && threadLen > 1) return 'フック（長文）';
  if (postOrder === 1 && threadLen === 1) return '単発投稿';

  const hasCTA = CTA_KEYWORDS.some((kw) => t.includes(kw));
  const hasList = LIST_PATTERNS.some((p) => p.test(t));
  const isLastPost = postOrder === threadLen;
  const hasTransition = TRANSITION_ENDINGS.some((e) => t.endsWith(e));

  if (isLastPost && hasCTA && len < 100) return 'CTA（短文誘導）';
  if (isLastPost && hasCTA) return 'CTA + まとめ';
  if (hasList) return '具体策・アクションリスト';
  if (hasTransition) return '導入・誘導';
  if (/データ|分析|件の|ヶ月で|[0-9]件|[0-9]名|[0-9]万/.test(t)) return 'データ・根拠提示';
  if (/最初は|僕も|正直|ぶっちゃけ/.test(t)) return '体験談・共感';
  return '本論・解説';
}

// ============================================================
// フックパターン分類
// ============================================================
const HOOK_PATTERNS = [
  { name: '速報・ニュース型', test: (t) => /^(【速報|⚡️|🔥|🚨|速報|緊急)/.test(t) || /(?:発表|リリース|公開|登場)しました/.test(t.slice(0, 60)) },
  { name: '衝撃・驚愕型', test: (t) => /^(やばい|ガチで|マジで|これは|えぐい|凄すぎ|ヤバ)/.test(t) },
  { name: '損訴求型', test: (t) => /損してます|損してる|もったいない|知らないと損/.test(t.slice(0, 80)) },
  { name: '質問型', test: (t) => /^(なぜ|なんで|どうして|知ってます|ぶっちゃけ)/.test(t) || t.slice(0, 50).includes('？') },
  { name: '数字・実績型', test: (t) => /[0-9０-９]+[名件万ヶ月日%倍]/.test(t.slice(0, 80)) },
  { name: '警告・禁止型', test: (t) => /しないでください|やめてください|するな|してはいけない|絶対NG|注意/.test(t.slice(0, 80)) },
  { name: '宣言型', test: (t) => /断言します|言い切ります|言います|思います/.test(t.slice(0, 80)) },
  { name: 'Tips告知型', test: (t) => /解説すると|教えます|ポイント|方法を|理由を|コツを|まとめ/.test(t.slice(0, 80)) },
  { name: 'リスト型', test: (t) => LIST_PATTERNS.some((p) => p.test(t.slice(0, 200))) },
  { name: '画像/動画紹介型', test: (t) => /見てください|見て$|使い方|デモ|比較/.test(t.slice(0, 60)) },
];

function classifyHook(text) {
  if (!text) return 'その他';
  const matched = HOOK_PATTERNS.find(({ test }) => test(text));
  return matched ? matched.name : 'その他';
}

// ============================================================
// 導入文パターン分類（投稿2以降の冒頭）
// ============================================================
function classifyIntro(text) {
  if (!text) return 'その他';
  const t = text.trim().slice(0, 100);
  if (/結論|結論から/.test(t)) return '結論先行型';
  if (/データ|分析|[0-9]+件|[0-9]+ヶ月/.test(t)) return 'データ提示型';
  if (/最初は|僕も|正直|実は|ぶっちゃけ/.test(t)) return '体験談型';
  if (/じゃあ|では|具体的に|やること/.test(t)) return 'アクション提示型';
  if (/なぜ|理由|原因/.test(t)) return '理由説明型';
  if (/[①②③]/.test(t)) return 'リスト型';
  if (/これ|今すぐ|まず|「/.test(t)) return '直接開始型';
  return 'その他';
}

// ============================================================
// 締め方パターン分類
// ============================================================
function classifyEnding(text) {
  if (!text) return 'その他';
  const last100 = text.trim().slice(-100);
  if (last100.includes('▼') || last100.includes('↓') || last100.includes('👇')) return '↓/▼誘導';
  if (/フォロー|フォローして/.test(last100)) return 'フォロー誘導';
  if (/LINE|登録/.test(last100)) return 'LINE誘導';
  if (/RT|リポスト|拡散/.test(last100)) return 'RT/拡散誘導';
  if (/https?:\/\//.test(last100)) return 'リンク付き';
  if (/？$|？\s*$/.test(last100)) return '質問投げかけ';
  if (/してください|してみて/.test(last100)) return 'アクション促し';
  return 'その他';
}

// ============================================================
// ノウハウカテゴリ定義（X投稿向け）
// ============================================================
const KNOWHOW_CATEGORIES = [
  {
    id: 'ai_tools',
    name: 'AI ツール・新サービス速報',
    keywords: ['ChatGPT', 'Claude', 'Gemini', 'OpenAI', 'Anthropic', 'Google', 'GPT', 'Grok', 'Perplexity', 'Copilot', 'Cursor', 'Midjourney', 'DALL-E', 'Sora', 'NotebookLM', 'DeepSeek'],
  },
  {
    id: 'ai_usage',
    name: 'AI活用法・プロンプト術',
    keywords: ['プロンプト', '使い方', '活用', 'ワークフロー', '自動化', 'コツ', 'テクニック', 'ハック', '効率化', 'prompt', '業務効率'],
  },
  {
    id: 'x_algorithm',
    name: 'X アルゴリズム・運用',
    keywords: ['アルゴリズム', 'インプレッション', 'インプ', 'フォロワー', 'エンゲージ', 'リーチ', 'おすすめ', 'ブースト', 'バズ', '伸びる', '伸びない'],
  },
  {
    id: 'business',
    name: 'ビジネス・マネタイズ',
    keywords: ['売上', '収益', 'マネタイズ', '事業', '起業', 'ビジネス', '経営', '会社', 'スタートアップ', 'SaaS', '月収', '年収'],
  },
  {
    id: 'industry_news',
    name: '業界ニュース・トレンド',
    keywords: ['発表', 'リリース', 'アップデート', '新機能', '最新', 'トレンド', '買収', '提携', '規制', 'EU', 'API'],
  },
  {
    id: 'coding',
    name: 'コーディング・開発',
    keywords: ['コード', 'プログラミング', 'エンジニア', '開発', 'アプリ', 'ノーコード', 'Python', 'JavaScript', 'React', 'API', 'GitHub', 'デプロイ'],
  },
  {
    id: 'content_creation',
    name: 'コンテンツ制作・クリエイティブ',
    keywords: ['画像生成', '動画生成', 'デザイン', 'クリエイティブ', '音楽', '映像', 'イラスト', '3D', 'アニメーション', 'ロゴ'],
  },
  {
    id: 'productivity',
    name: '生産性・ライフハック',
    keywords: ['効率', '時短', '生産性', '習慣', 'ルーティン', 'ツール', 'タスク', '整理', 'Notion', 'スプレッドシート'],
  },
  {
    id: 'career',
    name: 'キャリア・スキルアップ',
    keywords: ['転職', 'キャリア', 'スキル', '学習', '勉強', '資格', '副業', 'フリーランス', '年収', '市場価値'],
  },
  {
    id: 'mindset',
    name: 'マインドセット・思考法',
    keywords: ['大事', '本質', '思考', 'マインド', '成功', '失敗', '成長', '挑戦', '変化', '行動'],
  },
];

// ============================================================
// ノウハウ抽出
// ============================================================
function extractAllKnowhow(threads) {
  const results = {};
  for (const cat of KNOWHOW_CATEGORIES) results[cat.id] = [];

  for (const g of threads) {
    const fullText = g.map((p) => (p.text ?? '')).join('\n');
    const likes = g[0]?.like_count ?? 0;
    const impressions = g[0]?.impression_count ?? 0;
    const rts = g[0]?.retweet_count ?? 0;
    const bookmarks = g[0]?.bookmark_count ?? 0;

    for (const cat of KNOWHOW_CATEGORIES) {
      const matched = cat.keywords.filter((kw) => fullText.toLowerCase().includes(kw.toLowerCase()));
      if (matched.length >= 1) {
        results[cat.id].push({
          likes,
          impressions,
          rts,
          bookmarks,
          matchedKeywords: matched,
          threadLen: g.length,
          date: g[0]?.date?.slice(0, 10) ?? '-',
          permalink: g[0]?.permalink ?? '',
          posts: g.map((p, i) => ({
            order: i + 1,
            text: p.text ?? '',
            chars: (p.text ?? '').length,
          })),
        });
      }
    }
  }

  for (const catId of Object.keys(results)) {
    results[catId].sort((a, b) => b.likes - a.likes);
  }
  return results;
}

// ============================================================
// 文体分析
// ============================================================
function analyzeStyle(posts) {
  const allText = posts.map((p) => p.text ?? '').join('\n');

  return {
    firstPerson: {
      '僕': (allText.match(/僕/g) || []).length,
      '私': (allText.match(/私[はがもの]/g) || []).length,
      '自分': (allText.match(/自分[はがもの]/g) || []).length,
    },
    endings: {
      '〜です。': (allText.match(/です。/g) || []).length,
      '〜なんですよ': (allText.match(/なんですよ/g) || []).length,
      '〜なんですよね': (allText.match(/なんですよね/g) || []).length,
      '〜してください': (allText.match(/してください/g) || []).length,
      '〜ですけど': (allText.match(/ですけど/g) || []).length,
      '〜なんです。': (allText.match(/なんです。/g) || []).length,
    },
    colloquial: {
      'マジで': (allText.match(/マジで/g) || []).length,
      'ぶっちゃけ': (allText.match(/ぶっちゃけ/g) || []).length,
      'やばい': (allText.match(/やばい|ヤバい|ヤバイ/gi) || []).length,
      'ガチ': (allText.match(/ガチ/g) || []).length,
      'めっちゃ': (allText.match(/めっちゃ/g) || []).length,
      'えぐい': (allText.match(/えぐい|エグい/gi) || []).length,
    },
    emoji: {
      '⚡️': (allText.match(/⚡/g) || []).length,
      '🔥': (allText.match(/🔥/g) || []).length,
      '👇': (allText.match(/👇/g) || []).length,
      '✅': (allText.match(/✅/g) || []).length,
      '📌': (allText.match(/📌/g) || []).length,
      '🚨': (allText.match(/🚨/g) || []).length,
    },
    readerAddress: {
      'あなた': (allText.match(/あなた/g) || []).length,
      '〜してる人': (allText.match(/してる人/g) || []).length,
      '〜な方': (allText.match(/な方[はに]/g) || []).length,
      'みんな': (allText.match(/みんな/g) || []).length,
    },
  };
}

// ============================================================
// 接続表現分析
// ============================================================
function analyzeTransitions(posts) {
  const transitions = {
    'じゃあ具体的に': 0, '具体的には': 0, 'つまり': 0,
    'なぜかっていうと': 0, '理由は': 0, '結論から言うと': 0,
    'ぶっちゃけ': 0, '正直に言うと': 0, 'ポイントは': 0,
    '注意点': 0, 'やることは': 0, '逆に': 0,
    'しかも': 0, 'ただし': 0, '大事なのは': 0,
    'ちなみに': 0, '補足': 0, 'さらに': 0,
  };
  for (const p of posts) {
    const t = p.text ?? '';
    for (const key of Object.keys(transitions)) {
      transitions[key] += (t.match(new RegExp(key, 'g')) || []).length;
    }
  }
  return transitions;
}

// ============================================================
// 時間帯分析
// ============================================================
function analyzeTimingPatterns(posts) {
  const hourBuckets = Array(24).fill(0);
  const hourLikes = Array.from({ length: 24 }, () => []);
  const hourImps = Array.from({ length: 24 }, () => []);
  const dowBuckets = Array(7).fill(0);
  const dowLikes = Array.from({ length: 7 }, () => []);
  const dowNames = ['日', '月', '火', '水', '木', '金', '土'];

  for (const p of posts) {
    if (!p.created_at || p.post_order !== 1) continue;
    const d = new Date(p.created_at);
    const jstHour = (d.getUTCHours() + 9) % 24;
    hourBuckets[jstHour]++;
    hourLikes[jstHour].push(p.like_count ?? 0);
    hourImps[jstHour].push(p.impression_count ?? 0);

    const jstDate = new Date(d.getTime() + 9 * 60 * 60 * 1000);
    const dow = jstDate.getDay();
    dowBuckets[dow]++;
    dowLikes[dow].push(p.like_count ?? 0);
  }

  return { hourBuckets, hourLikes, hourImps, dowBuckets, dowLikes, dowNames };
}

// ============================================================
// メイン分析 & レポート生成
// ============================================================
function analyzeUser(username) {
  const acct = raw.accounts?.[username];
  const posts = acct?.posts;

  if (!posts || posts.length === 0) {
    console.error(`@${username} のデータがありません。`);
    return;
  }

  console.log(`\n=== @${username} X投稿 全文詳細分析 ===`);
  console.log(`投稿数: ${posts.length}件`);

  const threads = groupByThread(posts);
  const dates = posts.map((p) => p.date).filter(Boolean).sort();
  const dateMin = dates[0] ?? '?';
  const dateMax = dates[dates.length - 1] ?? '?';
  const days = Math.round((new Date(dateMax) - new Date(dateMin)) / 86400000) + 1;

  const lines = [];

  // ── ヘッダー ──
  lines.push(`# @${username} X投稿 全文詳細分析レポート`);
  lines.push('');
  lines.push(`**分析対象**: [@${username}](https://x.com/${username})`);
  lines.push(`**名前**: ${acct.name ?? username}`);
  lines.push(`**データ期間**: ${dateMin} 〜 ${dateMax}（${days}日間）`);
  lines.push(`**総投稿数**: ${fmtN(posts.length)}件 / **総スレッド数**: ${fmtN(threads.length)}本`);
  lines.push(`**平均スレッド長**: ${fmt(posts.length / threads.length)}件`);
  lines.push(`**生成日時**: ${new Date().toISOString().slice(0, 10)}`);
  lines.push('');
  lines.push('---');
  lines.push('');

  // ================================================================
  // 第1章: サマリー
  // ================================================================
  lines.push('## 第1章 サマリー：最重要の発見');
  lines.push('');

  const postsByOrder = {};
  for (const g of threads) {
    for (let i = 0; i < g.length; i++) {
      const order = i + 1;
      const key = order <= 5 ? String(order) : '6+';
      if (!postsByOrder[key]) postsByOrder[key] = [];
      postsByOrder[key].push(g[i]);
    }
  }

  const post1 = postsByOrder['1'] || [];
  const post2 = postsByOrder['2'] || [];
  const post3 = postsByOrder['3'] || [];
  const post1Chars = post1.map((p) => (p.text ?? '').length);
  const post2Chars = post2.map((p) => (p.text ?? '').length);
  const post3Chars = post3.map((p) => (p.text ?? '').length);
  const multiThreads = threads.filter((g) => g.length >= 2);

  // Engagement summary
  const allLikes = post1.map((p) => p.like_count ?? 0);
  const allImps = post1.map((p) => p.impression_count ?? 0).filter((v) => v > 0);
  const allRTs = post1.map((p) => p.retweet_count ?? 0);
  const allBookmarks = post1.map((p) => p.bookmark_count ?? 0);

  lines.push(`1. **投稿1の平均文字数は${fmt(avg(post1Chars))}字**（Xの280字制限に対して${fmt(avg(post1Chars) / 280 * 100)}%使用）`);

  const threadLenDist = {};
  for (const g of threads) {
    const l = g.length >= 6 ? '6+' : String(g.length);
    threadLenDist[l] = (threadLenDist[l] || 0) + 1;
  }
  const mostCommonLen = Object.entries(threadLenDist).sort((a, b) => b[1] - a[1])[0];
  lines.push(`2. **最頻出スレッド長は${mostCommonLen[0]}件**（${mostCommonLen[1]}本 / ${fmt(mostCommonLen[1] / threads.length * 100)}%）`);

  lines.push(`3. **平均いいね: ${fmt(avg(allLikes))}件** / 平均インプレッション: ${fmtN(Math.round(avg(allImps)))}回 / 平均RT: ${fmt(avg(allRTs))}件`);

  lines.push(`4. **平均ブックマーク: ${fmt(avg(allBookmarks))}件**（保存価値の指標）`);

  const hookTypes = {};
  for (const g of threads) {
    const h = classifyHook(g[0].text ?? '');
    hookTypes[h] = (hookTypes[h] || 0) + 1;
  }
  const topHook = Object.entries(hookTypes).sort((a, b) => b[1] - a[1])[0];
  lines.push(`5. **最頻出フックパターン: 「${topHook[0]}」**（${topHook[1]}件 / ${fmt(topHook[1] / threads.length * 100)}%）`);

  const knowhow = extractAllKnowhow(threads);
  const topKnowCat = Object.entries(knowhow)
    .map(([id, items]) => ({ id, name: KNOWHOW_CATEGORIES.find((c) => c.id === id).name, count: items.length }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);
  lines.push(`6. **ノウハウ最多カテゴリ: ${topKnowCat.map((c) => `${c.name}(${c.count}件)`).join('、')}**`);

  const style = analyzeStyle(posts);
  const topColloquial = Object.entries(style.colloquial).sort((a, b) => b[1] - a[1])[0];
  lines.push(`7. **最頻出口語表現: 「${topColloquial[0]}」（${topColloquial[1]}回）**`);

  const mediaRate = fmt(post1.filter((p) => p.has_image || p.has_video).length / post1.length * 100);
  lines.push(`8. **メディア添付率: ${mediaRate}%**（画像または動画）`);

  const linkRate = fmt(post1.filter((p) => p.has_link).length / post1.length * 100);
  lines.push(`9. **外部リンク添付率: ${linkRate}%**`);

  // 投稿頻度
  const postsPerDay = fmt(threads.length / days);
  lines.push(`10. **投稿頻度: ${postsPerDay}スレッド/日**（${days}日間で${threads.length}スレッド）`);

  lines.push('');
  lines.push('---');
  lines.push('');

  // ================================================================
  // 第2章: エンゲージメント分析（X固有）
  // ================================================================
  lines.push('## 第2章 エンゲージメント分析');
  lines.push('');

  lines.push('### 2-1. エンゲージメント概要');
  lines.push('');
  lines.push(table(
    ['指標', '平均', '中央値', '最大'],
    [
      ['いいね', `${fmt(avg(allLikes))}件`, `${fmt(median(allLikes))}件`, `${Math.max(...allLikes, 0)}件`],
      ['リツイート', `${fmt(avg(allRTs))}件`, `${fmt(median(allRTs))}件`, `${Math.max(...allRTs, 0)}件`],
      ['ブックマーク', `${fmt(avg(allBookmarks))}件`, `${fmt(median(allBookmarks))}件`, `${Math.max(...allBookmarks, 0)}件`],
      ['インプレッション', `${fmtN(Math.round(avg(allImps)))}回`, `${fmtN(Math.round(median(allImps)))}回`, `${fmtN(Math.max(...allImps, 0))}回`],
    ],
  ));
  lines.push('');

  // エンゲージメント率
  if (allImps.length > 0) {
    const engRates = post1.filter((p) => (p.impression_count ?? 0) > 0).map((p) => {
      const imp = p.impression_count;
      const eng = (p.like_count ?? 0) + (p.retweet_count ?? 0) + (p.reply_count ?? 0) + (p.bookmark_count ?? 0);
      return eng / imp * 100;
    });
    lines.push(`**平均エンゲージメント率**: ${fmt(avg(engRates))}%（いいね + RT + リプ + ブックマーク / インプレッション）`);
    lines.push('');
  }

  // いいね上位20件
  lines.push('### 2-2. いいね上位20件');
  lines.push('');
  const top20 = [...threads].sort((a, b) => (b[0].like_count ?? 0) - (a[0].like_count ?? 0)).slice(0, 20);
  lines.push(table(
    ['順位', 'いいね', 'RT', 'BM', 'インプ', 'スレッド長', 'フック冒頭', '日付'],
    top20.map((g, i) => [
      `${i + 1}`,
      `${g[0].like_count}`,
      `${g[0].retweet_count}`,
      `${g[0].bookmark_count}`,
      `${fmtN(g[0].impression_count ?? 0)}`,
      `${g.length}件`,
      `${(g[0].text ?? '').split('\n')[0].slice(0, 40)}...`,
      g[0].date ?? '',
    ]),
  ));
  lines.push('');

  // ブックマーク上位10件（保存価値の高い投稿）
  lines.push('### 2-3. ブックマーク上位10件（保存価値の高い投稿）');
  lines.push('');
  const topBM = [...threads].sort((a, b) => (b[0].bookmark_count ?? 0) - (a[0].bookmark_count ?? 0)).slice(0, 10);
  for (const g of topBM) {
    lines.push(`- **BM ${g[0].bookmark_count}件** / いいね${g[0].like_count}件（${g.length}件スレッド / ${g[0].date}）`);
    lines.push(`  「${(g[0].text ?? '').split('\n')[0].slice(0, 60)}」`);
  }
  lines.push('');
  lines.push('---');
  lines.push('');

  // ================================================================
  // 第3章: 投稿順別の定量分析
  // ================================================================
  lines.push('## 第3章 投稿順別の定量分析');
  lines.push('');
  lines.push('### 3-1. 投稿順別の文字数');
  lines.push('');

  const orderKeys = ['1', '2', '3', '4', '5', '6+'].filter((k) => postsByOrder[k]?.length);
  lines.push(table(
    ['投稿順', '件数', '平均文字数', '中央値', '最小', '最大'],
    orderKeys.map((k) => {
      const ps = postsByOrder[k];
      const chars = ps.map((p) => (p.text ?? '').length);
      return [
        k === '6+' ? '6件目以降' : `${k}件目`,
        `${ps.length}件`,
        `${fmt(avg(chars))}字`,
        `${fmt(median(chars))}字`,
        `${Math.min(...chars)}字`,
        `${Math.max(...chars)}字`,
      ];
    }),
  ));
  lines.push('');

  // 文字数分布帯
  lines.push('### 3-2. 投稿1の文字数分布帯');
  lines.push('');
  const CHAR_BANDS = ['〜50字', '51〜100字', '101〜140字', '141〜200字', '201〜280字', '281字+'];
  function charBand(n) {
    if (n <= 50) return '〜50字';
    if (n <= 100) return '51〜100字';
    if (n <= 140) return '101〜140字';
    if (n <= 200) return '141〜200字';
    if (n <= 280) return '201〜280字';
    return '281字+';
  }

  const bandCounts = Object.fromEntries(CHAR_BANDS.map((b) => [b, 0]));
  const bandLikes = Object.fromEntries(CHAR_BANDS.map((b) => [b, []]));
  for (const p of post1) {
    const b = charBand((p.text ?? '').length);
    bandCounts[b]++;
    bandLikes[b].push(p.like_count ?? 0);
  }
  lines.push(table(
    ['文字数帯', '件数', '割合', 'いいね平均'],
    CHAR_BANDS.filter((b) => bandCounts[b] > 0).map((b) => [
      b, `${bandCounts[b]}件`, `${fmt(bandCounts[b] / post1.length * 100)}%`, `${fmt(avg(bandLikes[b]))}件`,
    ]),
  ));
  lines.push('');

  // フック:本文の分量比
  if (multiThreads.length > 0) {
    lines.push('### 3-3. フック（投稿1）と本文（投稿2）の分量比');
    lines.push('');
    const ratios = multiThreads.map((g) => {
      const c1 = (g[0].text ?? '').length;
      const c2 = (g[1]?.text ?? '').length;
      return { c1, c2, ratio: c1 > 0 ? c2 / c1 : 0 };
    });
    lines.push(`- 投稿1の平均文字数: **${fmt(avg(ratios.map((r) => r.c1)))}字**`);
    lines.push(`- 投稿2の平均文字数: **${fmt(avg(ratios.map((r) => r.c2)))}字**`);
    lines.push(`- 投稿2/投稿1の比率: **${fmt(avg(ratios.map((r) => r.ratio)))}倍**`);
    lines.push('');
  }

  // メディア使用率
  lines.push('### 3-4. 投稿順別のメディア使用率');
  lines.push('');
  lines.push(table(
    ['投稿順', '画像', '動画', '外部リンク'],
    orderKeys.map((k) => {
      const ps = postsByOrder[k];
      const n = ps.length;
      const img = ps.filter((p) => p.has_image).length;
      const vid = ps.filter((p) => p.has_video).length;
      const link = ps.filter((p) => p.has_link).length;
      return [
        k === '6+' ? '6件目以降' : `${k}件目`,
        `${fmt(n > 0 ? img / n * 100 : 0)}%`,
        `${fmt(n > 0 ? vid / n * 100 : 0)}%`,
        `${fmt(n > 0 ? link / n * 100 : 0)}%`,
      ];
    }),
  ));
  lines.push('');

  // メディアタイプ別エンゲージメント
  lines.push('### 3-5. メディアタイプ別のエンゲージメント');
  lines.push('');
  const mediaGroups = {
    '画像あり': post1.filter((p) => p.has_image && !p.has_video),
    '動画あり': post1.filter((p) => p.has_video),
    'テキストのみ': post1.filter((p) => !p.has_image && !p.has_video),
    'リンクあり': post1.filter((p) => p.has_link),
  };
  lines.push(table(
    ['メディアタイプ', '件数', 'いいね平均', 'RT平均', 'BM平均', 'インプ平均'],
    Object.entries(mediaGroups).filter(([, ps]) => ps.length > 0).map(([name, ps]) => [
      name, `${ps.length}件`,
      `${fmt(avg(ps.map((p) => p.like_count ?? 0)))}件`,
      `${fmt(avg(ps.map((p) => p.retweet_count ?? 0)))}件`,
      `${fmt(avg(ps.map((p) => p.bookmark_count ?? 0)))}件`,
      `${fmtN(Math.round(avg(ps.map((p) => p.impression_count ?? 0).filter((v) => v > 0))))}回`,
    ]),
  ));
  lines.push('');
  lines.push('---');
  lines.push('');

  // ================================================================
  // 第4章: スレッド全体構成パターン
  // ================================================================
  lines.push('## 第4章 スレッド全体構成パターン');
  lines.push('');

  lines.push('### 4-1. スレッド長の分布');
  lines.push('');
  const lenKeys = ['1', '2', '3', '4', '5', '6+'];
  const lenCounts = Object.fromEntries(lenKeys.map((k) => [k, 0]));
  const lenLikes = Object.fromEntries(lenKeys.map((k) => [k, []]));
  const lenImps = Object.fromEntries(lenKeys.map((k) => [k, []]));
  for (const g of threads) {
    const l = g.length >= 6 ? '6+' : String(g.length);
    lenCounts[l]++;
    lenLikes[l].push(g[0].like_count ?? 0);
    lenImps[l].push(g[0].impression_count ?? 0);
  }
  lines.push(table(
    ['スレッド長', '本数', '割合', 'いいね平均', 'インプ平均'],
    lenKeys.filter((k) => lenCounts[k] > 0).map((k) => [
      k === '1' ? '1件（単発）' : k === '6+' ? '6件以上' : `${k}件`,
      `${lenCounts[k]}本`,
      `${fmt(lenCounts[k] / threads.length * 100)}%`,
      `${fmt(avg(lenLikes[k]))}件`,
      `${fmtN(Math.round(avg(lenImps[k].filter((v) => v > 0))))}回`,
    ]),
  ));
  lines.push('');

  // 各スレッド長の典型構成
  lines.push('### 4-2. スレッド長別の典型的な投稿役割構成');
  lines.push('');

  for (const targetLen of [2, 3, 4, 5]) {
    const sameLen = threads.filter((g) => g.length === targetLen);
    if (sameLen.length < 3) continue;

    lines.push(`**${targetLen}件スレッド（${sameLen.length}本）の投稿役割:**`);
    lines.push('');

    const rolesByPos = {};
    for (let pos = 1; pos <= targetLen; pos++) rolesByPos[pos] = {};

    for (const g of sameLen) {
      for (let i = 0; i < g.length; i++) {
        const role = classifyPostRole(g[i].text, i + 1, g.length);
        rolesByPos[i + 1][role] = (rolesByPos[i + 1][role] || 0) + 1;
      }
    }

    for (let pos = 1; pos <= targetLen; pos++) {
      const roles = Object.entries(rolesByPos[pos]).sort((a, b) => b[1] - a[1]);
      const top3 = roles.slice(0, 3).map(([r, c]) => `${r}(${fmt(c / sameLen.length * 100)}%)`).join('、');
      const posChars = sameLen.map((g) => (g[pos - 1]?.text ?? '').length);
      lines.push(`- **投稿${pos}**: ${top3} — 平均${fmt(avg(posChars))}字`);
    }
    lines.push('');
  }

  // 高パフォーマンス vs 下位の構成比較
  lines.push('### 4-3. 高パフォーマンス（いいね上位20%）vs 下位の構成');
  lines.push('');
  const sortedByLikes = [...threads].sort((a, b) => (b[0].like_count ?? 0) - (a[0].like_count ?? 0));
  const top20pct = sortedByLikes.slice(0, Math.ceil(threads.length * 0.2));
  const bottom80pct = sortedByLikes.slice(Math.ceil(threads.length * 0.2));

  function groupStats(group, label) {
    const avgLen = fmt(avg(group.map((g) => g.length)));
    const avgPost1 = fmt(avg(group.map((g) => (g[0].text ?? '').length)));
    const multi = group.filter((g) => g.length >= 2);
    const avgPost2 = multi.length > 0 ? fmt(avg(multi.map((g) => (g[1]?.text ?? '').length))) : '-';
    const avgLikes = fmt(avg(group.map((g) => g[0].like_count ?? 0)));
    const avgRTs = fmt(avg(group.map((g) => g[0].retweet_count ?? 0)));
    return [label, `${group.length}本`, `${avgLen}件`, `${avgPost1}字`, `${avgPost2}字`, `${avgLikes}件`, `${avgRTs}件`];
  }

  lines.push(table(
    ['グループ', '本数', '平均スレッド長', '投稿1平均', '投稿2平均', 'いいね平均', 'RT平均'],
    [
      groupStats(top20pct, 'いいね上位20%'),
      groupStats(bottom80pct, '下位80%'),
    ],
  ));
  lines.push('');
  lines.push('---');
  lines.push('');

  // ================================================================
  // 第5章: 各投稿順の本文構造パターン
  // ================================================================
  lines.push('## 第5章 各投稿順の本文構造パターン');
  lines.push('');

  // フックパターン
  lines.push('### 5-1. 投稿1（フック）のパターン分類');
  lines.push('');
  const hookStats = {};
  for (const g of threads) {
    const h = classifyHook(g[0].text ?? '');
    if (!hookStats[h]) hookStats[h] = { count: 0, likes: [], chars: [], imps: [] };
    hookStats[h].count++;
    hookStats[h].likes.push(g[0].like_count ?? 0);
    hookStats[h].chars.push((g[0].text ?? '').length);
    hookStats[h].imps.push(g[0].impression_count ?? 0);
  }
  lines.push(table(
    ['パターン', '件数', '割合', 'いいね平均', 'インプ平均', '平均文字数'],
    Object.entries(hookStats).sort((a, b) => b[1].count - a[1].count).map(([name, v]) => [
      name, `${v.count}件`, `${fmt(v.count / threads.length * 100)}%`,
      `${fmt(avg(v.likes))}件`,
      `${fmtN(Math.round(avg(v.imps.filter((i) => i > 0))))}回`,
      `${fmt(avg(v.chars))}字`,
    ]),
  ));
  lines.push('');

  // フック実例
  lines.push('**フック実例（パターン別・いいね上位）:**');
  lines.push('');
  const hookByType = {};
  for (const g of threads) {
    const h = classifyHook(g[0].text ?? '');
    if (!hookByType[h]) hookByType[h] = [];
    hookByType[h].push(g);
  }
  const topHookTypes = Object.entries(hookStats).sort((a, b) => b[1].count - a[1].count).slice(0, 5);
  for (const [hookName] of topHookTypes) {
    const examples = (hookByType[hookName] || []).sort((a, b) => (b[0].like_count ?? 0) - (a[0].like_count ?? 0)).slice(0, 2);
    lines.push(`**${hookName}:**`);
    for (const g of examples) {
      const text = (g[0].text ?? '').split('\n')[0].slice(0, 80);
      lines.push(`- 「${text}」（いいね${g[0].like_count ?? 0}件 / ${(g[0].text ?? '').length}字）`);
    }
    lines.push('');
  }

  // 投稿2パターン
  if (post2.length > 0) {
    lines.push('### 5-2. 投稿2（本論）のパターン分析');
    lines.push('');

    const introStats = {};
    for (const p of post2) {
      const intro = classifyIntro(p.text);
      introStats[intro] = (introStats[intro] || 0) + 1;
    }
    lines.push('**導入文パターン:**');
    lines.push(table(
      ['パターン', '件数', '割合'],
      Object.entries(introStats).sort((a, b) => b[1] - a[1]).map(([name, c]) => [
        name, `${c}件`, `${fmt(c / post2.length * 100)}%`,
      ]),
    ));
    lines.push('');

    const withList = post2.filter((p) => LIST_PATTERNS.some((pat) => pat.test(p.text ?? '')));
    lines.push(`**リスト形式の使用率**: ${fmt(withList.length / post2.length * 100)}%（${withList.length}/${post2.length}件）`);
    lines.push('');

    lines.push('**投稿2の実例（いいね上位スレッドから）:**');
    lines.push('');
    const topThreadsFor2 = [...threads].filter((g) => g.length >= 2)
      .sort((a, b) => (b[0].like_count ?? 0) - (a[0].like_count ?? 0)).slice(0, 3);
    for (const g of topThreadsFor2) {
      lines.push(`> **スレッド（いいね${g[0].like_count}件 / ${g.length}件構成）の投稿2:**`);
      lines.push(`> ${(g[1].text ?? '').slice(0, 280).replace(/\n/g, '\n> ')}${(g[1].text ?? '').length > 280 ? '…' : ''}`);
      lines.push(`> （${(g[1].text ?? '').length}字）`);
      lines.push('');
    }
  }

  // 投稿3以降
  if (post3.length > 0) {
    lines.push('### 5-3. 投稿3（深掘り・具体策）のパターン分析');
    lines.push('');

    const listRate3 = post3.filter((p) => LIST_PATTERNS.some((pat) => pat.test(p.text ?? ''))).length;
    lines.push(`**リスト形式の使用率**: ${fmt(listRate3 / post3.length * 100)}%`);
    lines.push('');

    lines.push('**投稿3の実例（いいね上位スレッドから）:**');
    lines.push('');
    const topFor3 = [...threads].filter((g) => g.length >= 3)
      .sort((a, b) => (b[0].like_count ?? 0) - (a[0].like_count ?? 0)).slice(0, 3);
    for (const g of topFor3) {
      lines.push(`> **スレッド（いいね${g[0].like_count}件 / ${g.length}件構成）の投稿3:**`);
      lines.push(`> ${(g[2].text ?? '').slice(0, 280).replace(/\n/g, '\n> ')}${(g[2].text ?? '').length > 280 ? '…' : ''}`);
      lines.push(`> （${(g[2].text ?? '').length}字）`);
      lines.push('');
    }
  }

  // 最終投稿
  lines.push('### 5-4. 最終投稿（CTA・締め）のパターン分析');
  lines.push('');
  const lastPosts = threads.filter((g) => g.length >= 2).map((g) => g[g.length - 1]);
  if (lastPosts.length > 0) {
    const endingStatsLast = {};
    for (const p of lastPosts) {
      const e = classifyEnding(p.text);
      endingStatsLast[e] = (endingStatsLast[e] || 0) + 1;
    }
    lines.push(table(
      ['締め方', '件数', '割合'],
      Object.entries(endingStatsLast).sort((a, b) => b[1] - a[1]).map(([name, c]) => [
        name, `${c}件`, `${fmt(c / lastPosts.length * 100)}%`,
      ]),
    ));
    lines.push('');

    lines.push('**最終投稿の実例:**');
    lines.push('');
    const topLast = threads.filter((g) => g.length >= 2)
      .sort((a, b) => (b[0].like_count ?? 0) - (a[0].like_count ?? 0)).slice(0, 3);
    for (const g of topLast) {
      const last = g[g.length - 1];
      lines.push(`> **（いいね${g[0].like_count}件スレッドの最終投稿）:**`);
      lines.push(`> ${(last.text ?? '').slice(0, 200).replace(/\n/g, '\n> ')}`);
      lines.push(`> （${(last.text ?? '').length}字）`);
      lines.push('');
    }
  }

  // 接続表現
  lines.push('### 5-5. 投稿間の接続表現');
  lines.push('');
  const transitions = analyzeTransitions(posts);
  lines.push(table(
    ['接続表現', '出現回数'],
    Object.entries(transitions).sort((a, b) => b[1] - a[1]).filter(([, c]) => c > 0).map(([expr, c]) => [
      `「${expr}」`, `${c}回`,
    ]),
  ));
  lines.push('');
  lines.push('---');
  lines.push('');

  // ================================================================
  // 第6章: 投稿タイミング分析
  // ================================================================
  lines.push('## 第6章 投稿タイミング分析');
  lines.push('');

  const timing = analyzeTimingPatterns(posts);

  lines.push('### 6-1. 時間帯別の投稿数とエンゲージメント（JST）');
  lines.push('');
  const activeHours = timing.hourBuckets.map((c, h) => ({ hour: h, count: c })).filter((h) => h.count > 0);
  lines.push(table(
    ['時間帯', '投稿数', 'いいね平均', 'インプ平均'],
    activeHours.sort((a, b) => b.count - a.count).map(({ hour }) => [
      `${hour}時台`,
      `${timing.hourBuckets[hour]}件`,
      `${fmt(avg(timing.hourLikes[hour]))}件`,
      `${fmtN(Math.round(avg(timing.hourImps[hour].filter((v) => v > 0))))}回`,
    ]),
  ));
  lines.push('');

  // ベスト投稿時間
  const bestHour = activeHours.sort((a, b) => avg(timing.hourLikes[b.hour]) - avg(timing.hourLikes[a.hour]))[0];
  if (bestHour) {
    lines.push(`**最高いいね平均の時間帯: ${bestHour.hour}時台**（平均${fmt(avg(timing.hourLikes[bestHour.hour]))}いいね）`);
    lines.push('');
  }

  lines.push('### 6-2. 曜日別の投稿数とエンゲージメント');
  lines.push('');
  lines.push(table(
    ['曜日', '投稿数', 'いいね平均'],
    timing.dowNames.map((name, i) => [
      name,
      `${timing.dowBuckets[i]}件`,
      `${fmt(avg(timing.dowLikes[i]))}件`,
    ]).filter(([, c]) => c !== '0件'),
  ));
  lines.push('');

  const bestDow = timing.dowNames
    .map((name, i) => ({ name, i, avgLikes: avg(timing.dowLikes[i]) }))
    .filter((d) => timing.dowBuckets[d.i] > 0)
    .sort((a, b) => b.avgLikes - a.avgLikes)[0];
  if (bestDow) {
    lines.push(`**最高パフォーマンスの曜日: ${bestDow.name}曜日**（平均${fmt(bestDow.avgLikes)}いいね）`);
    lines.push('');
  }

  lines.push('---');
  lines.push('');

  // ================================================================
  // 第7章: 文体・表現分析
  // ================================================================
  lines.push('## 第7章 文体・表現分析');
  lines.push('');

  lines.push('### 7-1. 一人称の使い方');
  lines.push('');
  lines.push(table(
    ['一人称', '出現回数'],
    Object.entries(style.firstPerson).sort((a, b) => b[1] - a[1]).map(([word, c]) => [`「${word}」`, `${c}回`]),
  ));
  lines.push('');

  lines.push('### 7-2. 語尾パターン');
  lines.push('');
  lines.push(table(
    ['語尾', '出現回数'],
    Object.entries(style.endings).sort((a, b) => b[1] - a[1]).map(([word, c]) => [word, `${c}回`]),
  ));
  lines.push('');

  lines.push('### 7-3. 口語表現');
  lines.push('');
  lines.push(table(
    ['表現', '出現回数'],
    Object.entries(style.colloquial).sort((a, b) => b[1] - a[1]).map(([word, c]) => [`「${word}」`, `${c}回`]),
  ));
  lines.push('');

  lines.push('### 7-4. 絵文字使用');
  lines.push('');
  lines.push(table(
    ['絵文字', '出現回数'],
    Object.entries(style.emoji).sort((a, b) => b[1] - a[1]).filter(([, c]) => c > 0).map(([emoji, c]) => [emoji, `${c}回`]),
  ));
  lines.push('');

  lines.push('### 7-5. 読者への呼びかけ');
  lines.push('');
  lines.push(table(
    ['呼びかけ', '出現回数'],
    Object.entries(style.readerAddress).sort((a, b) => b[1] - a[1]).map(([word, c]) => [`「${word}」`, `${c}回`]),
  ));
  lines.push('');
  lines.push('---');
  lines.push('');

  // ================================================================
  // 第8章: テーマ別ノウハウ完全版
  // ================================================================
  lines.push('## 第8章 テーマ別ノウハウ完全版');
  lines.push('');
  lines.push('投稿本文を10カテゴリに分類。各カテゴリで実例テキスト（全文）と出典を掲載。');
  lines.push('');

  for (const cat of KNOWHOW_CATEGORIES) {
    const items = knowhow[cat.id];
    lines.push(`### 8-${KNOWHOW_CATEGORIES.indexOf(cat) + 1}. ${cat.name}（${items.length}件）`);
    lines.push('');

    if (items.length === 0) {
      lines.push('（このカテゴリの投稿は見つかりませんでした）');
      lines.push('');
      continue;
    }

    const topItems = items.slice(0, 5);
    for (const item of topItems) {
      lines.push(`#### いいね${item.likes}件 / RT ${item.rts}件 / BM ${item.bookmarks}件 / インプ${fmtN(item.impressions)}（${item.date} / ${item.threadLen}件スレッド）`);
      lines.push('');
      for (const p of item.posts) {
        lines.push(`**[投稿${p.order}]（${p.chars}字）:**`);
        lines.push('```');
        lines.push(p.text);
        lines.push('```');
        lines.push('');
      }
      if (item.permalink) {
        lines.push(`出典: ${item.permalink}`);
        lines.push('');
      }
    }

    if (items.length > 5) {
      lines.push(`*（他${items.length - 5}件省略 — いいね順で上位5件を掲載）*`);
      lines.push('');
    }
  }

  lines.push('---');
  lines.push('');

  // ================================================================
  // 第9章: 実践テンプレート集
  // ================================================================
  lines.push('## 第9章 実践テンプレート集');
  lines.push('');

  for (const targetLen of [2, 3, 4, 5]) {
    const sameLen = threads.filter((g) => g.length === targetLen);
    if (sameLen.length < 3) continue;

    const topPerf = [...sameLen].sort((a, b) => (b[0].like_count ?? 0) - (a[0].like_count ?? 0)).slice(0, Math.ceil(sameLen.length * 0.2));

    lines.push(`### ${targetLen}件スレッドの勝ちパターン（上位20%から抽出）`);
    lines.push('');
    lines.push('```');
    for (let pos = 1; pos <= targetLen; pos++) {
      const posChars = topPerf.map((g) => (g[pos - 1]?.text ?? '').length);
      const roles = {};
      for (const g of topPerf) {
        const role = classifyPostRole(g[pos - 1]?.text, pos, targetLen);
        roles[role] = (roles[role] || 0) + 1;
      }
      const topRole = Object.entries(roles).sort((a, b) => b[1] - a[1])[0];
      lines.push(`投稿${pos}（${fmt(avg(posChars))}字）: ${topRole[0]}`);
    }
    lines.push('```');
    lines.push('');

    const best = topPerf[0];
    if (best) {
      lines.push(`**実例（いいね${best[0].like_count}件）:**`);
      for (let i = 0; i < best.length; i++) {
        const t = (best[i].text ?? '').slice(0, 150).replace(/\n/g, ' ');
        lines.push(`- 投稿${i + 1}（${(best[i].text ?? '').length}字）: 「${t}${(best[i].text ?? '').length > 150 ? '…' : ''}」`);
      }
      lines.push('');
    }
  }

  // 推奨文字数配分
  if (multiThreads.length > 0) {
    lines.push('### 推奨文字数配分');
    lines.push('');
    const topMulti = [...multiThreads].sort((a, b) => (b[0].like_count ?? 0) - (a[0].like_count ?? 0))
      .slice(0, Math.ceil(multiThreads.length * 0.2));
    lines.push('高パフォーマンススレッドの平均文字数配分:');
    lines.push('');
    const maxPos = Math.min(5, Math.max(...topMulti.map((g) => g.length)));
    for (let pos = 1; pos <= maxPos; pos++) {
      const chars = topMulti.filter((g) => g.length >= pos).map((g) => (g[pos - 1]?.text ?? '').length);
      if (chars.length > 0) {
        lines.push(`- **投稿${pos}**: ${fmt(avg(chars))}字（中央値${fmt(median(chars))}字）`);
      }
    }
    lines.push('');
  }

  lines.push('---');
  lines.push('');
  lines.push(`*分析レポート生成日: ${new Date().toISOString().slice(0, 10)}*`);
  lines.push(`*分析スクリプト: research/analyze-x-content.js*`);
  lines.push(`*データソース: xurl API（${posts.length}件取得）*`);

  return {
    username,
    lines,
    stats: {
      totalPosts: posts.length,
      totalThreads: threads.length,
      days,
      avgThreadLen: fmt(posts.length / threads.length),
      post1AvgChars: fmt(avg(post1Chars)),
      post2AvgChars: post2Chars.length > 0 ? fmt(avg(post2Chars)) : '-',
      post3AvgChars: post3Chars.length > 0 ? fmt(avg(post3Chars)) : '-',
      mostCommonLen: mostCommonLen[0],
      avgLikes: fmt(avg(allLikes)),
      avgRTs: fmt(avg(allRTs)),
      avgBMs: fmt(avg(allBookmarks)),
      avgImps: Math.round(avg(allImps)),
      topHookName: topHook[0],
      topHookPct: fmt(topHook[1] / threads.length * 100),
      topColloquial: topColloquial[0],
      topColloquialCount: topColloquial[1],
      firstPerson: Object.entries(style.firstPerson).sort((a, b) => b[1] - a[1])[0],
    },
  };
}

// ============================================================
// 実行
// ============================================================
for (const username of targets) {
  const result = analyzeUser(username);
  if (!result) continue;

  const outPath = path.join(ROOT, 'research', `${result.username}_x_analysis.md`);
  const output = result.lines.join('\n');
  fs.writeFileSync(outPath, output, 'utf-8');
  console.log(`\n✓ @${result.username} レポート生成完了`);
  console.log(`  出力先: ${outPath}`);
  console.log(`  文字数: ${fmtN(output.length)}文字`);

  // CSV出力
  const csvPath = path.join(ROOT, 'research', `${result.username}_x_posts.csv`);
  const acct = raw.accounts[username];
  const csvLines = ['id,conversation_id,post_order,thread_length,date,created_at,text,like_count,retweet_count,reply_count,quote_count,bookmark_count,impression_count,has_image,has_video,has_link,permalink'];
  for (const p of acct.posts) {
    const textEscaped = `"${(p.text ?? '').replace(/"/g, '""')}"`;
    csvLines.push([
      p.id, p.conversation_id, p.post_order, p.thread_length, p.date, p.created_at,
      textEscaped,
      p.like_count, p.retweet_count, p.reply_count, p.quote_count, p.bookmark_count, p.impression_count,
      p.has_image ? '○' : '', p.has_video ? '○' : '', p.has_link ? '○' : '',
      p.permalink,
    ].join(','));
  }
  fs.writeFileSync(csvPath, csvLines.join('\n'), 'utf-8');
  console.log(`  CSV出力: ${csvPath}（${acct.posts.length}行）`);
}

console.log('\n=== 全分析完了 ===');
