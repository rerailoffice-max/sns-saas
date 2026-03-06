-- ============================================================
-- マイグレーション 00005: model_accounts + model_posts テーブル
-- ============================================================

-- model_accounts テーブル
-- ユーザーが「参考にしたい」として登録するモデルアカウント
create table public.model_accounts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  platform text not null default 'threads' check (platform in ('threads', 'instagram', 'x')),
  username text not null,
  display_name text,
  avatar_url text,
  is_verified boolean not null default false,
  status text not null default 'active' check (status in ('active', 'paused', 'deleted')),
  analysis_result jsonb,                 -- AI分析結果（投稿スタイル・テーマ・ハッシュタグ戦略等）
  last_analyzed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint model_accounts_unique unique (profile_id, platform, username)
);

-- インデックス
create index idx_model_accounts_profile_id on public.model_accounts(profile_id);

-- RLS
alter table public.model_accounts enable row level security;

create policy "model_accounts_all_own" on public.model_accounts
  for all using (
    profile_id in (select id from public.profiles where user_id = auth.uid())
  );

-- updated_at トリガー
create trigger model_accounts_updated_at
  before update on public.model_accounts
  for each row execute function public.update_updated_at_column();

-- ============================================================

-- model_posts テーブル
-- モデルアカウントの公開投稿データ
-- エンゲージメント (likes/replies/reposts) はChrome拡張機能経由で取得
create table public.model_posts (
  id uuid primary key default gen_random_uuid(),
  model_account_id uuid not null references public.model_accounts(id) on delete cascade,
  platform_post_id text not null,
  text text,
  hashtags text[],
  media_type text check (media_type in ('text', 'image', 'carousel', 'video')),
  posted_at timestamptz,
  ai_category text,                      -- AI自動分類カテゴリ
  -- エンゲージメントデータ（Chrome拡張経由）
  likes integer,                         -- いいね数
  replies integer,                       -- 返信数
  reposts integer,                       -- リポスト数
  engagement_source text check (engagement_source in ('extension', 'manual')),
  engagement_updated_at timestamptz,
  created_at timestamptz not null default now(),

  constraint model_posts_unique unique (model_account_id, platform_post_id)
);

-- インデックス
create index idx_model_posts_model_account_id on public.model_posts(model_account_id);
create index idx_model_posts_posted_at on public.model_posts(posted_at desc);
create index idx_model_posts_engagement on public.model_posts(likes desc nulls last)
  where likes is not null;

-- RLS
alter table public.model_posts enable row level security;

create policy "model_posts_select_own" on public.model_posts
  for select using (
    model_account_id in (
      select ma.id from public.model_accounts ma
      join public.profiles p on ma.profile_id = p.id
      where p.user_id = auth.uid()
    )
  );

-- Chrome拡張Sync APIからの書き込み用ポリシー
-- service_role キーを使用するため、RLSを迂回
-- （API Route内でservice_roleクライアントを使用）

-- ============================================================
-- ストレージバケット（画像アップロード用）
-- ============================================================

-- Supabase Storageの投稿画像用バケットはダッシュボードまたはSeed SQLで作成
-- insert into storage.buckets (id, name, public) values ('post-images', 'post-images', true);
