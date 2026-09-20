-- Revisión final de la rama de fundación de miembro: tres invariantes de
-- `member` que hasta ahora solo vivían en el código que las llama, no en el
-- esquema.

-- 1) "Al salir del hogar se marca deleted_at" estaba copiada a mano en tres
-- cuerpos de función (leave_household, delete_account, remove_member —
-- 20260920090200). Si una cuenta se borra por fuera de esas rutas (panel de
-- Supabase, Admin API), la cascada de auth.users se lleva `profile`,
-- `member.auth_user_id` queda a null (`on delete set null`) y `deleted_at`
-- nunca se pone: una fila que sale en Personas para siempre, que nadie puede
-- editar ni borrar, y que solo se arregla con SQL a mano. Un trigger BEFORE
-- DELETE en `profile` hace de esto una propiedad del esquema: se dispara
-- antes de que el borrado surta efecto y, por tanto, antes de que la FK de
-- `member.auth_user_id` la ponga a null — `old.id` todavía identifica al
-- miembro correcto. No sustituye las tres copias existentes (siguen siendo
-- el camino normal y no está de más que actúen ya, sin esperar al commit
-- del trigger); esto es la red de seguridad para cuando alguien las salta.
create or replace function private.mark_member_deleted_on_profile_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update public.member set deleted_at = now()
   where auth_user_id = old.id and deleted_at is null;
  return old;
end;
$$;

drop trigger if exists profile_delete_mark_member_trg on public.profile;
create trigger profile_delete_mark_member_trg
before delete on public.profile
for each row execute function private.mark_member_deleted_on_profile_delete();

-- 2) La tutela es explícita (comentario de la columna en
-- 20260920090000_rezet_member_foundation.sql), pero nada impedía que un
-- tutelado tuviera cuenta propia a la vez — un PATCH directo o un bug de RPC
-- podía dejar `is_ward = true` con `auth_user_id` no nulo. NOT VALID: no
-- revalida filas ya existentes, igual que las demás checks añadidas después
-- de crear la tabla (member_avatar_path_own_folder en 20260920090400).
alter table public.member
  add constraint member_ward_has_no_account
  check (not (is_ward and auth_user_id is not null)) not valid;

-- 3) `color` aceptaba cualquier texto. Los siete acentos válidos son
-- `app/src/store/prefs.tsx::ACCENTS`; sin este check, un PATCH directo deja
-- un valor que `ACCENTS[color]` no resuelve (`undefined`) y el avatar se
-- queda sin fondo. NOT VALID por el mismo motivo que el punto anterior.
alter table public.member
  add constraint member_color_valid
  check (color in ('green', 'amber', 'coral', 'blue', 'pink', 'violet', 'teal')) not valid;
