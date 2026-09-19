-- Auditoría run-3:
-- (1) rezet-supabase:recipe.photo_path:direct-dml-bypasses-save_recipe-folder-guard:
--     la comprobación de carpeta vivía solo en save_recipe; un PATCH directo
--     podía apuntar a la foto de otro hogar y fijarla contra la limpieza.
-- (2) rezet-storage:recipe-photos:nested-prefix-objects-escape-orphan-sweep:
--     las políticas solo miraban el primer segmento, así que se podían subir
--     objetos en subcarpetas que cleanup-orphan-photos nunca recorre.
-- Las dos reglas pasan a la base de datos: vale para cualquier cliente.

-- photo_path: nulo, vacío (save_recipe lo acepta) o un nombre plano dentro de
-- la carpeta del propio hogar. NOT VALID: no revalida filas antiguas (una
-- sola que no encaje haría fallar el despliegue); se aplica a toda escritura
-- nueva, que es donde estaba el agujero.
alter table public.recipe
  add constraint recipe_photo_path_own_folder check (
    photo_path is null
    or photo_path = ''
    or (photo_path ~ ('^' || household_id::text || '/[^/]+$') and position('..' in photo_path) = 0)
  ) not valid;

-- Storage: solo <hogar>/<uuid>.<jpg|png|webp>, que es exactamente lo que
-- escriben RecipeForm e IdeaDetail. SELECT y DELETE no cambian (siguen por
-- carpeta, así que los objetos anidados antiguos se pueden seguir borrando).
drop policy if exists recipe_photos_insert on storage.objects;
create policy recipe_photos_insert on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'recipe-photos'
    and name ~ ('^' || (select private.current_household())::text
                || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$')
  );

drop policy if exists recipe_photos_update on storage.objects;
create policy recipe_photos_update on storage.objects for update
  to authenticated
  using (
    bucket_id = 'recipe-photos'
    and (storage.foldername(name))[1] = (select private.current_household())::text
  )
  with check (
    bucket_id = 'recipe-photos'
    and name ~ ('^' || (select private.current_household())::text
                || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$')
  );
