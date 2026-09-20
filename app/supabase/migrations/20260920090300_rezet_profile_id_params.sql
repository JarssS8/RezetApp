-- Diseño §3.6, corregido durante la implementación.
--
-- La intención era renombrar `p_member_id` a `p_profile_id` en las tres RPC
-- que reciben un id de `profile`, para que ese nombre significara siempre un
-- id de `member`. No se puede: Postgres rechaza dos funciones que difieran
-- solo en el nombre del parámetro (misma firma = duplicada), y PostgREST
-- resuelve la llamada por nombre. Renombrar rompería expulsar, promover y
-- degradar en cualquier PWA cacheada, y este esquema ya decidió (§3.1) no
-- romper a los clientes viejos.
--
-- Así que el nombre se queda y la distinción se documenta aquí y se vigila
-- en el cliente con tipos marcados (ProfileId / MemberId).

comment on function public.remove_member(uuid) is
  'p_member_id es un id de public.profile (cuenta), NO de public.member. Para quitar un miembro sin cuenta: delete_ward_member(member.id).';

comment on function public.promote_admin(uuid) is
  'p_member_id es un id de public.profile (cuenta), NO de public.member.';

comment on function public.demote_admin(uuid) is
  'p_member_id es un id de public.profile (cuenta), NO de public.member.';
