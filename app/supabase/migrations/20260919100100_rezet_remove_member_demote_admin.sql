-- Auditoría run-3.
-- (1) household-membership:no-member-removal-or-admin-demotion: una vez
--     canjeada una invitación, los admins no tenían forma de quitar a nadie
--     ni de retirar el rol de admin; el único remedio era borrar el hogar.
-- (2) redeem_invite:invite-creator-admin-not-rechecked: las invitaciones
--     acuñadas por no-admins en la ventana 1.6.0–1.7.2 seguían canjeándose,
--     y con demote_admin cualquier invitación de un admin degradado también.
--
-- Mismo patrón que leave_household (20260918100200): SECURITY DEFINER con
-- search_path vacío, hogar y rol derivados de auth.uid(), fila del hogar
-- bloqueada para serializar con leave/redeem/promote concurrentes.

-- ── remove_member(): un admin expulsa a un miembro no admin ─────────────
-- A un admin hay que quitarle antes el rol (demote_admin): dos pasos
-- explícitos en vez de uno que pueda sorprender. Uno mismo sale con
-- leave_household, no por aquí.
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

  delete from public.profile where id = p_member_id;
end;
$$;

revoke all on function public.remove_member(uuid) from public, anon;
grant execute on function public.remove_member(uuid) to authenticated;

-- ── demote_admin(): un admin retira el rol a otro admin ─────────────────
-- Quien llama sigue siendo admin, así que el hogar nunca se queda sin
-- ninguno. Las invitaciones pendientes del degradado dejan de servir (y
-- redeem_invite, más abajo, ya no acepta las de un creador no admin).
create or replace function public.demote_admin(p_member_id uuid)
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
    raise exception 'REZET_NOT_ADMIN: solo un administrador puede quitar el rol de administrador';
  end if;

  perform 1 from public.household where id = v_household_id for update;

  if p_member_id = v_uid or not exists (
    select 1 from public.profile
     where id = p_member_id and household_id = v_household_id and is_admin
  ) then
    raise exception 'REZET_NOT_A_MEMBER: esa persona no es administradora de tu hogar';
  end if;

  delete from public.household_invite
   where household_id = v_household_id
     and created_by = p_member_id
     and used_at is null;

  update public.profile set is_admin = false where id = p_member_id;
end;
$$;

revoke all on function public.demote_admin(uuid) from public, anon;
grant execute on function public.demote_admin(uuid) to authenticated;

-- ── redeem_invite(): el creador debe seguir siendo admin ────────────────
-- Cuerpo idéntico al de 20260917220200_rezet_server_minted_invites.sql,
-- con `and p.is_admin` añadido a la comprobación del creador.
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

  update public.household_invite
    set used_by = (select auth.uid()), used_at = now()
    where id = v_invite.id;

  return v_invite.household_id;
end;
$$;

revoke all on function public.redeem_invite(text, text) from public, anon;
grant execute on function public.redeem_invite(text, text) to authenticated;

-- Invitaciones pendientes heredadas cuyo creador no es admin: se caducan ya
-- (redeem_invite las rechazaría de todos modos; así tampoco aparecen como
-- pendientes en InviteSheet).
update public.household_invite i
   set expires_at = now()
  from public.profile p
 where p.id = i.created_by
   and not p.is_admin
   and i.used_at is null
   and i.expires_at > now();
