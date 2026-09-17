-- Auditoría run-2, hallazgo MEDIO
-- (app/supabase/migrations:household_invite:unrevocable-member-minted-invite-survives-exit).
--
-- El código y la caducidad eran valores por defecto de columna, así que el
-- cliente los elegía. Al salir del hogar la invitación sobrevivía y nadie podía
-- anularla: no hay política de UPDATE/DELETE ni RPC de revocación.

-- ── create_invite(): el servidor decide código, caducidad y autoría ──
create or replace function public.create_invite()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household_id uuid;
  v_code text;
begin
  select household_id into v_household_id
    from public.profile where id = (select auth.uid());
  if v_household_id is null then
    raise exception 'REZET_NO_HOUSEHOLD';
  end if;

  -- El trigger de compatibilidad `household_invite_server_mint_trg` (más abajo
  -- en este fichero) se dispara en TODO insert de household_invite, incluido
  -- este: no distingue entre el insert directo de una PWA vieja y el de esta
  -- misma función, así que reescribe también el código que se calculara aquí
  -- antes de guardarlo. Calcularlo en una variable y devolverlo aparte (como
  -- hace el resto de RPC de esta migración con created_at/expires_at) dejaba
  -- create_invite() devolviendo un código que la fila nunca llegaba a tener
  -- guardado — detectado con el banco de pruebas de la Task 0 antes de llegar
  -- a producción. Por eso aquí se lee con RETURNING el valor que de verdad
  -- queda en la tabla después del trigger, en vez de confiar en uno calculado
  -- aparte.
  insert into public.household_invite (household_id, created_by, expires_at)
    values (v_household_id, (select auth.uid()), now() + interval '7 days')
  returning code into v_code;

  return v_code;
end;
$$;

revoke all on function public.create_invite() from public, anon;
grant execute on function public.create_invite() to authenticated;

-- ── revoke_invite(): anular un código pendiente del propio hogar ──
create or replace function public.revoke_invite(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household_id uuid;
begin
  select household_id into v_household_id
    from public.profile where id = (select auth.uid());
  if v_household_id is null then
    raise exception 'REZET_NO_HOUSEHOLD';
  end if;

  update public.household_invite
     set used_at = now()
   where id = p_id
     and household_id = v_household_id
     and used_at is null;
end;
$$;

revoke all on function public.revoke_invite(uuid) from public, anon;
grant execute on function public.revoke_invite(uuid) to authenticated;

-- ── Compatibilidad: el INSERT directo del cliente antiguo ──
-- Una PWA cacheada sigue haciendo `insert into household_invite {household_id}`
-- sin `created_by`. Como abajo redeem_invite() pasa a exigir un creador vivo,
-- esos códigos nacerían inservibles. Hasta que la fase B revoque ese INSERT, el
-- servidor reescribe lo que llegue por ahí: mismo resultado que create_invite().
create or replace function private.force_server_minted_invite()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.created_by := (select auth.uid());
  new.code       := upper(substr(encode(extensions.gen_random_bytes(6), 'hex'), 1, 10));
  new.expires_at := now() + interval '7 days';
  new.used_at    := null;
  new.used_by    := null;
  return new;
end;
$$;

revoke all on function private.force_server_minted_invite() from public, anon, authenticated;

drop trigger if exists household_invite_server_mint_trg on public.household_invite;
create trigger household_invite_server_mint_trg
before insert on public.household_invite
for each row execute function private.force_server_minted_invite();

-- ── Barrido único de lo que ya hay ──
-- Las filas existentes se crearon desde el cliente sin `created_by`, así que no
-- se pueden atribuir: se caducan todas. Quien necesite invitar genera un código
-- nuevo, que ya nace con creador.
update public.household_invite
   set expires_at = now()
 where used_at is null
   and expires_at > now();

-- ── leave_household(): redeclarada solo para borrar las invitaciones del que
-- se va antes de anular su autoría (si no, ya no hay forma de saber cuáles
-- eran suyas). Cuerpo idéntico al de
-- 20260907181314_rezet_multi_admin_household_and_delete_account.sql:157-207,
-- con una única sentencia `delete` insertada antes del tercer `update`.
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

  delete from public.profile where id = v_uid;
end;
$$;

revoke all on function public.leave_household() from public;
revoke execute on function public.leave_household() from anon;
grant execute on function public.leave_household() to authenticated;

-- ── delete_account(): redeclarada por el mismo motivo, solo en la rama
-- `else` (v_member_count > 1): en la rama `if v_member_count <= 1` se borra el
-- hogar entero y las invitaciones caen por cascada. Cuerpo idéntico al de
-- 20260907181314_rezet_multi_admin_household_and_delete_account.sql:310-372,
-- con una única sentencia `delete` insertada antes del `update` de esa rama.
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

      delete from public.profile where id = v_uid;
    end if;
  end if;

  delete from auth.users where id = v_uid;
end;
$$;

revoke all on function public.delete_account() from public;
revoke execute on function public.delete_account() from anon;
grant execute on function public.delete_account() to authenticated;

-- ── redeem_invite(): redeclarada para exigir que el creador de la invitación
-- siga siendo miembro del hogar (si no, quien salía dejaba su código vivo y
-- podía volver a entrar con él). Cuerpo idéntico al de
-- 20260905131217_rezet_core_schema.sql:261-299, con una comprobación
-- insertada tras el `if not found then raise ... end if;`.
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

  -- Una invitación cuyo creador ya no está en el hogar no debe seguir sirviendo:
  -- antes, quien salía dejaba su código vivo y podía volver a entrar con él.
  if v_invite.created_by is null
     or not exists (
       select 1 from public.profile p
        where p.id = v_invite.created_by
          and p.household_id = v_invite.household_id
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

revoke all on function public.redeem_invite(text, text) from public;
grant execute on function public.redeem_invite(text, text) to authenticated;
