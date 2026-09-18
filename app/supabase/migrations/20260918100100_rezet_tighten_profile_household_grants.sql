-- Diseño §3.1: red de seguridad sobre las columnas que deciden pertenencia y
-- rol. El INSERT directo ya está revocado (Fase A); esto cierra el UPDATE y
-- hace que el trigger guardián también mire los INSERT, por si algún día
-- alguien vuelve a conceder INSERT sin darse cuenta.

-- `revoke update (columna)` es INOCUO mientras siga vivo el grant de tabla: este
-- repositorio ya lo comprobó con household.komprapp_list_token (ver la cabecera
-- de 20260917070714 y la corrección de 20260917070845). Hay que quitar el UPDATE
-- de tabla y volver a conceder columna a columna.
revoke update on public.profile from anon, authenticated;
grant update (display_name, locale, theme, accent, units, onboarded_at)
  on public.profile to authenticated;

create or replace function private.protect_profile_household()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if current_user <> 'postgres' then
      raise exception 'REZET_PROFILE_DIRECT_INSERT';
    end if;
    return new;
  end if;

  if new.household_id is distinct from old.household_id then
    raise exception 'household_id no se puede modificar directamente';
  end if;
  if new.is_admin is distinct from old.is_admin and current_user <> 'postgres' then
    raise exception 'is_admin no se puede modificar directamente';
  end if;
  return new;
end;
$$;

drop trigger if exists profile_protect_household_trg on public.profile;
create trigger profile_protect_household_trg
before insert or update on public.profile
for each row execute function private.protect_profile_household();

-- Diseño §3.3: del hogar, el cliente solo debe poder cambiar el nombre y el
-- objetivo de kcal. `komprapp_list_token` ya estaba revocado (20260917070845)
-- y se fija por su propia RPC.
revoke update on public.household from anon, authenticated;
grant update (name, kcal_target) on public.household to authenticated;
