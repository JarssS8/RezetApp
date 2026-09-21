-- Cierre de cuatro hallazgos de dos revisiones sobre member_body/intake_share/
-- intake_extra (20260921090000, 20260921090100). Ninguna fuga de datos: son
-- validación, limpieza y dos índices de FK que faltaban.
--
-- Nota sobre 20260920090200_rezet_member_lifecycle.sql: los comentarios
-- "FASE 2: aquí irá `delete from public.member_body where member_id = …`" que
-- lleva en leave_household() y delete_account() están OBSOLETOS. La solución
-- acabó siendo el trigger de más abajo sobre `member` (cubre esas dos RPC más
-- delete_ward_member y remove_member sin tocar ninguna), así que no hay que
-- añadir ningún delete ahí. Esa migración ya está aplicada en producción y no
-- se edita: se deja constancia aquí en vez de en su cabecera.

-- ── 1. set_member_body: valores inválidos con etiqueta REZET_, no un check
--       crudo de Postgres ────────────────────────────────────────────────
-- Cuerpo copiado íntegro de 20260921090000_rezet_member_body.sql, con solo
-- las cuatro comprobaciones nuevas (justo después de can_act_for, antes de
-- tocar ninguna fila): mismo motivo que el REZET_FORBIDDEN de la propia
-- función, para que la interfaz pueda traducir el error en vez de mostrar
-- una violación de `check` en crudo.
create or replace function public.set_member_body(
  p_member_id uuid,
  p_patch jsonb,
  p_kcal_target int default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select private.can_act_for(p_member_id)) then
    raise exception 'REZET_FORBIDDEN: no puedes editar esos datos';
  end if;

  if p_patch ? 'sex' and p_patch->>'sex' is not null
     and p_patch->>'sex' not in ('female','male') then
    raise exception 'REZET_INVALID_BODY: sexo no válido';
  end if;
  if p_patch ? 'activity'
     and p_patch->>'activity' not in ('sedentary','light','moderate','active','very_active') then
    raise exception 'REZET_INVALID_BODY: actividad no válida';
  end if;
  if p_patch ? 'goal' and p_patch->>'goal' not in ('lose','maintain','gain') then
    raise exception 'REZET_INVALID_BODY: objetivo no válido';
  end if;
  if p_kcal_target is not null and p_kcal_target not between 1000 and 5000 then
    raise exception 'REZET_INVALID_BODY: el objetivo debe estar entre 1000 y 5000 kcal';
  end if;

  insert into public.member_body (member_id) values (p_member_id)
  on conflict (member_id) do nothing;

  -- Asignaciones literales, nunca SQL dinámico sobre las claves del patch:
  -- una clave `member_id` colada en un `execute format()` escribiría en la
  -- fila de otra persona.
  update public.member_body set
    sex        = case when p_patch ? 'sex' then p_patch->>'sex' else sex end,
    birth_year = case when p_patch ? 'birth_year' then (p_patch->>'birth_year')::int else birth_year end,
    height_cm  = case when p_patch ? 'height_cm' then (p_patch->>'height_cm')::numeric else height_cm end,
    weight_kg  = case when p_patch ? 'weight_kg' then (p_patch->>'weight_kg')::numeric else weight_kg end,
    activity   = coalesce(nullif(p_patch->>'activity', ''), activity),
    goal       = coalesce(nullif(p_patch->>'goal', ''), goal),
    updated_at = now()
  where member_id = p_member_id;

  if p_kcal_target is not null then
    update public.member set kcal_target = p_kcal_target where id = p_member_id;
  end if;
end;
$$;

revoke all on function public.set_member_body(uuid, jsonb, int) from public, anon;
grant execute on function public.set_member_body(uuid, jsonb, int) to authenticated;

-- ── 2. Borrado lógico de un miembro se lleva sus datos corporales ───────
-- El borrado lógico de un miembro se lleva sus datos corporales. Un trigger
-- sobre `member` en vez de un delete dentro de cada RPC: cubre las que hay
-- (delete_ward_member, y las que marcan deleted_at) y las que se añadan
-- después, sin que nadie tenga que acordarse.
create or replace function private.drop_member_body_on_soft_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.deleted_at is not null and old.deleted_at is null then
    delete from public.member_body where member_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists member_soft_delete_drop_body_trg on public.member;
create trigger member_soft_delete_drop_body_trg
after update of deleted_at on public.member
for each row execute function private.drop_member_body_on_soft_delete();

-- ── 3. intake_extra.created_by: validado contra el hogar, igual que
--       member_id y recipe_id ───────────────────────────────────────────
-- Sin esto, cualquiera podía poner como autor el id de un miembro de OTRO
-- hogar en una fila legítima suya: corrompe el dato que la columna existe
-- para tener, y sirve de oráculo de existencia de ids ajenos (un uuid válido
-- inserta; uno inexistente viola la FK). El trigger ya existe y apunta a esta
-- función (20260921090100), así que redeclararla basta: no hace falta
-- recrear el trigger.
create or replace function private.check_intake_extra_refs()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.member m
     where m.id = new.member_id and m.household_id = new.household_id
  ) then
    raise exception 'REZET_FOREIGN_HOUSEHOLD: ese miembro no es de ese hogar';
  end if;

  if new.recipe_id is not null and not exists (
    select 1 from public.recipe r
     where r.id = new.recipe_id and r.household_id = new.household_id
  ) then
    raise exception 'REZET_FOREIGN_HOUSEHOLD: esa receta no es de ese hogar';
  end if;

  if new.created_by is not null and not exists (
    select 1 from public.member m
     where m.id = new.created_by and m.household_id = new.household_id
  ) then
    raise exception 'REZET_FOREIGN_HOUSEHOLD: ese autor no es de ese hogar';
  end if;

  return new;
end;
$$;

-- ── 4. Índices de FK que el advisor señalaría igual que en
--       20260905131253_rezet_harden_rpc_grants_and_fk_indexes.sql ────────
-- intake_share.plan_entry_id es la SEGUNDA columna de su PK compuesta (no
-- tiene cobertura como columna líder) y su FK es ON DELETE CASCADE; y
-- intake_extra.created_by no tenía ningún índice.
create index intake_share_plan_entry_idx on public.intake_share (plan_entry_id);
create index intake_extra_created_by_idx on public.intake_extra (created_by);
