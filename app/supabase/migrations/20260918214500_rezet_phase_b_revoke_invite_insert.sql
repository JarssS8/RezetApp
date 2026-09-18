-- Fase B de la auditoría run-2 (docs/superpowers/plans/2026-09-17-security-fixes.md,
-- sección "FASE B"). La Fase A dejó vivo el INSERT directo sobre
-- `household_invite` para no romper una PWA cacheada anterior a la 1.6.0, que
-- todavía creaba invitaciones insertando en la tabla; el trigger de
-- compatibilidad `household_invite_server_mint_trg` reescribía código,
-- caducidad y autoría de esos inserts (y desde
-- 20260918110000_rezet_admin_only_invite_trigger_and_select exigía además que
-- quien insertaba fuera admin).
--
-- Ya no hace falta: desde la 1.6.0 el cliente usa create_invite(), y
-- create_invite()/revoke_invite() son independientes del trigger desde
-- 20260918110100_rezet_create_invite_independent_of_trigger (ponen `created_by`
-- y `expires_at` en su propio insert). Se retira el permiso y su andamio.
--
-- Riesgo asumido, decidido con el usuario: en un cliente anterior a la 1.6.0 el
-- botón "Generar invitación" deja de funcionar y, en esas versiones, sin avisar
-- (el manejo de errores llegó en la 1.7.2). Se arregla abriendo la app y
-- aceptando la actualización que ofrece `UpdatePrompt`.

-- `service_role` va incluido a propósito: se salta RLS, así que sin este revoke
-- seguiría siendo la única vía de crear un código sin pasar por
-- create_invite(). `update`/`delete`/`truncate` son grants por defecto de
-- Supabase que nadie usa: RLS tapa los dos primeros (no hay políticas de
-- UPDATE ni de DELETE sobre esta tabla), pero `truncate` no pasa por RLS.
-- No hacen falta revokes por columna: `household_invite` no tiene ACL de
-- columna (al contrario que `profile` y `household`, ver
-- 20260918100100_rezet_tighten_profile_household_grants), así que el revoke de
-- tabla se lleva también los privilegios de columna.
revoke insert on public.household_invite from anon, authenticated, service_role;
revoke update, delete, truncate on public.household_invite from anon, authenticated;

drop policy if exists household_invite_insert on public.household_invite;

-- El orden importa: la función no se puede borrar mientras el trigger la use.
drop trigger if exists household_invite_server_mint_trg on public.household_invite;
drop function if exists private.force_server_minted_invite();

-- Aviso del linter de Supabase, ajeno a la auditoría: `public.rls_auto_enable()`
-- es SECURITY DEFINER y `anon`/`authenticated` pueden ejecutarla. Es un event
-- trigger de la plataforma (activa RLS en las tablas nuevas de `public`) y
-- Postgres no deja invocar funciones que devuelven `event_trigger` ni por
-- `select` ni por PostgREST, así que el aviso es un falso positivo; se revoca
-- igualmente para dejar el linter limpio. No está en ninguna migración de este
-- repositorio — vive solo en producción — y tampoco existe en el banco de
-- pruebas, de ahí la guarda.
do $$
begin
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'rls_auto_enable'
  ) then
    execute 'revoke execute on function public.rls_auto_enable() from public, anon, authenticated';
  end if;
end;
$$;
