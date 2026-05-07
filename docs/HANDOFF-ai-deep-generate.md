# AI投稿生成 deep モード — 引き継ぎドキュメント

最終更新: 2026-05-08

## 概要

`/compose` の AI投稿生成モーダルで URL を貼ると、以下を自動実行する非同期パイプライン:

1. 元投稿/関連動画のフルダウンロード（X / YouTube、最長1時間）
2. ffmpeg + Gemini で文字起こし + 章立て要約
3. Claude でツリー型解説投稿生成
4. ChatGPT Image 2.0 で投稿ごとに解説画像生成
5. X-link を絶対に貼らない（日本語記事 / Threads等価投稿 / 空 のいずれかにフォールバック）

## アーキテクチャ

```
[ブラウザ /compose]
    │ URL+テーマ → [AIで生成]
    ▼
[Vercel: sns-saas /api/ai/generate-post (POST)]
    │ ai_generate_jobs に enqueue
    │ {job_id, mode:"deep"} を即返却
    ▼
[ブラウザが3秒間隔でポーリング]
    GET /api/ai/generate-post?job_id=...
    ▼
[Macローカル: ai-lab-bot deep-generate-worker]
    30秒tickでqueueを取得 → 9ステップ実行
    ↓ Supabase Storage に動画+画像upload
    ↓ ai_generate_jobs.result_json に書き戻し
    ▼
[ブラウザ] 投稿N件と投稿ごとのメディアを表示
```

**重要**: 重い処理 (動画DL / ChatGPT画像生成) は **Macローカルのai-lab-botのみ** が実行。Vercelは enqueue + ポーリングAPIのみ。

## 必要な前提環境（worker稼働ホスト = Mac）

### 1. システム依存
```bash
brew install yt-dlp ffmpeg
node --version  # v20以上
```

### 2. ChatGPT Plus セッション（CDP接続）
- ChatGPT Plus 契約必須（Image 2.0 利用のため）
- 以下を別ターミナルで起動して常駐:
```bash
node "/path/to/ai-management/scripts/ai-lab-bot/sns/chatgpt-cdp-launcher.mjs"
```
- 起動した Chrome ウィンドウで chatgpt.com にログイン状態にしておく
- Cloudflare チャレンジが出たら手動通過
- セッションが切れたら手動で再ログイン必要

### 3. ai-lab-bot launchd 常駐
- `com.rerail.ai-lab-bot.plist` を `~/Library/LaunchAgents/` に配置
- `launchctl load ~/Library/LaunchAgents/com.rerail.ai-lab-bot.plist`
- 状態確認: `launchctl list | grep ai-lab`
- 再起動: `launchctl kickstart -k "gui/$UID/com.rerail.ai-lab-bot"`

詳細は `scripts/ai-lab-bot/LAUNCHD-SETUP.md` 参照。

## 環境変数

### sns-saas/.env.local（Next.js dev用）

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
ANTHROPIC_API_KEY=...
ENCRYPTION_KEY=...                    # OAuth token暗号化、32バイト hex
X_BEARER_TOKEN=...                    # X API v2 (動画variants取得)
```

### Vercel本番（Vercel ダッシュボード → Settings → Environment Variables）

上記すべてに加えて、本番ドメイン用に:
- `NEXT_PUBLIC_APP_URL=https://sns-saas.vercel.app`
- Threads OAuth関連 (`THREADS_APP_*`) 投稿実行する場合のみ

### ai-lab-bot/.env（worker用、Macローカルのみ）

```
SUPABASE_URL=...                      # sns-saasと同じ
SUPABASE_SERVICE_ROLE_KEY=...         # sns-saasと同じ
SNS_SAAS_PROFILE_ID=...               # クロニキ運用のprofile_id
ANTHROPIC_API_KEY=...
GOOGLE_AI_API_KEY=...                 # Gemini文字起こし
X_BEARER_TOKEN=...                    # 動画variants取得 (sns-saasと同じ)
BOT_ENABLED=true
DAILY_CREDIT_LIMIT_USD=1.5
```

## デプロイ手順

### 初回（本番Vercelプロジェクト作成済み前提）

1. Supabase migration を本番DB に適用:
   - https://supabase.com/dashboard → 対象プロジェクト → SQL Editor
   - `supabase/migrations/00015_ai_generate_jobs.sql` をコピペして Run
2. Vercel env vars を設定（上記）
3. main にマージ → Vercel が自動デプロイ

### 通常のリリース

```bash
git checkout -b feat/<name>
# 変更
git commit -m "..."
git push -u origin feat/<name>
gh pr create
# Reviewerレビュー → Merge → 自動デプロイ
```

main直push禁止のリポジトリポリシーに注意。

## 別Macに workerを増設する場合

複数Macで worker を並列稼働させたい場合（ChatGPTセッション制約のため、ジョブは1ホスト1並列）:

1. 別Macで:
```bash
git clone <ai-management-repo>
cd ai-management/scripts/ai-lab-bot
npm install
brew install yt-dlp ffmpeg
```
2. `.env` を上記内容で作成（既存Macからコピー）
3. ChatGPT Plus 別アカウント or 同じアカウントで CDP起動・ログイン
4. `launchctl` で常駐起動

> **注意**: 同じ Supabase を見るので、複数workerが同じジョブを取り合う可能性。`pollJobs()` 内の `isRunning` ガードで1ホスト内重複は防止されているが、ホスト間の排他制御はない。複数台運用するなら、`ai_generate_jobs.processing_host` カラムを追加して FOR UPDATE SKIP LOCKED で取り出すなどの拡張が必要。

## 主要ファイル早見表

### sns-saas (Next.js / Vercel)
| ファイル | 役割 |
|--------|------|
| `supabase/migrations/00015_ai_generate_jobs.sql` | ジョブテーブル + RLS |
| `src/app/api/ai/generate-post/route.ts` | enqueue (POST) + status取得 (GET) |
| `src/components/compose/ai-assist-button.tsx` | UI + 3秒間隔ポーリング |
| `src/lib/url-fetcher.ts` | URL分類、X variants→MP4、YouTube認識 |
| `src/lib/x-link-sanitizer.ts` | Xリンク除去 |

### ai-management (Mac local worker)
| ファイル | 役割 |
|--------|------|
| `scripts/ai-lab-bot/sns/deep-generate-worker.js` | コアパイプライン (9ステップ) |
| `scripts/ai-lab-bot/sns/youtube-downloader.js` | yt-dlp ラッパー |
| `scripts/ai-lab-bot/sns/threads-equivalent-finder.js` | X→Threads等価投稿lookup |
| `scripts/ai-lab-bot/sns/media-fetcher.js` | URL→ローカル→Supabase Storage |
| `scripts/ai-lab-bot/sns/video-transcriber.js` | ffmpeg + Gemini文字起こし |
| `scripts/ai-lab-bot/sns/chatgpt-image-generator.js` | CDP接続でChatGPT Image 2.0 |
| `scripts/ai-lab-bot/sns/chatgpt-cdp-launcher.mjs` | Chrome起動 (CDP mode) |
| `scripts/ai-lab-bot/sns/cron-tasks-sns.js:194` | 30秒tick → pollJobs() |

## トラブルシューティング

### 「URL解析中…」のまま進まない
worker は動いているがエラーで止まっている可能性。

```bash
# bot.log で deep-worker のエラー確認
tail -200 ~/Documents/88_Claude\ Code/ai-management/scripts/ai-lab-bot/bot.log | grep "deep-worker\|deep-generate"

# ジョブの実状態を見る (Supabase REST)
SUPABASE_SERVICE_ROLE_KEY=$(grep -E '^SUPABASE_SERVICE_ROLE_KEY=' ~/Documents/88_Claude\ Code/ai-management/scripts/ai-lab-bot/.env | cut -d= -f2-)
curl -s "https://<your-project>.supabase.co/rest/v1/ai_generate_jobs?select=id,status,progress,error&order=created_at.desc&limit=3" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" | python3 -m json.tool
```

ありがちなエラー:
- `X_BEARER_TOKEN 未設定` → ai-lab-bot/.env に追加して `launchctl kickstart -k`
- `Chrome (CDP) に接続できません` → `chatgpt-cdp-launcher.mjs` を再実行
- `ChatGPT 一時チャットでは画像生成不可` → Chrome を再起動
- `OVERSIZED:<bytes>` → 動画が50MBを超えている。`SUPABASE_MAX_FILE_BYTES` 環境変数で上限調整 or yt-dlpの解像度を下げる

### ChatGPT Image 2.0 がタイムアウトする
- 1枚 60-120秒 × 投稿数 で時間がかかる
- `chatgpt-image-generator.js` の `timeoutMs` を伸ばす (デフォルト 90s)
- 投稿数を減らす（thread_count パラメータで2-3件に絞る）

### 動画ダウンロードが詰まる
- yt-dlp の場合: `yt-dlp --version` で更新確認、`brew upgrade yt-dlp`
- X video variants の場合: X APIの bit_rate <= 2.5Mbps 縛り。代わりにbest選びたければ `url-fetcher.ts` の選択ロジック調整

## ロールバック手順

問題発生時の本番ロールバック:

1. Vercel ダッシュボード → Deployments → 前のデプロイ → "Promote to Production"
2. もしくは git で revert:
```bash
git revert <commit-sha>
git push origin <branch>
# PR作成 → Merge
```

Supabase migration のロールバック:
```sql
-- ai_generate_jobs テーブルを削除（中身も消える）
drop table if exists ai_generate_jobs cascade;
drop function if exists ai_generate_jobs_set_updated_at cascade;
```

実行前に既存ジョブ履歴をバックアップ推奨。

## 既知の制限

- **ChatGPT セッション同時実行不可**: 1ホスト = 1ジョブ並列
- **動画上限 50MB**: Supabase Free プランの制約。ffmpeg圧縮で対処
- **YouTube 30分タイムアウト**: yt-dlp DLが30分超えると失敗。`youtube-downloader.js:50` で調整可
- **Threads keyword_search API は限定リリース**: 等価投稿lookup失敗率は高め。フォールバック前提
- **m3u8/HLS非対応**: Phase 2で対応予定

## 連絡先

不明点は CLAUDE.md / docs/ ディレクトリ参照。
