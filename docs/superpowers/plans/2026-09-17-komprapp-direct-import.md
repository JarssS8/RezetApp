# Importar directo a komprapp (un toque, vinculado por hogar) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A household in Rezet links itself once to a komprapp shopping list (by pasting a token/link in Settings); after that, any household member's Rezet client can import checked shopping-list items into that list with one button tap — no copying, no opening komprapp.

**Architecture:** komprapp gains one new `SECURITY DEFINER` Postgres function, `import_shopping_items(p_token, p_items)`, that validates the token and inserts rows into `products` for that list only — never a raw table write, so komprapp's existing wide-open `lists`/`products` RLS is not a factor for this new path. Rezet gains a matching `set_komprapp_list_token` RPC (household-scoped, mirrors its existing `promote_admin` pattern) plus a new Store field/action, a Settings sheet to paste the token, and a `src/data/komprapp.ts` module that calls komprapp's RPC directly with a second Supabase client. The button in `ShoppingSheet` uses direct import when a token is linked, and falls back to the already-shipped copy-a-link flow (2026-09-16 work) when it isn't.

**Tech Stack:** Rezet: TypeScript, React, TanStack Query, Supabase (Postgres/plpgsql), Vitest. komprapp: plain `<script type="text/babel">` files, Supabase (Postgres/plpgsql) applied manually via its dashboard SQL editor (this repo's established migration method — see `supabase/SUPABASE_MIGRATION_DELETE.sql`'s header comment).

**Spec:** `docs/superpowers/specs/2026-09-17-komprapp-direct-import-design.md` (supersedes/extends `docs/superpowers/specs/2026-09-16-komprapp-shopping-export-design.md` — read both; the new spec explains exactly what changed and why).

## Global Constraints

- The new komprapp RPC must be `SECURITY DEFINER`, validate the token server-side, cap the items array at 100, whitelist `unit` to `g`/`kg`/`ml`/`L`/`paq` (anything else stored as `null`), and clamp `name` to 200 characters — never trust client-supplied shape beyond what's validated in SQL.
- The new komprapp RPC must NOT alter any existing RLS policy on `lists`/`products` — it is a parallel, narrower door, not a fix to the pre-existing wide-open policies (those are out of scope, per the spec).
- Rezet must never write to komprapp's `lists`/`products` tables directly (no raw REST insert/update/select from the Rezet codebase) — the only touchpoint is the one RPC call.
- All `household` table mutations in Rezet go through a Postgres RPC called via `supabase.rpc(...)`, matching the existing convention (`promoteAdmin`, `leaveHousehold`, `deleteHousehold`) — never a raw `.update()` on `household` from client code.
- Demo mode (`store.tsx`) has no real household/backend — `setKomprappListToken` in demo mode must reuse the existing `demoHouseholdActionUnavailable()` pattern (see `store.tsx:85-87`, already used by `leaveHousehold`/`deleteHousehold`/`deleteAccount`).
- Business-rule/parsing code (the token-extraction function) lives in `app/src/domain/`, pure, covered by a Vitest test — per this repo's non-negotiable "business rules live in domain/ only" rule.
- The already-shipped copy-a-link flow (2026-09-16) is not removed or modified in its own behavior — it becomes the fallback path when no token is linked.
- No new Supabase migration/RPC is applied to a live project by an implementer without following the exact method each repo already uses: Rezet's via `mcp__supabase__apply_migration` (this repo's documented, routine workflow — see `CLAUDE.md`'s Migrations section), komprapp's by writing a `supabase/SUPABASE_MIGRATION_*.sql` file for a human to run in its Supabase dashboard SQL editor (komprapp has no CLI/MCP-driven migration workflow — every existing `SUPABASE_MIGRATION_*.sql` file in that repo says so in its own header comment).
- This repo's local checkout has no `supabase/` directory even though `CLAUDE.md` documents one — treat the live Supabase project (via `mcp__supabase__list_tables`/`list_migrations`) as the actual source of truth for Rezet's schema, and create `supabase/migrations/` if it doesn't exist yet.
- **This plan's branch must fork from `feature/komprapp-export`, not `main`** — the 2026-09-16 work isn't merged yet (verified: `main` is at `8c05b02`, docs-only; the actual feature commits `f90d25a`/`ab0f9b9` live only on `feature/komprapp-export`). Task 6 depends on files that branch added. Similarly, komprapp's `#/import/` deep-link handler (the fallback path's receiving side) lives only on komprapp's own `feature/import-from-rezet` branch, not its `main` — this plan doesn't touch komprapp's app code so it isn't blocked by that, but the fallback won't work end-to-end against komprapp's `main` until that branch also merges. Note this for the user; don't try to merge either branch yourself as part of this plan.
- The `import_shopping_items` RPC does not make the share token a real secret — komprapp's existing `lists` table already has a fully public `SELECT` RLS policy (`USING (true)`), so anyone with komprapp's anon key can already enumerate every list's token via plain REST regardless of anything this plan does. Frame the new RPC honestly in code comments as "no worse than what already exists," not as "the token is now a real credential" — it isn't, and fixing that is explicitly out of scope (it's komprapp's pre-existing problem).

---

## Task 1: komprapp — `import_shopping_items` RPC

**Files:**
- Create: `/home/jars/Programing/ShoppingList/supabase/SUPABASE_MIGRATION_IMPORT_RPC.sql`

**Interfaces:**
- Consumes: nothing (new SQL function, no dependency on other tasks).
- Produces (used by Task 6): a Postgres function `import_shopping_items(p_token text, p_items jsonb) RETURNS integer`, callable via PostgREST as `POST /rest/v1/rpc/import_shopping_items` with body `{"p_token": "...", "p_items": [{"name": "...", "quantity": 1, "unit": "g"}, ...]}`, granted to `anon` and `authenticated`. Returns the count of rows actually inserted (items with an empty/blank name after trimming are silently skipped, not counted, not erroring the whole call).

This repo has no CLI-driven migration workflow — you are writing a `.sql` file for a human to paste into the Supabase Dashboard SQL editor for komprapp's project, exactly like the existing `supabase/SUPABASE_MIGRATION_DELETE.sql`/`SUPABASE_MIGRATION_AUTH.sql` files in this same directory. **Do not attempt to apply this migration yourself** (you likely don't have MCP/CLI access to komprapp's Supabase project from this repo, and even if you did, this repo's convention is manual application) — writing the file correctly is the task's deliverable.

- [ ] **Step 1: Read `products` and `lists` table shape for accuracy**

Read `/home/jars/Programing/ShoppingList/src/supabase.jsx` (the `productLocalToDb`/`listLocalToDb` functions, around lines 93-155) and `/home/jars/Programing/ShoppingList/supabase/SUPABASE_MIGRATION_UNITS.sql` to confirm: `products.quantity` is `TEXT` (not numeric — client code always does `String(q)` before insert), `products.unit` is a nullable `text` column allowing `null | 'g' | 'kg' | 'ml' | 'L' | 'paq'`, `products.category` is nullable, `lists.token` is the share-token column. If anything here contradicts what this brief assumes, write the SQL to match the real schema, not this brief.

- [ ] **Step 2: Write the migration file**

Create `/home/jars/Programing/ShoppingList/supabase/SUPABASE_MIGRATION_IMPORT_RPC.sql`:

```sql
-- RPC de importación directa desde Rezet (o cualquier otro cliente que
-- conozca el token de una lista): añade productos a ESA lista concreta sin
-- dar lectura, borrado ni renombrado — a diferencia del flujo "unirse a
-- lista" (que ya da acceso de lectura+escritura total a quien conozca el
-- token), esta función solo puede INSERTAR filas en products. No cambia
-- ninguna política RLS existente de lists/products.
-- Ejecutar en: Supabase Dashboard → SQL Editor (proyecto de komprapp).

CREATE OR REPLACE FUNCTION import_shopping_items(p_token text, p_items jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_list_id uuid;
  v_item jsonb;
  v_name text;
  v_quantity numeric;
  v_unit text;
  v_count integer := 0;
  v_calls integer;
  v_rows integer;
BEGIN
  -- Token de formato inesperado: ni lo busques (evita búsquedas sobre
  -- strings arbitrariamente largos que alguien mande por probar).
  IF p_token IS NULL OR p_token !~ '^[a-z0-9-]{3,64}$' THEN
    RAISE EXCEPTION 'list not found';
  END IF;

  SELECT id INTO v_list_id FROM public.lists WHERE token = lower(p_token);
  IF v_list_id IS NULL THEN
    RAISE EXCEPTION 'list not found';
  END IF;

  IF jsonb_typeof(p_items) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'p_items must be a JSON array';
  END IF;

  IF jsonb_array_length(p_items) > 100 THEN
    RAISE EXCEPTION 'too many items (max 100)';
  END IF;

  -- Tope de tamaño total: 100 items no acota un payload con nombres
  -- gigantes o claves basura repetidas.
  IF pg_column_size(p_items) > 65536 THEN
    RAISE EXCEPTION 'payload too large';
  END IF;

  -- Límite de tasa barato, en profundidad: no arregla el problema real
  -- (la RLS pública de `lists`/`products` ya permite lo mismo sin pasar por
  -- aquí — ver nota en el plan), pero evita que ESTA función en concreto se
  -- use para spamear una lista de forma automatizada y silenciosa una vez
  -- que alguien tenga el token. Ventana de 10 minutos, máx. 20 llamadas o
  -- 500 filas por lista.
  INSERT INTO public.import_rate_limit (list_id, window_start, calls, rows_inserted)
  VALUES (v_list_id, date_trunc('hour', now()) + (extract(minute from now())::int / 10) * interval '10 min', 1, 0)
  ON CONFLICT (list_id, window_start)
  DO UPDATE SET calls = public.import_rate_limit.calls + 1
  RETURNING calls, rows_inserted INTO v_calls, v_rows;

  IF v_calls > 20 OR v_rows > 500 THEN
    RAISE EXCEPTION 'rate limit exceeded, try again later';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_name := trim(both from (v_item->>'name'));
    IF v_name IS NULL OR v_name = '' THEN
      CONTINUE;
    END IF;
    -- Quita caracteres de control y overrides de dirección de texto (RTL)
    -- antes del recorte a 200 — trim() solo quita espacios normales.
    v_name := left(regexp_replace(v_name, '[\x01-\x1F\x7F​-‏‪-‮]', '', 'g'), 200);
    IF v_name = '' THEN
      CONTINUE;
    END IF;

    BEGIN
      v_quantity := (v_item->>'quantity')::numeric;
    EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
      v_quantity := NULL;
    END;
    IF v_quantity IS NOT NULL AND (v_quantity <= 0 OR v_quantity != v_quantity OR v_quantity > 100000) THEN
      v_quantity := NULL;
    END IF;

    v_unit := v_item->>'unit';
    IF v_unit IS NULL OR v_unit NOT IN ('g', 'kg', 'ml', 'L', 'paq') THEN
      v_unit := NULL;
    END IF;

    INSERT INTO public.products (id, list_id, name, quantity, unit, category, is_purchased, is_archived, added_at)
    VALUES (
      gen_random_uuid(),
      v_list_id,
      v_name,
      CASE WHEN v_quantity IS NULL THEN NULL ELSE v_quantity::text END,
      v_unit,
      NULL,
      false,
      false,
      now()
    );
    v_count := v_count + 1;
  END LOOP;

  UPDATE public.import_rate_limit
     SET rows_inserted = rows_inserted + v_count
   WHERE list_id = v_list_id
     AND window_start = date_trunc('hour', now()) + (extract(minute from now())::int / 10) * interval '10 min';

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION import_shopping_items(text, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION import_shopping_items(text, jsonb) TO anon, authenticated;
```

The rate-limit table this function writes to (create it first, before the function, in the same migration file):

```sql
CREATE TABLE IF NOT EXISTS import_rate_limit (
  list_id uuid NOT NULL,
  window_start timestamptz NOT NULL,
  calls integer NOT NULL DEFAULT 0,
  rows_inserted integer NOT NULL DEFAULT 0,
  PRIMARY KEY (list_id, window_start)
);
-- Sin RLS pública a propósito: solo la función SECURITY DEFINER de arriba
-- la toca. No conceder acceso a anon/authenticated sobre esta tabla.
```

`v_quantity != v_quantity` is the standard SQL idiom for "is NaN" (NaN is the only value not equal to itself); `'Infinity'::numeric > 100000` is caught by the existing upper-bound check.

**`SET search_path = ''`** (not `public`) plus explicit `public.` qualification on every table reference — this is what actually closes the search-path-hijacking risk `SECURITY DEFINER` functions are prone to (an empty search path can't be poisoned by a same-named object created in another schema, whereas `SET search_path = public` still resolves unqualified names through `public` on the caller's terms). `delete_my_data()` in this repo uses the older, weaker `SET search_path = public` pattern — don't copy that part of it, even though the rest of its shape (REVOKE/GRANT, `SECURITY DEFINER`, exception handling) is the right precedent to follow.

If Step 1 found `unit` doesn't exist as a column (the UNITS migration is optional/gracefully-degrading per its own header comment), drop the `unit` column from the `INSERT` and the `v_unit` handling entirely rather than inserting into a column that might not exist — note this explicitly in your report either way.

**Known accepted gap, not to fix in this task**: unlike komprapp's own `addItem()` (which also writes a `history_logs` row via `enqueue('addHistory', ...)`, `core.jsx:735`), this RPC does not create a history-log entry for imported items — decide this is fine for v1 (imported items just appear, without an "added by Rezet" history trail) rather than also inserting into `history_logs`, since that table's schema/expected fields aren't part of this plan's research. Note it in your report so the user can ask for it later if they want it.

- [ ] **Step 3: Self-review the SQL**

Read it back once. Confirm: the function only ever touches rows matching the resolved `v_list_id` (no path inserts into any other list), the item-count cap raises before any insert happens (not a partial-then-fail), and `REVOKE`/`GRANT` are present so the function isn't left executable by roles it shouldn't be.

- [ ] **Step 4: Report**

Write your report to: `/home/jars/Programing/Rezet/.worktrees/komprapp-direct-import/.superpowers/sdd/2026-09-17-komprapp-direct-import/task-1-report.md` (create directories as needed).

Include: what you wrote, what Step 1's schema check found (and whether it matched or required changes), any concerns.

Then reply with ONLY (under 15 lines):
- **Status:** DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
- One-line summary of what the SQL does
- Concerns, if any (e.g. schema mismatches found)
- The report file path

**No commit in this task** — this file lives in the komprapp (`ShoppingList`) repo, but there is no active worktree for that repo in this plan (the SQL is applied manually, not through this plan's own git flow). Just leave the file written; the controller will decide separately how to hand it to the user for manual application. (If you do have write access to a `/home/jars/Programing/ShoppingList` worktree from a prior plan, do NOT reuse it — write the file at the absolute path above regardless of what's checked out there, and do not run any git commands in that repo.)

---

## Task 2: Rezet — `household.komprapp_list_token` column + `set_komprapp_list_token` RPC

**Files:**
- Create: a new file under `/home/jars/Programing/Rezet/.worktrees/komprapp-direct-import/supabase/migrations/` (create the directory if it doesn't exist) — name it with today's UTC timestamp prefix in the form `YYYYMMDDHHMMSS_add_komprapp_list_token.sql` as a placeholder; **the real filename must be renamed to match whatever version `mcp__supabase__apply_migration` records**, per this repo's own documented convention (`CLAUDE.md`'s Migrations section) — do this renaming as part of this task, not left for later.

**Interfaces:**
- Consumes: nothing.
- Produces (used by Task 4): a nullable `household.komprapp_list_token text` column, and a Postgres function `set_komprapp_list_token(p_token text) RETURNS void`, callable via `supabase.rpc('set_komprapp_list_token', { p_token })` from an authenticated Rezet session, granted to `authenticated` only (never `anon` — unlike komprapp's RPC, this one touches Rezet's own household data and requires a real signed-in Rezet user).

- [ ] **Step 1: Inspect the live schema**

Use `mcp__supabase__list_tables` (schema `public`, `verbose: true`) to confirm the exact column names on `household` and `profile` (this brief assumes `household.id`, `household.komprapp_list_token` doesn't exist yet, and `profile.id` / `profile.household_id` — a signed-in user's row linking them to their household, per `CLAUDE.md`'s description of `CreateOrJoinHousehold`). Also run `mcp__supabase__list_migrations` to find the current latest migration version, so your new file's timestamp prefix sorts after it. If any assumed column/table name is wrong, adjust the SQL below to match reality — do not blindly paste it.

- [ ] **Step 2: Write the migration**

```sql
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
```

**Verify `profile.is_admin` is the real column name before pasting this** — Step 1 already has you inspect the live schema; specifically confirm this by reading `promote_admin`'s actual definition (`SELECT prosrc FROM pg_proc WHERE proname = 'promote_admin';` via `mcp__supabase__execute_sql`) and copy its exact admin-check expression rather than assuming `profile.is_admin` is spelled that way — `supabaseStore.tsx:292` references `is_admin` from a members query, but the RPC's own internal check may use a different join (e.g. a household_member table) that you should match exactly.

- [ ] **Step 3: Apply it to the live project**

Use `mcp__supabase__apply_migration` with this SQL, a descriptive `name` (e.g. `add_komprapp_list_token`). Note the version it records. Rename your local file so its prefix matches that exact version, per this repo's documented convention (`apply_migration` records the time it ran, not your file name — CI's `supabase db push` will try to reapply otherwise).

- [ ] **Step 4: Verify live**

Run `mcp__supabase__execute_sql` with `SELECT set_komprapp_list_token('test-token-123');` while impersonating... — you likely can't easily impersonate an authenticated user via this tool. Instead, verify more simply: `SELECT komprapp_list_token FROM household LIMIT 1;` to confirm the column exists and is queryable, and read back the function definition with `SELECT prosecdef, proacl FROM pg_proc WHERE proname = 'set_komprapp_list_token';` (or equivalent) to confirm `SECURITY DEFINER` is set and the grants match. Full authenticated-call verification happens naturally in Task 4/5's manual testing once the UI exists.

- [ ] **Step 5: Commit the migration file**

Work from: `/home/jars/Programing/Rezet/.worktrees/komprapp-direct-import` (this plan's worktree — create it via `superpowers:using-git-worktrees` conventions if the controller hasn't already). **Branch `feature/komprapp-direct-import` off `feature/komprapp-export`, NOT off `main`** — the 2026-09-16 work (`komprappExport.ts`, the `shareToKomprapp` button, `toKomprappItem`) is not yet merged to `main` (`main` is still at `8c05b02`, docs-only); it lives on `feature/komprapp-export` (commits `f90d25a`/`ab0f9b9`). Task 6 of this plan imports `../domain/komprappExport` and modifies the button that branch added — branching off `main` would make those files not exist yet.

```bash
git add supabase/migrations/<final-renamed-file>.sql
git commit -m "$(cat <<'EOF'
feat(household): add komprapp_list_token column and linking RPC

EOF
)"
```
(append your own session's attribution footer before the closing `EOF`, per this repo's convention — don't hardcode a specific model name here since whichever session executes this may differ)

- [ ] **Step 6: Report**

Write your report to: `/home/jars/Programing/Rezet/.worktrees/komprapp-direct-import/.superpowers/sdd/2026-09-17-komprapp-direct-import/task-2-report.md`

Then reply with ONLY (under 15 lines):
- **Status:** DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
- Commit (short SHA + subject), migration version applied
- One-line verification summary
- Concerns, if any (e.g. schema assumptions that needed correcting)
- The report file path

---

## Task 3: Rezet — pure token-extraction domain function

**Files:**
- Create: `app/src/domain/komprappToken.ts`
- Test: `app/src/domain/__tests__/komprappToken.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces (used by Task 5): `export function extractKomprappToken(raw: string): string` — given a pasted komprapp share link or bare token, returns the bare lowercase token, or `''` if the input is empty/whitespace. Mirrors komprapp's own `extractToken()` (`ShoppingList/src/smart-input.jsx:665-682`), which this must stay compatible with (same accepted formats), without importing anything from that repo (this is Rezet's own copy of the same small parsing rule, since the two repos share no code).

- [ ] **Step 1: Write the failing test**

Create `app/src/domain/__tests__/komprappToken.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { extractKomprappToken } from '../komprappToken';

describe('extractKomprappToken', () => {
  it('extrae el token de un enlace completo con hash /#/s/<token>', () => {
    expect(extractKomprappToken('https://shop.jarsss8.es/#/s/abc-def-ghi')).toBe('abc-def-ghi');
  });

  it('extrae el token de un enlace con /shared/<token>', () => {
    expect(extractKomprappToken('https://shop.jarsss8.es/shared/xyz-123-456')).toBe('xyz-123-456');
  });

  it('acepta un token pelado, sin URL alrededor', () => {
    expect(extractKomprappToken('abc-def-ghi')).toBe('abc-def-ghi');
  });

  it('normaliza a minúsculas', () => {
    expect(extractKomprappToken('ABC-DEF-GHI')).toBe('abc-def-ghi');
  });

  it('recorta espacios en los extremos', () => {
    expect(extractKomprappToken('  abc-def-ghi  ')).toBe('abc-def-ghi');
  });

  it('devuelve cadena vacía si la entrada está vacía o es solo espacios', () => {
    expect(extractKomprappToken('')).toBe('');
    expect(extractKomprappToken('   ')).toBe('');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app && npx vitest run src/domain/__tests__/komprappToken.test.ts`
Expected: FAIL — `Cannot find module '../komprappToken'`

- [ ] **Step 3: Write the implementation**

Create `app/src/domain/komprappToken.ts`:

```ts
/**
 * Extrae el token de una lista de komprapp (repo `ShoppingList`) a partir
 * de lo que el usuario pegue: un enlace completo (`/#/s/<token>` o
 * `/shared/<token>`) o el token pelado. Espejo puro, en este repo, de
 * `extractToken()` en `ShoppingList/src/smart-input.jsx` — debe aceptar los
 * mismos formatos, pero no comparte código con ese repo (no hay import
 * cruzado entre los dos proyectos).
 */
const TOKEN_RE = /\/(?:s|shared)\/([^/?#&\s]+)/i;

export function extractKomprappToken(raw: string): string {
  const s = raw.trim();
  if (!s) return '';
  try {
    const u = new URL(s);
    const hashMatch = u.hash.match(TOKEN_RE);
    if (hashMatch) return hashMatch[1].toLowerCase();
    const pathMatch = u.pathname.match(TOKEN_RE);
    if (pathMatch) return pathMatch[1].toLowerCase();
  } catch {
    /* no era una URL completa */
  }
  const m = s.match(TOKEN_RE);
  if (m) return m[1].toLowerCase();
  return s.toLowerCase();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app && npx vitest run src/domain/__tests__/komprappToken.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

Work from: `/home/jars/Programing/Rezet/.worktrees/komprapp-direct-import`

```bash
git add app/src/domain/komprappToken.ts app/src/domain/__tests__/komprappToken.test.ts
git commit -m "$(cat <<'EOF'
feat(household): add pure komprapp token-extraction helper

EOF
)"
```
(append your session's attribution footer before `EOF`)

- [ ] **Step 6: Report**

Write to: `/home/jars/Programing/Rezet/.worktrees/komprapp-direct-import/.superpowers/sdd/2026-09-17-komprapp-direct-import/task-3-report.md`

Then reply with ONLY (under 15 lines): Status, commit, test summary, concerns, report path.

---

## Task 4: Rezet — `Store` contract: `komprappListToken` + `setKomprappListToken`

**Files:**
- Modify: `app/src/types.ts` (`HouseholdDetail`)
- Modify: `app/src/data/storeContext.ts` (`Store` interface)
- Modify: `app/src/data/store.tsx` (demo provider)
- Modify: `app/src/data/supabaseStore.tsx` (real provider)

**Interfaces:**
- Consumes: the `set_komprapp_list_token` RPC from Task 2 (must already be applied to the live project — if Task 2 isn't done yet, wait for it; don't guess at the RPC name/signature).
- Produces (used by Task 5 and Task 6): `useData().household.komprappListToken: string | null` and `useData().setKomprappListToken(token: string | null): Promise<void>`, working identically in shape in both providers (screens never need to know which is mounted).

- [ ] **Step 1: `HouseholdDetail` type**

In `app/src/types.ts`, find `interface HouseholdDetail` (around line 133) and add a field:

```ts
export interface HouseholdDetail {
  id: string;
  name: string;
  members: HouseholdMember[];
  membersLoaded: boolean;
  /** Token de una lista de komprapp (repo `ShoppingList`) vinculada a este hogar, o `null` si no hay ninguna. */
  komprappListToken: string | null;
}
```

(Match this to whatever fields are actually already there — don't remove `membersLoaded` or anything else present; just add `komprappListToken`.)

- [ ] **Step 2: `Store` interface**

In `app/src/data/storeContext.ts`, find where `household: HouseholdDetail | null;` and `promoteAdmin: (memberId: string) => Promise<void>;` are declared (around lines 76, 135) and add, near `promoteAdmin`:

```ts
  /**
   * Contrato: `rpc/set_komprapp_list_token`. Vincula (token no nulo) o
   * desvincula (`null`) la lista de komprapp del hogar actual. Solo un
   * ADMIN del hogar puede llamarlo — mismo nivel que `deleteHousehold`,
   * porque redirige la lista de la compra de todo el hogar. La RPC rechaza
   * la llamada (error) si quien la hace no es admin; la UI (Tarea 5) debe
   * ocultar o deshabilitar el botón para no-admins en vez de dejar que
   * fallen al intentarlo.
   */
  setKomprappListToken: (token: string | null) => Promise<void>;
```

- [ ] **Step 3: Demo provider**

In `app/src/data/store.tsx`, find `DEMO_HOUSEHOLD` (around line 78) and add the field:

```ts
const DEMO_HOUSEHOLD: HouseholdDetail = {
  id: 'demo',
  name: 'Demo',
  members: [{ id: 'demo-user', displayName: 'Tú', isAdmin: true }],
  membersLoaded: true,
  komprappListToken: null,
};
```

Find where `leaveHousehold: demoHouseholdActionUnavailable,` etc. are wired into the returned object (around line 434) and add a sibling line:

```ts
      setKomprappListToken: demoHouseholdActionUnavailable,
```

- [ ] **Step 4: Real provider**

In `app/src/data/supabaseStore.tsx`:

1. In `householdQ` (around line 253-266), add the column to the `select` and the returned object:

```ts
  const householdQ = useQuery({
    queryKey: householdKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('household')
        .select('kcal_target, name, komprapp_list_token')
        .eq('id', householdId)
        .single();
      if (error) throw error;
      return {
        kcalTarget: data.kcal_target as number,
        name: data.name as string,
        komprappListToken: data.komprapp_list_token as string | null,
      };
    },
  });
```

2. Find wherever `householdQ.data` gets assembled into the `household: HouseholdDetail` value returned by this hook (search for where `name:` / `membersLoaded:` are set on the final household object) and thread `komprappListToken: householdQ.data?.komprappListToken ?? null` into it, matching how `name`/`kcalTarget` are already threaded.

3. Add a new mutation right after `promoteAdminMut`/`promoteAdmin` (around line 697-707), matching that exact pattern:

```ts
  const setKomprappListTokenMut = useMutation({
    mutationFn: async (token: string | null) => {
      const { error } = await supabase.rpc('set_komprapp_list_token', { p_token: token ?? '' });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: householdKey }),
  });
  const setKomprappListToken = useCallback(
    (token: string | null) => setKomprappListTokenMut.mutateAsync(token),
    [setKomprappListTokenMut],
  );
```

(The RPC's `p_token text` parameter treats an empty string the same as unlinking, per `NULLIF(trim(...), '')` in Task 2's SQL — passing `token ?? ''` here covers both "user cleared the field" and explicit unlink.)

4. Add `setKomprappListToken` to the `value` object returned by this hook (near where `promoteAdmin,` is listed, around line 760).

- [ ] **Step 5: Typecheck**

Run: `cd app && npm run lint` — must be clean (TypeScript will catch it if any provider is missing the new `Store` field).

- [ ] **Step 6: Commit**

Work from: `/home/jars/Programing/Rezet/.worktrees/komprapp-direct-import`

```bash
git add app/src/types.ts app/src/data/storeContext.ts app/src/data/store.tsx app/src/data/supabaseStore.tsx
git commit -m "$(cat <<'EOF'
feat(household): wire komprapp_list_token through the Store contract

EOF
)"
```
(append your session's attribution footer before `EOF`)

- [ ] **Step 7: Report**

Write to: `/home/jars/Programing/Rezet/.worktrees/komprapp-direct-import/.superpowers/sdd/2026-09-17-komprapp-direct-import/task-4-report.md`

Then reply with ONLY (under 15 lines): Status, commit, lint result, concerns, report path.

---

## Task 5: Rezet — "Vincular komprapp" UI in Settings

**Files:**
- Create: `app/src/sheets/KomprappLinkSheet.tsx`
- Modify: `app/src/sheets/AccountHouseholdSheet.tsx`
- Modify: `app/src/App.tsx`
- Modify: `app/src/i18n/es.ts`
- Modify: `app/src/i18n/en.ts`

**Interfaces:**
- Consumes: `useData().household.komprappListToken` / `useData().setKomprappListToken` (Task 4); `extractKomprappToken` (Task 3).
- Produces: nothing consumed by later tasks — this is the linking UI, independent of Task 6's import-button change.

- [ ] **Step 1: i18n keys**

In `app/src/i18n/es.ts`, right after the `connectAiNote` line (around line 316):

```ts
  connectAiNote: 'Solo disponible con cuenta real, no en modo demo. Revocar el acceso: cierra sesión en la app.',
  komprappLinkRow: 'Vincular komprapp',
  komprappLinkSheetTitle: 'Vincular komprapp',
  komprappLinkSheetBody:
    'Pega el enlace para compartir o el código de una lista de komprapp. Cualquiera en tu hogar podrá importar la lista de la compra ahí con un toque.',
  komprappLinkPlaceholder: 'Enlace o código de komprapp',
  komprappLinkSave: 'Vincular',
  komprappLinkSaved: 'Lista vinculada',
  komprappLinkUnlink: 'Desvincular',
  komprappLinkUnlinked: 'Lista desvinculada',
  komprappLinkCurrentLabel: 'Vinculada',
  komprappLinkNote: 'Solo disponible con cuenta real, no en modo demo.',
  komprappLinkAdminOnly: 'Solo un administrador del hogar puede vincular o desvincular komprapp.',
```

In `app/src/i18n/en.ts`, the matching English versions in the same position:

```ts
  connectAiNote: 'Only available with a real account, not in demo mode. Revoke access: sign out of the app.',
  komprappLinkRow: 'Link komprapp',
  komprappLinkSheetTitle: 'Link komprapp',
  komprappLinkSheetBody:
    "Paste the share link or code for a komprapp list. Anyone in your household will be able to import the shopping list there with one tap.",
  komprappLinkPlaceholder: 'komprapp link or code',
  komprappLinkSave: 'Link',
  komprappLinkSaved: 'List linked',
  komprappLinkUnlink: 'Unlink',
  komprappLinkUnlinked: 'List unlinked',
  komprappLinkCurrentLabel: 'Linked',
  komprappLinkNote: 'Only available with a real account, not in demo mode.',
  komprappLinkAdminOnly: 'Only a household admin can link or unlink komprapp.',
```

(Match the exact neighboring `connectAiNote` line you find — insert the new keys right after it, don't reformat surrounding lines.)

- [ ] **Step 2: `KomprappLinkSheet.tsx`**

Create `app/src/sheets/KomprappLinkSheet.tsx`, modeled closely on `app/src/sheets/ConnectMcpSheet.tsx`'s structure and `app/src/ui/Fields.tsx`'s `TextField`:

```tsx
import { useState } from 'react';
import { usePrefs } from '../store/prefs';
import { useData } from '../data/storeContext';
import { extractKomprappToken } from '../domain/komprappToken';
import { Sheet } from '../ui/Sheet';
import { Button } from '../ui/Button';
import { TextField } from '../ui/Fields';
import { radius, tabular } from '../ui/tokens';

export function KomprappLinkSheet({
  onClose,
  onToast,
}: {
  onClose: () => void;
  onToast: (msg: string) => void;
}) {
  const { t } = usePrefs();
  const { profile } = useAuth();
  const { household, setKomprappListToken } = useData();
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);

  const linked = household?.komprappListToken ?? null;
  // La RPC rechaza esto si no eres admin (redirige la lista de la compra de
  // TODO el hogar) — lo deshabilitamos aquí para no dejar que el usuario
  // rellene el campo y solo se entere del rechazo al guardar.
  const amIAdmin = household?.members.find((m) => m.id === profile?.id)?.isAdmin ?? false;

  const save = async () => {
    const token = extractKomprappToken(draft);
    if (!token || busy || !amIAdmin) return;
    setBusy(true);
    try {
      await setKomprappListToken(token);
      setDraft('');
      onToast(t.komprappLinkSaved);
    } catch {
      /* la hoja se queda abierta; el usuario puede reintentar */
    } finally {
      setBusy(false);
    }
  };

  const unlink = async () => {
    if (busy || !amIAdmin) return;
    setBusy(true);
    try {
      await setKomprappListToken(null);
      onToast(t.komprappLinkUnlinked);
    } catch {
      /* idem */
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet title={t.komprappLinkSheetTitle} onClose={onClose}>
      <div style={{ paddingBottom: 6 }}>
        <div style={{ fontSize: 15, color: 'var(--muted)', lineHeight: 1.5, marginBottom: 18, textWrap: 'pretty' }}>
          {t.komprappLinkSheetBody}
        </div>

        {linked && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              padding: '14px 16px',
              borderRadius: radius.button,
              background: 'var(--soft)',
              marginBottom: 18,
            }}
          >
            <div style={{ fontSize: 14, color: 'var(--muted)' }}>
              {t.komprappLinkCurrentLabel}: <span style={{ ...tabular, color: 'var(--text)', fontWeight: 650 }}>{linked}</span>
            </div>
            <Button size="header" variant="secondary" onClick={() => void unlink()} disabled={busy || !amIAdmin}>
              {t.komprappLinkUnlink}
            </Button>
          </div>
        )}

        <TextField
          value={draft}
          onChange={setDraft}
          placeholder={t.komprappLinkPlaceholder}
          style={{ marginBottom: 14 }}
        />
        <Button full onClick={() => void save()} disabled={busy || !draft.trim() || !amIAdmin}>
          {t.komprappLinkSave}
        </Button>

        <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.4, marginTop: 18 }}>
          {amIAdmin ? t.komprappLinkNote : t.komprappLinkAdminOnly}
        </div>
      </div>
    </Sheet>
  );
}
```

Add the `useAuth` import: `import { useAuth } from '../data/auth';`.

Add one more i18n key alongside the others in Step 1 — `komprappLinkAdminOnly: 'Solo un administrador del hogar puede vincular o desvincular komprapp.'` (es) / `'Only a household admin can link or unlink komprapp.'` (en).

Read `ConnectMcpSheet.tsx` and `TextField`'s actual current props before finalizing — if either has drifted from what's shown here (e.g. `Button`'s exact prop names), match the real current code, not this snippet blindly. Also confirm `HouseholdMember`'s `isAdmin` field name against `HouseholdSheet.tsx`'s actual usage (it already does `myMember?.isAdmin` — mirror that exactly).

- [ ] **Step 3: Row in `AccountHouseholdSheet.tsx`**

In `app/src/sheets/AccountHouseholdSheet.tsx`, add a new prop `onKomprappLink: () => void` next to `onConnectMcp` in the component's props type, and a new row next to the existing "Conectar IA" row (find the `Eyebrow` block with `t.accountHouseholdConnect` around line 66-74) — add a sibling row inside the same section or its own new `Eyebrow` section, matching the existing row's exact JSX shape:

```tsx
          <Pressable
            onClick={onKomprappLink}
            scale={0.98}
            style={{ ...rowStyle, display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}
          >
            <Icon name="link" size={18} strokeWidth={1.8} />
            {t.komprappLinkRow}
          </Pressable>
```

- [ ] **Step 4: Wire it in `App.tsx`**

In `app/src/App.tsx`:

1. Add the import: `import { KomprappLinkSheet } from './sheets/KomprappLinkSheet';`
2. Add a new sheet-kind variant to the discriminated union (find `| { kind: 'connectMcp' }` around line 57, add a sibling): `| { kind: 'komprappLink' }`
3. Add the render block next to the existing `connectMcp` block (around line 417-419):

```tsx
      {sheet?.kind === 'komprappLink' && (
        <KomprappLinkSheet onClose={() => setSheet({ kind: 'accountHousehold' })} onToast={show} />
      )}
```

4. Pass the new handler into `AccountHouseholdSheet` (find `onConnectMcp={() => setSheet({ kind: 'connectMcp' })}` around line 426, add a sibling prop):

```tsx
          onKomprappLink={() => setSheet({ kind: 'komprappLink' })}
```

Read the actual current `App.tsx` around these line numbers before editing — they may have shifted slightly; match by the surrounding code shown, not blind line numbers.

- [ ] **Step 5: Typecheck + manual verification**

Run: `cd app && npm run lint`. Then, if you have the means to run `npm run dev` and drive a browser (or failing that, careful code reading): sign in with a real (non-demo) account, open Settings → Cuenta y hogar → Vincular komprapp, paste a token, save, confirm the toast and that the row now shows "Vinculada: <token>". Be precise in your report about what you actually verified vs. only code-reviewed.

- [ ] **Step 6: Commit**

Work from: `/home/jars/Programing/Rezet/.worktrees/komprapp-direct-import`

```bash
git add app/src/sheets/KomprappLinkSheet.tsx app/src/sheets/AccountHouseholdSheet.tsx app/src/App.tsx app/src/i18n/es.ts app/src/i18n/en.ts
git commit -m "$(cat <<'EOF'
feat(household): add UI to link a komprapp list from Settings

EOF
)"
```
(append your session's attribution footer before `EOF`)

- [ ] **Step 7: Report**

Write to: `/home/jars/Programing/Rezet/.worktrees/komprapp-direct-import/.superpowers/sdd/2026-09-17-komprapp-direct-import/task-5-report.md`

Then reply with ONLY (under 15 lines): Status, commit, verification summary (precise about coverage), concerns, report path.

---

## Task 6: Rezet — direct import call + `ShoppingSheet` button switch

**Files:**
- Create: `app/src/data/komprapp.ts`
- Modify: `app/src/sheets/ShoppingSheet.tsx`
- Modify: `app/.env.example`
- Modify: `app/src/i18n/es.ts`
- Modify: `app/src/i18n/en.ts`

**Interfaces:**
- Consumes: `useData().household.komprappListToken` (Task 4); the `import_shopping_items` RPC (Task 1, must be applied to komprapp's live project before this can be end-to-end tested — if it isn't applied yet, this task can still be implemented and unit-verified, but the live call will fail until a human runs Task 1's SQL); `toKomprappItem` from `../domain/komprappExport` (existing, from the 2026-09-16 work — reuse its unit-mapping/rounding logic, don't duplicate it).
- Produces: nothing consumed by later tasks — last task in this plan.

- [ ] **Step 1: New env vars**

In `app/.env.example`, add after the existing `VITE_VAPID_PUBLIC_KEY` line:

```
# Proyecto Supabase de komprapp (repo ShoppingList) — solo para la RPC de
# importación directa (import_shopping_items). No es el mismo proyecto que
# VITE_SUPABASE_URL de arriba.
VITE_KOMPRAPP_SUPABASE_URL=https://your-komprapp-project-ref.supabase.co
VITE_KOMPRAPP_SUPABASE_ANON_KEY=komprapp-anon-or-publishable-key
```

- [ ] **Step 2: `src/data/komprapp.ts`**

Create `app/src/data/komprapp.ts`. Read `app/src/data/supabaseClient.ts` first to match its exact `createClient` call style/options:

```ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { toKomprappItem } from '../domain/komprappExport';
import type { ShoppingNeed } from '../types';

const KOMPRAPP_URL = import.meta.env.VITE_KOMPRAPP_SUPABASE_URL as string | undefined;
const KOMPRAPP_ANON_KEY = import.meta.env.VITE_KOMPRAPP_SUPABASE_ANON_KEY as string | undefined;

// Cliente creado perezosamente, no al importar el módulo, y con
// detectSessionInUrl/persistSession/autoRefreshToken todos en false: los
// defaults de supabase-js intentan leer un fragmento #access_token o
// ?code=... de la URL actual y guardar sesión en localStorage — esta app
// (Rezet) YA tiene su propio flujo de login corriendo contra SU PROPIO
// proyecto de Supabase; un segundo cliente con los defaults intentaría
// consumir el mismo callback OAuth y podría competir con el login real.
// Este cliente no necesita sesión propia: la RPC de komprapp se llama solo
// con la anon key, sin usuario de komprapp.
let _komprappClient: SupabaseClient | null | undefined;
function getKomprappClient(): SupabaseClient | null {
  if (_komprappClient !== undefined) return _komprappClient;
  _komprappClient =
    KOMPRAPP_URL && KOMPRAPP_ANON_KEY
      ? createClient(KOMPRAPP_URL, KOMPRAPP_ANON_KEY, {
          auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        })
      : null;
  return _komprappClient;
}

const MAX_ITEMS_PER_CALL = 100; // debe coincidir con el tope de la RPC (Tarea 1)

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Llama a la RPC `import_shopping_items` de komprapp (repo `ShoppingList`)
 * directamente — nunca toca sus tablas `lists`/`products` por REST. Trocea
 * en llamadas de máx. `MAX_ITEMS_PER_CALL` porque la RPC rechaza payloads
 * más grandes de golpe en vez de truncarlos en silencio. Lanza si
 * `VITE_KOMPRAPP_SUPABASE_URL`/`_ANON_KEY` no están configuradas, o si
 * cualquier tanda falla (token inválido, límite de tasa, etc.) — quien
 * llama decide cómo mostrarlo (toast). Nota: si una tanda falla a mitad de
 * una lista larga, las tandas anteriores ya se insertaron (no es atómico
 * entre tandas) — aceptable en v1 dado el tope de 100 hace esto raro en la
 * práctica (una lista de la compra normal nunca se acerca a ese tamaño).
 */
export async function importToKomprapp(
  token: string,
  needs: Pick<ShoppingNeed, 'name' | 'quantity' | 'unit'>[],
): Promise<number> {
  const client = getKomprappClient();
  if (!client) throw new Error('komprapp no configurado');
  const items = needs.map(toKomprappItem);
  let total = 0;
  for (const batch of chunk(items, MAX_ITEMS_PER_CALL)) {
    const { data, error } = await client.rpc('import_shopping_items', {
      p_token: token,
      p_items: batch,
    });
    if (error) throw new Error(error.message);
    total += data as number;
  }
  return total;
}
```

Match `supabaseClient.ts`'s actual options for anything not covered above (e.g. custom headers, global fetch options) — this second client should otherwise be as minimal as `supabaseClient.ts`'s own precedent suggests, but the three `auth` options above are not optional, they're the fix for a real cross-client session-hijack risk a security review flagged.

- [ ] **Step 3: i18n keys**

In `app/src/i18n/es.ts`, right after `shareToKomprapp` (added by the 2026-09-16 work):

```ts
  shareToKomprapp: 'Compartir con komprapp',
  importToKomprapp: 'Importar a komprapp',
  komprappImported: (n: number) => `${n} ${n === 1 ? 'producto importado' : 'productos importados'}`,
  komprappImportError: 'No se pudo importar a komprapp',
```

In `app/src/i18n/en.ts`, matching English:

```ts
  shareToKomprapp: 'Share with komprapp',
  importToKomprapp: 'Import to komprapp',
  komprappImported: (n: number) => `${n} ${n === 1 ? 'item imported' : 'items imported'}`,
  komprappImportError: 'Could not import to komprapp',
```

(If this repo's i18n dictionaries don't already support function-valued entries like `komprappImported`, check how any other pluralized/parameterized string is handled elsewhere — e.g. `t.householdMembersCount(...)` is referenced in `HouseholdSheet.tsx`, so this pattern already exists; match it exactly rather than inventing a different mechanism.)

- [ ] **Step 4: `ShoppingSheet.tsx` — branch the button**

Modify the handler and button added by the 2026-09-16 work. Replace the existing `shareWithKomprapp` function and its button with:

```tsx
  const { household } = useData();
  const komprappToken = household?.komprappListToken ?? null;

  const shareWithKomprapp = async () => {
    const selected = needs.filter((n) => shoppingChecked[n.key]);
    if (komprappToken) {
      try {
        const count = await importToKomprapp(komprappToken, selected);
        onToast(t.komprappImported(count));
      } catch {
        onToast(t.komprappImportError);
      }
      return;
    }
    const url = buildKomprappImportUrl(selected, KOMPRAPP_BASE_URL);
    try {
      await navigator.clipboard.writeText(url);
      onToast(t.copiedLink);
    } catch {
      /* portapapeles no disponible en este navegador */
    }
  };
```

Add the import: `import { importToKomprapp } from '../data/komprapp';`. `useData` should already be imported in this file (used elsewhere for `needsForWeek`/`shoppingChecked`/etc.) — add `household` to that existing destructure rather than a second `useData()` call.

Update the button's label to switch too:

```tsx
                <Button
                  full
                  variant="secondary"
                  disabled={!anyChecked}
                  onClick={() => void shareWithKomprapp()}
                  style={{ borderRadius: radius.button }}
                >
                  {komprappToken ? t.importToKomprapp : t.shareToKomprapp}
                </Button>
```

- [ ] **Step 5: Add the new env vars to CI**

In `.github/workflows/deploy.yml`, find where `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`/`VITE_VAPID_PUBLIC_KEY` are passed as build-time env vars to the `app` job (around lines 121-123 per this repo's current workflow — read the actual file, the line numbers may have shifted) and add `VITE_KOMPRAPP_SUPABASE_URL`/`VITE_KOMPRAPP_SUPABASE_ANON_KEY` alongside them, sourced from repo secrets of the same names. Note in your report that the user still needs to add `KOMPRAPP_SUPABASE_URL`/`KOMPRAPP_SUPABASE_ANON_KEY` (or however you name the secrets) in the GitHub repo's Actions secrets themselves — you cannot do that from this task, only reference them in the workflow file. Without this step, the production build silently ships with the direct-import path disabled (falls back to the copy-link flow) rather than failing loudly — note that behavior explicitly in your report so the user understands what "forgot to add the secret" looks like in production.

- [ ] **Step 6: Typecheck**

Run: `cd app && npm run lint` — clean.

- [ ] **Step 7: Manual verification**

If Task 1's SQL has been applied to komprapp's live project and a household has a token linked (via Task 5's UI): run `cd app && npm run dev`, sign in with a real account, link a komprapp list, check a shopping-list item, tap the (now "Importar a komprapp") button, confirm the toast shows a count and the item actually appears in komprapp's list. If Task 1 hasn't been applied yet, you cannot complete this live check — verify instead that: (a) with no token linked, the button still says "Compartir con komprapp" and still copies a link exactly as before (regression check on the 2026-09-16 behavior), and (b) `importToKomprapp`'s request shape is correct by reading the code carefully (matches the RPC's parameter names `p_token`/`p_items` exactly). State precisely which of these you actually ran.

- [ ] **Step 8: Commit**

Work from: `/home/jars/Programing/Rezet/.worktrees/komprapp-direct-import`

```bash
git add app/src/data/komprapp.ts app/src/sheets/ShoppingSheet.tsx app/.env.example app/src/i18n/es.ts app/src/i18n/en.ts .github/workflows/deploy.yml
git commit -m "$(cat <<'EOF'
feat(shopping): import directly to komprapp when a list is linked

EOF
)"
```
(append your session's attribution footer before `EOF`)

- [ ] **Step 9: Report**

Write to: `/home/jars/Programing/Rezet/.worktrees/komprapp-direct-import/.superpowers/sdd/2026-09-17-komprapp-direct-import/task-6-report.md`

Then reply with ONLY (under 15 lines): Status, commit, verification summary (precise about coverage, including whether Task 1's RPC was live to test against), concerns, report path.

---

## Deploy note (not part of this plan's tasks)

Task 1's SQL must be run manually in komprapp's Supabase dashboard by the user before the direct-import button does anything live for any household (it degrades to the existing copy-link fallback until then, so this is not a hard blocker to merging Rezet's side — just to it actually working end-to-end). The user also needs to add `KOMPRAPP_SUPABASE_URL`/`KOMPRAPP_SUPABASE_ANON_KEY` as GitHub Actions secrets (Task 6, Step 5 references them in the workflow file but can't create them). Rezet's own deploy still goes through `releasing-versions` + `deploying-to-main` as usual, same as the 2026-09-16 feature. Both the 2026-09-16 branches (`feature/komprapp-export` in Rezet, `feature/import-from-rezet` in komprapp) need to merge to their respective `main`s for the fallback path to work end-to-end too — this plan doesn't do that merging itself.

## Security notes carried over from review (Fable, 2026-09-17)

- The share token this design reuses is **not a real secret today** — komprapp's existing `lists` table has a fully public `SELECT` RLS policy, so anyone with komprapp's (inherently public) anon key can already enumerate every list's token via plain REST, independent of anything in this plan. `import_shopping_items` is strictly less capable than what already exists (insert-only vs. the existing join flow's full read/write), so this plan does not make things worse — but don't describe the token as "protected" anywhere in code comments or UI copy; describe the new function as "narrower than what already exists," which is the accurate claim.
- The real fix for that pre-existing exposure (tightening `lists`' `SELECT` policy, moving `findListByToken` behind its own RPC) belongs to komprapp as its own separate piece of work — out of scope here, but worth flagging to the user directly, not just burying in a code comment.
- The rate-limit table added in Task 1 is defense-in-depth for this one function, not a fix for the underlying exposure above.
