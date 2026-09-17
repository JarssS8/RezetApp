-- Auditoría run-2, hallazgo MEDIO
-- (rezet-supabase:storage.objects:recipe_photos_read-to-public-enables-cross-household-listing).
--
-- La política de lectura era `to public` con solo el bucket como condición, así
-- que cualquiera podía listar el bucket entero. Como las rutas son
-- `<household_id>/<uuid>.<ext>`, ese listado entregaba el UUID de todos los
-- hogares, que es lo que hacía explotable el fallo de `profile_insert`.
--
-- El bucket sigue siendo público, así que `getPublicUrl` (lo único que usa la
-- app) no se ve afectado: esa ruta no consulta RLS.

drop policy if exists recipe_photos_read on storage.objects;

create policy recipe_photos_read on storage.objects for select
  to authenticated
  using (
    bucket_id = 'recipe-photos'
    and (storage.foldername(name))[1] = ((select private.current_household()))::text
  );
