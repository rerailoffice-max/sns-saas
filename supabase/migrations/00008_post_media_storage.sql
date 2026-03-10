-- post-media Storage バケット
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'post-media',
  'post-media',
  true,
  26214400, -- 25MB
  array['image/jpeg','image/png','image/gif','image/webp','video/mp4','video/quicktime']
)
on conflict (id) do nothing;

-- 認証ユーザーがアップロード可能
create policy "auth users can upload post media"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'post-media');

-- 誰でも閲覧可能（public bucket）
create policy "public read post media"
  on storage.objects for select
  to public
  using (bucket_id = 'post-media');

-- 所有者のみ削除可能
create policy "owners can delete post media"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'post-media' and (storage.foldername(name))[1] = auth.uid()::text);
