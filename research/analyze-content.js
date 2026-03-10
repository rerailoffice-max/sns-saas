#!/usr/bin/env node
/**
 * Threads 投稿 全文詳細分析 + 運用ノウハウ完全抽出
 *
 * raw-posts-full.json からユーザーの全投稿を読み込み、
 * 投稿順別の定量分析・スレッド全体構成・本文構造・文体・ノウハウを8章構成で出力。
 *
 * 実行例:
 *   node research/analyze-content.js --user kudooo_ai
 *   node research/analyze-content.js                   # 全ユーザー実行
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const INPUT_PATH = path.join(ROOT, 'research', 'raw-posts-full.json');

const args = process.argv;
const rawUser = args.find((a, i) => args[i - 1] === '--user') || null;

if (!fs.existsSync(INPUT_PATH)) {
  console.error(`データファイルが見つかりません: ${INPUT_PATH}`);
  process.exit(1);
}

const raw = JSON.parse(fs.readFileSync(INPUT_PATH, 'utf-8'));
const allUsernames = Object.keys(raw.accounts || {});
const targets = rawUser
  ? [rawUser.replace(/^@/, '')]
  : allUsernames;

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
const pct = (arr, p) => {
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.floor((s.length * p) / 100)] ?? 0;
};
const fmt = (n) => (Number.isFinite(n) ? Math.round(n * 10) / 10 : 0);
const fmtN = (n) => n?.toLocaleString() ?? '0';
const tableRow = (...cells) => `| ${cells.join(' | ')} |`;
const table = (headers, rows) => {
  const sep = headers.map(() => '---');
  return [tableRow(...headers), tableRow(...sep), ...rows.map((r) => tableRow(...r))].join('\n');
};

// ============================================================
// CSV からデータを読み込む（JSON が不完全な場合のフォールバック）
// ============================================================
function loadFromCSV(username) {
  const csvPath = path.join(ROOT, 'research', `${username}_posts.csv`);
  if (!fs.existsSync(csvPath)) return null;

  const content = fs.readFileSync(csvPath, 'utf-8');
  const lines = content.split('\n').filter((l) => l.trim());
  if (lines.length < 2) return null;

  const posts = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    // permalink (https://...) と thread_id を末尾から抽出
    const permalinkMatch = line.match(/(https:\/\/www\.threads\.net\/@[^,]+),([A-Za-z0-9_-]+)\s*$/);
    if (!permalinkMatch) continue;

    const permalink = permalinkMatch[1];
    const thread_id = permalinkMatch[2];
    const beforePermalink = line.slice(0, line.lastIndexOf(permalink)).replace(/,$/, '');

    // 前半のフィールドを分割（最大13フィールド + 残りがテキスト）
    const parts = beforePermalink.split(',');
    if (parts.length < 13) continue;

    const text = parts.slice(13).join(',');
    const postOrderStr = parts[3] || '1/1';
    const [orderNum] = postOrderStr.split('/').map(Number);

    posts.push({
      id: `csv_${i}`,
      permalink,
      thread_id,
      date: parts[4] || '',
      text,
      like_count: parseInt(parts[5]) || 0,
      thread_view_count: parseInt(parts[7]) || 0,
      total_chars: parseInt(parts[8]) || text.length,
      has_image: parts[9] === '○',
      has_video: parts[10] === '○',
      has_link: parts[11] === '○',
      has_emoji: parts[12] === '○',
      post_order: orderNum,
      media_type: 19,
    });
  }

  console.log(`  CSV から ${posts.length}件 読み込み（${csvPath}）`);
  return posts.length > 0 ? posts : null;
}

// ============================================================
// スレッドグループ化（thread_id ベース）
// ============================================================
function groupByThread(posts) {
  const map = {};
  for (const p of posts) {
    const tid = p.thread_id || p.permalink;
    if (!map[tid]) map[tid] = [];
    map[tid].push(p);
  }
  for (const g of Object.values(map)) {
    g.sort((a, b) => (a.post_order ?? 1) - (b.post_order ?? 1));
  }
  return Object.values(map);
}

// ============================================================
// 投稿の「役割」を推定
// ============================================================
const CTA_KEYWORDS = ['フォロー', 'LINE', 'こちら▼', 'はこちら', '受け取って', '登録', 'オプチャ', 'プレゼント', '無料配布', '限定公開', 'リンク'];
const LIST_PATTERNS = [/[①②③④⑤⑥⑦⑧⑨⑩]/, /^[■●・]/, /^[1-9][.．)）]/m];
const TRANSITION_ENDINGS = ['▼', 'っていうと', 'っていうと▼', 'どうすればいいか'];

function classifyPostRole(text, postOrder, threadLen) {
  if (!text) return 'その他';
  const t = text.trim();
  const len = t.length;

  if (postOrder === 1 && threadLen > 1 && len <= 120) return 'フック（短文）';
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
  { name: 'あのー型', test: (t) => /^あのー/.test(t) },
  { name: 'やばい・ガチ型', test: (t) => /^(やばい|ガチで|マジで|これは)/.test(t) },
  { name: '損訴求型', test: (t) => /損してます|損してる|もったいない/.test(t.slice(0, 80)) },
  { name: '質問型', test: (t) => /^(なぜ|なんで|どうして|知ってます|ぶっちゃけ)/.test(t) || t.slice(0, 50).includes('？') },
  { name: '数字・実績型', test: (t) => /[0-9０-９]+[名件万ヶ月日]/.test(t.slice(0, 80)) },
  { name: '警告・禁止型', test: (t) => /しないでください|やめてください|するな|してはいけない|絶対NG/.test(t.slice(0, 80)) },
  { name: '宣言型', test: (t) => /断言します|言い切ります|言います/.test(t.slice(0, 80)) },
  { name: 'ニュース・速報型', test: (t) => /緊急|速報|発表|新ルール|完全終了|アルゴリズム変わ/.test(t.slice(0, 60)) },
  { name: 'Tips告知型', test: (t) => /解説すると|教えます|ポイント|方法を|理由を|コツを/.test(t.slice(0, 80)) },
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
  if (/これ|今すぐ|まず|「/.test(t)) return '直接開始型';
  return 'その他';
}

// ============================================================
// 締め方パターン分類
// ============================================================
function classifyEnding(text) {
  if (!text) return 'その他';
  const t = text.trim();
  const last100 = t.slice(-100);
  if (last100.includes('▼')) return '▼誘導';
  if (/フォロー|フォローして/.test(last100)) return 'フォロー誘導';
  if (/LINE|登録/.test(last100)) return 'LINE誘導';
  if (/https?:\/\//.test(last100)) return 'リンク付き';
  if (/？$|？\s*$/.test(last100)) return '質問投げかけ';
  if (/してください|してみて/.test(last100)) return 'アクション促し';
  return 'その他';
}

// ============================================================
// ノウハウカテゴリ定義
// ============================================================
const KNOWHOW_CATEGORIES = [
  {
    id: 'algorithm',
    name: 'アルゴリズム・表示ロジック',
    keywords: ['アルゴリズム', 'AI判定', 'フィード', '表示回数', 'インプレッション', 'インプ', '拡散', 'リーチ', 'おすすめ表示', 'ニッチ', '一貫性', 'トピックベース', 'Dear Algo', 'fediverse', '滞在時間', '加点', 'グルーピング'],
  },
  {
    id: 'hook',
    name: 'フック・1行目の書き方',
    keywords: ['フック', '1行目', '冒頭', '1文目', 'スクロール', '手を止め', '目を引', 'キャッチ', 'あのー', '書き出し'],
  },
  {
    id: 'thread_structure',
    name: 'スレッド構成・文字数',
    keywords: ['スレッド', 'ツリー', '文字数', '長文', '短文', '3部構成', '構成', '文章', 'ライティング', '投稿1', '投稿2', '2投稿目'],
  },
  {
    id: 'timing',
    name: '投稿頻度・時間帯',
    keywords: ['投稿時間', '時間帯', '頻度', '毎日投稿', '朝', '夜', '午前', '午後', '予約投稿', '曜日', 'ゴールデン', '通勤'],
  },
  {
    id: 'engagement',
    name: 'エンゲージメント獲得',
    keywords: ['いいね', 'コメント', '返信', '保存', 'エンゲージ', '初動', '30分', '90分', '会話', 'リプライ', '反応'],
  },
  {
    id: 'follower_growth',
    name: 'フォロワー獲得・成長',
    keywords: ['フォロワー', '成長', '増やし', '増える', '相互', 'フォロバ', 'ブルーオーシャン', '先行者'],
  },
  {
    id: 'branding',
    name: 'プロフィール・ブランディング',
    keywords: ['プロフィール', 'プロフ', '肩書', '権威', 'ポジション', '専門家', 'ブランド', '名乗る', '実績'],
  },
  {
    id: 'cta',
    name: 'CTA・導線設計',
    keywords: ['CTA', 'LINE', '導線', 'マネタイズ', 'リンク', '誘導', '登録', 'note', 'コンバージョン', '売上', '収益'],
  },
  {
    id: 'content_planning',
    name: 'コンテンツ企画',
    keywords: ['ネタ', '企画', '拡散投稿', '教育投稿', '画像投稿', 'シリーズ', 'テーマ', 'ジャンル', 'コンテンツ', '使い分け'],
  },
  {
    id: 'tools',
    name: 'ツール活用',
    keywords: ['ChatGPT', 'Claude', 'AI', 'NotebookLM', 'Gemini', 'プロンプト', '自動化', 'ポスロボ', 'ツール'],
  },
  {
    id: 'mindset',
    name: 'マインドセット・継続',
    keywords: ['継続', 'メンタル', 'やめ', '挫折', '失敗', '辞め', '伸びない', 'モチベ', '習慣', 'マインド', '諦め'],
  },
];

// ============================================================
// ノウハウ抽出: スレッド全文を走査してカテゴリ別に分類
// ============================================================
function extractAllKnowhow(threads) {
  const results = {};
  for (const cat of KNOWHOW_CATEGORIES) results[cat.id] = [];

  for (const g of threads) {
    const fullText = g.map((p) => (p.text ?? '')).join('\n');
    const likes = g[0]?.like_count ?? 0;
    const views = g[0]?.thread_view_count ?? 0;

    for (const cat of KNOWHOW_CATEGORIES) {
      const matched = cat.keywords.filter((kw) => fullText.toLowerCase().includes(kw.toLowerCase()));
      if (matched.length >= 1) {
        results[cat.id].push({
          likes,
          views,
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

  const patterns = {
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
      'だるい': (allText.match(/だるい|だるく/g) || []).length,
    },
    dataRef: {
      'N件のデータ': (allText.match(/[0-9０-９]+件のデータ/g) || []).length,
      'Nヶ月でN名': (allText.match(/[0-9０-９]+ヶ月で/g) || []).length,
      'N万インプ': (allText.match(/[0-9０-９]+万インプ/g) || []).length,
      '勝率N%': (allText.match(/勝率[0-9０-９.]+%/g) || []).length,
    },
    readerAddress: {
      'あなた': (allText.match(/あなた/g) || []).length,
      '〜してる人': (allText.match(/してる人/g) || []).length,
      '〜な方': (allText.match(/な方[はに]/g) || []).length,
    },
  };
  return patterns;
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
// メイン分析 & レポート生成
// ============================================================
function analyzeUser(username) {
  let posts = raw.accounts?.[username]?.posts;

  // JSON のデータが少ない場合は CSV からフォールバック読み込み
  const csvPosts = loadFromCSV(username);
  if (csvPosts && (!posts || csvPosts.length > posts.length)) {
    console.log(`  JSON(${posts?.length ?? 0}件) < CSV(${csvPosts.length}件) → CSV を使用`);
    posts = csvPosts;
  }

  if (!posts || posts.length === 0) {
    console.error(`@${username} のデータがありません。`);
    return;
  }

  console.log(`\n=== @${username} 全文詳細分析 ===`);
  console.log(`投稿数: ${posts.length}件`);

  const threads = groupByThread(posts);
  const dates = posts.map((p) => p.date).filter(Boolean).sort();
  const dateMin = dates[0] ?? '?';
  const dateMax = dates[dates.length - 1] ?? '?';
  const days = Math.round((new Date(dateMax) - new Date(dateMin)) / 86400000) + 1;

  const lines = [];

  // ── ヘッダー ──
  lines.push(`# @${username} Threads投稿 全文詳細分析レポート`);
  lines.push('');
  lines.push(`**分析対象**: @${username}`);
  lines.push(`**データ期間**: ${dateMin} 〜 ${dateMax}（${days}日間）`);
  lines.push(`**総投稿数**: ${fmtN(posts.length)}件 / **総スレッド数**: ${fmtN(threads.length)}スレッド`);
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

  // 投稿順別の文字数を計算
  const postsByOrder = {};
  for (const g of threads) {
    for (let i = 0; i < g.length; i++) {
      const order = i + 1;
      const key = order <= 5 ? String(order) : '6+';
      if (!postsByOrder[key]) postsByOrder[key] = [];
      postsByOrder[key].push(g[i]);
    }
  }

  const post1Chars = (postsByOrder['1'] || []).map((p) => (p.text ?? '').length);
  const post2Chars = (postsByOrder['2'] || []).map((p) => (p.text ?? '').length);
  const post3Chars = (postsByOrder['3'] || []).map((p) => (p.text ?? '').length);

  const multiThreads = threads.filter((g) => g.length >= 2);

  lines.push(`1. **投稿1の平均文字数は${fmt(avg(post1Chars))}字**、投稿2は${fmt(avg(post2Chars))}字（${fmt(avg(post2Chars) / Math.max(avg(post1Chars), 1))}倍）`);

  const threadLenDist = {};
  for (const g of threads) {
    const l = g.length >= 6 ? '6+' : String(g.length);
    threadLenDist[l] = (threadLenDist[l] || 0) + 1;
  }
  const mostCommonLen = Object.entries(threadLenDist).sort((a, b) => b[1] - a[1])[0];
  lines.push(`2. **最頻出スレッド長は${mostCommonLen[0]}件**（${mostCommonLen[1]}本 / ${fmt(mostCommonLen[1] / threads.length * 100)}%）`);

  const listUsage2 = (postsByOrder['2'] || []).filter((p) => LIST_PATTERNS.some((pat) => pat.test(p.text ?? ''))).length;
  const total2 = (postsByOrder['2'] || []).length;
  lines.push(`3. **投稿2のリスト使用率: ${fmt(total2 > 0 ? listUsage2 / total2 * 100 : 0)}%**（①②③や・で箇条書き）`);

  const ctaLastCount = threads.filter((g) => {
    if (g.length < 2) return false;
    const last = g[g.length - 1].text ?? '';
    return CTA_KEYWORDS.some((kw) => last.includes(kw));
  }).length;
  lines.push(`4. **最終投稿にCTAがあるスレッド: ${fmt(multiThreads.length > 0 ? ctaLastCount / multiThreads.length * 100 : 0)}%**`);

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

  if (post3Chars.length > 0) {
    lines.push(`8. **投稿3の平均文字数は${fmt(avg(post3Chars))}字**（投稿2の${fmt(avg(post3Chars) / Math.max(avg(post2Chars), 1))}倍）`);
  }

  const transitionEndCount = multiThreads.filter((g) => {
    for (let i = 0; i < g.length - 1; i++) {
      const t = (g[i].text ?? '').trim();
      if (TRANSITION_ENDINGS.some((e) => t.endsWith(e))) return true;
    }
    return false;
  }).length;
  lines.push(`9. **「▼」誘導で次投稿へ繋ぐスレッド: ${fmt(multiThreads.length > 0 ? transitionEndCount / multiThreads.length * 100 : 0)}%**`);

  lines.push('');
  lines.push('---');
  lines.push('');

  // ================================================================
  // 第2章: 投稿順別の定量分析
  // ================================================================
  lines.push('## 第2章 投稿順別の定量分析');
  lines.push('');
  lines.push('### 2-1. 投稿順別の文字数');
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
  lines.push('### 2-2. 投稿順別の文字数分布帯');
  lines.push('');
  const CHAR_BANDS = ['〜50字', '51〜100字', '101〜200字', '201〜300字', '301〜400字', '401〜500字', '501字+'];
  function charBand(n) {
    if (n <= 50) return '〜50字';
    if (n <= 100) return '51〜100字';
    if (n <= 200) return '101〜200字';
    if (n <= 300) return '201〜300字';
    if (n <= 400) return '301〜400字';
    if (n <= 500) return '401〜500字';
    return '501字+';
  }

  for (const k of ['1', '2', '3'].filter((k) => postsByOrder[k]?.length)) {
    const bandCounts = Object.fromEntries(CHAR_BANDS.map((b) => [b, 0]));
    for (const p of postsByOrder[k]) bandCounts[charBand((p.text ?? '').length)]++;
    const total = postsByOrder[k].length;
    lines.push(`**${k}件目の文字数分布:**`);
    lines.push(table(
      ['文字数帯', '件数', '割合'],
      CHAR_BANDS.filter((b) => bandCounts[b] > 0).map((b) => [b, `${bandCounts[b]}件`, `${fmt(bandCounts[b] / total * 100)}%`]),
    ));
    lines.push('');
  }

  // フック:本文の分量比
  if (multiThreads.length > 0) {
    lines.push('### 2-3. フック（投稿1）と本文（投稿2）の分量比');
    lines.push('');
    const ratios = multiThreads.map((g) => {
      const c1 = (g[0].text ?? '').length;
      const c2 = (g[1]?.text ?? '').length;
      return { c1, c2, ratio: c1 > 0 ? c2 / c1 : 0 };
    });
    lines.push(`- 投稿1の平均文字数: **${fmt(avg(ratios.map((r) => r.c1)))}字**`);
    lines.push(`- 投稿2の平均文字数: **${fmt(avg(ratios.map((r) => r.c2)))}字**`);
    lines.push(`- 投稿2/投稿1の比率: **${fmt(avg(ratios.map((r) => r.ratio)))}倍**`);
    lines.push(`- つまり、投稿1は短いフックで注意を引き、投稿2で${fmt(avg(ratios.map((r) => r.ratio)))}倍の分量で詳細を展開`);
    lines.push('');
  }

  // いいね・表示（投稿順別）
  lines.push('### 2-4. 投稿順別のいいね・表示回数');
  lines.push('');
  lines.push(table(
    ['投稿順', '件数', 'いいね平均', '表示平均'],
    orderKeys.map((k) => {
      const ps = postsByOrder[k];
      const likes = ps.map((p) => p.like_count ?? 0);
      const views = ps.map((p) => p.thread_view_count ?? 0).filter((v) => v > 0);
      return [
        k === '6+' ? '6件目以降' : `${k}件目`,
        `${ps.length}件`,
        `${fmt(avg(likes))}件`,
        views.length > 0 ? `${fmtN(Math.round(avg(views)))}回` : '-',
      ];
    }),
  ));
  lines.push('');

  // メディア使用率
  lines.push('### 2-5. 投稿順別のメディア使用率');
  lines.push('');
  lines.push(table(
    ['投稿順', '画像', '動画', 'リンク', '絵文字'],
    orderKeys.map((k) => {
      const ps = postsByOrder[k];
      const n = ps.length;
      const img = ps.filter((p) => p.has_image).length;
      const vid = ps.filter((p) => p.has_video).length;
      const link = ps.filter((p) => p.has_link).length;
      const emoji = ps.filter((p) => p.has_emoji).length;
      return [
        k === '6+' ? '6件目以降' : `${k}件目`,
        `${fmt(n > 0 ? img / n * 100 : 0)}%`,
        `${fmt(n > 0 ? vid / n * 100 : 0)}%`,
        `${fmt(n > 0 ? link / n * 100 : 0)}%`,
        `${fmt(n > 0 ? emoji / n * 100 : 0)}%`,
      ];
    }),
  ));
  lines.push('');
  lines.push('---');
  lines.push('');

  // ================================================================
  // 第3章: スレッド全体構成パターン
  // ================================================================
  lines.push('## 第3章 スレッド全体構成パターン');
  lines.push('');

  // 3-1. スレッド長の分布
  lines.push('### 3-1. スレッド長の分布');
  lines.push('');
  const lenKeys = ['1', '2', '3', '4', '5', '6+'];
  const lenCounts = Object.fromEntries(lenKeys.map((k) => [k, 0]));
  const lenLikes = Object.fromEntries(lenKeys.map((k) => [k, []]));
  const lenViews = Object.fromEntries(lenKeys.map((k) => [k, []]));
  for (const g of threads) {
    const l = g.length >= 6 ? '6+' : String(g.length);
    lenCounts[l]++;
    lenLikes[l].push(g[0].like_count ?? 0);
    if ((g[0].thread_view_count ?? 0) > 0) lenViews[l].push(g[0].thread_view_count);
  }
  lines.push(table(
    ['スレッド長', '本数', '割合', 'いいね平均', '表示平均'],
    lenKeys.filter((k) => lenCounts[k] > 0).map((k) => [
      k === '1' ? '1件（単発）' : k === '6+' ? '6件以上' : `${k}件`,
      `${lenCounts[k]}本`,
      `${fmt(lenCounts[k] / threads.length * 100)}%`,
      `${fmt(avg(lenLikes[k]))}件`,
      lenViews[k].length > 0 ? `${fmtN(Math.round(avg(lenViews[k])))}回` : '-',
    ]),
  ));
  lines.push('');

  // 3-2. 各スレッド長の典型構成
  lines.push('### 3-2. スレッド長別の典型的な投稿役割構成');
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

  // 3-3. フック文字数 × スレッド長のクロス集計
  lines.push('### 3-3. フック（投稿1）文字数帯 × スレッド長');
  lines.push('');
  const hookBands = ['〜50字', '51〜100字', '101〜200字', '201字+'];
  function hookBand(n) {
    if (n <= 50) return '〜50字';
    if (n <= 100) return '51〜100字';
    if (n <= 200) return '101〜200字';
    return '201字+';
  }
  const crossTable = {};
  for (const b of hookBands) crossTable[b] = {};
  for (const g of threads) {
    const b = hookBand((g[0].text ?? '').length);
    const l = g.length >= 5 ? '5+' : String(g.length);
    crossTable[b][l] = (crossTable[b][l] || 0) + 1;
  }
  const crossLenKeys = ['1', '2', '3', '4', '5+'];
  lines.push(table(
    ['フック文字数', ...crossLenKeys.map((k) => `${k}件`)],
    hookBands.map((b) => [b, ...crossLenKeys.map((k) => `${crossTable[b][k] || 0}本`)]),
  ));
  lines.push('');

  // 3-4. 高パフォーマンス vs 下位の構成比較
  lines.push('### 3-4. 高パフォーマンス（いいね上位20%）vs 下位の構成');
  lines.push('');
  const sortedByLikes = [...threads].sort((a, b) => (b[0].like_count ?? 0) - (a[0].like_count ?? 0));
  const top20pct = sortedByLikes.slice(0, Math.ceil(threads.length * 0.2));
  const bottom80pct = sortedByLikes.slice(Math.ceil(threads.length * 0.2));

  function groupStats(group, label) {
    const avgLen = fmt(avg(group.map((g) => g.length)));
    const avgPost1 = fmt(avg(group.map((g) => (g[0].text ?? '').length)));
    const multi = group.filter((g) => g.length >= 2);
    const avgPost2 = multi.length > 0 ? fmt(avg(multi.map((g) => (g[1]?.text ?? '').length))) : '-';
    const ctaRate = fmt(multi.filter((g) => CTA_KEYWORDS.some((kw) => (g[g.length - 1].text ?? '').includes(kw))).length / Math.max(multi.length, 1) * 100);
    const listRate2 = multi.length > 0 ? fmt(multi.filter((g) => g[1] && LIST_PATTERNS.some((p) => p.test(g[1].text ?? ''))).length / multi.length * 100) : '-';
    return [label, `${group.length}本`, `${avgLen}件`, `${avgPost1}字`, `${avgPost2}字`, `${ctaRate}%`, `${listRate2}%`];
  }

  lines.push(table(
    ['グループ', '本数', '平均スレッド長', '投稿1平均文字数', '投稿2平均文字数', 'CTA率', '投稿2リスト率'],
    [
      groupStats(top20pct, 'いいね上位20%'),
      groupStats(bottom80pct, '下位80%'),
    ],
  ));
  lines.push('');
  lines.push('---');
  lines.push('');

  // ================================================================
  // 第4章: 各投稿順の本文構造パターン
  // ================================================================
  lines.push('## 第4章 各投稿順の本文構造パターン');
  lines.push('');

  // 4-1. 投稿1（フック）のパターン
  lines.push('### 4-1. 投稿1（フック）のパターン分類');
  lines.push('');
  const hookStats = {};
  for (const g of threads) {
    const h = classifyHook(g[0].text ?? '');
    if (!hookStats[h]) hookStats[h] = { count: 0, likes: [], chars: [] };
    hookStats[h].count++;
    hookStats[h].likes.push(g[0].like_count ?? 0);
    hookStats[h].chars.push((g[0].text ?? '').length);
  }
  lines.push(table(
    ['パターン', '件数', '割合', 'いいね平均', '平均文字数'],
    Object.entries(hookStats).sort((a, b) => b[1].count - a[1].count).map(([name, v]) => [
      name, `${v.count}件`, `${fmt(v.count / threads.length * 100)}%`,
      `${fmt(avg(v.likes))}件`, `${fmt(avg(v.chars))}字`,
    ]),
  ));
  lines.push('');

  // フック実例（上位3パターン各2件）
  lines.push('**フック実例（パターン別・いいね上位）:**');
  lines.push('');
  const hookByType = {};
  for (const g of threads) {
    const h = classifyHook(g[0].text ?? '');
    if (!hookByType[h]) hookByType[h] = [];
    hookByType[h].push(g);
  }
  const topHookTypes = Object.entries(hookStats).sort((a, b) => b[1].count - a[1].count).slice(0, 4);
  for (const [hookName] of topHookTypes) {
    const examples = (hookByType[hookName] || []).sort((a, b) => (b[0].like_count ?? 0) - (a[0].like_count ?? 0)).slice(0, 2);
    lines.push(`**${hookName}:**`);
    for (const g of examples) {
      const text = (g[0].text ?? '').split('\n')[0].slice(0, 80);
      lines.push(`- 「${text}」（いいね${g[0].like_count ?? 0}件 / ${(g[0].text ?? '').length}字）`);
    }
    lines.push('');
  }

  // 4-2. 投稿2（本論）のパターン
  if (postsByOrder['2']?.length) {
    lines.push('### 4-2. 投稿2（本論）のパターン分析');
    lines.push('');

    // 導入文パターン
    const introStats = {};
    for (const p of postsByOrder['2']) {
      const intro = classifyIntro(p.text);
      introStats[intro] = (introStats[intro] || 0) + 1;
    }
    lines.push('**導入文パターン:**');
    lines.push(table(
      ['パターン', '件数', '割合'],
      Object.entries(introStats).sort((a, b) => b[1] - a[1]).map(([name, c]) => [
        name, `${c}件`, `${fmt(c / postsByOrder['2'].length * 100)}%`,
      ]),
    ));
    lines.push('');

    // リスト使用
    const withList = postsByOrder['2'].filter((p) => LIST_PATTERNS.some((pat) => pat.test(p.text ?? '')));
    lines.push(`**リスト形式（①②③/■/・）の使用率**: ${fmt(withList.length / postsByOrder['2'].length * 100)}%（${withList.length}/${postsByOrder['2'].length}件）`);
    lines.push('');

    // 締め方
    const endingStats2 = {};
    for (const p of postsByOrder['2']) {
      const e = classifyEnding(p.text);
      endingStats2[e] = (endingStats2[e] || 0) + 1;
    }
    lines.push('**投稿2の締め方:**');
    lines.push(table(
      ['パターン', '件数', '割合'],
      Object.entries(endingStats2).sort((a, b) => b[1] - a[1]).map(([name, c]) => [
        name, `${c}件`, `${fmt(c / postsByOrder['2'].length * 100)}%`,
      ]),
    ));
    lines.push('');

    // 実例
    lines.push('**投稿2の実例（いいね上位スレッドから）:**');
    lines.push('');
    const topThreadsFor2 = [...threads].filter((g) => g.length >= 2)
      .sort((a, b) => (b[0].like_count ?? 0) - (a[0].like_count ?? 0)).slice(0, 3);
    for (const g of topThreadsFor2) {
      lines.push(`> **スレッド（いいね${g[0].like_count}件 / ${g.length}件構成）の投稿2:**`);
      lines.push(`> ${(g[1].text ?? '').slice(0, 300).replace(/\n/g, '\n> ')}${(g[1].text ?? '').length > 300 ? '…' : ''}`);
      lines.push(`> （${(g[1].text ?? '').length}字）`);
      lines.push('');
    }
  }

  // 4-3. 投稿3以降
  if (postsByOrder['3']?.length) {
    lines.push('### 4-3. 投稿3（深掘り・具体策）のパターン分析');
    lines.push('');

    const listRate3 = postsByOrder['3'].filter((p) => LIST_PATTERNS.some((pat) => pat.test(p.text ?? ''))).length;
    lines.push(`**リスト形式の使用率**: ${fmt(listRate3 / postsByOrder['3'].length * 100)}%`);
    lines.push('');

    const introStats3 = {};
    for (const p of postsByOrder['3']) {
      const intro = classifyIntro(p.text);
      introStats3[intro] = (introStats3[intro] || 0) + 1;
    }
    lines.push('**導入パターン:**');
    lines.push(table(
      ['パターン', '件数', '割合'],
      Object.entries(introStats3).sort((a, b) => b[1] - a[1]).map(([name, c]) => [
        name, `${c}件`, `${fmt(c / postsByOrder['3'].length * 100)}%`,
      ]),
    ));
    lines.push('');

    lines.push('**投稿3の実例（いいね上位スレッドから）:**');
    lines.push('');
    const topFor3 = [...threads].filter((g) => g.length >= 3)
      .sort((a, b) => (b[0].like_count ?? 0) - (a[0].like_count ?? 0)).slice(0, 3);
    for (const g of topFor3) {
      lines.push(`> **スレッド（いいね${g[0].like_count}件 / ${g.length}件構成）の投稿3:**`);
      lines.push(`> ${(g[2].text ?? '').slice(0, 300).replace(/\n/g, '\n> ')}${(g[2].text ?? '').length > 300 ? '…' : ''}`);
      lines.push(`> （${(g[2].text ?? '').length}字）`);
      lines.push('');
    }
  }

  // 4-4. 最終投稿（CTA）
  lines.push('### 4-4. 最終投稿（CTA・締め）のパターン分析');
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

    const lastChars = lastPosts.map((p) => (p.text ?? '').length);
    lines.push(`**最終投稿の文字数**: 平均${fmt(avg(lastChars))}字 / 中央値${fmt(median(lastChars))}字`);
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

  // 4-5. 投稿間の接続表現
  lines.push('### 4-5. 投稿間の接続表現');
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
  // 第5章: 文体・表現分析
  // ================================================================
  lines.push('## 第5章 文体・表現分析');
  lines.push('');

  lines.push('### 5-1. 一人称の使い方');
  lines.push('');
  lines.push(table(
    ['一人称', '出現回数'],
    Object.entries(style.firstPerson).sort((a, b) => b[1] - a[1]).map(([word, c]) => [`「${word}」`, `${c}回`]),
  ));
  lines.push('');

  lines.push('### 5-2. 語尾パターン');
  lines.push('');
  lines.push(table(
    ['語尾', '出現回数'],
    Object.entries(style.endings).sort((a, b) => b[1] - a[1]).map(([word, c]) => [word, `${c}回`]),
  ));
  lines.push('');

  lines.push('### 5-3. 口語表現');
  lines.push('');
  lines.push(table(
    ['表現', '出現回数'],
    Object.entries(style.colloquial).sort((a, b) => b[1] - a[1]).map(([word, c]) => [`「${word}」`, `${c}回`]),
  ));
  lines.push('');

  lines.push('### 5-4. データ引用パターン');
  lines.push('');
  lines.push(table(
    ['パターン', '出現回数'],
    Object.entries(style.dataRef).sort((a, b) => b[1] - a[1]).filter(([, c]) => c > 0).map(([word, c]) => [word, `${c}回`]),
  ));
  lines.push('');

  lines.push('### 5-5. 読者への呼びかけ');
  lines.push('');
  lines.push(table(
    ['呼びかけ', '出現回数'],
    Object.entries(style.readerAddress).sort((a, b) => b[1] - a[1]).map(([word, c]) => [`「${word}」`, `${c}回`]),
  ));
  lines.push('');
  lines.push('---');
  lines.push('');

  // ================================================================
  // 第6章: Threads運用ノウハウ完全版
  // ================================================================
  lines.push('## 第6章 Threads運用ノウハウ完全版');
  lines.push('');
  lines.push('投稿本文からThreads運用に関するノウハウを全量抽出し、11カテゴリに分類。各カテゴリで実例テキスト（全文）と出典を掲載。');
  lines.push('');

  for (const cat of KNOWHOW_CATEGORIES) {
    const items = knowhow[cat.id];
    lines.push(`### 6-${KNOWHOW_CATEGORIES.indexOf(cat) + 1}. ${cat.name}（${items.length}件）`);
    lines.push('');

    if (items.length === 0) {
      lines.push('（このカテゴリの投稿は見つかりませんでした）');
      lines.push('');
      continue;
    }

    const topItems = items.slice(0, 8);
    for (const item of topItems) {
      lines.push(`#### いいね${item.likes}件 / 表示${fmtN(item.views)}回（${item.date} / ${item.threadLen}件スレッド）`);
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

    if (items.length > 8) {
      lines.push(`*（他${items.length - 8}件省略 — いいね順で上位8件を掲載）*`);
      lines.push('');
    }
  }

  lines.push('---');
  lines.push('');

  // ================================================================
  // 第7章: 2ユーザー比較（後で結合用のプレースホルダー）
  // ================================================================
  lines.push('## 第7章 2ユーザー比較');
  lines.push('');
  lines.push('*（本セクションは全ユーザー分析完了後に自動生成されます）*');
  lines.push('');
  lines.push('---');
  lines.push('');

  // ================================================================
  // 第8章: 実践テンプレート集
  // ================================================================
  lines.push('## 第8章 実践テンプレート集');
  lines.push('');
  lines.push('上記の分析結果から導き出される勝ちパターンのテンプレート。');
  lines.push('');

  // スレッド長別の推奨構成を実データから生成
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

    // 最高パフォーマンスの実例
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

  // 文字数配分の推奨
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
  lines.push(`*分析スクリプト: research/analyze-content.js*`);

  // 保存情報を返す（比較セクション生成用）
  return {
    username,
    lines,
    stats: {
      totalPosts: posts.length,
      totalThreads: threads.length,
      days,
      avgThreadLen: fmt(posts.length / threads.length),
      post1AvgChars: fmt(avg(post1Chars)),
      post2AvgChars: fmt(avg(post2Chars)),
      post3AvgChars: post3Chars.length > 0 ? fmt(avg(post3Chars)) : '-',
      mostCommonLen: mostCommonLen[0],
      listRate2: total2 > 0 ? fmt(listUsage2 / total2 * 100) : 0,
      ctaRate: multiThreads.length > 0 ? fmt(ctaLastCount / multiThreads.length * 100) : 0,
      topHookName: topHook[0],
      topHookPct: fmt(topHook[1] / threads.length * 100),
      topColloquial: topColloquial[0],
      topColloquialCount: topColloquial[1],
      firstPerson: Object.entries(style.firstPerson).sort((a, b) => b[1] - a[1])[0],
      knowhowTopCats: topKnowCat,
    },
  };
}

// ============================================================
// 比較セクション生成
// ============================================================
function generateComparison(results) {
  if (results.length < 2) return;

  const compLines = [];
  compLines.push('## 第7章 2ユーザー比較');
  compLines.push('');

  const [a, b] = results;
  compLines.push(table(
    ['指標', `@${a.username}`, `@${b.username}`],
    [
      ['総投稿数', `${fmtN(a.stats.totalPosts)}件`, `${fmtN(b.stats.totalPosts)}件`],
      ['総スレッド数', `${fmtN(a.stats.totalThreads)}本`, `${fmtN(b.stats.totalThreads)}本`],
      ['平均スレッド長', `${a.stats.avgThreadLen}件`, `${b.stats.avgThreadLen}件`],
      ['最頻出スレッド長', `${a.stats.mostCommonLen}件`, `${b.stats.mostCommonLen}件`],
      ['投稿1 平均文字数', `${a.stats.post1AvgChars}字`, `${b.stats.post1AvgChars}字`],
      ['投稿2 平均文字数', `${a.stats.post2AvgChars}字`, `${b.stats.post2AvgChars}字`],
      ['投稿3 平均文字数', `${a.stats.post3AvgChars}字`, `${b.stats.post3AvgChars}字`],
      ['投稿2リスト使用率', `${a.stats.listRate2}%`, `${b.stats.listRate2}%`],
      ['最終投稿CTA率', `${a.stats.ctaRate}%`, `${b.stats.ctaRate}%`],
      ['最頻出フック', `${a.stats.topHookName}(${a.stats.topHookPct}%)`, `${b.stats.topHookName}(${b.stats.topHookPct}%)`],
      ['最頻出口語', `${a.stats.topColloquial}(${a.stats.topColloquialCount}回)`, `${b.stats.topColloquial}(${b.stats.topColloquialCount}回)`],
      ['一人称', `${a.stats.firstPerson[0]}(${a.stats.firstPerson[1]}回)`, `${b.stats.firstPerson[0]}(${b.stats.firstPerson[1]}回)`],
    ],
  ));
  compLines.push('');

  compLines.push('### 戦略タイプの違い');
  compLines.push('');
  compLines.push(`**@${a.username}**: 投稿1が平均${a.stats.post1AvgChars}字、投稿2が平均${a.stats.post2AvgChars}字。${Number(a.stats.post2AvgChars) > 300 ? 'データ駆動型の長文解説スタイル。実績数字と分析結果を根拠に展開し、説得力で読者を引き込む。' : '簡潔なリスト形式で要点を伝えるスタイル。'}`);
  compLines.push('');
  compLines.push(`**@${b.username}**: 投稿1が平均${b.stats.post1AvgChars}字、投稿2が平均${b.stats.post2AvgChars}字。${Number(b.stats.post2AvgChars) > 300 ? 'データ駆動型の長文解説スタイル。' : '簡潔なリスト形式のスタイル。①②③の箇条書きで読みやすさを重視し、量産と継続性を武器にする。'}`);
  compLines.push('');

  compLines.push('### 使い分けの指針');
  compLines.push('');
  compLines.push(`- **深い信頼性・専門性を出したい場合** → @${a.username}型（データ引用 + 長文解説 + 体験談）`);
  compLines.push(`- **量産・継続重視で広くリーチしたい場合** → @${b.username}型（簡潔リスト + 画像 + 高頻度投稿）`);
  compLines.push(`- **最適な組み合わせ**: 週2-3回は長文解説型、残りは簡潔リスト型でペースを維持`);
  compLines.push('');

  return compLines.join('\n');
}

// ============================================================
// 実行
// ============================================================
const allResults = [];

for (const username of targets) {
  const result = analyzeUser(username);
  if (result) allResults.push(result);
}

// 比較セクションを生成して各レポートに挿入
if (allResults.length >= 2) {
  const compSection = generateComparison(allResults);
  if (compSection) {
    for (const result of allResults) {
      const placeholder = '*（本セクションは全ユーザー分析完了後に自動生成されます）*';
      const idx = result.lines.indexOf(placeholder);
      if (idx >= 0) {
        result.lines.splice(idx - 2, 4);
        const compLines = compSection.split('\n');
        result.lines.splice(idx - 2, 0, ...compLines);
      }
    }
  }
}

// ファイル書き出し
for (const result of allResults) {
  const outPath = path.join(ROOT, 'research', `${result.username}_content_analysis.md`);
  const output = result.lines.join('\n');
  fs.writeFileSync(outPath, output, 'utf-8');
  console.log(`\n✓ @${result.username} レポート生成完了`);
  console.log(`  出力先: ${outPath}`);
  console.log(`  文字数: ${fmtN(output.length)}文字`);
}

console.log('\n=== 全分析完了 ===');
