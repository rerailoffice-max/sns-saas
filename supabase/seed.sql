-- =============================================
-- 開発用シードデータ
-- supabase db reset で自動適用される
-- テスト用: test@example.com / password123
-- =============================================

-- テストユーザー作成（Supabase Auth）
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  'authenticated', 'authenticated',
  'test@example.com',
  crypt('password123', gen_salt('bf')),
  NOW(),
  '{"provider":"email","providers":["email"]}',
  '{"full_name":"テストユーザー"}',
  NOW(), NOW(), '', '', '', ''
);

-- Auth identities
INSERT INTO auth.identities (
  id, user_id, provider_id, identity_data, provider,
  last_sign_in_at, created_at, updated_at
) VALUES (
  'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  'test@example.com',
  jsonb_build_object('sub', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'email', 'test@example.com'),
  'email', NOW(), NOW(), NOW()
);

-- ※ profiles は handle_new_user() トリガーで自動作成される
-- 以降、profile_idはSELECTで動的に参照

-- SNSアカウント（Threads テスト用）
INSERT INTO public.social_accounts (
  id, profile_id, platform, platform_user_id,
  username, display_name, access_token_enc, token_expires_at, is_active
)
SELECT
  'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22'::uuid,
  p.id, 'threads', 'threads_12345678',
  'test_threads_user', 'テストThreadsアカウント',
  'encrypted_dummy_token', NOW() + INTERVAL '60 days', true
FROM public.profiles p
WHERE p.user_id = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

-- フォロワースナップショット（直近30日分）
-- カラム: account_id, follower_count, recorded_at
INSERT INTO public.follower_snapshots (account_id, follower_count, recorded_at)
SELECT
  'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
  1200 + (random() * 50)::int + (row_number() OVER ()) * 8,
  (CURRENT_DATE - ((30 - row_number() OVER ()) || ' days')::interval)::date
FROM generate_series(1, 30);

-- 投稿インサイト（10件）
-- カラム: account_id, platform_post_id, likes, replies, reposts, quotes, impressions, text_length, hashtag_count, posted_at
INSERT INTO public.post_insights (
  account_id, platform_post_id,
  likes, replies, reposts, quotes, impressions,
  text_length, hashtag_count, posted_at
) VALUES
  ('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22', 'post_001', 45, 12, 8, 2, 1200, 58, 2, NOW() - INTERVAL '1 day'),
  ('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22', 'post_002', 38, 9, 5, 1, 980, 48, 1, NOW() - INTERVAL '2 days'),
  ('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22', 'post_003', 62, 18, 15, 4, 2100, 45, 2, NOW() - INTERVAL '3 days'),
  ('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22', 'post_004', 29, 7, 4, 0, 750, 38, 0, NOW() - INTERVAL '5 days'),
  ('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22', 'post_005', 89, 25, 20, 6, 3500, 42, 2, NOW() - INTERVAL '7 days'),
  ('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22', 'post_006', 55, 14, 11, 3, 1800, 36, 0, NOW() - INTERVAL '10 days'),
  ('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22', 'post_007', 41, 10, 7, 2, 1100, 38, 2, NOW() - INTERVAL '12 days'),
  ('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22', 'post_008', 72, 22, 18, 5, 2800, 40, 0, NOW() - INTERVAL '15 days'),
  ('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22', 'post_009', 34, 8, 6, 1, 900, 42, 1, NOW() - INTERVAL '18 days'),
  ('b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22', 'post_010', 48, 13, 9, 2, 1500, 38, 0, NOW() - INTERVAL '20 days');

-- 下書き（3件）
-- カラム: profile_id, account_id, source('manual'/'openclaw'/'ai'), text, hashtags, status
INSERT INTO public.drafts (profile_id, account_id, text, hashtags, source, status)
SELECT
  p.id, 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22'::uuid,
  t.text, t.hashtags, t.source, t.status
FROM public.profiles p
CROSS JOIN (VALUES
  ('新しいSNS管理ツールを使い始めました。投稿の予約機能が便利すぎる！ #SNS管理', ARRAY['#SNS管理'], 'manual', 'draft'),
  ('今週のフォロワー分析レポート。成長率が先週比で15%アップ！', ARRAY[]::text[], 'ai', 'draft'),
  ('ThreadsのAPI活用事例を紹介。自動投稿から分析まで、できることが増えています。 #Threads #API', ARRAY['#Threads', '#API'], 'manual', 'draft')
) AS t(text, hashtags, source, status)
WHERE p.user_id = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

-- 予約投稿用の下書き（scheduled_postsはdraft_idが必須）
INSERT INTO public.drafts (id, profile_id, account_id, text, hashtags, source, status)
SELECT
  t.draft_id, p.id, 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22'::uuid,
  t.text, t.hashtags, 'manual', 'scheduled'
FROM public.profiles p
CROSS JOIN (VALUES
  ('c0eebc99-0001-4ef8-bb6d-6bb9bd380a01'::uuid, '明日の朝投稿予定：SNS運用の効率化について。自動化ツールの選び方を解説します。', ARRAY['#SNS運用', '#自動化']),
  ('c0eebc99-0002-4ef8-bb6d-6bb9bd380a02'::uuid, '週末投稿：今週学んだことのまとめ。小さな改善の積み重ねが大きな成果につながる。', ARRAY[]::text[])
) AS t(draft_id, text, hashtags)
WHERE p.user_id = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

-- 予約投稿（2件）
-- カラム: draft_id, account_id, scheduled_at, status
INSERT INTO public.scheduled_posts (draft_id, account_id, scheduled_at, status) VALUES
  ('c0eebc99-0001-4ef8-bb6d-6bb9bd380a01', 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22', NOW() + INTERVAL '1 day', 'pending'),
  ('c0eebc99-0002-4ef8-bb6d-6bb9bd380a02', 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22', NOW() + INTERVAL '3 days', 'pending');

-- サブスクリプション（Starterプラン）
INSERT INTO public.subscriptions (profile_id, stripe_customer_id, stripe_subscription_id, plan, status, current_period_end)
SELECT p.id, 'cus_test_12345', 'sub_test_12345', 'starter', 'active', NOW() + INTERVAL '30 days'
FROM public.profiles p
WHERE p.user_id = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
