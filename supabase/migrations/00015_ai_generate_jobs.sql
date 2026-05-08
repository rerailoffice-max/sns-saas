-- AI投稿生成ジョブ（動画DL+解説画像 deepモード）
-- compose のAI生成モーダルから enqueue → ai-lab-bot がpolling実行 → 結果書き戻し
-- 軽量モード（テーマのみ）はAPI内同期生成のため、本テーブルは使わない

create table if not exists ai_generate_jobs (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null,
  account_id uuid,                       -- social_accounts.id (任意)
  source_url text not null,              -- 元投稿URL
  params_json jsonb not null default '{}'::jsonb,  -- theme/thread_count/hook_pattern/long_form/arrange_prompt 等
  status text not null default 'queued'
    check (status in ('queued', 'processing', 'done', 'error', 'cancelled')),
  progress text,                         -- 「動画DL中」「文字起こし中」「画像生成中(2/4)」等のヒューマンリーダブルなステップ
  result_json jsonb,                     -- {posts: [{text, media_url}], source_kind, last_url}
  error text,                            -- エラー時の概要
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz
);

do $$ begin
  alter table ai_generate_jobs
    add constraint ai_generate_jobs_profile_fk
    foreign key (profile_id) references profiles(id) on delete cascade;
exception when duplicate_object then null;
end $$;

create index if not exists idx_ai_generate_jobs_queued on ai_generate_jobs(created_at)
  where status = 'queued';
create index if not exists idx_ai_generate_jobs_profile on ai_generate_jobs(profile_id, created_at desc);

-- updated_at 自動更新
create or replace function ai_generate_jobs_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_ai_generate_jobs_updated_at on ai_generate_jobs;
create trigger trg_ai_generate_jobs_updated_at
  before update on ai_generate_jobs
  for each row execute function ai_generate_jobs_set_updated_at();

alter table ai_generate_jobs enable row level security;

do $$ begin
  create policy "ai_generate_jobs_select_own" on ai_generate_jobs
    for select using (
      profile_id in (select id from profiles where user_id = auth.uid())
    );
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "ai_generate_jobs_insert_own" on ai_generate_jobs
    for insert with check (
      profile_id in (select id from profiles where user_id = auth.uid())
    );
exception when duplicate_object then null;
end $$;

-- worker (service_role) は全権限。RLS bypassのため明示policyは不要だが、UPDATEを認証ユーザーにも許可（cancel用）
do $$ begin
  create policy "ai_generate_jobs_update_own" on ai_generate_jobs
    for update using (
      profile_id in (select id from profiles where user_id = auth.uid())
    );
exception when duplicate_object then null;
end $$;
