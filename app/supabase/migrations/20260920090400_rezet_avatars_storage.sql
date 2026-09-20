-- Diseño §5.4 — bucket de avatares. Dos diferencias con `recipe-photos`:
--   * la lectura NO es pública: la cara de alguien no es una foto de comida,
--     así que se acota al propio hogar;
--   * la ruta es plana desde el principio. 20260919100300 existe porque los
--     objetos anidados se escapan del barrido de huérfanos; no se repite el
--     error.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 2097152, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

create policy avatars_read on storage.objects for select
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select private.current_household())::text
  );

create policy avatars_insert on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and name ~ ('^' || (select private.current_household())::text
                || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$')
  );

create policy avatars_update on storage.objects for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select private.current_household())::text
  )
  with check (
    bucket_id = 'avatars'
    and name ~ ('^' || (select private.current_household())::text
                || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$')
  );

create policy avatars_delete on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select private.current_household())::text
  );

-- Misma regla en la columna, para que un PATCH directo no apunte al avatar
-- de otro hogar ni fije un objeto contra la limpieza. NOT VALID como en
-- 20260919100300: no revalida filas antiguas.
alter table public.member
  add constraint member_avatar_path_own_folder check (
    avatar_path is null
    or avatar_path = ''
    or (avatar_path ~ ('^' || household_id::text || '/[^/]+$') and position('..' in avatar_path) = 0)
  ) not valid;
