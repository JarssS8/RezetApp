-- Diseño §3.2 y §6.1 — datos corporales, nivel de privacidad "propio".
--
-- Por qué una tabla aparte y no columnas en `profile`: la política de SELECT
-- de `profile` es de HOGAR (20260905131217:332), así que una columna
-- `weight_kg` ahí sería legible por tu pareja el día que se añadiera. En
-- Postgres no hay seguridad por columna para SELECT: la única separación
-- real es otra tabla con su propia política.

create table public.member_body (
  member_id   uuid primary key references public.member(id) on delete cascade,
  sex         text check (sex in ('female','male')),   -- null = no declarado
  birth_year  int  check (birth_year between 1900 and 2100),
  height_cm   numeric(5,1) check (height_cm between 50 and 250),
  weight_kg   numeric(5,1) check (weight_kg between 15 and 400),
  activity    text not null default 'sedentary'
              check (activity in ('sedentary','light','moderate','active','very_active')),
  goal        text not null default 'maintain' check (goal in ('lose','maintain','gain')),
  updated_at  timestamptz not null default now()
);

alter table public.member_body enable row level security;

-- `can_act_for` ya comprueba las tres condiciones que hacen falta: mismo
-- hogar, fila propia o tutelado explícito, y no borrado. No se reimplementan
-- aquí: un solo predicado para todas las tablas personales.
create policy member_body_rw on public.member_body for all
  to authenticated
  using ((select private.can_act_for(member_body.member_id)))
  with check ((select private.can_act_for(member_body.member_id)));

-- Sin escritura directa: solo por RPC, que además mantiene `kcal_target`.
revoke all on public.member_body from anon, authenticated;
grant select on public.member_body to authenticated;

-- El objetivo llega YA CALCULADO. La fórmula (Mifflin-St Jeor) vive en
-- `app/src/domain/nutrition.ts` y solo ahí: implementarla también en
-- PL/pgSQL sería una segunda copia de una regla de negocio, y dos copias
-- divergen. La base de datos sigue validando el rango con el `check` de
-- `member.kcal_target`.
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

-- Diseño §3.2, cinturón además de tirantes: los datos corporales NO
-- sobreviven a la salida del hogar en ninguna forma. La fila de `member` se
-- conserva (borrado lógico, para la atribución del historial); esto no.
create or replace function private.drop_member_body_on_profile_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  delete from public.member_body
   where member_id in (select id from public.member where auth_user_id = old.id);
  return old;
end;
$$;

drop trigger if exists profile_delete_drop_body_trg on public.profile;
create trigger profile_delete_drop_body_trg
before delete on public.profile
for each row execute function private.drop_member_body_on_profile_delete();
