-- ============================================================
-- マイグレーション 00001: profiles テーブル + 認証トリガー
-- ============================================================

-- profiles テーブル
-- Supabase Auth の users テーブルと1:1で紐づくユーザープロフィール
create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  email_notifications boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint profiles_user_id_unique unique (user_id)
);

-- インデックス
create index idx_profiles_user_id on public.profiles(user_id);

-- RLS有効化
alter table public.profiles enable row level security;

-- RLSポリシー: 自分のプロフィールのみアクセス可能
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = user_id);

create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = user_id);

-- 新規ユーザー作成時に自動的にprofileを作成するトリガー
-- profiles.id = auth.users.id にすることで、アプリ全体で user.id を profile_id として直接使用可能
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, user_id, display_name, avatar_url)
  values (
    new.id,
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'avatar_url'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- updated_at 自動更新トリガー
create or replace function public.update_updated_at_column()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.update_updated_at_column();
