-- Auditoría run-2, hallazgo CRÍTICO
-- (app/supabase/migrations:policy-profile_insert:unbound-household_id-and-is_admin).
--
-- `profile_insert` solo ataba `id = auth.uid()`, y `authenticated` conservaba
-- INSERT sobre `household_id` e `is_admin`. El trigger que protege esas columnas
-- es BEFORE UPDATE, así que no veía los INSERT: cualquier usuario con sesión y
-- sin perfil podía meterse en cualquier hogar como admin, saltándose a la vez la
-- invitación y la promoción a admin.
--
-- La pertenencia solo debe nacer en create_household() (hogar nuevo) y
-- redeem_invite() (código válido). Ninguna tabla usa FORCE ROW LEVEL SECURITY,
-- así que ambas, como SECURITY DEFINER, siguen insertando sin política.

revoke insert on public.profile from anon, authenticated;
drop policy if exists profile_insert on public.profile;

create or replace function public.create_household(p_name text, p_display_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household_id uuid := gen_random_uuid();
begin
  if (select auth.uid()) is null then
    raise exception 'not authenticated';
  end if;

  if exists (select 1 from public.profile where id = (select auth.uid())) then
    raise exception 'ya perteneces a un hogar';
  end if;

  insert into public.household (id, name) values (v_household_id, p_name);
  insert into public.profile (id, household_id, display_name, is_admin)
    values ((select auth.uid()), v_household_id, p_display_name, true);

  return v_household_id;
end;
$$;

revoke all on function public.create_household(text, text) from public, anon;
grant execute on function public.create_household(text, text) to authenticated;
