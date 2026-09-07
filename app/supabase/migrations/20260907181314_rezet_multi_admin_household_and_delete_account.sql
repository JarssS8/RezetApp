-- Rezet — single owner_id -> multi-admin (profile.is_admin), promote_admin(),
-- and a real delete_account() RPC.
--
-- Verified live before writing this (never invoked leave_household/
-- delete_household/promote_admin/delete_account, only read/introspected):
--  * Exactly 2 households, each with exactly 1 profile, and in both cases
--    that profile.id = household.owner_id — so the is_admin backfill below
--    is exact, not a heuristic.
--  * household_protect_owner_trg (BEFORE UPDATE on household) and
--    profile_protect_household_trg (BEFORE UPDATE on profile) are the only
--    triggers on either table; their function bodies are reproduced from
--    pg_get_functiondef below before being replaced/dropped.
--  * The four NO ACTION FKs pointing at profile.id are unchanged from the
--    previous migration's audit: recipe.created_by, cook_log.cooked_by,
--    household_invite.created_by, household_invite.used_by. cook_timer.
--    profile_id and push_subscription.profile_id are ON DELETE CASCADE, not
--    NO ACTION, so they need no nulling. profile.id -> auth.users.id
--    (profile_id_fkey) is ALSO ON DELETE CASCADE.
--  * information_schema.role_table_grants shows the `postgres` role (the
--    owner of every function in this migration, confirmed via pg_proc.
--    proowner) already holds DELETE (and SELECT/INSERT/UPDATE/...) on
--    auth.users directly, not just via table ownership — this is the
--    Supabase-managed grant that makes a plain SECURITY DEFINER SQL
--    function able to `delete from auth.users` without an Edge Function.
--    No trigger exists on auth.users, and no FK in this project's schema
--    (public or storage) references auth.users except the ones owned by
--    Supabase itself (auth.identities/sessions/mfa_factors/... all CASCADE)
--    and our own profile_id_fkey (CASCADE). storage.objects currently has
--    zero rows in this project, so the "can't delete a user who owns
--    Storage objects" caveat in Supabase's docs does not apply here today.
--    `postgres` also has rolbypassrls = true (confirmed via pg_roles), same
--    as it already relied on for leave_household()/delete_household() to
--    delete profile/household rows that have no client-facing DELETE
--    policy at all — promote_admin()'s cross-member UPDATE relies on the
--    same bypass.
--  * PostgREST client requests run under current_user 'anon' or
--    'authenticated' (authenticator -> SET ROLE); a SECURITY DEFINER
--    function owned by `postgres` runs its body, including any UPDATE it
--    issues, under current_user 'postgres'. protect_profile_household()'s
--    new is_admin guard uses that distinction to allow promote_admin()'s
--    internal UPDATE while still blocking a direct client PATCH.

-- ── profile.is_admin ─────────────────────────────────────────────────────

alter table profile add column is_admin boolean not null default false;

update profile p
set is_admin = true
from household h
where h.owner_id = p.id;

-- ── drop household.owner_id and its protection trigger ─────────────────
-- Live bodies read via pg_get_functiondef before dropping:
--
-- CREATE OR REPLACE FUNCTION private.protect_household_owner()
--  RETURNS trigger
--  LANGUAGE plpgsql
--  SET search_path TO ''
-- AS $function$
-- begin
--   if new.owner_id is distinct from old.owner_id then
--     raise exception 'owner_id no se puede modificar directamente';
--   end if;
--   return new;
-- end;
-- $function$
--
-- trigger: household_protect_owner_trg BEFORE UPDATE ON household
--   EXECUTE FUNCTION private.protect_household_owner()

drop trigger household_protect_owner_trg on household;
drop function private.protect_household_owner();
alter table household drop column owner_id;

-- ── protect_profile_household(): also guard is_admin ────────────────────
-- Live body read via pg_get_functiondef before extending:
--
-- CREATE OR REPLACE FUNCTION private.protect_profile_household()
--  RETURNS trigger
--  LANGUAGE plpgsql
--  SET search_path TO ''
-- AS $function$
-- begin
--   if new.household_id is distinct from old.household_id then
--     raise exception 'household_id no se puede modificar directamente';
--   end if;
--   return new;
-- end;
-- $function$
--
-- trigger: profile_protect_household_trg BEFORE UPDATE ON profile
--   EXECUTE FUNCTION private.protect_profile_household()
--
-- household_id keeps its unconditional guard (no RPC updates it via UPDATE
-- today). is_admin gets a conditional guard: `current_user <> 'postgres'`
-- lets promote_admin()'s own SECURITY DEFINER-context UPDATE through (it
-- runs as `postgres`, the owner of every RPC in this file) while still
-- rejecting a direct client `PATCH profile` (which runs as
-- `authenticated`/`anon` under PostgREST).

create or replace function private.protect_profile_household()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.household_id is distinct from old.household_id then
    raise exception 'household_id no se puede modificar directamente';
  end if;
  if new.is_admin is distinct from old.is_admin and current_user <> 'postgres' then
    raise exception 'is_admin no se puede modificar directamente';
  end if;
  return new;
end;
$$;

-- ── create_household(): founding profile becomes is_admin, not owner_id ─
-- Reproduced from the live pg_get_functiondef exactly, except the household
-- insert drops owner_id and the profile insert sets is_admin = true.

create or replace function public.create_household(p_name text, p_display_name text)
returns uuid
language plpgsql
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

revoke all on function public.create_household(text, text) from public;
revoke execute on function public.create_household(text, text) from anon;
grant execute on function public.create_household(text, text) to authenticated;

-- ── leave_household(): last-admin check replaces sole-owner check ──────
-- REZET_SOLE_MEMBER case is unchanged (verbatim message). The old
-- REZET_OWNER_WITH_MEMBERS case is replaced by REZET_LAST_ADMIN, which only
-- fires when the caller is an admin, is the ONLY admin, AND other members
-- remain (a non-admin member, or an admin who isn't the last one, can
-- always leave). The four NO ACTION FK nulls are re-verified unchanged
-- above.

create or replace function public.leave_household()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_household_id uuid;
  v_is_admin boolean;
  v_member_count int;
  v_admin_count int;
begin
  select household_id, is_admin into v_household_id, v_is_admin
    from public.profile where id = v_uid;

  if v_household_id is null then
    raise exception 'not authenticated or no household';
  end if;

  select count(*) into v_member_count from public.profile where household_id = v_household_id;

  if v_member_count <= 1 then
    raise exception 'REZET_SOLE_MEMBER: eres el único miembro de este hogar: bórralo en vez de abandonarlo';
  end if;

  if v_is_admin then
    select count(*) into v_admin_count
      from public.profile where household_id = v_household_id and is_admin = true;

    if v_admin_count <= 1 then
      raise exception 'REZET_LAST_ADMIN: eres el único administrador de este hogar y quedan otros miembros: dale el rol de administrador a alguien más antes de salir';
    end if;
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

-- ── delete_household(): admin check replaces owner_id check ────────────
-- Error tag RENAMED: REZET_NOT_OWNER -> REZET_NOT_ADMIN (see migration
-- report — "owner" no longer describes the model now that any number of
-- members can be admin). Same tag promote_admin() uses for its own
-- not-an-admin rejection; both mean "you are not an admin of this
-- household", just from two different RPCs.

create or replace function public.delete_household()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_household_id uuid;
  v_is_admin boolean;
begin
  select household_id, is_admin into v_household_id, v_is_admin
    from public.profile where id = v_uid;

  if v_household_id is null then
    raise exception 'not authenticated or no household';
  end if;

  if not v_is_admin then
    raise exception 'REZET_NOT_ADMIN: solo un administrador de este hogar puede borrarlo';
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

-- ── promote_admin(p_member_id uuid): grant admin to a fellow member ────
-- SECURITY DEFINER, owned by `postgres`, so its own `update public.profile
-- set is_admin = true` runs under current_user = 'postgres' and passes the
-- new guard in protect_profile_household() above.

create or replace function public.promote_admin(p_member_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_household_id uuid;
  v_is_admin boolean;
begin
  select household_id, is_admin into v_household_id, v_is_admin
    from public.profile where id = v_uid;

  if v_household_id is null or v_is_admin is not true then
    raise exception 'REZET_NOT_ADMIN: solo un administrador puede dar el rol de administrador';
  end if;

  if not exists (
    select 1 from public.profile where id = p_member_id and household_id = v_household_id
  ) then
    raise exception 'REZET_NOT_A_MEMBER: esa persona no está en tu hogar';
  end if;

  update public.profile set is_admin = true where id = p_member_id;
end;
$$;

revoke all on function public.promote_admin(uuid) from public;
revoke execute on function public.promote_admin(uuid) from anon;
grant execute on function public.promote_admin(uuid) to authenticated;

-- ── delete_account(): real Supabase Auth self-deletion ──────────────────
-- Research finding (see migration comment header): a plain SQL SECURITY
-- DEFINER function is sufficient on this project — no Edge Function needed.
-- `postgres` (the owner of every function here) already has an explicit
-- DELETE grant on auth.users (confirmed via information_schema.
-- role_table_grants), there is no trigger on auth.users, and every FK that
-- targets auth.users in this schema is ON DELETE CASCADE. So `delete from
-- auth.users where id = v_uid` at the end of this function is naturally
-- transactional with all the app-level bookkeeping before it — if anything
-- above raises, nothing (including the auth user) is deleted.
--
-- Same last-admin-with-other-members rule as leave_household(), phrased for
-- account deletion. If the caller has no profile/household at all, none of
-- the household bookkeeping runs and only the auth user is deleted (a
-- profile row always implies household_id NOT NULL, so "no profile" means
-- nothing else to clean up). If the caller is the household's sole member,
-- the whole household is deleted (same cascade delete_household() already
-- performs) as part of the same operation.

create or replace function public.delete_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_household_id uuid;
  v_is_admin boolean;
  v_member_count int;
  v_admin_count int;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select household_id, is_admin into v_household_id, v_is_admin
    from public.profile where id = v_uid;

  if v_household_id is not null then
    select count(*) into v_member_count from public.profile where household_id = v_household_id;

    if v_is_admin and v_member_count > 1 then
      select count(*) into v_admin_count
        from public.profile where household_id = v_household_id and is_admin = true;

      if v_admin_count <= 1 then
        raise exception 'REZET_LAST_ADMIN: eres el único administrador de este hogar y quedan otros miembros: dale el rol de administrador a alguien más antes de borrar tu cuenta';
      end if;
    end if;

    if v_member_count <= 1 then
      update public.recipe set created_by = null
        where household_id = v_household_id;
      update public.cook_log set cooked_by = null
        where household_id = v_household_id;
      update public.household_invite set created_by = null, used_by = null
        where household_id = v_household_id;

      delete from public.profile where household_id = v_household_id;
      delete from public.household where id = v_household_id;
    else
      update public.recipe set created_by = null
        where household_id = v_household_id and created_by = v_uid;
      update public.cook_log set cooked_by = null
        where household_id = v_household_id and cooked_by = v_uid;
      update public.household_invite set created_by = null
        where household_id = v_household_id and created_by = v_uid;
      update public.household_invite set used_by = null
        where household_id = v_household_id and used_by = v_uid;

      delete from public.profile where id = v_uid;
    end if;
  end if;

  delete from auth.users where id = v_uid;
end;
$$;

revoke all on function public.delete_account() from public;
revoke execute on function public.delete_account() from anon;
grant execute on function public.delete_account() to authenticated;
