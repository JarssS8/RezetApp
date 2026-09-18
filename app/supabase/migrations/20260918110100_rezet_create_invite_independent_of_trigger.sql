-- Revisión (reviewer): create_invite() (20260918100000_rezet_admin_only_invites.sql)
-- inserta solo `household_id` y confía en el trigger de compatibilidad
-- `private.force_server_minted_invite()` para rellenar `created_by` y
-- `expires_at`. La Fase B (docs/superpowers/plans/2026-09-17-security-fixes.md)
-- retira ese trigger junto con el INSERT directo del cliente antiguo — y en
-- cuanto lo haga, el insert de create_invite() deja `created_by` a NULL, y
-- redeem_invite() (que exige un creador vivo desde
-- 20260918100000_rezet_admin_only_invites.sql) rechaza todo código nuevo.
--
-- Se redeclara create_invite() para que ponga `created_by` y `expires_at`
-- explícitos en su propio insert — igual que hacía antes de que existiera el
-- trigger (20260905131217_rezet_core_schema.sql) — y deje que el valor por
-- defecto de la columna genere `code`. Así deja de depender del trigger: cuando
-- la Fase B lo borre, esta función sigue funcionando sin cambios. (Mientras el
-- trigger siga vivo, lo que ponga aquí lo vuelve a sobrescribir con los mismos
-- valores — incluido el barrido de invitaciones pendientes, que ahora hacen
-- las dos capas — así que el comportamiento observable hoy no cambia.)
--
-- De paso, `REZET_NO_HOUSEHOLD` gana los dos puntos que le faltaban:
-- `stripHouseholdErrorTag` (app/src/data/householdErrors.ts) solo recorta
-- prefijos `REZET_X:`, y sin los dos puntos el mensaje crudo se colaba entero
-- al toast.

create or replace function public.create_invite()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household_id uuid;
  v_is_admin boolean;
  v_code text;
begin
  select household_id, is_admin into v_household_id, v_is_admin
    from public.profile where id = (select auth.uid());
  if v_household_id is null then
    raise exception 'REZET_NO_HOUSEHOLD: no perteneces a ningún hogar';
  end if;
  if not v_is_admin then
    raise exception 'REZET_NOT_ADMIN: solo un administrador de este hogar puede gestionar las invitaciones';
  end if;

  update public.household_invite
     set expires_at = now()
   where household_id = v_household_id
     and used_at is null
     and expires_at > now();

  insert into public.household_invite (household_id, created_by, expires_at)
    values (v_household_id, (select auth.uid()), now() + interval '7 days')
  returning code into v_code;

  return v_code;
end;
$$;

revoke all on function public.create_invite() from public, anon;
grant execute on function public.create_invite() to authenticated;

-- revoke_invite() no dependía del trigger (no inserta), pero se redeclara
-- igualmente para el mismo arreglo de mensaje.
create or replace function public.revoke_invite(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household_id uuid;
  v_is_admin boolean;
begin
  select household_id, is_admin into v_household_id, v_is_admin
    from public.profile where id = (select auth.uid());
  if v_household_id is null then
    raise exception 'REZET_NO_HOUSEHOLD: no perteneces a ningún hogar';
  end if;
  if not v_is_admin then
    raise exception 'REZET_NOT_ADMIN: solo un administrador de este hogar puede gestionar las invitaciones';
  end if;

  update public.household_invite
     set expires_at = now()
   where id = p_id
     and household_id = v_household_id
     and used_at is null;
end;
$$;

revoke all on function public.revoke_invite(uuid) from public, anon;
grant execute on function public.revoke_invite(uuid) to authenticated;
