-- Фото товарів: приватне сховище. Кожен користувач читає й змінює лише файли у своїй теці <user_id>/…
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-photos', 'product-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists product_photos_select on storage.objects;
create policy product_photos_select on storage.objects for select to authenticated
  using (bucket_id = 'product-photos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists product_photos_insert on storage.objects;
create policy product_photos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'product-photos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists product_photos_update on storage.objects;
create policy product_photos_update on storage.objects for update to authenticated
  using (bucket_id = 'product-photos' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'product-photos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists product_photos_delete on storage.objects;
create policy product_photos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'product-photos' and (storage.foldername(name))[1] = auth.uid()::text);
