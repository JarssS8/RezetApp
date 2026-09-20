-- Diseño §5.1 — enganchar `member` al ciclo de vida del hogar.
--
-- Desde 20260920090000_rezet_member_foundation.sql, `member` solo se rellena
-- con el backfill de esa migración: nadie la mantiene. Esta migración hace
-- que se cree al crear hogar o canjear invitación, y que se marque
-- `deleted_at` (nunca se borra la fila) en las cuatro formas de salir:
-- leave_household, remove_member, delete_household y delete_account.
--
-- Cada función de abajo es el cuerpo actual, copiado íntegro de su última
-- migración, con solo el cambio que indica esta tarea:
--   create_household   <- 20260917220000_rezet_lock_profile_insert.sql
--   redeem_invite       <- 20260919100100_rezet_remove_member_demote_admin.sql
--   remove_member       <- 20260919100100_rezet_remove_member_demote_admin.sql
--   leave_household     <- 20260918100200_rezet_harden_transactional_rpcs.sql
--   delete_household     <- 20260907181314_rezet_multi_admin_household_and_delete_account.sql
--   delete_account       <- 20260918100200_rezet_harden_transactional_rpcs.sql
-- (verificado: ninguna migración posterior a las de arriba vuelve a
-- redefinir estas seis funciones).

-- ── create_household(): también funda el member fundador ───────────────
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

  insert into public.member (household_id, auth_user_id, display_name, kcal_target)
  values (v_household_id, (select auth.uid()), p_display_name,
          (select kcal_target from public.household where id = v_household_id));

  return v_household_id;
end;
$$;

revoke all on function public.create_household(text, text) from public, anon;
grant execute on function public.create_household(text, text) to authenticated;

-- ── redeem_invite(): también funda el member de quien canjea ───────────
create or replace function public.redeem_invite(p_code text, p_display_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invite public.household_invite%rowtype;
begin
  if (select auth.uid()) is null then
    raise exception 'not authenticated';
  end if;

  if exists (select 1 from public.profile where id = (select auth.uid())) then
    raise exception 'ya perteneces a un hogar';
  end if;

  select * into v_invite
  from public.household_invite
  where code = upper(p_code)
    and used_at is null
    and expires_at > now()
  for update;

  if not found then
    raise exception 'código de invitación inválido o caducado';
  end if;

  -- Solo sirve una invitación cuyo creador sigue en el hogar y sigue siendo
  -- administrador: quien sale, es expulsado o pierde el rol ya no puede
  -- meter a nadie con un código antiguo.
  if v_invite.created_by is null
     or not exists (
       select 1 from public.profile p
        where p.id = v_invite.created_by
          and p.household_id = v_invite.household_id
          and p.is_admin
     ) then
    raise exception 'código de invitación inválido o caducado';
  end if;

  insert into public.profile (id, household_id, display_name)
    values ((select auth.uid()), v_invite.household_id, p_display_name);

  insert into public.member (household_id, auth_user_id, display_name, kcal_target)
  values (v_invite.household_id, (select auth.uid()), p_display_name,
          (select kcal_target from public.household where id = v_invite.household_id));

  update public.household_invite
    set used_by = (select auth.uid()), used_at = now()
    where id = v_invite.id;

  return v_invite.household_id;
end;
$$;

revoke all on function public.redeem_invite(text, text) from public, anon;
grant execute on function public.redeem_invite(text, text) to authenticated;

-- ── leave_household(): borrado lógico del member antes de perder la cuenta ─
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

  perform 1 from public.household where id = v_household_id for update;

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
  -- Las invitaciones pendientes de quien se va dejan de servir. Tiene que ir
  -- antes de anular `created_by`: después ya no hay forma de saber cuáles eran
  -- suyas.
  delete from public.household_invite
   where household_id = v_household_id
     and created_by = v_uid
     and used_at is null;
  update public.household_invite set created_by = null
    where household_id = v_household_id and created_by = v_uid;
  update public.household_invite set used_by = null
    where household_id = v_household_id and used_by = v_uid;

  -- Borrado lógico: el historial de consumo y las recetas que creó siguen
  -- necesitando un nombre al que apuntar.
  update public.member set deleted_at = now() where auth_user_id = v_uid;
  -- FASE 2: aquí irá `delete from public.member_body where member_id = …`.
  -- Los datos corporales no deben sobrevivir a la salida del hogar.

  delete from public.profile where id = v_uid;
end;
$$;

revoke all on function public.leave_household() from public, anon;
grant execute on function public.leave_household() to authenticated;

-- ── delete_household(): sin cambios de código ───────────────────────────
-- `member.household_id` tiene `on delete cascade` (20260920090000), así que
-- al borrar el hogar la tabla se vacía sola con el `delete from
-- public.household` de abajo. No hace falta tocar `member` aquí: no lo
-- "arregles" añadiendo un update de deleted_at, sería redundante.
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

revoke all on function public.delete_household() from public, anon;
grant execute on function public.delete_household() to authenticated;

-- ── delete_account(): borrado lógico del member solo en la rama de "me voy" ─
-- La rama que borra el hogar entero (v_member_count <= 1) no necesita nada:
-- mismo cascade que delete_household. Solo la rama "quedan más miembros"
-- hace lo mismo que leave_household con el member.
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
    perform 1 from public.household where id = v_household_id for update;

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
      -- Las invitaciones pendientes de quien se va dejan de servir. Tiene que ir
      -- antes de anular `created_by`: después ya no hay forma de saber cuáles eran
      -- suyas.
      delete from public.household_invite
       where household_id = v_household_id
         and created_by = v_uid
         and used_at is null;
      update public.household_invite set created_by = null
        where household_id = v_household_id and created_by = v_uid;
      update public.household_invite set used_by = null
        where household_id = v_household_id and used_by = v_uid;

      -- Borrado lógico: el historial de consumo y las recetas que creó siguen
      -- necesitando un nombre al que apuntar.
      update public.member set deleted_at = now() where auth_user_id = v_uid;
      -- FASE 2: aquí irá `delete from public.member_body where member_id = …`.
      -- Los datos corporales no deben sobrevivir a la salida del hogar.

      delete from public.profile where id = v_uid;
    end if;
  end if;

  delete from auth.users where id = v_uid;
end;
$$;

revoke all on function public.delete_account() from public, anon;
grant execute on function public.delete_account() to authenticated;

-- ── remove_member(): borrado lógico del member expulsado ────────────────
create or replace function public.remove_member(p_member_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_household_id uuid;
  v_is_admin boolean;
  v_target_admin boolean;
begin
  select household_id, is_admin into v_household_id, v_is_admin
    from public.profile where id = v_uid;

  if v_household_id is null or v_is_admin is not true then
    raise exception 'REZET_NOT_ADMIN: solo un administrador puede quitar a alguien del hogar';
  end if;

  perform 1 from public.household where id = v_household_id for update;

  select is_admin into v_target_admin
    from public.profile
   where id = p_member_id and household_id = v_household_id;

  if not found or p_member_id = v_uid then
    raise exception 'REZET_NOT_A_MEMBER: esa persona no está en tu hogar';
  end if;

  if v_target_admin then
    raise exception 'REZET_TARGET_IS_ADMIN: quítale primero el rol de administrador';
  end if;

  -- Misma limpieza que leave_household, aplicada al miembro expulsado. Las
  -- invitaciones pendientes van antes de anular created_by: después ya no se
  -- sabría cuáles eran suyas.
  update public.recipe set created_by = null
    where household_id = v_household_id and created_by = p_member_id;
  update public.cook_log set cooked_by = null
    where household_id = v_household_id and cooked_by = p_member_id;
  delete from public.household_invite
   where household_id = v_household_id
     and created_by = p_member_id
     and used_at is null;
  update public.household_invite set created_by = null
    where household_id = v_household_id and created_by = p_member_id;
  update public.household_invite set used_by = null
    where household_id = v_household_id and used_by = p_member_id;

  -- Borrado lógico: mismo motivo que en leave_household.
  update public.member set deleted_at = now() where auth_user_id = p_member_id;

  delete from public.profile where id = p_member_id;
end;
$$;

revoke all on function public.remove_member(uuid) from public, anon;
grant execute on function public.remove_member(uuid) to authenticated;
