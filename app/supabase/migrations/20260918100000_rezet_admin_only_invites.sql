-- Diseño §3.2: invitar pasa a ser cosa de admins, y crear una invitación
-- caduca las anteriores sin usar del hogar, para que no se acumulen códigos
-- vivos que nadie recuerda haber creado.

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
    raise exception 'REZET_NO_HOUSEHOLD';
  end if;
  if not v_is_admin then
    raise exception 'REZET_NOT_ADMIN: solo un administrador de este hogar puede gestionar las invitaciones';
  end if;

  update public.household_invite
     set expires_at = now()
   where household_id = v_household_id
     and used_at is null
     and expires_at > now();

  insert into public.household_invite (household_id)
    values (v_household_id)
  returning code into v_code;

  return v_code;
end;
$$;

revoke all on function public.create_invite() from public, anon;
grant execute on function public.create_invite() to authenticated;

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
    raise exception 'REZET_NO_HOUSEHOLD';
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
