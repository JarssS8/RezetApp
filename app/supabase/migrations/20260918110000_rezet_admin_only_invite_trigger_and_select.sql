-- Revisión (reviewer): la política `household_invite_insert` y el privilegio
-- INSERT de tabla para `authenticated` se dejaron vivos a propósito (Fase B
-- los retira, cuando los clientes cacheados hayan actualizado), pero el
-- trigger BEFORE INSERT `private.force_server_minted_invite()`
-- (20260917220200_rezet_server_minted_invites.sql) reescribe código/caducidad
-- /autoría de cualquier insert que llegue por esa vía sin comprobar que quien
-- inserta sea admin del hogar. Resultado: cualquier miembro podía hacer
-- `insert into household_invite(household_id) values (<su_hogar>) returning
-- code` y sacar un código válido — el guardia de "solo admins invitan" de
-- create_invite() (20260918100000_rezet_admin_only_invites.sql) no protegía
-- este camino en absoluto.
--
-- Además `household_invite_select` dejaba leer las invitaciones pendientes
-- del hogar (código incluido) a cualquier miembro, no solo a quien
-- administra.

-- ── force_server_minted_invite(): ahora exige admin y caduca lo pendiente ──
-- Mismo guardia que create_invite() (REZET_NOT_ADMIN) y misma limpieza de
-- invitaciones vivas del hogar antes de emitir una nueva — así el camino
-- viejo del cliente (insert directo) queda con la misma semántica que el
-- nuevo (la RPC).
create or replace function private.force_server_minted_invite()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_is_admin boolean;
begin
  select is_admin into v_is_admin
    from public.profile
   where id = (select auth.uid())
     and household_id = new.household_id;

  if v_is_admin is not true then
    raise exception 'REZET_NOT_ADMIN: solo un administrador de este hogar puede gestionar las invitaciones';
  end if;

  update public.household_invite
     set expires_at = now()
   where household_id = new.household_id
     and used_at is null
     and expires_at > now();

  new.created_by := (select auth.uid());
  new.code       := upper(substr(encode(extensions.gen_random_bytes(6), 'hex'), 1, 10));
  new.expires_at := now() + interval '7 days';
  new.used_at    := null;
  new.used_by    := null;
  return new;
end;
$$;

revoke all on function private.force_server_minted_invite() from public, anon, authenticated;

-- ── household_invite_select: solo admins del hogar ─────────────────────
-- redeem_invite() es SECURITY DEFINER (dueño postgres, con rolbypassrls) y
-- no pasa por esta política, así que no necesita SELECT propio. El único
-- lector de cliente es InviteSheet.tsx, y solo se monta cuando
-- profile.isAdmin (ver AccountHouseholdSheet.tsx, fila "invitar" condicionada
-- a `profile?.isAdmin`); el cliente antiguo hace `.insert(...).select('code')`
-- tras el insert directo, que también necesita SELECT sobre la fila que
-- acaba de crear — y con el trigger de arriba, solo un admin llega a
-- crearla.
drop policy if exists household_invite_select on public.household_invite;
create policy household_invite_select on public.household_invite for select
  to authenticated
  using (
    exists (
      select 1 from public.profile
       where id = (select auth.uid())
         and household_id = household_invite.household_id
         and is_admin = true
    )
  );
