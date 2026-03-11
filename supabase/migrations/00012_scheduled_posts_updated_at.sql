-- マイグレーション 00012: scheduled_posts に updated_at 追加
-- processing スタック復旧で正確な経過時間を判定するため

ALTER TABLE public.scheduled_posts
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE OR REPLACE FUNCTION public.update_scheduled_posts_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_scheduled_posts_updated_at ON public.scheduled_posts;

CREATE TRIGGER trg_scheduled_posts_updated_at
  BEFORE UPDATE ON public.scheduled_posts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_scheduled_posts_updated_at();
