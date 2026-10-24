-- Файли приміщення (фото, заміри, скани договору): приватне сховище. Кожен користувач бачить і змінює лише свою теку <user_id>/…
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('premises-files', 'premises-files', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists premises_files_select on storage.objects;
create policy premises_files_select on storage.objects for select to authenticated
  using (bucket_id = 'premises-files' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists premises_files_insert on storage.objects;
create policy premises_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'premises-files' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists premises_files_update on storage.objects;
create policy premises_files_update on storage.objects for update to authenticated
  using (bucket_id = 'premises-files' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'premises-files' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists premises_files_delete on storage.objects;
create policy premises_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'premises-files' and (storage.foldername(name))[1] = auth.uid()::text);
