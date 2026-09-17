-- The prior migration (revoke_column_update_komprapp_list_token) revoked
-- UPDATE(komprapp_list_token) column-level, but verification with
-- has_column_privilege() showed it had NO effect: Supabase's default
-- project setup grants authenticated/anon blanket table-level ALL
-- privileges on every public table (relacl shows
-- anon=arwdDxtm/postgres, authenticated=arwdDxtm/postgres on household),
-- and in Postgres a table-level UPDATE grant subsumes any column-level
-- REVOKE — has_column_privilege('authenticated', 'household',
-- 'komprapp_list_token', 'UPDATE') was still true after that migration.
--
-- The only way to actually block UPDATE on this one column while leaving
-- every other column exactly as updatable as before is to revoke the
-- table-level UPDATE grant and re-grant UPDATE column-by-column for
-- every OTHER column household has (id, name, kcal_target, created_at) —
-- reproducing prior effective permissions on those columns exactly,
-- while leaving komprapp_list_token out.
REVOKE UPDATE ON public.household FROM anon, authenticated;
GRANT UPDATE (id, name, kcal_target, created_at) ON public.household TO anon, authenticated;
