-- Arreglos de la revisión final de la rama de turnos (fase 7). Cuatro cosas
-- que la migración 20260921100200 dejó a medias, ninguna explotable pero
-- todas con consecuencias visibles.

-- 1. Tiempo real. `supabaseStore.tsx` se suscribe a `household` y a
--    `shopping_turn` para que encender los turnos en el móvil llegue a la
--    tablet, pero ninguna de las dos estaba en la publicación, así que esas
--    dos suscripciones no disparaban nunca. Publicar la tabla no salta la
--    RLS: `postgres_changes` sigue filtrando por las políticas de cada
--    cliente, que aquí acotan por hogar.
alter publication supabase_realtime add table public.household;
alter publication supabase_realtime add table public.shopping_turn;

-- 2. `updated_at` que miente. Las tres tablas nuevas la declaran con
--    `default now()` y nadie la vuelve a escribir —los upsert del cliente no
--    mandan la columna—, así que siempre dice la hora del alta. El repo ya
--    tiene el disparador para esto desde el esquema base (`pantry_item`).
create trigger member_notify_pref_set_updated_at
before update on public.member_notify_pref
for each row execute function private.set_updated_at();

create trigger member_recipe_pref_set_updated_at
before update on public.member_recipe_pref
for each row execute function private.set_updated_at();

create trigger shopping_turn_set_updated_at
before update on public.shopping_turn
for each row execute function private.set_updated_at();

-- 3. FK sin índice. `plan_entry.cook_member_id` sí se indexó en su
--    migración; su hermana se quedó fuera. Sin él, borrar un miembro obliga
--    a recorrer la tabla entera para comprobar la FK.
create index if not exists shopping_turn_member_idx
  on public.shopping_turn (member_id);

-- 4. El `revoke` de `plan_entry` se dejó a `anon` fuera, a diferencia del de
--    `household` de la línea de al lado y del de 20260918100100. No es
--    explotable —todas las políticas de `plan_entry` son `to authenticated`,
--    así que `anon` no pasa la RLS— pero deja vivo justo el tipo de grant de
--    tabla que este repo ya se equivocó una vez en no revocar
--    (20260917070714 → 20260917070845). Se revoca entero para `anon`: ese rol
--    no tiene nada que escribir aquí.
revoke update, truncate, references on public.plan_entry from anon;
