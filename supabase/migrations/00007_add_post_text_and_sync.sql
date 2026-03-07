-- ============================================================
-- 00007: 投稿本文・同期状態・ライティングプロファイル追加
-- ============================================================

-- post_insights に投稿本文・メディア情報カラムを追加
ALTER TABLE public.post_insights ADD COLUMN IF NOT EXISTS post_text text;
ALTER TABLE public.post_insights ADD COLUMN IF NOT EXISTS post_url text;
ALTER TABLE public.post_insights ADD COLUMN IF NOT EXISTS media_type text;
ALTER TABLE public.post_insights ADD COLUMN IF NOT EXISTS media_url text;

-- social_accounts に同期状態・ライティングプロファイルを追加
ALTER TABLE public.social_accounts ADD COLUMN IF NOT EXISTS last_synced_at timestamptz;
ALTER TABLE public.social_accounts ADD COLUMN IF NOT EXISTS sync_status text DEFAULT 'pending';
ALTER TABLE public.social_accounts ADD COLUMN IF NOT EXISTS writing_profile jsonb;

-- profiles にカスタムライティング指示を追加
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS custom_writing_instructions text;
