-- ============================================================
-- マイグレーション 00006: social_accounts に avatar_url カラム追加
-- ============================================================

alter table public.social_accounts add column if not exists avatar_url text;
