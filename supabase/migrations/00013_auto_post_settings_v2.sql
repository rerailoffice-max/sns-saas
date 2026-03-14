-- auto_post_settings に承認フロー・スケジュール・データソース関連カラムを追加
alter table auto_post_settings
  add column if not exists approval_required boolean not null default true,
  add column if not exists schedule_start_hour integer not null default 8,
  add column if not exists schedule_end_hour integer not null default 22,
  add column if not exists schedule_interval_minutes integer not null default 60,
  add column if not exists x_accounts jsonb default '[]'::jsonb;

-- drafts テーブルに pending_approval / rejected ステータスを許容する
-- (既存の status カラムが text 型であることを前提)
comment on column auto_post_settings.approval_required is '承認フロー: trueの場合、AI生成後に管理者承認を待ってから投稿';
comment on column auto_post_settings.schedule_start_hour is '実行スケジュール開始時刻 (0-23, JST)';
comment on column auto_post_settings.schedule_end_hour is '実行スケジュール終了時刻 (0-23, JST)';
comment on column auto_post_settings.schedule_interval_minutes is '実行間隔 (分): 30, 60, 120, 240';
comment on column auto_post_settings.x_accounts is 'X参考アカウント一覧 (JSON配列)';
