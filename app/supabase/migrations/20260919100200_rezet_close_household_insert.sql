-- Auditoría run-3 (rezet-supabase:household:vestigial-insert-policy-allows-unowned-orphan-households).
-- household_insert WITH CHECK (true) y el INSERT a authenticated venían del
-- alta abierta, cuando create_household era SECURITY INVOKER. Desde
-- 20260917220000 es DEFINER y no los necesita: lo único que quedaba era que
-- cualquier sesión, sin hogar incluso, podía crear hogares sin miembros que
-- nadie ve ni borra nunca. Mismo cierre que profile y household_invite.

drop policy if exists household_insert on public.household;
revoke insert on public.household from anon, authenticated;

-- create_household crea hogar y perfil en la misma transacción, así que un
-- hogar sin ningún perfil solo puede venir de ese INSERT directo: nadie
-- puede alcanzarlo, ni tiene recetas ni despensa (RLS lo impide sin perfil).
delete from public.household h
 where not exists (select 1 from public.profile p where p.household_id = h.id);
