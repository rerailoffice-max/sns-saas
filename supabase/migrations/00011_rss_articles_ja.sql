-- RSS記事の日本語翻訳カラム追加
alter table rss_articles add column if not exists title_ja text;
alter table rss_articles add column if not exists description_ja text;
