-- ============================================================
-- マイグレーション 00004: subscriptions + api_keys テーブル
-- ============================================================

-- subscriptions テーブル
-- Stripe サブスクリプション管理
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  stripe_customer_id text not null,
  stripe_subscription_id text,
  plan text not null default 'free' check (plan in ('free', 'starter', 'professional')),
  status text not null default 'active' check (
    status in ('active', 'canceled', 'past_due', 'trialing')
  ),
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint subscriptions_profile_id_unique unique (profile_id)
);

-- インデックス
create index idx_subscriptions_stripe_customer on public.subscriptions(stripe_customer_id);

-- RLS
alter table public.subscriptions enable row level security;

create policy "subscriptions_select_own" on public.subscriptions
  for select using (
    profile_id in (select id from public.profiles where user_id = auth.uid())
  );

create policy "subscriptions_update_own" on public.subscriptions
  for update using (
    profile_id in (select id from public.profiles where user_id = auth.uid())
  );

-- updated_at トリガー
create trigger subscriptions_updated_at
  before update on public.subscriptions
  for each row execute function public.update_updated_at_column();

-- ============================================================

-- api_keys テーブル
-- 外部API連携用のAPIキー管理（OpenClaw等）
create table public.api_keys (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  name text not null default 'Default',
  key_hash text not null,               -- bcryptハッシュ
  key_prefix text not null,             -- 先頭8文字（表示用）
  last_used_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- インデックス
create index idx_api_keys_profile_id on public.api_keys(profile_id);
create index idx_api_keys_key_prefix on public.api_keys(key_prefix);

-- RLS
alter table public.api_keys enable row level security;

create policy "api_keys_all_own" on public.api_keys
  for all using (
    profile_id in (select id from public.profiles where user_id = auth.uid())
  );
