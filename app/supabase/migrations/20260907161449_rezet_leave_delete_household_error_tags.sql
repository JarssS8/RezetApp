-- Rezet — add stable, machine-readable prefixes to leave_household()/
-- delete_household() exception messages, so the frontend can match on a
-- fixed tag instead of the Spanish prose (which could change wording and
-- silently stop matching, and which never had a matching case for the
-- owner-with-members-remaining rejection at all). This RPC has never been
-- called live (both leave_household and delete_household), so it's safe to
-- change the message format now. Logic is unchanged — only the three
-- `raise exception` message strings gain a `REZET_..._TAG: ` prefix. The
-- pre-existing 'not authenticated or no household' string is reused verbatim
-- elsewhere in the codebase and is left untouched.

create or replace function public.leave_household()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_household_id uuid;
  v_owner_id uuid;
  v_member_count int;
begin
  select household_id into v_household_id from public.profile where id = v_uid;

  if v_household_id is null then
    raise exception 'not authenticated or no household';
  end if;

  select owner_id into v_owner_id from public.household where id = v_household_id;
  select count(*) into v_member_count from public.profile where household_id = v_household_id;

  if v_member_count <= 1 then
    raise exception 'REZET_SOLE_MEMBER: eres el único miembro de este hogar: bórralo en vez de abandonarlo';
  end if;

  if v_owner_id = v_uid then
    raise exception 'REZET_OWNER_WITH_MEMBERS: eres el propietario de este hogar y aún quedan otros miembros: transferir la propiedad no está disponible todavía, así que no puedes abandonarlo';
  end if;

  update public.recipe set created_by = null
    where household_id = v_household_id and created_by = v_uid;
  update public.cook_log set cooked_by = null
    where household_id = v_household_id and cooked_by = v_uid;
  update public.household_invite set created_by = null
    where household_id = v_household_id and created_by = v_uid;
  update public.household_invite set used_by = null
    where household_id = v_household_id and used_by = v_uid;

  delete from public.profile where id = v_uid;
end;
$$;

revoke all on function public.leave_household() from public;
revoke execute on function public.leave_household() from anon;
grant execute on function public.leave_household() to authenticated;

create or replace function public.delete_household()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_household_id uuid;
begin
  select household_id into v_household_id from public.profile where id = v_uid;

  if v_household_id is null then
    raise exception 'not authenticated or no household';
  end if;

  if not exists (
    select 1 from public.household where id = v_household_id and owner_id = v_uid
  ) then
    raise exception 'REZET_NOT_OWNER: solo el propietario del hogar puede borrarlo';
  end if;

  update public.recipe set created_by = null
    where household_id = v_household_id;
  update public.cook_log set cooked_by = null
    where household_id = v_household_id;
  update public.household_invite set created_by = null, used_by = null
    where household_id = v_household_id;

  delete from public.profile where household_id = v_household_id;
  delete from public.household where id = v_household_id;
end;
$$;

revoke all on function public.delete_household() from public;
revoke execute on function public.delete_household() from anon;
grant execute on function public.delete_household() to authenticated;
