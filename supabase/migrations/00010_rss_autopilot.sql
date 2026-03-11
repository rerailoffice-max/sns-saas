-- RSS自動投稿パイプライン用テーブル

-- RSSフィード記事ストア
create table if not exists rss_articles (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null,
  title text not null,
  link text not null,
  description text,
  source text not null,
  published_at timestamptz,
  is_used boolean not null default false,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_rss_articles_link on rss_articles(link);
create index if not exists idx_rss_articles_profile_unused on rss_articles(profile_id, is_used) where is_used = false;

do $$ begin
  alter table rss_articles
    add constraint rss_articles_profile_fk
    foreign key (profile_id) references profiles(id) on delete cascade;
exception when duplicate_object then null;
end $$;

alter table rss_articles enable row level security;

do $$ begin
  create policy "rss_articles_select_own" on rss_articles
    for select using (profile_id in (select id from profiles where user_id = auth.uid()));
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "rss_articles_insert_own" on rss_articles
    for insert with check (profile_id in (select id from profiles where user_id = auth.uid()));
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "rss_articles_update_own" on rss_articles
    for update using (profile_id in (select id from profiles where user_id = auth.uid()));
exception when duplicate_object then null;
end $$;

-- 自動投稿設定
create table if not exists auto_post_settings (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique,
  is_enabled boolean not null default false,
  account_id uuid,
  posts_per_cycle integer not null default 1 check (posts_per_cycle between 1 and 3),
  schedule_delay_minutes integer not null default 30,
  rss_feeds jsonb default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$ begin
  alter table auto_post_settings
    add constraint auto_post_settings_profile_fk
    foreign key (profile_id) references profiles(id) on delete cascade;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table auto_post_settings
    add constraint auto_post_settings_account_fk
    foreign key (account_id) references social_accounts(id) on delete set null;
exception when duplicate_object then null;
end $$;

alter table auto_post_settings enable row level security;

do $$ begin
  create policy "auto_post_settings_select_own" on auto_post_settings
    for select using (profile_id in (select id from profiles where user_id = auth.uid()));
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "auto_post_settings_insert_own" on auto_post_settings
    for insert with check (profile_id in (select id from profiles where user_id = auth.uid()));
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "auto_post_settings_update_own" on auto_post_settings
    for update using (profile_id in (select id from profiles where user_id = auth.uid()));
exception when duplicate_object then null;
end $$;
