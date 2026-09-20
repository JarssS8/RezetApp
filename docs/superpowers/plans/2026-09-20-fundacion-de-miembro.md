# Fundación de miembro — plan de implementación (fases 0 y 1)

> **Para agentes ejecutores:** SUB-SKILL OBLIGATORIA: `superpowers:subagent-driven-development`. Pasos con checkbox (`- [ ]`). Ejecuta las tareas **en orden**: cada una asume que la anterior está commiteada.

**Goal:** Que un hogar de Rezet tenga miembros de verdad —con avatar, color y objetivo de calorías propio, incluidos los que no tienen cuenta (niños, invitados)— y que los ajustes de cada persona la sigan entre dispositivos.

**Architecture:** Se añade la tabla `member` como identidad de producto del hogar, con `auth_user_id` nullable y una columna `is_ward` explícita para los miembros sin cuenta. `profile` no se toca: sigue mandando en autenticación, hogar y rol de admin. Un único predicado SQL, `private.can_act_for(member_id)`, decide quién puede escribir en los datos de un miembro, y lo reutilizarán todas las tablas personales de fases posteriores. Los ajustes (tema, idioma, acento, unidades) se quedan en las columnas que `profile` ya tiene y que hoy nadie escribe.

**Tech Stack:** Supabase (Postgres + RLS + Storage), React 19 + TypeScript + Vite, TanStack Query, vitest, PGlite (banco de migraciones; es Postgres 18 y producción no lo es).

**Spec:** `docs/superpowers/specs/2026-09-20-personalizacion-por-miembro-design.md` (commit `9c4f282`). El plan argumenta desde la spec: léela, sobre todo §3 y §5.

## Desviaciones respecto de la spec, decididas y justificadas

Dos, y ninguna más. Si encuentras una tercera, **para y repórtalo**.

1. **La fase 0 se reduce.** §3.8 pide partir `app/src/data/supabaseStore.tsx` (928 líneas) en seis hooks por dominio. Aquí solo se extraen los helpers puros y las claves de query (Tareas 1 y 2), y el código nuevo entra en ficheros nuevos bajo `src/data/supabaseStore/`. Motivo: el troceado completo reescribe 928 líneas sin aportar nada al usuario y con riesgo real de regresión en el bucle central; el objetivo de §3.8 —que lo nuevo no engorde el monolito— se cumple igual. El resto del troceado queda pendiente y se anota en `CLAUDE.md` (Tarea 12).
2. **`member_body` no existe todavía.** §3.2 y §5.1 piden borrarlo al salir del hogar; esa tabla es de la fase 2. La Tarea 5 deja el comentario y el sitio exacto donde añadir ese borrado, y la fase 2 lo completa.

## Global Constraints

- **Ninguna tarea toca producción:** nada de `mcp__supabase__apply_migration`, `supabase db push`, `wrangler deploy`, `supabase functions deploy`, ni `git push`. El despliegue lo hace CI al final, con la skill `deploying-to-main` y confirmación del usuario.
- **Prefijo de migración** `YYYYMMDDHHMMSS`, mayor que `20260919100400`. Usa los nombres de fichero **exactos** que da cada tarea.
- **Toda función SQL nueva:** `set search_path = ''`, tablas siempre como `public.<tabla>`, `revoke all on function … from public, anon;` y el `grant execute` que toque.
- **Grants por columna:** `revoke update on <tabla> from authenticated;` **primero**, y luego `grant update (col, col…)`. Un `revoke update (col)` no hace nada mientras exista el grant de tabla. El repo ya se equivocó una vez (`20260917070714` → `20260917070845`).
- **Banco de pruebas:** `app/supabase/tests/harness.ts` ya existe: `applyMigrations()`, `asUser(db, uid, sql)`, `createAuthUser(db)`. **Solo `asUser` aplica RLS**; fuera de ahí eres superusuario y RLS no se evalúa, así que toda aserción de RLS va por `asUser`. Cada test abre su propia base y termina con `await db.close()`, y lleva el timeout `120_000` como los que ya hay.
- **Gate de cada tarea:** `cd app && npm run lint && npm test`. No commitees con el gate en rojo.
- **Comentarios en castellano**, explicando el porqué, no el qué. Los textos de interfaz van siempre a `app/src/i18n/es.ts` **y** `app/src/i18n/en.ts` en la misma tarea.
- **Colores:** solo tokens (`var(--accent)`, `var(--warn)`, `var(--muted)`…). Texto sobre fondo tintado → `--accent-ink`/`--warn-ink`; texto sobre relleno de acento → `--onaccent`. Ningún hex suelto en componentes.
- **Nada de librerías de componentes.** Las primitivas están en `app/src/ui/` y se reutilizan.
- **Commits:** uno por tarea, `feat(ámbito): …` o `refactor(ámbito): …`, con la línea `Co-Authored-By:` de la atribución activa de tu sesión.
- **Si algo no encaja con lo que dice el plan, para y repórtalo. No improvises.**

## Mapa de ficheros

| Fichero | Responsabilidad |
|---|---|
| `app/src/data/supabaseStore/rows.ts` | *(nuevo, T1)* Mapeo fila Postgres → tipo de dominio, y `RECIPE_SELECT`. Puro, sin React. |
| `app/src/data/supabaseStore/keys.ts` | *(nuevo, T2)* Fábricas de claves de TanStack Query. |
| `app/src/data/supabaseStore/useMembers.ts` | *(nuevo, T8)* Consulta y mutaciones de `member`. |
| `app/supabase/migrations/20260920090000_rezet_member_foundation.sql` | *(nuevo, T3)* Tabla, helpers, backfill, RLS, grants. |
| `app/supabase/migrations/20260920090100_rezet_member_ward_rpcs.sql` | *(nuevo, T4)* RPC de tutelados y de ajustes. |
| `app/supabase/migrations/20260920090200_rezet_member_lifecycle.sql` | *(nuevo, T5)* Alta y baja de `member` dentro de las RPC de hogar. |
| `app/supabase/migrations/20260920090300_rezet_profile_id_params.sql` | *(nuevo, T6)* Renombrado de parámetros con envoltorio. |
| `app/supabase/migrations/20260920090400_rezet_avatars_storage.sql` | *(nuevo, T11)* Bucket `avatars` y sus políticas. |
| `app/src/types.ts` | *(modificar, T7)* `MemberId`, `ProfileId`, `Member`. |
| `app/src/data/storeContext.ts` | *(modificar, T7)* Contrato `Store` ampliado. |
| `app/src/store/prefs.tsx` | *(modificar, T10)* `hydrateFromServer` y escritura al servidor. |
| `app/src/app/PrefsBridge.tsx` | *(nuevo, T10)* Puente entre sesión y prefs. |
| `app/src/sheets/HouseholdSheet.tsx` | *(modificar, T9)* Avatar, color, objetivo, alta de tutelados. |
| `app/src/sheets/MemberSheet.tsx` | *(nuevo, T9)* Hoja de un miembro. |
| `app/src/ui/Avatar.tsx` | *(nuevo, T9)* Inicial sobre color, o foto. |

## Orden y reparto de modelos

T1 → T2 → T3 → T4 → T5 → T6 → T7 → T8 → T9 → T10 → T11 → T12.

T3-T6 son SQL y se pueden verificar enteras con `npm test`. T7-T11 son la app. T12 cierra versión y documentación.

| Tareas | Modelo | Por qué |
|---|---|---|
| T1, T2, T7 | **Haiku** | Movimiento mecánico de código y declaración de tipos, con el compilador como red de seguridad. |
| T3, T4, T5, T6, T10, T11 | **Sonnet** | SQL con RLS y grants, ciclo de vida de cuentas y el puente de sesión: aquí un error no falla, filtra. |
| T8, T9, T12 | **Sonnet** | Lógica de datos, interfaz nueva y release. |

Regla que manda sobre la tabla: **si una tarea te pide juicio que el plan no da, para y repórtalo** en vez de decidir. Vale para cualquier modelo.

---

### Task 1: Extraer los mapeadores de fila a su propio módulo

Refactor puro, sin cambio de comportamiento. Deja `supabaseStore.tsx` sin las funciones que no dependen de React, para que el código de miembros que viene después no engorde un fichero de 928 líneas.

**Files:**
- Create: `app/src/data/supabaseStore/rows.ts`
- Modify: `app/src/data/supabaseStore.tsx` (elimina lo movido y lo importa)

**Interfaces:**
- Consumes: nada.
- Produces: `mapIngredient`, `mapRecipe`, `mapPantryItem`, `mapPlanEntry`, `escapeIlike`, `RECIPE_SELECT`, y el tipo `RecipeRow`. Mismas firmas que hoy.

- [ ] **Step 1: Verificar el punto de partida en verde**

```bash
cd app && npm run lint && npm test
```
Esperado: PASS. Si ya está en rojo antes de tocar nada, **para y repórtalo**.

- [ ] **Step 2: Crear el módulo con el código movido tal cual**

Crea `app/src/data/supabaseStore/rows.ts` y **mueve** (cortar y pegar, sin reescribir) desde `app/src/data/supabaseStore.tsx`:

- el tipo `RecipeRow` (declarado alrededor de la línea 53),
- `mapIngredient` (línea 37), `mapRecipe` (83), `mapPantryItem` (121), `mapPlanEntry` (139),
- la constante `RECIPE_SELECT` (157),
- `escapeIlike` (165).

Exporta cada una con `export`. Ajusta los imports de tipos: el fichero nuevo está un nivel más adentro, así que `../types` pasa a ser `../../types`.

Cabecera del fichero:

```ts
/**
 * Mapeo de filas de Postgres a tipos de dominio. Puro: ni React ni red, para
 * que se pueda leer y probar sin montar el proveedor entero.
 */
```

- [ ] **Step 3: Importar desde el proveedor**

En `app/src/data/supabaseStore.tsx`, sustituye el código borrado por:

```ts
import {
  RECIPE_SELECT,
  escapeIlike,
  mapIngredient,
  mapPantryItem,
  mapPlanEntry,
  mapRecipe,
  type RecipeRow,
} from './supabaseStore/rows';
```

Deja solo los imports de `../types` que el fichero siga usando; `npm run lint` te dirá cuáles sobran.

- [ ] **Step 4: Gate**

```bash
cd app && npm run lint && npm test
```
Esperado: PASS, con el mismo número de tests que en el Step 1. Este refactor no añade ni quita ninguno.

- [ ] **Step 5: Commit**

```bash
git add app/src/data/supabaseStore/rows.ts app/src/data/supabaseStore.tsx
git commit -m "refactor(data): extraer los mapeadores de fila de supabaseStore"
```

---

### Task 2: Extraer las claves de query

**Files:**
- Create: `app/src/data/supabaseStore/keys.ts`
- Modify: `app/src/data/supabaseStore.tsx:181-187`

**Interfaces:**
- Consumes: nada.
- Produces: `storeKeys`, objeto de funciones que reciben `householdId` y devuelven una clave `as const`.

- [ ] **Step 1: Crear el módulo**

`app/src/data/supabaseStore/keys.ts`:

```ts
/**
 * Claves de TanStack Query, en un solo sitio. Están aquí y no repartidas por
 * los hooks porque las invalidaciones cruzan dominios (cocinar toca despensa
 * y plan), y una clave mal escrita falla en silencio: la query no se
 * refresca y nadie se entera.
 */
export const storeKeys = {
  ingredients: (householdId: string) => ['ingredients', householdId] as const,
  recipes: (householdId: string) => ['recipes', householdId] as const,
  pantry: (householdId: string) => ['pantry', householdId] as const,
  plan: (householdId: string) => ['plan', householdId] as const,
  shopping: (householdId: string) => ['shopping', householdId] as const,
  household: (householdId: string) => ['household', householdId] as const,
  householdMembers: (householdId: string) => ['householdMembers', householdId] as const,
  members: (householdId: string) => ['members', householdId] as const,
};
```

`members` es la clave nueva de la Tarea 8; se declara ya para no volver a tocar este fichero.

- [ ] **Step 2: Sustituir las declaraciones del proveedor**

En `supabaseStore.tsx`, reemplaza las siete líneas `const xxxKey = useMemo(...)` (181-187) por:

```ts
const ingredientsKey = useMemo(() => storeKeys.ingredients(householdId), [householdId]);
const recipesKey = useMemo(() => storeKeys.recipes(householdId), [householdId]);
const pantryKey = useMemo(() => storeKeys.pantry(householdId), [householdId]);
const planKey = useMemo(() => storeKeys.plan(householdId), [householdId]);
const shoppingKey = useMemo(() => storeKeys.shopping(householdId), [householdId]);
const householdKey = useMemo(() => storeKeys.household(householdId), [householdId]);
const householdMembersKey = useMemo(() => storeKeys.householdMembers(householdId), [householdId]);
```

y añade el import `import { storeKeys } from './supabaseStore/keys';`.

**No cambies los nombres de las variables locales.** Se usan en decenas de sitios del fichero; renombrarlas es trabajo sin beneficio y una fuente de errores.

- [ ] **Step 3: Gate**

```bash
cd app && npm run lint && npm test
```
Esperado: PASS.

- [ ] **Step 4: Commit**

```bash
git add app/src/data/supabaseStore/keys.ts app/src/data/supabaseStore.tsx
git commit -m "refactor(data): centralizar las claves de query de supabaseStore"
```

---

### Task 3: Migración de fundación — tabla `member`, helpers y RLS

El corazón de la fase. Spec §3.1, §3.2 y §5.1-5.2.

**Files:**
- Create: `app/supabase/migrations/20260920090000_rezet_member_foundation.sql`
- Modify: `app/supabase/tests/migrations.test.ts` (añadir al final, antes del `});` que cierra el `describe`)

**Interfaces:**
- Consumes: `private.current_household()` (ya existe).
- Produces: tabla `public.member`; `private.current_member() returns uuid`; `private.can_act_for(p_member_id uuid) returns boolean`.

- [ ] **Step 1: Escribir los tests, que fallarán**

Añade a `app/supabase/tests/migrations.test.ts`:

```ts
  it('member: se crea una fila por cada perfil existente', async () => {
    const db = await applyMigrations();
    const ana = await createAuthUser(db);

    await asUser(db, ana, "select public.create_household('Casa', 'Ana')");

    const res = await db.query<{ n: number; display_name: string; is_ward: boolean }>(
      `select count(*)::int as n, min(display_name) as display_name, bool_or(is_ward) as is_ward
         from public.member where auth_user_id = '${ana}'`,
    );
    expect(res.rows[0].n).toBe(1);
    expect(res.rows[0].display_name).toBe('Ana');
    expect(res.rows[0].is_ward).toBe(false);
    await db.close();
  }, 120_000);

  it('member: no se puede insertar ni borrar desde el cliente', async () => {
    const db = await applyMigrations();
    const ana = await createAuthUser(db);
    await asUser(db, ana, "select public.create_household('Casa', 'Ana')");
    const h = await db.query<{ id: string }>('select id from public.household limit 1');

    await expect(
      asUser(
        db,
        ana,
        `insert into public.member (household_id, display_name) values ('${h.rows[0].id}', 'Colado')`,
      ),
    ).rejects.toThrow();

    await expect(asUser(db, ana, 'delete from public.member')).rejects.toThrow();
    await db.close();
  }, 120_000);

  it('member: solo se pueden actualizar las columnas propias de la fila propia', async () => {
    const db = await applyMigrations();
    const ana = await createAuthUser(db);
    const bea = await createAuthUser(db);
    await asUser(db, ana, "select public.create_household('Casa', 'Ana')");
    await asUser(db, ana, 'select public.create_invite()');
    const code = await db.query<{ code: string }>('select code from public.household_invite limit 1');
    await asUser(db, bea, `select public.redeem_invite('${code.rows[0].code}', 'Bea')`);

    // La propia: sí.
    await asUser(db, ana, "update public.member set color = 'blue' where auth_user_id = '" + ana + "'");
    const propio = await db.query<{ color: string }>(
      `select color from public.member where auth_user_id = '${ana}'`,
    );
    expect(propio.rows[0].color).toBe('blue');

    // La de otro: la política no deja ninguna fila que actualizar.
    await asUser(db, ana, `update public.member set color = 'pink' where auth_user_id = '${bea}'`);
    const ajeno = await db.query<{ color: string }>(
      `select color from public.member where auth_user_id = '${bea}'`,
    );
    expect(ajeno.rows[0].color).not.toBe('pink');

    // Una columna sin grant: rechazo duro.
    await expect(
      asUser(db, ana, `update public.member set is_ward = true where auth_user_id = '${ana}'`),
    ).rejects.toThrow();

    await db.close();
  }, 120_000);

  it('member: kcal_target no admite valores absurdos', async () => {
    const db = await applyMigrations();
    const ana = await createAuthUser(db);
    await asUser(db, ana, "select public.create_household('Casa', 'Ana')");

    await expect(
      asUser(db, ana, `update public.member set kcal_target = 99999 where auth_user_id = '${ana}'`),
    ).rejects.toThrow();
    await db.close();
  }, 120_000);
```

- [ ] **Step 2: Ejecutar y ver que falla**

```bash
cd app && npx vitest run supabase/tests/migrations.test.ts
```
Esperado: FAIL, con errores del tipo `relation "public.member" does not exist`.

- [ ] **Step 3: Escribir la migración**

`app/supabase/migrations/20260920090000_rezet_member_foundation.sql`:

```sql
-- Diseño §3.1, §3.2, §5.1-5.2 — "member" es la identidad de producto del
-- hogar. `profile` sigue mandando en autenticación, hogar y rol de admin;
-- esta tabla existe para que pueda haber miembros SIN cuenta (niños,
-- invitados) y para que todo lo personal (kcal, gustos, dietas) apunte a un
-- id que no dependa de auth.users.

create table public.member (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.household(id) on delete cascade,
  auth_user_id  uuid references public.profile(id) on delete set null,
  -- La tutela es EXPLÍCITA, no "auth_user_id is null". Todas las salidas del
  -- hogar borran la fila de profile, así que inferirla de la ausencia de
  -- cuenta convertiría en tutelado a quien se va, y sus datos personales
  -- quedarían a la vista de quien se queda.
  is_ward       boolean not null default false,
  display_name  text not null,
  avatar_path   text,
  color         text not null default 'green',
  sort_order    int  not null default 0,
  -- El check vive aquí y no solo en el cliente: un PATCH directo a PostgREST
  -- no pasa por la interfaz.
  kcal_target   int  not null default 2100 check (kcal_target between 1000 and 5000),
  created_at    timestamptz not null default now(),
  deleted_at    timestamptz
);

create index member_household_idx on public.member (household_id) where deleted_at is null;
-- Índice parcial en vez de `unique` en la columna: un UNIQUE de Postgres ya
-- admite varios NULL, así que declarar ambos serían dos índices para la misma
-- garantía.
create unique index member_auth_uq on public.member (auth_user_id) where auth_user_id is not null;

-- ── Helpers ──────────────────────────────────────────────────────────────
-- SECURITY DEFINER igual que private.current_household(): si leyera `member`
-- bajo RLS, cualquier política de `member` que lo usara provocaría recursión
-- infinita (42P17).

create or replace function private.current_member()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from public.member
   where auth_user_id = (select auth.uid()) and deleted_at is null
   limit 1
$$;

revoke all on function private.current_member() from public, anon;
grant execute on function private.current_member() to authenticated;

-- El predicado único de autorización personal. Lo usarán TODAS las tablas
-- personales de las fases siguientes (member_body, intake_*, dashboard...).
-- Las tres condiciones son necesarias:
--   household_id → sin ella, `is_ward` es una condición global y cualquiera
--                  escribiría en el tutelado de otro hogar sabiendo su UUID.
--   is_ward      → ver el comentario de la columna.
--   deleted_at   → un miembro borrado no es tutelable.
create or replace function private.can_act_for(p_member_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.member m
     where m.id = p_member_id
       and m.deleted_at is null
       and m.household_id = (select private.current_household())
       and (m.auth_user_id = (select auth.uid()) or m.is_ward)
  )
$$;

revoke all on function private.can_act_for(uuid) from public, anon;
grant execute on function private.can_act_for(uuid) to authenticated;

-- ── Backfill ─────────────────────────────────────────────────────────────
-- Una fila por perfil existente. `color` hereda el acento de la cuenta, que
-- es lo más parecido a una elección que ya hizo esa persona.

insert into public.member (household_id, auth_user_id, display_name, color, kcal_target)
select p.household_id, p.id, p.display_name, coalesce(p.accent, 'green'), h.kcal_target
  from public.profile p
  join public.household h on h.id = p.household_id;

-- ── RLS ──────────────────────────────────────────────────────────────────

alter table public.member enable row level security;

-- Se leen TAMBIÉN los borrados: hacen falta para resolver la atribución del
-- historial ("lo registró X") cuando X ya no está. La interfaz los marca
-- como inactivos.
create policy member_select on public.member for select
  to authenticated
  using (household_id = (select private.current_household()));

create policy member_update_self on public.member for update
  to authenticated
  using (auth_user_id = (select auth.uid()) and deleted_at is null)
  with check (auth_user_id = (select auth.uid()) and deleted_at is null);

-- ── Grants ───────────────────────────────────────────────────────────────
-- Primero la tabla, luego las columnas: un `revoke update (col)` no hace
-- nada mientras siga vivo el grant de tabla (20260917070714 → 20260917070845).

revoke all on public.member from anon, authenticated;
grant select on public.member to authenticated;
grant update (display_name, avatar_path, color, sort_order, kcal_target)
  on public.member to authenticated;

-- INSERT y DELETE: ningún rol. Crear identidad dentro de un hogar solo pasa
-- por RPC, igual que se cerró `profile` en 20260917220000.
```

- [ ] **Step 4: Ejecutar los tests**

```bash
cd app && npx vitest run supabase/tests/migrations.test.ts
```
Esperado: PASS, los cuatro nuevos incluidos.

Si el test de backfill falla con 0 filas, es que `create_household` corre **después** de esta migración y por tanto no hay nada que rellenar: eso lo arregla la Tarea 5, no esta. En ese caso **deja el test fallando y pásalo a la Tarea 5**, anotándolo en tu informe; no lo borres ni lo debilites.

- [ ] **Step 5: Gate y commit**

```bash
cd app && npm run lint && npm test
git add app/supabase/migrations/20260920090000_rezet_member_foundation.sql app/supabase/tests/migrations.test.ts
git commit -m "feat(db): tabla member con tutela explícita y predicado can_act_for"
```

---

### Task 4: RPC de tutelados y de ajustes

Spec §3.3 y §5.3. Son las tres puertas por las que se crea, se borra y se edita un miembro.

**Files:**
- Create: `app/supabase/migrations/20260920090100_rezet_member_ward_rpcs.sql`
- Modify: `app/supabase/tests/migrations.test.ts`

**Interfaces:**
- Consumes: `private.can_act_for`, `private.current_household`, tabla `member` (Tarea 3).
- Produces: `public.create_ward_member(p_display_name text, p_color text) returns uuid`; `public.delete_ward_member(p_member_id uuid) returns void`; `public.set_member_settings(p_member_id uuid, p_patch jsonb) returns void`.

- [ ] **Step 1: Escribir los tests**

```ts
  it('tutelados: solo un admin los crea, y quedan en su hogar', async () => {
    const db = await applyMigrations();
    const ana = await createAuthUser(db);
    const bea = await createAuthUser(db);
    await asUser(db, ana, "select public.create_household('Casa', 'Ana')");
    await asUser(db, ana, 'select public.create_invite()');
    const code = await db.query<{ code: string }>('select code from public.household_invite limit 1');
    await asUser(db, bea, `select public.redeem_invite('${code.rows[0].code}', 'Bea')`);

    await asUser(db, ana, "select public.create_ward_member('Nico', 'blue')");
    const ward = await db.query<{ n: number; is_ward: boolean }>(
      "select count(*)::int as n, bool_or(is_ward) as is_ward from public.member where display_name = 'Nico'",
    );
    expect(ward.rows[0].n).toBe(1);
    expect(ward.rows[0].is_ward).toBe(true);

    // Bea no es admin.
    await expect(asUser(db, bea, "select public.create_ward_member('Otro', 'pink')")).rejects.toThrow();
    await db.close();
  }, 120_000);

  it('tutelados: no se pueden editar desde otro hogar', async () => {
    const db = await applyMigrations();
    const ana = await createAuthUser(db);
    const mallory = await createAuthUser(db);
    await asUser(db, ana, "select public.create_household('Casa de Ana', 'Ana')");
    await asUser(db, mallory, "select public.create_household('Casa de Mallory', 'Mallory')");

    await asUser(db, ana, "select public.create_ward_member('Nico', 'blue')");
    const nico = await db.query<{ id: string }>(
      "select id from public.member where display_name = 'Nico'",
    );

    await expect(
      asUser(
        db,
        mallory,
        `select public.set_member_settings('${nico.rows[0].id}', '{"display_name":"Robado"}'::jsonb)`,
      ),
    ).rejects.toThrow();

    const sigue = await db.query<{ display_name: string }>(
      `select display_name from public.member where id = '${nico.rows[0].id}'`,
    );
    expect(sigue.rows[0].display_name).toBe('Nico');
    await db.close();
  }, 120_000);

  it('set_member_settings ignora las claves que no están en la lista blanca', async () => {
    const db = await applyMigrations();
    const ana = await createAuthUser(db);
    const mallory = await createAuthUser(db);
    await asUser(db, ana, "select public.create_household('Casa', 'Ana')");
    const yo = await db.query<{ id: string }>(
      `select id from public.member where auth_user_id = '${ana}'`,
    );

    await asUser(
      db,
      ana,
      `select public.set_member_settings('${yo.rows[0].id}',
         '{"color":"teal","auth_user_id":"${mallory}","is_ward":true}'::jsonb)`,
    );

    const m = await db.query<{ color: string; auth_user_id: string; is_ward: boolean }>(
      `select color, auth_user_id, is_ward from public.member where id = '${yo.rows[0].id}'`,
    );
    expect(m.rows[0].color).toBe('teal');
    expect(m.rows[0].auth_user_id).toBe(ana);
    expect(m.rows[0].is_ward).toBe(false);
    await db.close();
  }, 120_000);

  it('delete_ward_member no sirve para expulsar a alguien con cuenta', async () => {
    const db = await applyMigrations();
    const ana = await createAuthUser(db);
    const bea = await createAuthUser(db);
    await asUser(db, ana, "select public.create_household('Casa', 'Ana')");
    await asUser(db, ana, 'select public.create_invite()');
    const code = await db.query<{ code: string }>('select code from public.household_invite limit 1');
    await asUser(db, bea, `select public.redeem_invite('${code.rows[0].code}', 'Bea')`);
    const beaMember = await db.query<{ id: string }>(
      `select id from public.member where auth_user_id = '${bea}'`,
    );

    await expect(
      asUser(db, ana, `select public.delete_ward_member('${beaMember.rows[0].id}')`),
    ).rejects.toThrow();
    await db.close();
  }, 120_000);
```

- [ ] **Step 2: Ejecutar y ver que falla**

```bash
cd app && npx vitest run supabase/tests/migrations.test.ts
```
Esperado: FAIL, `function public.create_ward_member(...) does not exist`.

- [ ] **Step 3: Escribir la migración**

`app/supabase/migrations/20260920090100_rezet_member_ward_rpcs.sql`:

```sql
-- Diseño §3.3, §5.3 — las tres puertas de escritura sobre `member`.
-- Contrato de todas: SECURITY DEFINER (así que la RLS NO las protege: el
-- chequeo es explícito), hogar derivado de la sesión y nunca recibido como
-- parámetro, y los patches jsonb aplicados columna a columna con
-- asignaciones literales. Nada de `execute format()` sobre las claves del
-- patch: una clave `auth_user_id` colada ahí sería una toma de cuenta.

create or replace function public.create_ward_member(p_display_name text, p_color text default 'green')
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household_id uuid;
  v_is_admin boolean;
  v_id uuid;
begin
  select household_id, is_admin into v_household_id, v_is_admin
    from public.profile where id = (select auth.uid());

  if v_household_id is null then
    raise exception 'no perteneces a ningún hogar';
  end if;
  if not v_is_admin then
    raise exception 'REZET_NOT_ADMIN: solo un administrador puede añadir miembros';
  end if;

  insert into public.member (household_id, display_name, color, is_ward, kcal_target)
  values (
    v_household_id,
    nullif(btrim(p_display_name), ''),
    coalesce(nullif(btrim(p_color), ''), 'green'),
    true,
    (select kcal_target from public.household where id = v_household_id)
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.create_ward_member(text, text) from public, anon;
grant execute on function public.create_ward_member(text, text) to authenticated;

create or replace function public.delete_ward_member(p_member_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household_id uuid;
  v_is_admin boolean;
  v_target public.member%rowtype;
begin
  select household_id, is_admin into v_household_id, v_is_admin
    from public.profile where id = (select auth.uid());

  if not coalesce(v_is_admin, false) then
    raise exception 'REZET_NOT_ADMIN: solo un administrador puede quitar miembros';
  end if;

  select * into v_target from public.member
   where id = p_member_id and household_id = v_household_id and deleted_at is null;

  if not found then
    raise exception 'REZET_MEMBER_NOT_FOUND: ese miembro no está en tu hogar';
  end if;

  -- A quien tiene cuenta se le saca con remove_member, que además limpia su
  -- perfil y sus invitaciones. Aquí solo se borran tutelados.
  if not v_target.is_ward then
    raise exception 'REZET_MEMBER_HAS_ACCOUNT: usa quitar del hogar para quien tiene cuenta';
  end if;

  -- Borrado lógico: su historial sigue teniendo un nombre al que apuntar.
  update public.member set deleted_at = now() where id = p_member_id;
end;
$$;

revoke all on function public.delete_ward_member(uuid) from public, anon;
grant execute on function public.delete_ward_member(uuid) to authenticated;

create or replace function public.set_member_settings(p_member_id uuid, p_patch jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth_user_id uuid;
begin
  if not (select private.can_act_for(p_member_id)) then
    raise exception 'REZET_FORBIDDEN: no puedes editar a ese miembro';
  end if;

  update public.member set
    display_name = coalesce(nullif(btrim(p_patch->>'display_name'), ''), display_name),
    color        = coalesce(nullif(btrim(p_patch->>'color'), ''), color),
    avatar_path  = case when p_patch ? 'avatar_path' then p_patch->>'avatar_path' else avatar_path end,
    sort_order   = coalesce((p_patch->>'sort_order')::int, sort_order),
    kcal_target  = coalesce((p_patch->>'kcal_target')::int, kcal_target)
  where id = p_member_id
  returning auth_user_id into v_auth_user_id;

  -- Espejo en profile mientras haya PWA cacheadas que lean de ahí el nombre.
  if v_auth_user_id is not null and nullif(btrim(p_patch->>'display_name'), '') is not null then
    update public.profile set display_name = btrim(p_patch->>'display_name')
     where id = v_auth_user_id;
  end if;
end;
$$;

revoke all on function public.set_member_settings(uuid, jsonb) from public, anon;
grant execute on function public.set_member_settings(uuid, jsonb) to authenticated;
```

- [ ] **Step 4: Ejecutar los tests**

```bash
cd app && npx vitest run supabase/tests/migrations.test.ts
```
Esperado: PASS.

- [ ] **Step 5: Gate y commit**

```bash
cd app && npm run lint && npm test
git add app/supabase/migrations/20260920090100_rezet_member_ward_rpcs.sql app/supabase/tests/migrations.test.ts
git commit -m "feat(db): RPC de alta, baja y edición de miembros"
```

---

### Task 5: Enganchar `member` al ciclo de vida del hogar

Hasta ahora `member` solo se rellena con el backfill. Esta tarea hace que se cree al crear hogar o canjear invitación, y que se marque `deleted_at` en las cuatro salidas. Spec §5.1.

**Files:**
- Create: `app/supabase/migrations/20260920090200_rezet_member_lifecycle.sql`
- Modify: `app/supabase/tests/migrations.test.ts`

**Interfaces:**
- Consumes: tabla `member` (T3).
- Produces: versiones nuevas de `create_household`, `redeem_invite`, `leave_household`, `remove_member`, `delete_household`, `delete_account`. Mismas firmas y mismos mensajes de error que hoy.

**Antes de escribir nada:** copia el cuerpo **actual** de cada función desde su última migración, y cámbialo solo donde diga este plan. Las últimas versiones están en:

| Función | Última definición |
|---|---|
| `create_household` | `20260917220000_rezet_lock_profile_insert.sql` |
| `redeem_invite` | `20260919100100_rezet_remove_member_demote_admin.sql` |
| `remove_member` | `20260919100100_rezet_remove_member_demote_admin.sql` |
| `leave_household`, `delete_household`, `delete_account` | `20260907181314_rezet_multi_admin_household_and_delete_account.sql` (ojo: revisa si `20260918100200_rezet_harden_transactional_rpcs.sql` las redefine; si lo hace, esa manda) |

- [ ] **Step 1: Escribir los tests**

```ts
  it('crear hogar y canjear invitación crean también el member', async () => {
    const db = await applyMigrations();
    const ana = await createAuthUser(db);
    const bea = await createAuthUser(db);

    await asUser(db, ana, "select public.create_household('Casa', 'Ana')");
    await asUser(db, ana, 'select public.create_invite()');
    const code = await db.query<{ code: string }>('select code from public.household_invite limit 1');
    await asUser(db, bea, `select public.redeem_invite('${code.rows[0].code}', 'Bea')`);

    const res = await db.query<{ n: number }>(
      'select count(*)::int as n from public.member where deleted_at is null',
    );
    expect(res.rows[0].n).toBe(2);
    await db.close();
  }, 120_000);

  it('salir del hogar marca el member como borrado, no lo elimina', async () => {
    const db = await applyMigrations();
    const ana = await createAuthUser(db);
    const bea = await createAuthUser(db);
    await asUser(db, ana, "select public.create_household('Casa', 'Ana')");
    await asUser(db, ana, 'select public.create_invite()');
    const code = await db.query<{ code: string }>('select code from public.household_invite limit 1');
    await asUser(db, bea, `select public.redeem_invite('${code.rows[0].code}', 'Bea')`);

    await asUser(db, bea, 'select public.leave_household()');

    const res = await db.query<{ n: number; borrados: number }>(
      `select count(*)::int as n,
              count(*) filter (where deleted_at is not null)::int as borrados
         from public.member`,
    );
    expect(res.rows[0].n).toBe(2);
    expect(res.rows[0].borrados).toBe(1);
    await db.close();
  }, 120_000);

  it('quien se va deja de ser tutelable aunque pierda la cuenta', async () => {
    const db = await applyMigrations();
    const ana = await createAuthUser(db);
    const bea = await createAuthUser(db);
    await asUser(db, ana, "select public.create_household('Casa', 'Ana')");
    await asUser(db, ana, 'select public.create_invite()');
    const code = await db.query<{ code: string }>('select code from public.household_invite limit 1');
    await asUser(db, bea, `select public.redeem_invite('${code.rows[0].code}', 'Bea')`);
    const beaMember = await db.query<{ id: string }>(
      `select id from public.member where auth_user_id = '${bea}'`,
    );

    await asUser(db, bea, 'select public.leave_household()');

    const puede = await asUser(
      db,
      ana,
      `select private.can_act_for('${beaMember.rows[0].id}') as ok`,
    );
    expect((puede as { rows: { ok: boolean }[] }).rows[0].ok).toBe(false);
    await db.close();
  }, 120_000);
```

El tercer test es el que cierra el bloqueante B1 de la revisión: al borrar `profile`, el `on delete set null` deja `auth_user_id` a null, y sin `is_ward` **y** sin `deleted_at` esa persona pasaría a ser tutelada por quien se queda.

- [ ] **Step 2: Ejecutar y ver que falla**

```bash
cd app && npx vitest run supabase/tests/migrations.test.ts
```
Esperado: FAIL — el primero da 0 miembros nuevos; el segundo, 1 fila en vez de 2.

- [ ] **Step 3: Escribir la migración**

`app/supabase/migrations/20260920090200_rezet_member_lifecycle.sql`. Para cada función: copia su cuerpo actual íntegro y aplica **solo** este cambio.

En `create_household`, justo después del `insert into public.profile …`:

```sql
  insert into public.member (household_id, auth_user_id, display_name, kcal_target)
  values (v_household_id, (select auth.uid()), p_display_name,
          (select kcal_target from public.household where id = v_household_id));
```

En `redeem_invite`, justo después del `insert into public.profile …`:

```sql
  insert into public.member (household_id, auth_user_id, display_name, kcal_target)
  values (v_invite.household_id, (select auth.uid()), p_display_name,
          (select kcal_target from public.household where id = v_invite.household_id));
```

En `leave_household` y en la rama equivalente de `delete_account`, **antes** del `delete from public.profile where id = v_uid;`:

```sql
  -- Borrado lógico: el historial de consumo y las recetas que creó siguen
  -- necesitando un nombre al que apuntar.
  update public.member set deleted_at = now() where auth_user_id = v_uid;
  -- FASE 2: aquí irá `delete from public.member_body where member_id = …`.
  -- Los datos corporales no deben sobrevivir a la salida del hogar.
```

En `remove_member`, antes del `delete from public.profile where id = p_member_id;` (o `p_profile_id` si ya se renombró):

```sql
  update public.member set deleted_at = now() where auth_user_id = p_member_id;
```

En `delete_household` y en la rama de `delete_account` que borra el hogar entero **no hace falta nada**: `member.household_id` tiene `on delete cascade`, así que la tabla se vacía sola. Añade un comentario diciéndolo, para que nadie lo "arregle" luego.

- [ ] **Step 4: Ejecutar los tests**

```bash
cd app && npx vitest run supabase/tests/migrations.test.ts
```
Esperado: PASS, incluido el test de backfill de la Tarea 3 si se había quedado en rojo.

- [ ] **Step 5: Gate y commit**

```bash
cd app && npm run lint && npm test
git add app/supabase/migrations/20260920090200_rezet_member_lifecycle.sql app/supabase/tests/migrations.test.ts
git commit -m "feat(db): crear y retirar member en el ciclo de vida del hogar"
```

---

### Task 6: Separar los dos espacios de identificadores

Spec §3.6. `p_member_id` ya significa "id de `profile`" en tres RPC. Con `member.id` en juego, el mismo nombre y el mismo tipo `uuid` en dos cosas distintas es una escritura cruzada esperando a pasar.

**Files:**
- Create: `app/supabase/migrations/20260920090300_rezet_profile_id_params.sql`
- Modify: `app/supabase/tests/migrations.test.ts`

**Interfaces:**
- Produces: `public.remove_member(p_profile_id uuid)`, `public.promote_admin(p_profile_id uuid)`, `public.demote_admin(p_profile_id uuid)`; y los envoltorios `…(p_member_id uuid)` que siguen funcionando.

- [ ] **Step 1: Escribir el test**

```ts
  it('las RPC de perfil aceptan el nombre viejo y el nuevo', async () => {
    const db = await applyMigrations();
    const ana = await createAuthUser(db);
    const bea = await createAuthUser(db);
    await asUser(db, ana, "select public.create_household('Casa', 'Ana')");
    await asUser(db, ana, 'select public.create_invite()');
    const code = await db.query<{ code: string }>('select code from public.household_invite limit 1');
    await asUser(db, bea, `select public.redeem_invite('${code.rows[0].code}', 'Bea')`);

    // Nombre nuevo.
    await asUser(db, ana, `select public.promote_admin(p_profile_id => '${bea}')`);
    const tras = await db.query<{ is_admin: boolean }>(
      `select is_admin from public.profile where id = '${bea}'`,
    );
    expect(tras.rows[0].is_admin).toBe(true);

    // Nombre viejo: el envoltorio sigue vivo para las PWA cacheadas.
    await asUser(db, ana, `select public.demote_admin(p_member_id => '${bea}')`);
    const vuelta = await db.query<{ is_admin: boolean }>(
      `select is_admin from public.profile where id = '${bea}'`,
    );
    expect(vuelta.rows[0].is_admin).toBe(false);
    await db.close();
  }, 120_000);
```

- [ ] **Step 2: Ejecutar y ver que falla**

```bash
cd app && npx vitest run supabase/tests/migrations.test.ts
```
Esperado: FAIL, `function public.promote_admin(p_profile_id => …) does not exist`.

- [ ] **Step 3: Escribir la migración**

Para cada una de las tres: declara la versión con `p_profile_id` copiando el cuerpo actual (de `20260919100100_rezet_remove_member_demote_admin.sql` para `remove_member` y `demote_admin`, de `20260907181314` para `promote_admin`; comprueba antes si alguna migración posterior las redefine) y añade el envoltorio.

Plantilla, que hay que repetir para las tres:

```sql
-- Diseño §3.6 — `p_member_id` pasa a significar SIEMPRE un id de `member`.
-- Lo que apunta a `profile` se llama `p_profile_id`. Renombrar un parámetro
-- con nombre rompe a los clientes que lo invocan por nombre, así que la
-- versión vieja sobrevive como envoltorio hasta que caduquen las PWA
-- cacheadas.

drop function if exists public.promote_admin(uuid);

create or replace function public.promote_admin(p_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- …cuerpo actual, con p_member_id sustituido por p_profile_id…
end;
$$;

revoke all on function public.promote_admin(uuid) from public, anon;
grant execute on function public.promote_admin(uuid) to authenticated;
```

**Atención:** `drop function` + `create` con otro nombre de parámetro es obligatorio — `create or replace` **no** puede cambiar el nombre de un parámetro y falla con `cannot change name of input parameter`.

Los envoltorios no pueden tener la misma firma `(uuid)`, así que se distinguen por nombre de función, no por parámetro:

```sql
-- Envoltorio de compatibilidad: las PWA anteriores a esta versión llaman por
-- nombre de parámetro (`p_member_id`). Sin esto, su botón de quitar del
-- hogar fallaría en silencio, como pasó con el de invitar en 1.6.0.
create or replace function public.promote_admin_by_member(p_member_id uuid)
returns void language sql security invoker set search_path = ''
as $$ select public.promote_admin(p_member_id) $$;
```

**Si al escribirlo compruebas que PostgREST resuelve la llamada por nombre de parámetro y el envoltorio con otro nombre de función no la cubre, para y repórtalo**: en ese caso la opción correcta es mantener las dos firmas declarando la nueva con un parámetro más (`p_profile_id uuid, p_unused boolean default null`), y hay que decidirlo con el usuario, no por tu cuenta.

- [ ] **Step 4: Ejecutar los tests**

```bash
cd app && npx vitest run supabase/tests/migrations.test.ts
```
Esperado: PASS.

- [ ] **Step 5: Gate y commit**

```bash
cd app && npm run lint && npm test
git add app/supabase/migrations/20260920090300_rezet_profile_id_params.sql app/supabase/tests/migrations.test.ts
git commit -m "refactor(db): p_profile_id para lo que apunta a profile"
```

---

### Task 7: Tipos y contrato `Store`

**Files:**
- Modify: `app/src/types.ts`, `app/src/data/storeContext.ts`

**Interfaces:**
- Produces: `MemberId`, `ProfileId`, `Member`; y en `Store`: `members`, `myMemberId`, `createWardMember`, `deleteWardMember`, `setMemberSettings`.

- [ ] **Step 1: Añadir los tipos**

Al final de `app/src/types.ts`:

```ts
/**
 * Dos espacios de identificadores distintos que son los dos `uuid`: el de
 * `profile` (cuenta, hogar, rol de admin) y el de `member` (identidad de
 * producto, incluidos los que no tienen cuenta). Marcarlos hace que el
 * compilador se acuerde de la diferencia dentro de seis meses; mezclarlos
 * escribe en la fila de otra persona sin que nada falle en tiempo de
 * ejecución.
 */
export type ProfileId = string & { readonly __profile: unique symbol };
export type MemberId = string & { readonly __member: unique symbol };

export const asProfileId = (v: string): ProfileId => v as ProfileId;
export const asMemberId = (v: string): MemberId => v as MemberId;

/** Miembro del hogar, tenga cuenta o no. */
export interface Member {
  id: MemberId;
  /** `null` si es un miembro sin cuenta (tutelado). */
  authUserId: ProfileId | null;
  /** Solo los tutelados se pueden editar y borrar por otros miembros. */
  isWard: boolean;
  displayName: string;
  /** Ruta en el bucket `avatars`, o `null` para pintar la inicial. */
  avatarPath: string | null;
  color: Accent;
  sortOrder: number;
  kcalTarget: number;
  /** No null = ya no está en el hogar. Se sigue leyendo para la atribución. */
  deletedAt: string | null;
}
```

- [ ] **Step 2: Ampliar el contrato**

En `app/src/data/storeContext.ts`, dentro de `interface Store`:

```ts
  /**
   * Miembros del hogar, **incluidos los borrados**: hacen falta para poner
   * nombre a lo que dejaron hecho. Filtra por `deletedAt === null` en
   * cualquier lista que el usuario vaya a tocar.
   */
  members: Member[];
  /** El miembro que corresponde a la sesión. `null` en demo y mientras carga. */
  myMemberId: MemberId | null;

  /** Contrato: `rpc/create_ward_member`. Solo admins. Devuelve el id nuevo. */
  createWardMember: (displayName: string, color: Accent) => Promise<MemberId>;
  /**
   * Contrato: `rpc/delete_ward_member`. Solo admins, y solo sobre miembros
   * SIN cuenta: a quien tiene cuenta se le saca con `removeMember`.
   */
  deleteWardMember: (memberId: MemberId) => Promise<void>;
  /**
   * Contrato: `rpc/set_member_settings`. Escribe la lista blanca
   * (`displayName`, `color`, `avatarPath`, `sortOrder`, `kcalTarget`) del
   * miembro propio o de un tutelado del hogar. El servidor ignora cualquier
   * otra clave.
   */
  setMemberSettings: (memberId: MemberId, patch: MemberSettingsPatch) => Promise<void>;
```

y, fuera de la interfaz:

```ts
export interface MemberSettingsPatch {
  displayName?: string;
  color?: Accent;
  avatarPath?: string | null;
  sortOrder?: number;
  kcalTarget?: number;
}
```

Añade `Accent`, `Member` y `MemberId` al import de `../types`.

- [ ] **Step 3: Ver el fallo de compilación**

```bash
cd app && npm run lint
```
Esperado: FAIL — los dos proveedores (`store.tsx`, `supabaseStore.tsx`) ya no cumplen el contrato. Es lo que se busca: el compilador es la lista de lo que falta por hacer en las Tareas 8 y 9.

- [ ] **Step 4: Commit**

No hay gate verde en esta tarea: se commitea el contrato roto a propósito, y las dos tareas siguientes lo cierran.

```bash
git add app/src/types.ts app/src/data/storeContext.ts
git commit -m "feat(types): contrato de miembros en el Store"
```

---

### Task 8: Implementar miembros en la capa real

**Files:**
- Create: `app/src/data/supabaseStore/useMembers.ts`
- Modify: `app/src/data/supabaseStore.tsx`

**Interfaces:**
- Consumes: `storeKeys.members` (T2), tipos de T7, RPC de T4.
- Produces: `useMembers(householdId, authUserId)` → `{ members, myMemberId, createWardMember, deleteWardMember, setMemberSettings }`.

- [ ] **Step 1: Escribir el hook**

`app/src/data/supabaseStore/useMembers.ts`:

```ts
import { useCallback, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../supabaseClient';
import { storeKeys } from './keys';
import { asMemberId, asProfileId, type Accent, type Member, type MemberId } from '../../types';
import type { MemberSettingsPatch } from '../storeContext';

interface MemberRow {
  id: string;
  auth_user_id: string | null;
  is_ward: boolean;
  display_name: string;
  avatar_path: string | null;
  color: string;
  sort_order: number;
  kcal_target: number;
  deleted_at: string | null;
}

function mapMember(row: MemberRow): Member {
  return {
    id: asMemberId(row.id),
    authUserId: row.auth_user_id ? asProfileId(row.auth_user_id) : null,
    isWard: row.is_ward,
    displayName: row.display_name,
    avatarPath: row.avatar_path,
    color: row.color as Accent,
    sortOrder: row.sort_order,
    kcalTarget: row.kcal_target,
    deletedAt: row.deleted_at,
  };
}

/**
 * Los miembros del hogar. Se piden TAMBIÉN los borrados: la pantalla los
 * esconde, pero sin ellos no hay forma de poner nombre a lo que dejaron
 * hecho quienes ya no están.
 */
export function useMembers(householdId: string, authUserId: string | null) {
  const queryClient = useQueryClient();
  const key = useMemo(() => storeKeys.members(householdId), [householdId]);

  const membersQ = useQuery({
    queryKey: key,
    queryFn: async (): Promise<Member[]> => {
      const { data, error } = await supabase
        .from('member')
        .select('id, auth_user_id, is_ward, display_name, avatar_path, color, sort_order, kcal_target, deleted_at')
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return (data as MemberRow[]).map(mapMember);
    },
  });

  const members = useMemo(() => membersQ.data ?? [], [membersQ.data]);

  const myMemberId = useMemo(
    () => members.find((m) => m.authUserId === authUserId && !m.deletedAt)?.id ?? null,
    [members, authUserId],
  );

  const invalidate = useCallback(
    () => queryClient.invalidateQueries({ queryKey: key }),
    [queryClient, key],
  );

  const createMut = useMutation({
    mutationFn: async ({ displayName, color }: { displayName: string; color: Accent }) => {
      const { data, error } = await supabase.rpc('create_ward_member', {
        p_display_name: displayName,
        p_color: color,
      });
      if (error) throw error;
      return asMemberId(data as string);
    },
    onSuccess: () => void invalidate(),
  });

  const deleteMut = useMutation({
    mutationFn: async (memberId: MemberId) => {
      const { error } = await supabase.rpc('delete_ward_member', { p_member_id: memberId });
      if (error) throw error;
    },
    onSuccess: () => void invalidate(),
  });

  const settingsMut = useMutation({
    mutationFn: async ({ memberId, patch }: { memberId: MemberId; patch: MemberSettingsPatch }) => {
      // Se manda solo lo que trae el patch: el servidor conserva lo ausente,
      // así que enviar `undefined` como null borraría datos sin querer.
      const payload: Record<string, unknown> = {};
      if (patch.displayName !== undefined) payload.display_name = patch.displayName;
      if (patch.color !== undefined) payload.color = patch.color;
      if (patch.avatarPath !== undefined) payload.avatar_path = patch.avatarPath;
      if (patch.sortOrder !== undefined) payload.sort_order = patch.sortOrder;
      if (patch.kcalTarget !== undefined) payload.kcal_target = patch.kcalTarget;

      const { error } = await supabase.rpc('set_member_settings', {
        p_member_id: memberId,
        p_patch: payload,
      });
      if (error) throw error;
    },
    onSuccess: () => void invalidate(),
  });

  const createWardMember = useCallback(
    (displayName: string, color: Accent) => createMut.mutateAsync({ displayName, color }),
    [createMut],
  );
  const deleteWardMember = useCallback((memberId: MemberId) => deleteMut.mutateAsync(memberId), [deleteMut]);
  const setMemberSettings = useCallback(
    (memberId: MemberId, patch: MemberSettingsPatch) => settingsMut.mutateAsync({ memberId, patch }),
    [settingsMut],
  );

  return { members, myMemberId, createWardMember, deleteWardMember, setMemberSettings };
}
```

- [ ] **Step 2: Cablearlo en el proveedor**

En `app/src/data/supabaseStore.tsx`: importa `useMembers`, llámalo junto al resto de hooks —

```ts
const { members, myMemberId, createWardMember, deleteWardMember, setMemberSettings } =
  useMembers(householdId, session?.user.id ?? null);
```

(usa la misma fuente de `session`/`profile` que ya emplea el fichero; mira cómo obtiene `householdId`) — y añade las cinco al objeto `value` del `useMemo` final, con sus dependencias.

- [ ] **Step 3: Gate**

```bash
cd app && npm run lint && npm test
```
Esperado: `lint` sigue fallando **solo** por `store.tsx` (demo), que es la Tarea 9. Si falla por `supabaseStore.tsx`, arréglalo aquí.

- [ ] **Step 4: Commit**

```bash
git add app/src/data/supabaseStore/useMembers.ts app/src/data/supabaseStore.tsx
git commit -m "feat(data): miembros del hogar en la capa real"
```

---

### Task 9: Miembros en el modo demo, e interfaz

Spec §5.5 y §5.6. La demo no tiene hogar multiusuario y `HouseholdSheet` **nunca se renderiza** en ella (`store.tsx:78-95`), así que aquí hay que abrir superficie nueva, no solo sembrar datos.

**Files:**
- Create: `app/src/ui/Avatar.tsx`, `app/src/sheets/MemberSheet.tsx`
- Modify: `app/src/data/store.tsx`, `app/src/data/seed.ts`, `app/src/sheets/HouseholdSheet.tsx`, `app/src/sheets/SettingsSheet.tsx`, `app/src/i18n/es.ts`, `app/src/i18n/en.ts`, `app/src/App.tsx`

**Interfaces:**
- Consumes: contrato de T7, hook de T8.
- Produces: `<Avatar member={…} size={…} />`, `<MemberSheet memberId={…} onClose={…} />`.

- [ ] **Step 1: Sembrar la demo**

En `app/src/data/seed.ts` añade y exporta:

```ts
/** Tres miembros para que la demo enseñe de qué va la personalización. */
export const MEMBERS: Member[] = [
  { id: asMemberId('demo-ana'), authUserId: asProfileId('demo-user'), isWard: false,
    displayName: 'Ana', avatarPath: null, color: 'green', sortOrder: 0, kcalTarget: 2000, deletedAt: null },
  { id: asMemberId('demo-jars'), authUserId: null, isWard: false,
    displayName: 'Jars', avatarPath: null, color: 'blue', sortOrder: 1, kcalTarget: 2500, deletedAt: null },
  { id: asMemberId('demo-nico'), authUserId: null, isWard: true,
    displayName: 'Nico', avatarPath: null, color: 'amber', sortOrder: 2, kcalTarget: 1600, deletedAt: null },
];
```

En `app/src/data/store.tsx`, añade `members` al estado persistido (`Data`/`INITIAL`), expón `myMemberId` como `MEMBERS[0].id`, e implementa las tres funciones **de verdad** sobre el estado local: `createWardMember` añade una fila, `deleteWardMember` marca `deletedAt`, `setMemberSettings` aplica el patch. No uses `demoHouseholdActionUnavailable` para estas tres: son exactamente lo que la demo tiene que poder enseñar.

- [ ] **Step 2: El avatar**

`app/src/ui/Avatar.tsx`:

```tsx
import { ACCENTS } from '../store/prefs';
import type { Member } from '../types';

/**
 * La inicial sobre el color del miembro es el caso NORMAL, no el hueco de
 * cuando falta la foto: casi nadie va a subir una. Tiene que verse bien.
 */
export function Avatar({
  member,
  size = 36,
  src,
}: {
  member: Member;
  size?: number;
  /** URL firmada del avatar, si la hay (el bucket no es público). */
  src?: string | null;
}) {
  const initial = member.displayName.trim().charAt(0).toUpperCase() || '·';
  return (
    <div
      aria-hidden
      style={{
        width: size,
        height: size,
        flex: `0 0 ${size}px`,
        borderRadius: '50%',
        overflow: 'hidden',
        background: ACCENTS[member.color],
        display: 'grid',
        placeItems: 'center',
        // Texto sobre un relleno de acento: --onaccent. Nunca --accent-ink,
        // que es para texto sobre fondo claro o tintado.
        color: 'var(--onaccent)',
        fontSize: Math.round(size * 0.42),
        fontWeight: 600,
        opacity: member.deletedAt ? 0.45 : 1,
      }}
    >
      {src ? (
        <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        initial
      )}
    </div>
  );
}
```

El `aria-hidden` es deliberado: el avatar acompaña siempre al nombre del miembro en texto, así que anunciarlo otra vez solo repite.

- [ ] **Step 3: Los textos**

Añade a `es.ts` y `en.ts`, en la familia `member*`, junto a las claves `household*` que ya existen (~línea 232):

```ts
  memberSheetTitle: 'Miembro',
  memberKcalTarget: 'Objetivo diario',
  memberColor: 'Color',
  memberName: 'Nombre',
  addWardMember: 'Añadir a alguien sin cuenta',
  addWardMemberBody: 'Para quien no usa la app: un hijo, un invitado. Sus datos los verán todas las personas con cuenta de este hogar.',
  addWardMemberAction: 'Añadir',
  removeWardMember: 'Quitar del hogar',
  memberInactive: 'Ya no está en el hogar',
  settingsSynced: 'Sincronizado con tu cuenta',
  settingsLocalOnly: 'Solo en este dispositivo',
```

El `addWardMemberBody` es el aviso de privacidad de la spec §3.2 y va **en el propio formulario**, no detrás de un enlace.

- [ ] **Step 4: Las hojas**

- `MemberSheet.tsx`: nombre, color (los siete de `ACCENTS`), objetivo de kcal con un `Stepper`, y "Quitar del hogar" solo si `member.isWard` y eres admin. Guarda con `setMemberSettings`. Sigue el patrón de una hoja existente (`PantryAddSheet.tsx` es la más parecida).
- `HouseholdSheet.tsx`: la lista pasa a pintar `<Avatar>` y el objetivo de cada miembro, abre `MemberSheet` al tocar, filtra `deletedAt === null`, y muestra el botón de añadir tutelado si `profile.isAdmin`.
- `SettingsSheet.tsx`: una línea con `settingsSynced` o `settingsLocalOnly` según haya sesión.
- `App.tsx`: monta `MemberSheet` con el resto de hojas, y **deja que `HouseholdSheet` se abra también en demo** (hoy se anula con `onInvite={demo ? undefined : …}`: mantén anuladas las acciones de hogar, no la hoja entera).

- [ ] **Step 5: Gate**

```bash
cd app && npm run lint && npm test
```
Esperado: PASS. Aquí es donde el contrato roto de la Tarea 7 vuelve a verde.

- [ ] **Step 6: Comprobarlo en el navegador**

```bash
cd app && npm run dev
```
Entra con "Ver la demo" → Ajustes → Tu hogar. Tienen que verse los tres miembros con su avatar de color y su objetivo; añadir y quitar un tutelado tiene que funcionar y sobrevivir a recargar la página. **Si no, no commitees: repórtalo.**

- [ ] **Step 7: Commit**

```bash
git add app/src/ui/Avatar.tsx app/src/sheets/MemberSheet.tsx app/src/data/store.tsx app/src/data/seed.ts app/src/sheets/HouseholdSheet.tsx app/src/sheets/SettingsSheet.tsx app/src/i18n/es.ts app/src/i18n/en.ts app/src/App.tsx
git commit -m "feat(ui): miembros del hogar con avatar, color y objetivo propio"
```

---

### Task 10: Los ajustes dejan de vivir solo en el dispositivo

Spec §3.5. Hoy `profile.locale/theme/accent/units` tienen grant desde `20260918100100` y **nadie las escribe**, mientras `profile.locale` sí se lee en `finish_cook` (`20260905132618:33`) y en las dos entradas del MCP (`mcp/src/supabase.ts:31`, `mcp/src/worker/supabaseAuth.ts:96`). Resultado: el MCP responde siempre en español. Esta tarea lo arregla.

**Files:**
- Create: `app/src/app/PrefsBridge.tsx`
- Modify: `app/src/store/prefs.tsx`, `app/src/App.tsx`

**Interfaces:**
- Produces: `hydrateFromServer(partial: Partial<Prefs>): void` en el contexto de prefs; `<PrefsBridge />`.

**Por qué un puente y no reordenar el árbol:** `app/src/main.tsx:19-22` monta `PrefsProvider` **encima** de `AuthProvider`, y las dos capas de datos consumen prefs (`store.tsx:99`, `supabaseStore.tsx:7,178`). Invertir el árbol rompería a los dos stores. El puente se monta dentro de `AuthProvider` y empuja hacia arriba.

- [ ] **Step 1: Ampliar el contexto de prefs**

En `app/src/store/prefs.tsx`, añade al valor del contexto:

```ts
  /**
   * Aplica los ajustes que vienen del servidor. Se llama una vez por sesión,
   * desde `PrefsBridge`: el dispositivo pinta al instante desde
   * localStorage, y cuando hay sesión el servidor gana.
   */
  hydrateFromServer: (partial: Partial<Prefs>) => void;
```

implementado como `(partial) => setPrefs((p) => ({ ...p, ...partial }))`.

**`showIdeas` no entra**: es una preferencia de pantalla, por dispositivo, y así se queda.

- [ ] **Step 2: Escribir el puente**

`app/src/app/PrefsBridge.tsx`:

```tsx
import { useEffect, useRef } from 'react';
import { useAuth } from '../data/auth';
import { usePrefs } from '../store/prefs';
import { supabase } from '../data/supabaseClient';

/**
 * Trae los ajustes de la cuenta al arrancar la sesión, y los devuelve al
 * servidor cuando cambian. Existe porque `PrefsProvider` está por encima de
 * `AuthProvider` (main.tsx) y no puede leer la sesión por sí mismo.
 *
 * El servidor gana sobre el dispositivo: si entras en un móvil nuevo, te
 * encuentras tus ajustes, no los de fábrica.
 */
export function PrefsBridge() {
  const { profile } = useAuth();
  const { locale, theme, accent, units, hydrateFromServer } = usePrefs();
  const hydrated = useRef<string | null>(null);

  useEffect(() => {
    if (!profile || hydrated.current === profile.id) return;
    hydrated.current = profile.id;
    void (async () => {
      const { data } = await supabase
        .from('profile')
        .select('locale, theme, accent, units')
        .eq('id', profile.id)
        .maybeSingle();
      if (data) {
        hydrateFromServer({
          locale: data.locale as typeof locale,
          theme: data.theme as typeof theme,
          accent: data.accent as typeof accent,
          units: data.units as typeof units,
        });
      }
    })();
  }, [profile, hydrateFromServer, locale, theme, accent, units]);

  useEffect(() => {
    if (!profile || hydrated.current !== profile.id) return;
    // Reintento silencioso: que falle la escritura no debe romper la
    // interfaz, el dispositivo ya tiene el valor bueno en localStorage.
    void supabase.from('profile').update({ locale, theme, accent, units }).eq('id', profile.id);
  }, [profile, locale, theme, accent, units]);

  return null;
}
```

**Cuidado con el orden:** el segundo efecto no debe escribir antes de que el primero haya hidratado, o el dispositivo pisaría los ajustes buenos del servidor. Por eso la guarda `hydrated.current !== profile.id`.

- [ ] **Step 3: Montarlo**

En `app/src/App.tsx`, dentro del árbol con sesión (donde ya se sabe que hay `profile`), monta `<PrefsBridge />`. **Nunca en el camino de demo**: ahí no hay cuenta y todo se queda local.

- [ ] **Step 4: Gate y prueba manual**

```bash
cd app && npm run lint && npm test
```

Y con una cuenta real (`npm run dev`, login normal): cambia el tema, recarga con el `localStorage` borrado (DevTools → Application → Local Storage → borrar `rezet.prefs`) y comprueba que vuelve el tema guardado, no el de fábrica.

- [ ] **Step 5: Commit**

```bash
git add app/src/app/PrefsBridge.tsx app/src/store/prefs.tsx app/src/App.tsx
git commit -m "feat(prefs): los ajustes se guardan en la cuenta y siguen al usuario"
```

---

### Task 11: Avatares en Storage

Spec §5.4. Ruta **plana** `<household_id>/<uuid>.jpg`: `20260919100300_rezet_bound_recipe_photo_paths.sql` existe precisamente para prohibir rutas anidadas, que se escapan del barrido de huérfanos.

**Files:**
- Create: `app/supabase/migrations/20260920090400_rezet_avatars_storage.sql`
- Modify: `app/src/sheets/MemberSheet.tsx`, `app/supabase/functions/cleanup-orphan-photos/logic.ts`, `app/supabase/tests/migrations.test.ts`

- [ ] **Step 1: La migración**

`app/supabase/migrations/20260920090400_rezet_avatars_storage.sql`:

```sql
-- Diseño §5.4 — bucket de avatares. Dos diferencias con `recipe-photos`:
--   * la lectura NO es pública: la cara de alguien no es una foto de comida,
--     así que se acota al propio hogar;
--   * la ruta es plana desde el principio. 20260919100300 existe porque los
--     objetos anidados se escapan del barrido de huérfanos; no se repite el
--     error.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 2097152, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

create policy avatars_read on storage.objects for select
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select private.current_household())::text
  );

create policy avatars_insert on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and name ~ ('^' || (select private.current_household())::text
                || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$')
  );

create policy avatars_update on storage.objects for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select private.current_household())::text
  )
  with check (
    bucket_id = 'avatars'
    and name ~ ('^' || (select private.current_household())::text
                || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$')
  );

create policy avatars_delete on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select private.current_household())::text
  );

-- Misma regla en la columna, para que un PATCH directo no apunte al avatar
-- de otro hogar ni fije un objeto contra la limpieza. NOT VALID como en
-- 20260919100300: no revalida filas antiguas.
alter table public.member
  add constraint member_avatar_path_own_folder check (
    avatar_path is null
    or avatar_path = ''
    or (avatar_path ~ ('^' || household_id::text || '/[^/]+$') and position('..' in avatar_path) = 0)
  ) not valid;
```

**Lectura no pública** significa que el cliente necesita URL firmada (`createSignedUrl`), no `getPublicUrl` como con las fotos de receta. Tenlo en cuenta en el Step 3.

- [ ] **Step 2: Test del banco**

Un test que compruebe que una ruta anidada (`hogar/miembro/foto.jpg`) se rechaza y una plana se acepta, calcado del que ya existe para `recipe-photos` en `migrations.test.ts` (búscalo por `nested` o `recipe-photos`).

- [ ] **Step 3: La subida**

En `MemberSheet.tsx`, un botón de subir foto que reutilice el patrón de subida de `RecipeForm.tsx` (compresión incluida), suba a `avatars` y guarde la ruta con `setMemberSettings({ avatarPath })`.

- [ ] **Step 4: La limpieza**

En `cleanup-orphan-photos/logic.ts`, añade el bucket `avatars` al barrido, contrastando contra `member.avatar_path` igual que hoy se hace contra `recipe.photo_path`. Comprueba que sigue compilando:

```bash
cd app && npx --yes deno@2 check --node-modules-dir=none supabase/functions/cleanup-orphan-photos/index.ts
```

Si Deno no se puede instalar en esta máquina, **dilo en el informe**: significa que ese código va a producción sin comprobar.

- [ ] **Step 5: Gate y commit**

```bash
cd app && npm run lint && npm test
git add app/supabase/migrations/20260920090400_rezet_avatars_storage.sql app/src/sheets/MemberSheet.tsx app/supabase/functions/cleanup-orphan-photos/logic.ts app/supabase/tests/migrations.test.ts
git commit -m "feat(storage): avatares de miembro"
```

---

### Task 12: Versión, changelog y documentación

**Files:**
- Modify: `CHANGELOG.md`, `CLAUDE.md`, `app/package.json` y `mcp/package.json` (vía script)

- [ ] **Step 1: Subir la versión**

```bash
node tools/release/bump-version.mjs minor
```

Es `minor`: hay funcionalidad nueva y ningún cambio incompatible.

- [ ] **Step 2: Entrada del CHANGELOG**

Bilingüe, como el resto del fichero. Tiene que decir, sin adornos:

- Miembros del hogar con nombre, color, avatar y objetivo de calorías propio.
- Se pueden añadir personas **sin cuenta** (niños, invitados); sus datos los ven todas las personas con cuenta del hogar.
- Los ajustes (tema, idioma, acento, unidades) se guardan ya en la cuenta y te siguen entre dispositivos.
- **Cambio de comportamiento:** como consecuencia de lo anterior, el asistente conectado por MCP responde en el idioma que tengas puesto en la app. Antes contestaba siempre en español, porque el idioma nunca llegaba a guardarse.

- [ ] **Step 3: Actualizar `CLAUDE.md`**

En la sección de huecos conocidos, dos líneas:

- `supabaseStore.tsx` está troceado solo a medias: los mapeadores y las claves salieron a `src/data/supabaseStore/`, el resto sigue en el monolito.
- `member_body` y el borrado de datos corporales al salir del hogar son de la fase 2; el sitio exacto está marcado con un comentario `FASE 2` en `20260920090200_rezet_member_lifecycle.sql`.

Y en la descripción de la arquitectura, que `member` es la identidad de producto y que **todo lo personal apunta a `member_id`, nunca a `profile.id`**.

- [ ] **Step 4: Gate y commit**

```bash
cd app && npm run lint && npm test
git add -A
git commit -m "Release X.Y.Z"
```

(La `X.Y.Z` que haya dejado el script.)

- [ ] **Step 5: Parar**

**No despliegues.** El despliegue lo pide el usuario con la skill `deploying-to-main`. Termina con un informe de lo hecho, lo que quedó fuera y cualquier cosa que no encajara con el plan.
