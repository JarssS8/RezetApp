-- INSERT ... RETURNING exige que la fila recién creada pase también la
-- política de SELECT de household — y en este punto el usuario todavía no
-- tiene profile, así que current_household() da null y la rechaza, aunque
-- el INSERT en sí sea válido (with check true). Se evita generando el id
-- antes, sin pedir RETURNING.
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

  insert into public.household (id, name) values (v_household_id, p_name);
  insert into public.profile (id, household_id, display_name)
    values ((select auth.uid()), v_household_id, p_display_name);

  return v_household_id;
end;
$$;

revoke all on function public.create_household(text, text) from public;
revoke execute on function public.create_household(text, text) from anon;
grant execute on function public.create_household(text, text) to authenticated;
