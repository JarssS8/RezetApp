-- Supabase's default privileges on schema public auto-grant EXECUTE to
-- anon/authenticated/service_role at function-creation time; REVOKE ALL
-- FROM PUBLIC in the prior migration does not remove this explicit
-- per-role grant. This RPC must never be callable by anon (it mutates a
-- household's shared data), so revoke that grant explicitly.
REVOKE EXECUTE ON FUNCTION set_komprapp_list_token(text) FROM anon;
