-- スクレイピングジョブ管理テーブル
-- Webアプリからジョブを作成し、ローカルWorkerがポーリングして実行する

create table if not exists scraping_jobs (
  id uuid primary key default gen_random_uuid(),
  model_account_id uuid not null,
  profile_id uuid not null,
  username text not null,
  platform text not null check (platform in ('threads', 'x', 'instagram')),
  status text not null default 'pending' check (status in ('pending', 'running', 'completed', 'failed')),
  error_message text,
  posts_found integer,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz
);

-- 外部キー（テーブル作成後に追加）
do $$ begin
  alter table scraping_jobs
    add constraint scraping_jobs_model_fk
    foreign key (model_account_id) references model_accounts(id) on delete cascade;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table scraping_jobs
    add constraint scraping_jobs_profile_fk
    foreign key (profile_id) references profiles(id) on delete cascade;
exception when duplicate_object then null;
end $$;

create index if not exists idx_scraping_jobs_status on scraping_jobs(status) where status = 'pending';
create index if not exists idx_scraping_jobs_model on scraping_jobs(model_account_id);

alter table scraping_jobs enable row level security;

do $$ begin
  create policy "scraping_jobs_select_own" on scraping_jobs
    for select using (
      profile_id in (select id from profiles where user_id = auth.uid())
    );
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "scraping_jobs_insert_own" on scraping_jobs
    for insert with check (
      profile_id in (select id from profiles where user_id = auth.uid())
    );
exception when duplicate_object then null;
end $$;
