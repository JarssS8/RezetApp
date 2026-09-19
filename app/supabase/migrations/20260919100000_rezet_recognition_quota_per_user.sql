-- Auditoría run-3 (recognize-pantry-item/unbounded-gemini-spend).
-- El contador de la cuota colgaba de profile con ON DELETE CASCADE, así que
-- delete_household → create_household (o leave_household → redeem_invite)
-- borraba el historial y recreaba el perfil con el mismo auth.uid(): cuota
-- nueva sin límite. La cuota es del usuario de auth, no de su fila de perfil.
-- Sigue borrándose con la cuenta (delete_account borra auth.users).

alter table public.recognition_usage
  drop constraint if exists recognition_usage_profile_id_fkey;

alter table public.recognition_usage
  add constraint recognition_usage_profile_id_fkey
  foreign key (profile_id) references auth.users(id) on delete cascade;

comment on column public.recognition_usage.profile_id is
  'id de auth.users (no de profile): salir, borrar o recrear el hogar no reinicia la cuota';
