-- Diseño §3.3, §5.3 — las tres puertas de escritura sobre `member`.
-- Contrato de todas: SECURITY DEFINER (así que la RLS NO las protege: el
-- chequeo es explícito), hogar derivado de la sesión y nunca recibido como
-- parámetro, y los patches jsonb aplicados columna a columna con
-- asignaciones literales. Nada de `execute format()` sobre las claves del
-- patch: una clave `auth_user_id` colada ahí sería una toma de cuenta.

create or replace function public.create_ward_member(p_display_name text, p_color text default 'green')
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household_id uuid;
  v_is_admin boolean;
  v_id uuid;
begin
  select household_id, is_admin into v_household_id, v_is_admin
    from public.profile where id = (select auth.uid());

  if v_household_id is null then
    raise exception 'REZET_NO_HOUSEHOLD: no perteneces a ningún hogar';
  end if;
  if not v_is_admin then
    raise exception 'REZET_NOT_ADMIN: solo un administrador puede añadir miembros';
  end if;

  insert into public.member (household_id, display_name, color, is_ward, kcal_target)
  values (
    v_household_id,
    nullif(btrim(p_display_name), ''),
    coalesce(nullif(btrim(p_color), ''), 'green'),
    true,
    (select kcal_target from public.household where id = v_household_id)
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.create_ward_member(text, text) from public, anon;
grant execute on function public.create_ward_member(text, text) to authenticated;

create or replace function public.delete_ward_member(p_member_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household_id uuid;
  v_is_admin boolean;
  v_target public.member%rowtype;
begin
  select household_id, is_admin into v_household_id, v_is_admin
    from public.profile where id = (select auth.uid());

  -- El predicado común manda: mismo hogar, tutela o fila propia, no borrado.
  -- Las comprobaciones de abajo lo estrechan (hace falta ser admin y que el
  -- objetivo sea tutelado), nunca lo relajan.
  if not (select private.can_act_for(p_member_id)) then
    raise exception 'REZET_FORBIDDEN: no puedes quitar a ese miembro';
  end if;

  if not coalesce(v_is_admin, false) then
    raise exception 'REZET_NOT_ADMIN: solo un administrador puede quitar miembros';
  end if;

  select * into v_target from public.member
   where id = p_member_id and household_id = v_household_id and deleted_at is null;

  if not found then
    raise exception 'REZET_MEMBER_NOT_FOUND: ese miembro no está en tu hogar';
  end if;

  -- A quien tiene cuenta se le saca con remove_member, que además limpia su
  -- perfil y sus invitaciones. Aquí solo se borran tutelados.
  if not v_target.is_ward then
    raise exception 'REZET_MEMBER_HAS_ACCOUNT: usa quitar del hogar para quien tiene cuenta';
  end if;

  -- Borrado lógico: su historial sigue teniendo un nombre al que apuntar.
  update public.member set deleted_at = now() where id = p_member_id;
end;
$$;

revoke all on function public.delete_ward_member(uuid) from public, anon;
grant execute on function public.delete_ward_member(uuid) to authenticated;

create or replace function public.set_member_settings(p_member_id uuid, p_patch jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth_user_id uuid;
begin
  if not (select private.can_act_for(p_member_id)) then
    raise exception 'REZET_FORBIDDEN: no puedes editar a ese miembro';
  end if;

  update public.member set
    display_name = coalesce(nullif(btrim(p_patch->>'display_name'), ''), display_name),
    color        = coalesce(nullif(btrim(p_patch->>'color'), ''), color),
    avatar_path  = case when p_patch ? 'avatar_path' then p_patch->>'avatar_path' else avatar_path end,
    sort_order   = coalesce((p_patch->>'sort_order')::int, sort_order),
    kcal_target  = coalesce((p_patch->>'kcal_target')::int, kcal_target)
  where id = p_member_id
  returning auth_user_id into v_auth_user_id;

  -- Espejo en profile mientras haya PWA cacheadas que lean de ahí el nombre.
  if v_auth_user_id is not null and nullif(btrim(p_patch->>'display_name'), '') is not null then
    update public.profile set display_name = btrim(p_patch->>'display_name')
     where id = v_auth_user_id;
  end if;
end;
$$;

revoke all on function public.set_member_settings(uuid, jsonb) from public, anon;
grant execute on function public.set_member_settings(uuid, jsonb) to authenticated;
