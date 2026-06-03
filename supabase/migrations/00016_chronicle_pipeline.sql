-- v7.19 (2026-05-18): クロニキ運用パイプライン用テーブル
-- ai-lab-bot 側の JSON ストア (topic-stock.json / pending-threads.json / publish-control.json)
-- を Supabase にミラーリングし、sns-saas Web UI から read/write できるようにする。
--
-- 設計方針:
--   - ai-lab-bot が source of truth (JSON を持つ)
--   - 書き込み時に Supabase へ upsert (同期アダプタ経由)
--   - sns-saas は Supabase から read、操作 (採用/却下/時間指定/停止/再開) は
--     ai-lab-bot HTTP API (Phase 2b) 経由で行う
--   - profile_id でマルチテナント対応 (現在はクロニキ運用 profile_id 1 件のみ)

-- ─────────────────────────────────────────────
-- 1. chronicle_topic_stock — 動画ネタ候補ストック
-- ─────────────────────────────────────────────
create table if not exists chronicle_topic_stock (
  topic_key text primary key,                  -- 例: 'twimg-mediaid:2055685967160258561'
  profile_id uuid not null,
  source_url text,
  title text,
  text text,
  author text,
  platform text default 'x',
  buzz_score int default 0,
  media_kind text check (media_kind in ('video', 'image', 'none')) default 'none',
  preview_url text,
  video_url text,
  status text not null default 'stocked'
    check (status in ('stocked', 'adopted', 'rejected', 'expired')),
  adopted_at timestamptz,
  adopted_as text,                             -- 紐づく thread_id
  published_at timestamptz,
  rejected_at timestamptz,
  rejected_reason text,
  expired_at timestamptz,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$ begin
  alter table chronicle_topic_stock
    add constraint chronicle_topic_stock_profile_fk
    foreign key (profile_id) references profiles(id) on delete cascade;
exception when duplicate_object then null;
end $$;

create index if not exists idx_chronicle_topic_stock_profile_status
  on chronicle_topic_stock(profile_id, status, buzz_score desc);
create index if not exists idx_chronicle_topic_stock_created
  on chronicle_topic_stock(profile_id, created_at desc);

-- ─────────────────────────────────────────────
-- 2. chronicle_publish_queue — pending-threads.json のミラー
-- ─────────────────────────────────────────────
create table if not exists chronicle_publish_queue (
  thread_id text primary key,                  -- 例: 'thread-20260518-15'
  profile_id uuid not null,
  title text,
  topic_source text,                           -- X URL 等
  slot int,                                    -- 0..23 (NULL なら absolute mode)
  publish_mode text default 'slot'
    check (publish_mode in ('slot', 'absolute', 'delay')),
  scheduled_at timestamptz,
  target_at timestamptz,                       -- absolute mode の発火時刻
  status text not null default 'pending'
    check (status in ('pending', 'published', 'failed', 'rejected', 'revision_requested')),
  posts_count int default 0,
  media_summary jsonb,                         -- [{kind: 'video', preview_url, ...}, ...]
  published_posts jsonb,                       -- 公開後の post_url 等
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz
);

do $$ begin
  alter table chronicle_publish_queue
    add constraint chronicle_publish_queue_profile_fk
    foreign key (profile_id) references profiles(id) on delete cascade;
exception when duplicate_object then null;
end $$;

create index if not exists idx_chronicle_publish_queue_profile_status
  on chronicle_publish_queue(profile_id, status, scheduled_at);
create index if not exists idx_chronicle_publish_queue_target
  on chronicle_publish_queue(profile_id, target_at)
  where publish_mode = 'absolute' and status = 'pending';

-- ─────────────────────────────────────────────
-- 3. chronicle_publish_control — 自動投稿 ON/OFF (profile ごと 1 行)
-- ─────────────────────────────────────────────
create table if not exists chronicle_publish_control (
  profile_id uuid primary key,
  paused boolean not null default false,
  paused_reason text,
  paused_at timestamptz,
  paused_by text,
  resumed_at timestamptz,
  history jsonb default '[]'::jsonb,           -- [{at, action, by, reason}]
  updated_at timestamptz not null default now()
);

do $$ begin
  alter table chronicle_publish_control
    add constraint chronicle_publish_control_profile_fk
    foreign key (profile_id) references profiles(id) on delete cascade;
exception when duplicate_object then null;
end $$;

-- ─────────────────────────────────────────────
-- 4. updated_at 自動更新 trigger (3 テーブル共通)
-- ─────────────────────────────────────────────
create or replace function chronicle_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_chronicle_topic_stock_updated_at on chronicle_topic_stock;
create trigger trg_chronicle_topic_stock_updated_at
  before update on chronicle_topic_stock
  for each row execute function chronicle_set_updated_at();

drop trigger if exists trg_chronicle_publish_queue_updated_at on chronicle_publish_queue;
create trigger trg_chronicle_publish_queue_updated_at
  before update on chronicle_publish_queue
  for each row execute function chronicle_set_updated_at();

drop trigger if exists trg_chronicle_publish_control_updated_at on chronicle_publish_control;
create trigger trg_chronicle_publish_control_updated_at
  before update on chronicle_publish_control
  for each row execute function chronicle_set_updated_at();

-- ─────────────────────────────────────────────
-- 5. RLS (profile_id ベース)
-- ─────────────────────────────────────────────
alter table chronicle_topic_stock enable row level security;
alter table chronicle_publish_queue enable row level security;
alter table chronicle_publish_control enable row level security;

do $$ begin
  create policy "chronicle_topic_stock_own" on chronicle_topic_stock
    for all using (
      profile_id in (select id from profiles where user_id = auth.uid())
    );
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "chronicle_publish_queue_own" on chronicle_publish_queue
    for all using (
      profile_id in (select id from profiles where user_id = auth.uid())
    );
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "chronicle_publish_control_own" on chronicle_publish_control
    for all using (
      profile_id in (select id from profiles where user_id = auth.uid())
    );
exception when duplicate_object then null;
end $$;

-- ─────────────────────────────────────────────
-- 6. 初期データ: クロニキ profile の publish_control 行を作成
-- ─────────────────────────────────────────────
insert into chronicle_publish_control (profile_id, paused)
select '51cf47ef-ba5b-4a21-8062-77e7102a2847'::uuid, false
where exists (
  select 1 from profiles where id = '51cf47ef-ba5b-4a21-8062-77e7102a2847'
)
on conflict (profile_id) do nothing;
