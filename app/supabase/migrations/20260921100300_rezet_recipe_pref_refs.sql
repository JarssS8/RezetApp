-- Cierre de hallazgo de revisión sobre 20260921100100_rezet_recipe_pref.sql:
-- la política de escritura (`member_recipe_pref_write`) solo comprueba que
-- el MIEMBRO sea tuyo (`can_act_for`), no que la RECETA apuntada sea de tu
-- mismo hogar. Un miembro puede votar sobre su propia fila apuntando al id
-- de una receta de otro hogar si lo conoce o lo adivina: no le deja votar
-- por otra persona, pero sí reproduce el mismo "oráculo de existencia de
-- ids ajenos" que 20260921090300 cerró para `intake_extra`
-- (`check_intake_extra_refs`) — un uuid válido de otro hogar inserta, uno
-- inexistente viola la FK, y esa diferencia de comportamiento ya basta para
-- confirmar que la receta existe. Mismo patrón: un trigger, porque lo que
-- falta no es "quién puede escribir" (eso ya lo cubre la RLS) sino "sobre
-- qué fila puede apuntar".
--
-- Diferencia con intake_extra: esa tabla guarda su propio household_id en
-- la fila; member_recipe_pref no tiene esa columna, así que el hogar se
-- resuelve con un join desde member hasta la receta.
create or replace function private.check_recipe_pref_refs()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1
      from public.member m
      join public.recipe r on r.id = new.recipe_id
     where m.id = new.member_id
       and m.household_id = r.household_id
  ) then
    raise exception 'REZET_FOREIGN_HOUSEHOLD: esa receta no es de ese hogar';
  end if;

  return new;
end;
$$;

drop trigger if exists member_recipe_pref_refs_trg on public.member_recipe_pref;
create trigger member_recipe_pref_refs_trg
before insert or update on public.member_recipe_pref
for each row execute function private.check_recipe_pref_refs();
