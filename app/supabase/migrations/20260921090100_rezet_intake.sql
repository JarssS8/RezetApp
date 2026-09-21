-- Diseño §6.2 — el registro personal de consumo.
--
-- Dos tablas y una ausencia:
--   intake_share  la EXCEPCIÓN al "una ración por persona". El valor por
--                 defecto es implícito: cocinar suma a todos sin escribir
--                 ninguna fila, así que solo lo raro ocupa espacio.
--   intake_extra  lo que se come fuera del plan.
--   (no hay tabla de favoritos: los favoritos son una CONSULTA sobre
--    intake_extra, agrupando lo que más se repite. Una tabla menos, un
--    contador de uso menos, una cuota menos, y la misma experiencia.)

create table public.intake_share (
  member_id     uuid not null references public.member(id) on delete cascade,
  plan_entry_id uuid not null references public.plan_entry(id) on delete cascade,
  servings      numeric(4,2) not null check (servings between 0 and 6),
  updated_at    timestamptz not null default now(),
  primary key (member_id, plan_entry_id)
);

create table public.intake_extra (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.household(id) on delete cascade,
  member_id     uuid not null references public.member(id) on delete cascade,
  date          date not null,
  label         text not null,
  kcal          int  not null check (kcal between 0 and 10000),
  source        text not null check (source in ('manual','recipe','barcode')),
  recipe_id     uuid references public.recipe(id) on delete set null,
  -- Distingue "lo registré yo" de "me lo registró mi padre": hace falta para
  -- el nivel tutelado y para que el historial se pueda leer.
  created_by    uuid references public.member(id) on delete set null,
  created_at    timestamptz not null default now()
);

create index intake_extra_member_date_idx on public.intake_extra (member_id, date);
create index intake_extra_household_idx on public.intake_extra (household_id);

alter table public.intake_share enable row level security;
alter table public.intake_extra enable row level security;

-- RLS POR MIEMBRO, no por hogar: el diario de comidas de quien tiene cuenta
-- es suyo. `household_id` en intake_extra existe para la cascada y para
-- anclar la integridad (el trigger de abajo), NUNCA como predicado de
-- lectura: con `household_id = current_household()` toda la casa leería lo
-- que come cada uno.
create policy intake_share_rw on public.intake_share for all
  to authenticated
  using ((select private.can_act_for(intake_share.member_id)))
  with check ((select private.can_act_for(intake_share.member_id)));

create policy intake_extra_rw on public.intake_extra for all
  to authenticated
  using ((select private.can_act_for(intake_extra.member_id)))
  with check ((select private.can_act_for(intake_extra.member_id)));

revoke all on public.intake_share from anon, authenticated;
grant select, insert, update, delete on public.intake_share to authenticated;
revoke all on public.intake_extra from anon, authenticated;
grant select, insert, update, delete on public.intake_extra to authenticated;

-- Mismo enfoque que 20260919100400: una fila no puede apuntar a un miembro o
-- una receta de otro hogar. La RLS acota quién escribe; esto acota QUÉ.
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

  return new;
end;
$$;

drop trigger if exists intake_extra_refs_trg on public.intake_extra;
create trigger intake_extra_refs_trg
before insert or update on public.intake_extra
for each row execute function private.check_intake_extra_refs();
