-- ============================================================
-- マイグレーション 00003: scheduled_posts + post_insights + dead_letters + follower_snapshots
-- ============================================================

-- scheduled_posts テーブル
-- 予約投稿キュー管理
create table public.scheduled_posts (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references public.drafts(id) on delete cascade,
  account_id uuid not null references public.social_accounts(id) on delete cascade,
  scheduled_at timestamptz not null,
  status text not null default 'pending' check (
    status in ('pending', 'processing', 'published', 'failed')
  ),
  retry_count integer not null default 0,
  last_error text,
  post_url text,                        -- 投稿成功後のURL
  platform_post_id text,                -- プラットフォーム上の投稿ID
  published_at timestamptz,
  created_at timestamptz not null default now()
);

-- インデックス: 実行対象の効率的な取得
create index idx_scheduled_posts_pending on public.scheduled_posts(scheduled_at)
  where status = 'pending';
create index idx_scheduled_posts_account_id on public.scheduled_posts(account_id);

-- RLS
alter table public.scheduled_posts enable row level security;

create policy "scheduled_posts_all_own" on public.scheduled_posts
  for all using (
    account_id in (
      select sa.id from public.social_accounts sa
      join public.profiles p on sa.profile_id = p.id
      where p.user_id = auth.uid()
    )
  );

-- ============================================================

-- post_insights テーブル
-- 投稿のエンゲージメントデータ（自分の投稿）
create table public.post_insights (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.social_accounts(id) on delete cascade,
  platform_post_id text not null,
  likes integer not null default 0,
  replies integer not null default 0,
  reposts integer not null default 0,
  quotes integer not null default 0,
  impressions integer,                   -- NULL: APIで取得できない場合
  text_length integer,                   -- 投稿テキストの文字数
  hashtag_count integer,                 -- ハッシュタグの数
  ai_category text,                      -- AI自動分類カテゴリ
  posted_at timestamptz,
  fetched_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- インデックス
create index idx_post_insights_account_id on public.post_insights(account_id);
create index idx_post_insights_posted_at on public.post_insights(posted_at);
create unique index idx_post_insights_unique on public.post_insights(account_id, platform_post_id);

-- RLS
alter table public.post_insights enable row level security;

create policy "post_insights_select_own" on public.post_insights
  for select using (
    account_id in (
      select sa.id from public.social_accounts sa
      join public.profiles p on sa.profile_id = p.id
      where p.user_id = auth.uid()
    )
  );

-- ============================================================

-- dead_letters テーブル
-- リトライ上限超過した失敗投稿を保管
create table public.dead_letters (
  id uuid primary key default gen_random_uuid(),
  scheduled_post_id uuid not null references public.scheduled_posts(id) on delete cascade,
  error_message text,
  retry_count integer not null default 0,
  created_at timestamptz not null default now()
);

-- RLS
alter table public.dead_letters enable row level security;

create policy "dead_letters_select_own" on public.dead_letters
  for select using (
    scheduled_post_id in (
      select sp.id from public.scheduled_posts sp
      join public.social_accounts sa on sp.account_id = sa.id
      join public.profiles p on sa.profile_id = p.id
      where p.user_id = auth.uid()
    )
  );

-- ============================================================

-- follower_snapshots テーブル
-- フォロワー数の日次スナップショット
create table public.follower_snapshots (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.social_accounts(id) on delete cascade,
  follower_count integer not null,
  following_count integer,
  recorded_at date not null default current_date,
  created_at timestamptz not null default now()
);

-- インデックス: アカウント×日付でユニーク
create unique index idx_follower_snapshots_unique on public.follower_snapshots(account_id, recorded_at);
create index idx_follower_snapshots_account_date on public.follower_snapshots(account_id, recorded_at desc);

-- RLS
alter table public.follower_snapshots enable row level security;

create policy "follower_snapshots_select_own" on public.follower_snapshots
  for select using (
    account_id in (
      select sa.id from public.social_accounts sa
      join public.profiles p on sa.profile_id = p.id
      where p.user_id = auth.uid()
    )
  );
