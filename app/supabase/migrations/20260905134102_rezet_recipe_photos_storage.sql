-- M6 — bucket para fotos de plato. Lectura pública (son fotos de comida, no
-- datos sensibles, y así el cliente usa getPublicUrl sin URLs firmadas que
-- caducan); la escritura queda restringida a subir solo dentro de la carpeta
-- del propio hogar: `<household_id>/<archivo>`.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('recipe-photos', 'recipe-photos', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

create policy recipe_photos_read on storage.objects for select
  to public
  using (bucket_id = 'recipe-photos');

create policy recipe_photos_insert on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'recipe-photos'
    and (storage.foldername(name))[1] = (select private.current_household())::text
  );

create policy recipe_photos_update on storage.objects for update
  to authenticated
  using (
    bucket_id = 'recipe-photos'
    and (storage.foldername(name))[1] = (select private.current_household())::text
  )
  with check (
    bucket_id = 'recipe-photos'
    and (storage.foldername(name))[1] = (select private.current_household())::text
  );

create policy recipe_photos_delete on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'recipe-photos'
    and (storage.foldername(name))[1] = (select private.current_household())::text
  );
