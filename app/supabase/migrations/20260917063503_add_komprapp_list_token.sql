-- Vincula un hogar de Rezet a una lista de komprapp (repo ShoppingList) por
-- su token de compartir, para que cualquier miembro del hogar pueda
-- importar la lista de la compra con un botón, sin configurar nada cada
-- vez. Ver docs/superpowers/specs/2026-09-17-komprapp-direct-import-design.md.

ALTER TABLE household ADD COLUMN IF NOT EXISTS komprapp_list_token text;

-- Todas las mutaciones de household pasan por RPC en este repo (ver
-- promote_admin/leave_household/delete_household) — nunca un .update()
-- crudo desde el cliente. SECURITY DEFINER + exigir que quien llama sea
-- ADMIN del hogar (no basta con ser miembro): esto redirige la lista de la
-- compra de TODO el hogar hacia una lista de komprapp elegida por quien la
-- pegue — mismo nivel de gravedad que deleteHousehold, no el de un cambio
-- de preferencia personal.
CREATE OR REPLACE FUNCTION set_komprapp_list_token(p_token text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_household_id uuid;
  v_is_admin boolean;
  v_token text;
BEGIN
  SELECT household_id, is_admin INTO v_household_id, v_is_admin
    FROM public.profile WHERE id = auth.uid();

  IF v_household_id IS NULL THEN
    RAISE EXCEPTION 'not a household member';
  END IF;
  IF NOT COALESCE(v_is_admin, false) THEN
    RAISE EXCEPTION 'must be a household admin';
  END IF;

  v_token := NULLIF(lower(trim(both from p_token)), '');
  IF v_token IS NOT NULL AND v_token !~ '^[a-z0-9-]{3,64}$' THEN
    RAISE EXCEPTION 'invalid token format';
  END IF;

  UPDATE public.household
     SET komprapp_list_token = v_token
   WHERE id = v_household_id;
END;
$$;

REVOKE ALL ON FUNCTION set_komprapp_list_token(text) FROM public;
GRANT EXECUTE ON FUNCTION set_komprapp_list_token(text) TO authenticated;
