-- ============================================================
-- マイグレーション 00014: auto_post_batches テーブル
-- RSS自動投稿の一括承認フロー管理
-- ============================================================

-- auto_post_batches テーブル
-- rss-autopilotが生成した下書きバッチを管理する
-- Discord DMで一括確認・承認するためのレコード
create table public.auto_post_batches (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  account_id uuid not null references public.social_accounts(id) on delete cascade,
  discord_channel_id text not null,       -- DM送信先チャンネルID
  discord_message_id text not null,       -- 送信したDMメッセージID（✅リアクション確認用）
  draft_ids uuid[] not null default '{}', -- 含まれる下書きのID配列
  preview_slots jsonb not null default '[]', -- 各下書きの仮予定スロット [{draft_id, slot_label, slot_time}]
  status text not null default 'waiting'
    check (status in ('waiting', 'approved', 'rejected', 'partial')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- インデックス
create index idx_auto_post_batches_profile_id on public.auto_post_batches(profile_id);
create index idx_auto_post_batches_status on public.auto_post_batches(status);
create index idx_auto_post_batches_created_at on public.auto_post_batches(created_at desc);

-- RLS
alter table public.auto_post_batches enable row level security;

create policy "auto_post_batches_all_own" on public.auto_post_batches
  for all using (
    profile_id in (select id from public.profiles where user_id = auth.uid())
  );

-- Adminによる全操作を許可（cronジョブ用）
create policy "auto_post_batches_admin_all" on public.auto_post_batches
  for all to service_role using (true) with check (true);

-- updated_at トリガー
create trigger auto_post_batches_updated_at
  before update on public.auto_post_batches
  for each row execute function public.update_updated_at_column();
