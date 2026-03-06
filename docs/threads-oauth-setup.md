# Threads API OAuth セットアップガイド

## 概要

SNS管理SaaSでThreadsアカウント接続を動作させるために必要な設定手順。

---

## Step 1: Meta Developer Appの作成

1. **[Meta for Developers](https://developers.facebook.com/)** にアクセス
2. 「マイアプリ」→「**アプリを作成**」をクリック
3. **ユースケース**で「**Access the Threads API**」を選択
4. アプリ名を入力（例: `SNS Manager`）
5. 連絡先メールアドレスを入力
6. 「アプリを作成」をクリック

> ⚠️ Meta Developer アカウント未登録の場合は先に登録が必要

---

## Step 2: 権限（スコープ）の設定

アプリダッシュボード → **ユースケース** → **カスタマイズ** で以下を有効化：

| スコープ | 用途 | 必須 |
|---------|------|:----:|
| `threads_basic` | ユーザー基本情報取得 | ✅ |
| `threads_content_publish` | 投稿作成・削除 | ✅ |
| `threads_manage_insights` | インサイト取得（いいね、リプライ等） | ✅ |
| `threads_manage_replies` | リプライ管理 | ✅ |

> 既にコード側でこの4スコープをリクエストしています（`/api/threads/connect`）

---

## Step 3: OAuth リダイレクトURIの設定

アプリダッシュボード → **ユースケース** → **Threads** → **設定**

### ローカル開発用
```
https://localhost:3000/api/threads/callback
```

### 本番用（Vercelデプロイ後）
```
https://あなたのドメイン.vercel.app/api/threads/callback
```

> ⚠️ **重要**: Threads OAuthは `https://` のみ対応。`http://localhost` は**使えません**。
> ローカルテストには以下のいずれかが必要：
> - `ngrok` でHTTPSトンネルを作成
> - `mkcert` でローカルHTTPS証明書を作成
> - Vercelにデプロイしてテスト（推奨）

---

## Step 4: テスターの追加

**開発モード**ではテスターとして登録したユーザーのみがOAuth認証可能。

1. アプリダッシュボード → **アプリの役割** → **役割**
2. 「**Threads テスター**」セクション → 「**人を追加**」
3. 自分のThreadsユーザー名を入力して追加

### テスター招待を承認する

4. **Threadsアプリ** → **設定** → **ウェブサイトのアクセス許可**
   - URL: `https://www.threads.net/settings/account`
5. 「**招待**」セクションでテスト招待を**承認**

> ⚠️ この承認手順を忘れるとOAuthが失敗します

---

## Step 5: App IDとApp Secretの取得

1. アプリダッシュボード → **アプリの設定** → **ベーシック**
2. 以下をコピー：
   - **アプリID** → `THREADS_APP_ID`
   - **app secret** → 「表示」→ `THREADS_APP_SECRET`

---

## Step 6: 環境変数の設定

### `.env.local` に以下を設定

```bash
# Threads API
THREADS_APP_ID=ここにアプリIDを貼り付け
THREADS_APP_SECRET=ここにアプリシークレットを貼り付け
THREADS_REDIRECT_URI=https://あなたのドメイン/api/threads/callback
```

### ローカル開発（ngrok使用時）

```bash
# ngrokを起動
ngrok http 3000

# 表示されたHTTPS URLを使用
THREADS_REDIRECT_URI=https://xxxx-xxx.ngrok-free.app/api/threads/callback
```

> Meta Developer App側のリダイレクトURIと `.env.local` の値は**完全一致**させること

---

## Step 7: 動作確認

### 7-1. ローカルサーバー起動

```bash
# Supabaseローカル起動
supabase start

# Next.js開発サーバー起動
npm run dev
```

### 7-2. OAuth フロー実行

1. `http://localhost:3000` にアクセスしてログイン
2. 設定 → **SNSアカウント管理** → 「**Threadsを接続**」ボタンをクリック
3. Threads認証画面にリダイレクトされる
4. アカウントで認可
5. `/settings/accounts` に戻り「**Threadsアカウントを接続しました**」と表示されれば成功 ✅

### 7-3. 確認ポイント

- Supabase Studio (`http://127.0.0.1:54323`) → `social_accounts` テーブルに行が追加されているか
- `access_token_enc` が暗号化された状態で保存されているか
- `platform_user_id`, `username`, `display_name` が正しく取得されているか

---

## トラブルシューティング

| 症状 | 原因 | 対処 |
|------|------|------|
| `invalid_state` エラー | Cookieが消えた / 10分以上経過 | もう一度「接続」をクリック |
| `oauth_failed` エラー | App ID/Secret が間違い | Meta Developerで再確認 |
| Threads認証画面が表示されない | テスター未追加/未承認 | Step 4を再確認 |
| `db_save_failed` エラー | Supabase接続エラー | `supabase status` で起動確認 |
| `ENCRYPTION_KEY` エラー | キーが未設定 or 形式不正 | 64文字のhex文字列を設定 |
| リダイレクトURI不一致 | Meta側と.env.localが不一致 | 完全一致させる（末尾スラッシュ注意） |

---

## 本番公開（Advanced Access）

テスターモード（開発モード）では最大25名まで。本番公開には：

1. Meta Developer → **アプリレビュー** → 各権限の承認申請
2. プライバシーポリシーURL設定（既に `/privacy` ページあり）
3. 利用規約URL設定（既に `/terms` ページあり）
4. アプリのアイコン・説明文設定
5. ビジネス認証（必要に応じて）

> MVP段階では開発モード（テスター限定）で十分
