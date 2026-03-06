-- ============================================================
-- マイグレーション 00002: social_accounts + drafts テーブル
-- ============================================================

-- social_accounts テーブル
-- SNSアカウント連携情報（Threads / Instagram / X）
create table public.social_accounts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  platform text not null check (platform in ('threads', 'instagram', 'x')),
  platform_user_id text not null,
  username text,
  display_name text,
  access_token_enc text not null,       -- 暗号化アクセストークン
  refresh_token_enc text,               -- 暗号化リフレッシュトークン
  token_expires_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint social_accounts_unique unique (profile_id, platform, platform_user_id)
);

-- インデックス
create index idx_social_accounts_profile_id on public.social_accounts(profile_id);
create index idx_social_accounts_platform on public.social_accounts(platform);

-- RLS
alter table public.social_accounts enable row level security;

create policy "social_accounts_all_own" on public.social_accounts
  for all using (
    profile_id in (select id from public.profiles where user_id = auth.uid())
  );

-- updated_at トリガー
create trigger social_accounts_updated_at
  before update on public.social_accounts
  for each row execute function public.update_updated_at_column();

-- ============================================================

-- drafts テーブル
-- 投稿の下書き管理（手動作成 / OpenClaw連携 / AI生成）
create table public.drafts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  account_id uuid not null references public.social_accounts(id) on delete cascade,
  source text not null default 'manual' check (source in ('manual', 'openclaw', 'ai')),
  text text not null,
  hashtags text[],
  media_urls text[],                    -- 画像URL配列
  metadata jsonb,                       -- OpenClawメタデータ等
  status text not null default 'draft' check (
    status in ('draft', 'scheduled', 'publishing', 'published', 'failed')
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- インデックス
create index idx_drafts_profile_id on public.drafts(profile_id);
create index idx_drafts_account_id on public.drafts(account_id);
create index idx_drafts_status on public.drafts(status);

-- RLS
alter table public.drafts enable row level security;

create policy "drafts_all_own" on public.drafts
  for all using (
    profile_id in (select id from public.profiles where user_id = auth.uid())
  );

-- updated_at トリガー
create trigger drafts_updated_at
  before update on public.drafts
  for each row execute function public.update_updated_at_column();
