-- Rezet — "abandonar hogar" / "el propietario borra el hogar".
-- household.owner_id se backfillea heurísticamente (no había creador
-- registrado); create_household ahora lo fija en la creación.
-- leave_household()/delete_household() son SECURITY DEFINER porque `profile`
-- y `household` no tienen policy de DELETE en absoluto (solo select/insert/
-- update) — sin bypass de RLS ningún DELETE de cliente pasaría nunca.

-- ── household.owner_id ──────────────────────────────────────────────────

alter table household add column owner_id uuid references auth.users(id);
create index household_owner_id_idx on household (owner_id);

-- Backfill: no hay registro de quién creó cada hogar existente, así que se
-- usa el profile con el onboarded_at más antiguo de cada hogar (empate por
-- id) como heurística razonable de "quien lo creó primero". En los dos
-- hogares reales de este proyecto hay un único profile cada uno, así que el
-- backfill es exacto, no una aproximación.
update household h
set owner_id = sub.profile_id
from (
  select distinct on (p.household_id) p.household_id, p.id as profile_id
  from profile p
  order by p.household_id, p.onboarded_at asc nulls last, p.id asc
) sub
where sub.household_id = h.id;

-- owner_id no se cambia por UPDATE directo del cliente: household_update ya
-- permite a cualquier miembro hacer PATCH de la fila entera (using/with
-- check solo comprueban el id de hogar, no columna a columna), y sin esta
-- protección cualquier miembro podría auto-nombrarse propietario. No hay
-- todavía una RPC de transferencia de propiedad, así que se bloquea sin
-- excepción, igual que protect_profile_household bloquea household_id.
create or replace function private.protect_household_owner()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.owner_id is distinct from old.owner_id then
    raise exception 'owner_id no se puede modificar directamente';
  end if;
  return new;
end;
$$;

create trigger household_protect_owner_trg
before update on household
for each row execute function private.protect_household_owner();

-- ── create_household: fija owner_id al crear ───────────────────────────
-- Mismo cuerpo que 20260905131743_rezet_fix_create_household_returning.sql
-- (la versión actualmente en vivo), + la columna owner_id en el insert.

create or replace function public.create_household(p_name text, p_display_name text)
returns uuid
language plpgsql
security invoker
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

  insert into public.household (id, name, owner_id) values (v_household_id, p_name, (select auth.uid()));
  insert into public.profile (id, household_id, display_name)
    values ((select auth.uid()), v_household_id, p_display_name);

  return v_household_id;
end;
$$;

revoke all on function public.create_household(text, text) from public;
revoke execute on function public.create_household(text, text) from anon;
grant execute on function public.create_household(text, text) to authenticated;

-- ── leave_household() ───────────────────────────────────────────────────
-- El propietario no puede abandonar mientras queden otros miembros (no hay
-- transferencia de propiedad todavía); el último miembro de un hogar no
-- "abandona", borra el hogar (delete_household). En ambos casos se
-- rechaza con un mensaje claro en vez de dejar el hogar en un estado raro.
--
-- private.protect_profile_household() SOLO dispara en UPDATE (verificado:
-- information_schema.triggers de `profile` solo tiene event UPDATE), así
-- que un DELETE de la propia fila de profile no lo toca en absoluto — no es
-- el obstáculo real aquí. El obstáculo real son las FK NO ACTION que
-- apuntan a profile.id como mera atribución (recipe.created_by,
-- cook_log.cooked_by, household_invite.created_by/used_by): borrar la fila
-- de profile sin tocarlas antes revienta con una violación de FK en cuanto
-- ese usuario haya creado alguna receta, cocinado algo o generado/canjeado
-- una invitación. Se ponen a null primero (las cuatro son nullable).
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
    raise exception 'eres el único miembro de este hogar: bórralo en vez de abandonarlo';
  end if;

  if v_owner_id = v_uid then
    raise exception 'eres el propietario de este hogar y aún quedan otros miembros: transferir la propiedad no está disponible todavía, así que no puedes abandonarlo';
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

-- ── delete_household() ──────────────────────────────────────────────────
-- Solo el propietario. Borra el profile de TODOS los miembros (al propio
-- household_id le sigue una cascada real cuando se borra household, pero se
-- borran los profile explícitamente primero — como pide el diseño, y porque
-- así el household.owner_id de la propia fila de household ya no se lee
-- cuando se ejecuta el delete de household más abajo) y luego el hogar.
-- Mismo problema de FK NO ACTION que leave_household: hay que anular
-- created_by/cooked_by/used_by de TODOS los miembros antes del delete de
-- profile, no solo del que llama.
--
-- Cadena de cascada verificada en vivo (information_schema.referential_
-- constraints) para cada tabla con household_id -> household: ingredient,
-- recipe, pantry_item, plan_entry, cook_log, shopping_check,
-- household_invite, push_subscription (vía profile_id -> profile, que a su
-- vez cascada desde household_id -> household), cook_timer, tag, profile —
-- TODAS on delete cascade. recipe_tag/recipe_ingredient/recipe_step/
-- recipe_step_ingredient cascadean transitivamente vía recipe_id -> recipe
-- (también cascade). No se encontró ninguna FK household-scoped sin
-- cascade; las únicas NO ACTION son las de atribución a profile ya
-- mencionadas, que esta función anula explícitamente.
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
    raise exception 'solo el propietario del hogar puede borrarlo';
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
