# Plan de corrección de seguridad — Rezet (v2, tras revisión)

> **Para agentes ejecutores:** SUB-SKILL OBLIGATORIA: `superpowers:subagent-driven-development`. Los pasos usan checkbox (`- [ ]`).
> Esta es la **segunda versión** del plan. Una revisión adversarial encontró un fallo P0 en la v1 (un trigger que habría roto todos los guardados de receta en producción) y tres defectos que rompían la premisa de compatibilidad. Todas las correcciones están incorporadas aquí; no consultes la v1.

**Goal:** Cerrar los 7 hallazgos confirmados de la auditoría run-2 más los refuerzos, sin romper a ningún cliente ya instalado y sin que ninguna sentencia SQL se ejecute por primera vez en producción.

**Architecture:** Primero se monta un banco de pruebas de migraciones con PGlite (Postgres real compilado a WASM, sin Docker), y a partir de ahí **todas** las migraciones se prueban en local antes de commitear. La **Fase A** añade capacidades, endurece lo que ningún cliente usa y actualiza el cliente web; incluye un trigger de compatibilidad para que las apps cacheadas antiguas sigan funcionando. La **Fase B**, en una versión posterior, retira el permiso antiguo que ese trigger sostiene.

**Tech Stack:** Supabase (Postgres 15 + RLS + Edge Functions Deno), React 19 + TypeScript + Vite, Cloudflare Workers (MCP), vitest, PGlite.

**Spec:** `~/security-audit-skill/Rezet/run-2/REPORT.md` y `FINDINGS-DETAIL.md`. Cada tarea cita su fingerprint.

## Global Constraints

- **Ninguna tarea toca producción.** Nada de `apply_migration`, `wrangler deploy`, `supabase functions deploy`, `supabase functions delete` ni `git push`. Las migraciones las aplica CI al hacer push a `main`, con la skill `deploying-to-main` y confirmación del usuario.
- **Prefijo de migración** `YYYYMMDDHHMMSS`, estrictamente mayor que `20260917070845`. Usa los nombres exactos de cada tarea.
- **Toda función SQL nueva** lleva `set search_path = ''`, referencia tablas como `public.<tabla>`, y termina con `revoke all on function … from public, anon;` más el `grant execute` que corresponda. Las funciones de trigger en `private.` se revocan también de `authenticated`.
- **Reglas de negocio solo en `app/src/domain/`**. Tokens de color en `app/src/` (no aplica a `mcp/src/worker/html.ts`, que es una página autónoma con hex literal propio).
- **Comentarios en castellano**, explicando el *por qué*.
- **Gate de cada tarea:** `cd app && npm run lint && npm test`. Desde la Task 0, `npm test` incluye el banco de migraciones, así que **sí cubre el SQL**.
- **Commits:** uno por tarea, `fix(ámbito): …` / `feat(ámbito): …`, terminando con `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.
- **Si algo no encaja con lo que dice el plan, para y repórtalo.** No improvises SQL ni "arregles" sobre la marcha: el plan se escribió contra el código exacto que hay en el repo.

---

## Orden de ejecución

Fase A: Task 0 → 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11. Las tasks 1-8 dependen del banco de pruebas de la Task 0. La Task 11 (versión) va la última.

Fase B: solo después de desplegar y verificar la Fase A, y de que los clientes se hayan actualizado.

---

### Task 0: Banco de pruebas de migraciones con PGlite

**Por qué existe:** hoy ninguna sentencia SQL del repositorio se ejecuta antes de producción. La revisión de este plan encontró un trigger que habría roto el guardado de recetas; un banco de pruebas lo habría detenido. PGlite es Postgres real en WASM, se instala con npm y no necesita Docker (que en esta máquina no funciona).

**Files:**
- Modify: `app/package.json` (dependencia de desarrollo)
- Create: `app/supabase/tests/harness.ts`
- Create: `app/supabase/tests/migrations.test.ts`
- Modify: `app/vite.config.ts` (solo si su `test.include` excluye la carpeta nueva)

**Interfaces:**
- Produces: `applyMigrations(): Promise<PGlite>` en `app/supabase/tests/harness.ts`, que devuelve una base con todas las migraciones aplicadas y los stubs de Supabase. Todas las tareas SQL posteriores importan esto.

- [ ] **Step 1: Instalar PGlite**

```bash
cd /home/jars/Programing/Rezet/app && npm install -D @electric-sql/pglite
```

- [ ] **Step 2: Escribir el arnés**

Crea `app/supabase/tests/harness.ts`:

```ts
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';

const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations/', import.meta.url));

/**
 * Objetos que existen en la plataforma Supabase pero no en un Postgres pelado.
 * Son stubs mínimos: lo justo para que las migraciones apliquen y para poder
 * probar RLS de verdad cambiando de rol con `set role`.
 */
const PRELUDE = `
create role anon;
create role authenticated;
create role service_role;

create schema if not exists extensions;
create schema if not exists auth;
create schema if not exists storage;
create schema if not exists vault;
create schema if not exists cron;
create schema if not exists net;

create extension if not exists pgcrypto schema extensions;

create table auth.users (id uuid primary key);

create table storage.buckets (
  id text primary key, name text, public boolean,
  file_size_limit bigint, allowed_mime_types text[]
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text, name text, owner uuid
);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[]
  language sql immutable as $$ select string_to_array(name, '/') $$;

-- auth.uid() lee una variable de sesión: cada test decide quién llama.
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('rezet.test_uid', true), '')::uuid
$$;

create function vault.create_secret(new_secret text, new_name text default null, new_description text default '')
  returns uuid language sql as $$ select gen_random_uuid() $$;
create view vault.decrypted_secrets as select gen_random_uuid() as id, ''::text as name, ''::text as decrypted_secret;
create function cron.schedule(job_name text, schedule text, command text)
  returns bigint language sql as $$ select 1::bigint $$;
create function net.http_post(url text, body jsonb default '{}'::jsonb, params jsonb default '{}'::jsonb,
                              headers jsonb default '{}'::jsonb, timeout_milliseconds integer default 5000)
  returns bigint language sql as $$ select 1::bigint $$;

create publication supabase_realtime;
`;

/** Aplica el prelude y todas las migraciones en orden de nombre de fichero. */
export async function applyMigrations(): Promise<PGlite> {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(PRELUDE);

  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
    try {
      await db.exec(sql);
    } catch (err) {
      throw new Error(`Migración ${file} falló: ${(err as Error).message}`);
    }
  }
  return db;
}

/** Ejecuta `fn` como el rol indicado y con `auth.uid()` fijado. */
export async function asUser(db: PGlite, uid: string, sql: string): Promise<unknown> {
  await db.exec(`set role authenticated; select set_config('rezet.test_uid', '${uid}', false);`);
  try {
    return await db.query(sql);
  } finally {
    await db.exec('reset role;');
  }
}

/** Crea un usuario de auth y devuelve su id. */
export async function createAuthUser(db: PGlite): Promise<string> {
  const res = await db.query<{ id: string }>(
    'insert into auth.users (id) values (gen_random_uuid()) returning id',
  );
  return res.rows[0].id;
}
```

- [ ] **Step 3: Escribir el test que comprueba que todo aplica**

Crea `app/supabase/tests/migrations.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { applyMigrations, asUser, createAuthUser } from './harness';

describe('migraciones', () => {
  it('aplican todas en orden sobre un Postgres limpio', async () => {
    const db = await applyMigrations();
    const res = await db.query<{ n: number }>(
      "select count(*)::int as n from information_schema.tables where table_schema = 'public'",
    );
    expect(res.rows[0].n).toBeGreaterThan(10);
    await db.close();
  }, 120_000);

  it('el ciclo de alta funciona: crear hogar, invitar, canjear', async () => {
    const db = await applyMigrations();
    const a = await createAuthUser(db);
    const b = await createAuthUser(db);

    await asUser(db, a, "select public.create_household('Casa', 'Ana')");
    const household = await db.query<{ n: number }>('select count(*)::int as n from public.household');
    expect(household.rows[0].n).toBe(1);

    await db.close();
  }, 120_000);
});
```

- [ ] **Step 4: Ejecutarlo**

```bash
cd /home/jars/Programing/Rezet/app && npx vitest run supabase/tests/migrations.test.ts
```

Esperado: PASS. **Si una migración falla por un objeto que solo existe en Supabase**, añade al `PRELUDE` el stub mínimo que le falte y vuelve a ejecutar. **Si una sentencia no se puede emular de ninguna forma razonable** (por ejemplo algo propio del planificador de Supabase), NO la borres del repositorio: añade al arnés una lista `SKIP_STATEMENTS` con el fragmento exacto y un comentario que diga por qué, y deja constancia en tu informe. Las **seis migraciones nuevas** de este plan tienen que aplicar sin ningún skip; las históricas pueden llevar alguno.

- [ ] **Step 5: Confirmar que `npm test` lo recoge**

```bash
cd /home/jars/Programing/Rezet/app && npm test 2>&1 | tail -20
```

Si el fichero nuevo no aparece en la salida, mira `app/vite.config.ts`: si define `test.include`, añade `'supabase/tests/**/*.test.ts'` a la lista. Si no lo define, vitest ya lo coge y no hay nada que cambiar.

- [ ] **Step 6: Commit**

```bash
cd /home/jars/Programing/Rezet
git add app/package.json app/package-lock.json app/supabase/tests/ app/vite.config.ts
git commit -m "$(cat <<'EOF'
test(db): banco de pruebas de migraciones con PGlite

Hasta ahora ninguna sentencia SQL se ejecutaba antes de producción. PGlite es
Postgres real en WASM, sin Docker, así que las migraciones y las RPC se pueden
probar en local antes de desplegarlas.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 1: Cerrar el INSERT directo en `profile` (CRÍTICA)

**Fingerprint:** `app/supabase/migrations:policy-profile_insert:unbound-household_id-and-is_admin`

**Files:**
- Create: `app/supabase/migrations/20260917220000_rezet_lock_profile_insert.sql`
- Modify: `app/supabase/tests/migrations.test.ts`

**Contexto:** la política `profile_insert` solo comprueba `id = auth.uid()`; `authenticated` tiene INSERT sobre `household_id` e `is_admin`; el trigger guardián es BEFORE UPDATE. Resultado: cualquiera con sesión se inserta en cualquier hogar como admin. `create_household()` es SECURITY INVOKER y su insert depende de esa política, así que se convierte a DEFINER en el mismo fichero. **Ninguna tabla usa `FORCE ROW LEVEL SECURITY`** (comprobado: cero coincidencias en las migraciones), así que el dueño de la tabla queda exento de RLS y tanto `create_household()` (ahora DEFINER) como `redeem_invite()` (ya DEFINER) siguen insertando en `profile` sin política de INSERT. El cliente web nunca inserta en `profile`.

- [ ] **Step 1: Confirmar que ningún cliente inserta en `profile`**

```bash
cd /home/jars/Programing/Rezet && grep -rn "from('profile')" app/src mcp/src
```

Esperado: solo `.select(` y `.update(`. Si hay un `.insert(`, **para y repórtalo**.

- [ ] **Step 2: Escribir la migración**

Crea `app/supabase/migrations/20260917220000_rezet_lock_profile_insert.sql`:

```sql
-- Auditoría run-2, hallazgo CRÍTICO
-- (app/supabase/migrations:policy-profile_insert:unbound-household_id-and-is_admin).
--
-- `profile_insert` solo ataba `id = auth.uid()`, y `authenticated` conservaba
-- INSERT sobre `household_id` e `is_admin`. El trigger que protege esas columnas
-- es BEFORE UPDATE, así que no veía los INSERT: cualquier usuario con sesión y
-- sin perfil podía meterse en cualquier hogar como admin, saltándose a la vez la
-- invitación y la promoción a admin.
--
-- La pertenencia solo debe nacer en create_household() (hogar nuevo) y
-- redeem_invite() (código válido). Ninguna tabla usa FORCE ROW LEVEL SECURITY,
-- así que ambas, como SECURITY DEFINER, siguen insertando sin política.

revoke insert on public.profile from anon, authenticated;
drop policy if exists profile_insert on public.profile;

create or replace function public.create_household(p_name text, p_display_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household_id uuid := gen_random_uuid();
begin
  if (select auth.uid()) is null then
    raise exception 'not authenticated';
  end if;

  if exists (select 1 from public.profile where id = (select auth.uid())) then
    raise exception 'ya perteneces a un hogar';
  end if;

  insert into public.household (id, name) values (v_household_id, p_name);
  insert into public.profile (id, household_id, display_name, is_admin)
    values ((select auth.uid()), v_household_id, p_display_name, true);

  return v_household_id;
end;
$$;

revoke all on function public.create_household(text, text) from public, anon;
grant execute on function public.create_household(text, text) to authenticated;
```

El cuerpo entre `as $$` y `$$;` es idéntico al de producción (`20260907181314_…sql:121-143`) salvo la línea `security definer`. Verifícalo con `sed -n '121,143p'` sobre ese fichero antes de seguir.

- [ ] **Step 3: Escribir el test que falla**

Añade a `app/supabase/tests/migrations.test.ts`:

```ts
  it('un usuario con sesión no puede insertarse en un hogar ajeno', async () => {
    const db = await applyMigrations();
    const ana = await createAuthUser(db);
    const mallory = await createAuthUser(db);

    await asUser(db, ana, "select public.create_household('Casa de Ana', 'Ana')");
    const h = await db.query<{ id: string }>('select id from public.household limit 1');
    const householdId = h.rows[0].id;

    await expect(
      asUser(
        db,
        mallory,
        `insert into public.profile (id, household_id, display_name, is_admin)
         values ('${mallory}', '${householdId}', 'Mallory', true)`,
      ),
    ).rejects.toThrow();

    const perfiles = await db.query<{ n: number }>(
      `select count(*)::int as n from public.profile where household_id = '${householdId}'`,
    );
    expect(perfiles.rows[0].n).toBe(1);
    await db.close();
  }, 120_000);
```

- [ ] **Step 4: Ejecutar el test y verlo fallar**

Antes de crear la migración el test pasaría por el motivo equivocado, así que ejecútalo **con la migración ya escrita**:

```bash
cd /home/jars/Programing/Rezet/app && npx vitest run supabase/tests/migrations.test.ts
```

Esperado: PASS, incluido el test nuevo y el del ciclo de alta (que demuestra que `create_household` sigue funcionando sin la política). Si el test de alta falla, la conversión a DEFINER está mal: **para y repórtalo**.

- [ ] **Step 5: Gate completo**

```bash
cd /home/jars/Programing/Rezet/app && npm run lint && npm test
```

- [ ] **Step 6: Commit**

```bash
cd /home/jars/Programing/Rezet
git add app/supabase/migrations/20260917220000_rezet_lock_profile_insert.sql app/supabase/tests/migrations.test.ts
git commit -m "$(cat <<'EOF'
fix(rls): impedir el alta directa de perfiles en cualquier hogar

profile_insert solo ataba id = auth.uid(), y el trigger guardián es BEFORE
UPDATE, así que un usuario con sesión podía insertarse en cualquier hogar como
admin. Se revoca el INSERT del cliente y create_household() pasa a SECURITY
DEFINER, que era quien dependía de esa política.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 7: Verificación posterior al despliegue (para el informe)**

```sql
select
  (select count(*) from pg_policies where schemaname='public' and tablename='profile' and cmd='INSERT') as insert_policies,
  (select count(*) from information_schema.role_table_grants
     where table_schema='public' and table_name='profile'
       and privilege_type='INSERT' and grantee in ('anon','authenticated')) as insert_grants,
  (select prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='public' and p.proname='create_household') as create_household_secdef;
```

Esperado: `0`, `0`, `true`.

---

### Task 2: Acotar la lectura del bucket y borrar las fotos huérfanas

**Fingerprint:** `rezet-supabase:storage.objects:recipe_photos_read-to-public-enables-cross-household-listing`

**Files:**
- Create: `app/supabase/migrations/20260917220100_rezet_scope_recipe_photos_read.sql`
- Modify: `app/src/data/supabaseStore.tsx` (función `deleteRecipe`, ~línea 465-482)

**Contexto:** la política de lectura es `to public` con solo el bucket como condición, así que cualquiera puede **listar** el bucket, y las carpetas son UUID de hogar. Servir la imagen no depende de esa política (el bucket es público y la app solo usa `getPublicUrl`; no hay `.list()`, `.download()` ni `createSignedUrl` en el repo). La remediación del hallazgo tiene **dos mitades**: acotar la política y borrar el objeto al borrar la receta. Esta tarea hace las dos.

- [ ] **Step 1: Escribir la migración**

Crea `app/supabase/migrations/20260917220100_rezet_scope_recipe_photos_read.sql`:

```sql
-- Auditoría run-2, hallazgo MEDIO
-- (rezet-supabase:storage.objects:recipe_photos_read-to-public-enables-cross-household-listing).
--
-- La política de lectura era `to public` con solo el bucket como condición, así
-- que cualquiera podía listar el bucket entero. Como las rutas son
-- `<household_id>/<uuid>.<ext>`, ese listado entregaba el UUID de todos los
-- hogares, que es lo que hacía explotable el fallo de `profile_insert`.
--
-- El bucket sigue siendo público, así que `getPublicUrl` (lo único que usa la
-- app) no se ve afectado: esa ruta no consulta RLS.

drop policy if exists recipe_photos_read on storage.objects;

create policy recipe_photos_read on storage.objects for select
  to authenticated
  using (
    bucket_id = 'recipe-photos'
    and (storage.foldername(name))[1] = ((select private.current_household()))::text
  );
```

- [ ] **Step 2: Borrar la foto al borrar la receta**

Lee `app/src/data/supabaseStore.tsx` alrededor de `deleteRecipe` (busca `const deleteRecipe` o `deleteRecipe:`). La receta ya tiene su ruta de foto en el estado (`photoPath` o equivalente: compruébalo en el tipo `Recipe` de `app/src/types.ts` y en cómo `supabaseStore` construye la URL con `getPublicUrl`). Antes de borrar la fila, añade:

```tsx
      // El bucket es público: si la fila se va y el objeto se queda, la foto
      // sigue sirviéndose por URL para siempre.
      if (photoPath) {
        await supabase.storage.from('recipe-photos').remove([photoPath]);
      }
```

adaptando el nombre de la variable al que use la función. **Si `deleteRecipe` no tiene acceso a la ruta de la foto**, obténla con un `select` de la receta justo antes de borrarla; no inventes un formato de ruta.

- [ ] **Step 3: Gate**

```bash
cd /home/jars/Programing/Rezet/app && npm run lint && npm test
```

- [ ] **Step 4: Commit**

```bash
cd /home/jars/Programing/Rezet
git add app/supabase/migrations/20260917220100_rezet_scope_recipe_photos_read.sql app/src/data/supabaseStore.tsx
git commit -m "$(cat <<'EOF'
fix(storage): acotar la lectura de recipe-photos y borrar la foto con la receta

La política era `to public` con solo el bucket como condición, así que
cualquiera podía listar el bucket y sacar el UUID de todos los hogares. Además
borrar una receta dejaba su foto servida por URL para siempre.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 5: Anotar para el informe**

`delete_household()` y `delete_account()` no pueden borrar objetos de Storage desde SQL: haría falta una Edge Function. Queda como acción del propietario (limpieza puntual) y como mejora futura.

---

### Task 3: Invitaciones generadas y revocables en el servidor

**Fingerprint:** `app/supabase/migrations:household_invite:unrevocable-member-minted-invite-survives-exit`

**Files:**
- Create: `app/supabase/migrations/20260917220200_rezet_server_minted_invites.sql`
- Modify: `app/src/sheets/InviteSheet.tsx` (función `generate`, líneas 45-56)
- Modify: `app/supabase/tests/migrations.test.ts`

**Contexto crítico para no romper nada:** la Fase A **no** revoca el INSERT directo (eso es Fase B), porque una PWA cacheada antigua sigue insertando en la tabla sin `created_by`. Por eso esta migración añade además un **trigger BEFORE INSERT** que reescribe lo que llegue por esa vía: así ningún código creado por una app vieja nace inservible cuando `redeem_invite` empiece a exigir que el creador siga siendo miembro.

- [ ] **Step 1: Escribir la primera parte de la migración**

Crea `app/supabase/migrations/20260917220200_rezet_server_minted_invites.sql`:

```sql
-- Auditoría run-2, hallazgo MEDIO
-- (app/supabase/migrations:household_invite:unrevocable-member-minted-invite-survives-exit).
--
-- El código y la caducidad eran valores por defecto de columna, así que el
-- cliente los elegía. Al salir del hogar la invitación sobrevivía y nadie podía
-- anularla: no hay política de UPDATE/DELETE ni RPC de revocación.

-- ── create_invite(): el servidor decide código, caducidad y autoría ──
create or replace function public.create_invite()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household_id uuid;
  v_code text;
begin
  select household_id into v_household_id
    from public.profile where id = (select auth.uid());
  if v_household_id is null then
    raise exception 'REZET_NO_HOUSEHOLD';
  end if;

  v_code := upper(substr(encode(extensions.gen_random_bytes(6), 'hex'), 1, 10));

  insert into public.household_invite (household_id, code, created_by, expires_at)
    values (v_household_id, v_code, (select auth.uid()), now() + interval '7 days');

  return v_code;
end;
$$;

revoke all on function public.create_invite() from public, anon;
grant execute on function public.create_invite() to authenticated;

-- ── revoke_invite(): anular un código pendiente del propio hogar ──
create or replace function public.revoke_invite(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household_id uuid;
begin
  select household_id into v_household_id
    from public.profile where id = (select auth.uid());
  if v_household_id is null then
    raise exception 'REZET_NO_HOUSEHOLD';
  end if;

  update public.household_invite
     set used_at = now()
   where id = p_id
     and household_id = v_household_id
     and used_at is null;
end;
$$;

revoke all on function public.revoke_invite(uuid) from public, anon;
grant execute on function public.revoke_invite(uuid) to authenticated;

-- ── Compatibilidad: el INSERT directo del cliente antiguo ──
-- Una PWA cacheada sigue haciendo `insert into household_invite {household_id}`
-- sin `created_by`. Como abajo redeem_invite() pasa a exigir un creador vivo,
-- esos códigos nacerían inservibles. Hasta que la fase B revoque ese INSERT, el
-- servidor reescribe lo que llegue por ahí: mismo resultado que create_invite().
create or replace function private.force_server_minted_invite()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.created_by := (select auth.uid());
  new.code       := upper(substr(encode(extensions.gen_random_bytes(6), 'hex'), 1, 10));
  new.expires_at := now() + interval '7 days';
  new.used_at    := null;
  new.used_by    := null;
  return new;
end;
$$;

revoke all on function private.force_server_minted_invite() from public, anon, authenticated;

drop trigger if exists household_invite_server_mint_trg on public.household_invite;
create trigger household_invite_server_mint_trg
before insert on public.household_invite
for each row execute function private.force_server_minted_invite();

-- ── Barrido único de lo que ya hay ──
-- Las filas existentes se crearon desde el cliente sin `created_by`, así que no
-- se pueden atribuir: se caducan todas. Quien necesite invitar genera un código
-- nuevo, que ya nace con creador.
update public.household_invite
   set expires_at = now()
 where used_at is null
   and expires_at > now();
```

- [ ] **Step 2: Añadir al mismo fichero las tres funciones redeclaradas**

Copia los cuerpos **exactos** de producción y aplícales solo los cambios indicados:

```bash
cd /home/jars/Programing/Rezet
sed -n '157,207p' app/supabase/migrations/20260907181314_rezet_multi_admin_household_and_delete_account.sql   # leave_household
sed -n '310,372p' app/supabase/migrations/20260907181314_rezet_multi_admin_household_and_delete_account.sql   # delete_account
sed -n '261,299p' app/supabase/migrations/20260905131217_rezet_core_schema.sql                                # redeem_invite
```

**Cambio 1 — `leave_household()`**: en el cuerpo copiado, inmediatamente **antes** de la línea `update public.household_invite set created_by = null` (es la tercera de las cuatro sentencias `update` seguidas), inserta:

```sql
  -- Las invitaciones pendientes de quien se va dejan de servir. Tiene que ir
  -- antes de anular `created_by`: después ya no hay forma de saber cuáles eran
  -- suyas.
  delete from public.household_invite
   where household_id = v_household_id
     and created_by = v_uid
     and used_at is null;
```

**Cambio 2 — `delete_account()`**: la misma sentencia, pero **solo en la rama `else`** (la de `v_member_count > 1`), antes de su `update public.household_invite set created_by = null`. **No toques la rama `if v_member_count <= 1`**: ahí se borra el hogar entero y las invitaciones caen por cascada.

**Cambio 3 — `redeem_invite()`**: después del bloque

```sql
  if not found then
    raise exception 'código de invitación inválido o caducado';
  end if;
```

inserta:

```sql
  -- Una invitación cuyo creador ya no está en el hogar no debe seguir sirviendo:
  -- antes, quien salía dejaba su código vivo y podía volver a entrar con él.
  if v_invite.created_by is null
     or not exists (
       select 1 from public.profile p
        where p.id = v_invite.created_by
          and p.household_id = v_invite.household_id
     ) then
    raise exception 'código de invitación inválido o caducado';
  end if;
```

Mantén el resto del cuerpo intacto, incluidos los `revoke`/`grant` que siguen a cada función.

- [ ] **Step 3: Escribir los tests**

Añade a `app/supabase/tests/migrations.test.ts`:

```ts
  it('create_invite genera el código en el servidor y redeem_invite lo acepta', async () => {
    const db = await applyMigrations();
    const ana = await createAuthUser(db);
    const bruno = await createAuthUser(db);

    await asUser(db, ana, "select public.create_household('Casa', 'Ana')");
    const code = await asUser(db, ana, 'select public.create_invite() as code');
    const value = (code as { rows: { code: string }[] }).rows[0].code;
    expect(value).toMatch(/^[0-9A-F]{10}$/);

    await asUser(db, bruno, `select public.redeem_invite('${value}', 'Bruno')`);
    const n = await db.query<{ n: number }>('select count(*)::int as n from public.profile');
    expect(n.rows[0].n).toBe(2);
    await db.close();
  }, 120_000);

  it('una invitación de quien ya salió del hogar deja de servir', async () => {
    const db = await applyMigrations();
    const ana = await createAuthUser(db);
    const bruno = await createAuthUser(db);
    const carla = await createAuthUser(db);

    await asUser(db, ana, "select public.create_household('Casa', 'Ana')");
    const first = await asUser(db, ana, 'select public.create_invite() as code');
    const firstCode = (first as { rows: { code: string }[] }).rows[0].code;
    await asUser(db, bruno, `select public.redeem_invite('${firstCode}', 'Bruno')`);

    // Bruno mintea un código y se va del hogar.
    const stash = await asUser(db, bruno, 'select public.create_invite() as code');
    const stashed = (stash as { rows: { code: string }[] }).rows[0].code;
    await asUser(db, bruno, 'select public.leave_household()');

    await expect(asUser(db, carla, `select public.redeem_invite('${stashed}', 'Carla')`)).rejects.toThrow();
    await db.close();
  }, 120_000);

  it('el insert directo del cliente antiguo produce un código válido igualmente', async () => {
    const db = await applyMigrations();
    const ana = await createAuthUser(db);
    const bruno = await createAuthUser(db);
    await asUser(db, ana, "select public.create_household('Casa', 'Ana')");

    const h = await db.query<{ household_id: string }>('select household_id from public.profile limit 1');
    await asUser(
      db,
      ana,
      `insert into public.household_invite (household_id) values ('${h.rows[0].household_id}')`,
    );
    const row = await db.query<{ code: string; created_by: string | null }>(
      'select code, created_by from public.household_invite order by created_at desc limit 1',
    );
    expect(row.rows[0].created_by).toBe(ana);
    await asUser(db, bruno, `select public.redeem_invite('${row.rows[0].code}', 'Bruno')`);
    await db.close();
  }, 120_000);
```

Si `household_invite` no tiene columna `created_at`, ordena por otra que sí exista (mira la definición en el esquema base).

- [ ] **Step 4: Ejecutar los tests**

```bash
cd /home/jars/Programing/Rezet/app && npx vitest run supabase/tests/migrations.test.ts
```

Esperado: PASS. Si falla el tercero, el trigger de compatibilidad está mal: **para y repórtalo**, no lo elimines.

- [ ] **Step 5: Pasar el cliente a la RPC**

En `app/src/sheets/InviteSheet.tsx`, sustituye el cuerpo de `generate` (líneas 45-56) por:

```tsx
  const generate = async () => {
    if (!profile || busy) return;
    setBusy(true);
    // El código y la caducidad los fija el servidor (create_invite): antes se
    // insertaba en la tabla y el cliente podía elegir ambos.
    const { data, error } = await supabase.rpc('create_invite');
    setBusy(false);
    if (!error && data) setCode(data as string);
  };
```

- [ ] **Step 6: Gate**

```bash
cd /home/jars/Programing/Rezet/app && npm run lint && npm test
```

- [ ] **Step 7: Commit**

```bash
cd /home/jars/Programing/Rezet
git add app/supabase/migrations/20260917220200_rezet_server_minted_invites.sql app/src/sheets/InviteSheet.tsx app/supabase/tests/migrations.test.ts
git commit -m "$(cat <<'EOF'
feat(invites): generar y revocar invitaciones en el servidor

El código y la caducidad eran valores por defecto que el cliente podía
sobrescribir, las invitaciones sobrevivían a la salida de quien las creó y no
había forma de anularlas. Un trigger reescribe también el insert directo del
cliente antiguo, así que las apps cacheadas siguen funcionando hasta que la
siguiente versión revoque ese permiso.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 8: Anotar para el informe**

`revoke_invite()` queda disponible pero **sin interfaz**: ninguna pantalla lista las invitaciones pendientes todavía. La mitad "poder anular un código" del hallazgo queda entregada a nivel de servidor y pendiente de UI. Dilo explícitamente.

---

### Task 4: Lista de hosts, timeout y tope en las notificaciones push

**Fingerprint:** `send-timer-notifications/unbounded-outbound-fanout`

**Files:**
- Create: `app/src/domain/push.ts`
- Create: `app/src/domain/__tests__/push.test.ts`
- Create: `app/supabase/migrations/20260917220300_rezet_push_endpoint_allowlist.sql`
- Modify: `app/src/data/push.ts`
- Modify: `app/supabase/functions/send-timer-notifications/index.ts`

- [ ] **Step 1: Escribir el test que falla**

Crea `app/src/domain/__tests__/push.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { isAllowedPushEndpoint } from '../push';

const VALIDOS = [
  'https://fcm.googleapis.com/fcm/send/abc',
  'https://updates.push.services.mozilla.com/wpush/v2/abc',
  'https://xyz.notify.windows.com/w/?token=abc',
  'https://web.push.apple.com/abc',
];

const INVALIDOS = [
  'https://attacker.example/beacon',
  'http://169.254.169.254/latest/meta-data',
  'http://fcm.googleapis.com/fcm/send/abc',
  'no es una url',
  'https://evil-fcm.googleapis.com.attacker.example/x',
  'https://notfcm.googleapis.com/x',
];

describe('isAllowedPushEndpoint', () => {
  it('acepta los servicios de push reales', () => {
    for (const ok of VALIDOS) expect(isAllowedPushEndpoint(ok)).toBe(true);
  });

  it('rechaza cualquier otro host, http y hosts que solo terminan parecido', () => {
    for (const bad of INVALIDOS) expect(isAllowedPushEndpoint(bad)).toBe(false);
  });

  it('el CHECK de la migración acepta y rechaza exactamente lo mismo', () => {
    const sql = readFileSync(
      new URL('../../../supabase/migrations/20260917220300_rezet_push_endpoint_allowlist.sql', import.meta.url),
      'utf8',
    );
    const match = sql.match(/check \(endpoint ~ '([^']+)'\)/);
    expect(match).not.toBeNull();
    const re = new RegExp(match![1]);
    for (const ok of VALIDOS) expect(re.test(ok)).toBe(true);
    for (const bad of INVALIDOS) expect(re.test(bad)).toBe(false);
  });
});
```

- [ ] **Step 2: Verlo fallar**

```bash
cd /home/jars/Programing/Rezet/app && npx vitest run src/domain/__tests__/push.test.ts
```

Esperado: FAIL (no existe `../push`).

- [ ] **Step 3: Implementar la función de dominio**

Crea `app/src/domain/push.ts`:

```ts
/**
 * Hosts de los servicios de Web Push reales. `push_subscription.endpoint` lo
 * escribe el cliente y el cron lo visita cada minuto con el rol de servicio, así
 * que sin esta lista una suscripción podía apuntar a cualquier URL y convertir
 * ese cron en un emisor de peticiones a gusto de quien la guardara.
 */
const ALLOWED_PUSH_HOSTS = [
  'fcm.googleapis.com',
  'push.services.mozilla.com',
  'notify.windows.com',
  'push.apple.com',
] as const;

export function isAllowedPushEndpoint(endpoint: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:') return false;
  return ALLOWED_PUSH_HOSTS.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`));
}
```

- [ ] **Step 4: Escribir la migración con el CHECK**

Crea `app/supabase/migrations/20260917220300_rezet_push_endpoint_allowlist.sql`:

```sql
-- Auditoría run-2, hallazgo BAJO (send-timer-notifications/unbounded-outbound-fanout).
--
-- `endpoint` era texto libre y el cron lo visita cada minuto con el rol de
-- servicio. La validación del cliente es cortesía; el control real es este.

delete from public.push_subscription
 where endpoint !~ '^https://([a-z0-9-]+\.)*(fcm\.googleapis\.com|push\.services\.mozilla\.com|notify\.windows\.com|push\.apple\.com)/';

alter table public.push_subscription
  add constraint push_subscription_endpoint_host_chk
  check (endpoint ~ '^https://([a-z0-9-]+\.)*(fcm\.googleapis\.com|push\.services\.mozilla\.com|notify\.windows\.com|push\.apple\.com)/');
```

**Ojo:** el test del paso 1 busca literalmente `check (endpoint ~ '…')`. Si cambias el formato del SQL, el test deja de encontrar la expresión; mantenlo en una línea tal cual.

- [ ] **Step 5: Ver pasar los tres tests**

```bash
cd /home/jars/Programing/Rezet/app && npx vitest run src/domain/__tests__/push.test.ts
```

Esperado: PASS los tres. Si el tercero falla, la expresión de la migración y la función no coinciden: ajusta **la migración**, que es el control real, y vuelve a ejecutar.

- [ ] **Step 6: Usar la función en el cliente**

Lee `app/src/data/push.ts` entero. En `subscribeToPush`, justo **antes** de la sentencia que guarda la suscripción en `push_subscription` (búscala: es un `.from('push_subscription')` con `insert` o `upsert`), añade:

```ts
  if (!isAllowedPushEndpoint(subscription.endpoint)) {
    // El navegador siempre da un endpoint de un servicio conocido; si no lo es,
    // no lo guardamos en vez de dejar que el cron lo visite.
    return 'error';
  }
```

y el import `import { isAllowedPushEndpoint } from '../domain/push';` arriba.

- [ ] **Step 7: Acotar la Edge Function**

Lee `app/supabase/functions/send-timer-notifications/index.ts` entero antes de tocarlo. Añade junto a las constantes de cabecera:

```ts
const ALLOWED_PUSH_HOSTS = [
  "fcm.googleapis.com",
  "push.services.mozilla.com",
  "notify.windows.com",
  "push.apple.com",
];
const MAX_SENDS_PER_RUN = 200;
const SEND_TIMEOUT_MS = 10_000;

function isAllowedEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    return (
      url.protocol === "https:" &&
      ALLOWED_PUSH_HOSTS.some((h) => url.hostname === h || url.hostname.endsWith(`.${h}`))
    );
  } catch {
    return false;
  }
}
```

Tres cambios en el bucle, **en este orden exacto**:

1. **Tope por ejecución, en el bucle EXTERNO** (el que recorre los temporizadores vencidos), como primera sentencia del cuerpo:

```ts
    // El tope se comprueba antes de empezar un temporizador, nunca a medias: la
    // marca de `notified_at` de más abajo daría por avisado un temporizador que
    // solo llegó a la mitad de sus dispositivos, y el cron no vuelve a él.
    if (sent >= MAX_SENDS_PER_RUN) break;
```

Declara `let sent = 0;` antes del bucle e incrementa `sent++` tras cada envío.

2. **Filtro de host, en el bucle interno** (el que recorre las suscripciones), antes de enviar:

```ts
      if (!isAllowedEndpoint(sub.endpoint)) {
        // Solo puede ser un resto anterior al CHECK de la base de datos.
        console.warn("send-timer-notifications: endpoint no permitido, se descarta");
        continue;
      }
```

3. **Timeout por envío.** La librería de envío que usa este fichero acepta un `timeout` en milisegundos en su objeto de opciones — **compruébalo leyendo cómo se llama hoy** y añade `timeout: SEND_TIMEOUT_MS` a esas opciones. Si la llamada es un `fetch` directo, usa `signal: AbortSignal.timeout(SEND_TIMEOUT_MS)`. **No uses `Promise.race`**: deja el socket abierto y no cancela nada. Si no encaja ninguna de las dos formas, **para y repórtalo**.

- [ ] **Step 8: Gate**

```bash
cd /home/jars/Programing/Rezet/app && npm run lint && npm test
```

- [ ] **Step 9: Commit**

```bash
cd /home/jars/Programing/Rezet
git add app/src/domain/push.ts app/src/domain/__tests__/push.test.ts app/src/data/push.ts app/supabase/functions/send-timer-notifications/index.ts app/supabase/migrations/20260917220300_rezet_push_endpoint_allowlist.sql
git commit -m "$(cat <<'EOF'
fix(push): limitar los destinos, el tiempo y el volumen del cron de avisos

endpoint era texto libre y el cron lo visitaba cada minuto con el rol de
servicio, así que una suscripción podía apuntar a cualquier host. Ahora hay
lista de hosts en la base de datos y en la función, timeout por envío y tope
por ejecución, comprobado antes de empezar cada temporizador.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Cuota y límites en `recognize-pantry-item`

**Fingerprint:** `recognize-pantry-item/unbounded-gemini-spend`

**Files:**
- Create: `app/supabase/migrations/20260917220400_rezet_recognition_quota.sql`
- Modify: `app/supabase/functions/recognize-pantry-item/index.ts`

- [ ] **Step 1: Escribir la migración**

Crea `app/supabase/migrations/20260917220400_rezet_recognition_quota.sql`:

```sql
-- Auditoría run-2 (recognize-pantry-item/unbounded-gemini-spend).
-- La función solo comprobaba identidad antes de gastar la clave de Gemini del
-- operador. Esta tabla lleva la cuenta por perfil en ventanas fijas; el rol de
-- servicio es el único que puede consumirla, desde la Edge Function.

create table if not exists public.recognition_usage (
  profile_id   uuid primary key references public.profile(id) on delete cascade,
  window_start timestamptz not null default now(),
  calls        int not null default 0
);

alter table public.recognition_usage enable row level security;
revoke all on public.recognition_usage from anon, authenticated;

create or replace function public.consume_recognition_quota(
  p_profile uuid, p_limit int, p_window interval
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_calls int;
begin
  insert into public.recognition_usage (profile_id) values (p_profile)
  on conflict (profile_id) do update
    set window_start = case when recognition_usage.window_start < now() - p_window
                            then now() else recognition_usage.window_start end,
        calls        = case when recognition_usage.window_start < now() - p_window
                            then 0 else recognition_usage.calls end;

  -- Sin coincidencia, RETURNING deja v_calls a NULL (no lanza: eso solo pasa
  -- con INTO STRICT), que es justo la señal de "cuota agotada".
  update public.recognition_usage
     set calls = calls + 1
   where profile_id = p_profile
     and calls < p_limit
  returning calls into v_calls;

  return v_calls is not null;
end;
$$;

revoke all on function public.consume_recognition_quota(uuid, int, interval) from public, anon, authenticated;
grant execute on function public.consume_recognition_quota(uuid, int, interval) to service_role;
```

En el `on conflict … do update`, la tabla se referencia **sin esquema** (`recognition_usage.window_start`): es la forma documentada.

- [ ] **Step 2: Escribir el test de la cuota**

Añade a `app/supabase/tests/migrations.test.ts`:

```ts
  it('la cuota de reconocimiento corta al llegar al límite', async () => {
    const db = await applyMigrations();
    const ana = await createAuthUser(db);
    await asUser(db, ana, "select public.create_household('Casa', 'Ana')");

    const call = () =>
      db.query<{ ok: boolean }>(
        `select public.consume_recognition_quota('${ana}'::uuid, 3, interval '1 hour') as ok`,
      );

    expect((await call()).rows[0].ok).toBe(true);
    expect((await call()).rows[0].ok).toBe(true);
    expect((await call()).rows[0].ok).toBe(true);
    expect((await call()).rows[0].ok).toBe(false);
    await db.close();
  }, 120_000);
```

- [ ] **Step 3: Ejecutar**

```bash
cd /home/jars/Programing/Rezet/app && npx vitest run supabase/tests/migrations.test.ts
```

Esperado: PASS.

- [ ] **Step 4: Tres ediciones ancladas en la Edge Function**

Abre `app/supabase/functions/recognize-pantry-item/index.ts`. Añade estas constantes junto a las demás de módulo (arriba del fichero, cerca de `CORS_HEADERS`):

```ts
const MAX_IMAGE_B64 = 2_000_000; // ~1,5 MB; el cliente manda <=1024px q0.85
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
```

**Edición 1 — tras el guard de `userError`** (la llave que cierra `if (userError || !userData.user) { … }`, línea 57), inserta:

```ts
  // Pertenencia a hogar: el mismo límite que aplican todas las RPC. Sin esto,
  // cualquiera con sesión y sin hogar llegaba a la clave de pago del operador.
  const { data: profileRow } = await callerClient
    .from("profile")
    .select("household_id")
    .eq("id", userData.user.id)
    .maybeSingle();
  if (!profileRow?.household_id) {
    return json({ error: "forbidden" }, 403);
  }
```

**Edición 2 — sustituye el bloque de validación del cuerpo** (líneas 65-67, `if (!body.image || !body.mimeType) { … }`) por:

```ts
  if (typeof body.image !== "string" || !body.image) {
    return json({ error: "missing image or mimeType" }, 400);
  }
  if (body.image.length > MAX_IMAGE_B64) {
    return json({ error: "image too large" }, 413);
  }
  if (typeof body.mimeType !== "string" || !ALLOWED_MIME.has(body.mimeType)) {
    return json({ error: "unsupported mimeType" }, 415);
  }
```

**Edición 3 — tras `const geminiKey = secretRows[0].value as string;`** (línea 79), inserta:

```ts
  const { data: allowed, error: quotaError } = await serviceClient.rpc("consume_recognition_quota", {
    p_profile: userData.user.id,
    p_limit: 30,
    p_window: "1 hour",
  });
  if (quotaError) {
    console.error("recognize-pantry-item: quota check failed", quotaError);
    return json({ error: "quota check failed" }, 500);
  }
  if (!allowed) {
    return json({ error: "rate limited" }, 429);
  }
```

`serviceClient` ya existe unas líneas más arriba (línea 70): **no lo dupliques ni lo muevas**.

- [ ] **Step 5: Gate**

```bash
cd /home/jars/Programing/Rezet/app && npm run lint && npm test
```

- [ ] **Step 6: Commit**

```bash
cd /home/jars/Programing/Rezet
git add app/supabase/migrations/20260917220400_rezet_recognition_quota.sql app/supabase/functions/recognize-pantry-item/index.ts app/supabase/tests/migrations.test.ts
git commit -m "$(cat <<'EOF'
fix(edge): exigir hogar, tamaño, tipo y cuota antes de llamar a Gemini

La función solo comprobaba que hubiera sesión antes de gastar la clave de pago
del operador: sin pertenencia a hogar, sin tope de tamaño, sin lista de tipos y
sin límite de frecuencia.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Atar `created_by` y `cooked_by` al hogar de la fila

**Fingerprint:** `rezet-supabase:recipe.created_by+cook_log.cooked_by:cross-household-profile-fk-blocks-lifecycle-rpcs`

**Files:**
- Create: `app/supabase/migrations/20260917220500_rezet_attribution_same_household.sql`
- Modify: `app/supabase/tests/migrations.test.ts`

**Aviso del revisor, respétalo al pie de la letra:** la primera versión de esta migración usaba `case tg_table_name when 'recipe' then new.created_by when 'cook_log' then new.cooked_by end`. PL/pgSQL resuelve `new.<campo>` contra el tipo real de la fila al planificar, así que en `recipe` (que no tiene `cooked_by`) reventaba con `record "new" has no field "cooked_by"` **en cada guardado de receta**. La forma correcta pasa el nombre de columna como argumento del trigger y lo lee de `to_jsonb(new)`.

- [ ] **Step 1: Escribir la migración**

Crea `app/supabase/migrations/20260917220500_rezet_attribution_same_household.sql`:

```sql
-- Auditoría run-2, hallazgo BAJO
-- (rezet-supabase:recipe.created_by+cook_log.cooked_by:cross-household-profile-fk-blocks-lifecycle-rpcs).
--
-- Un usuario podía crear en SU hogar una receta cuyo `created_by` apuntara al
-- perfil de otro hogar. La limpieza de leave_household()/delete_account() filtra
-- por hogar, así que nunca veía esa fila, y el borrado del perfil fallaba con
-- violación de clave foránea: la víctima quedaba sin poder salir ni borrarse.
--
-- El nombre de la columna llega como argumento del trigger y se lee de
-- to_jsonb(new): `new.created_by` se resolvería al planificar y reventaría en la
-- tabla que no tiene esa columna.

create or replace function private.attribution_same_household()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row jsonb := to_jsonb(new);
  v_attributed uuid;
  v_row_household uuid;
  v_profile_household uuid;
begin
  v_attributed    := nullif(v_row ->> tg_argv[0], '')::uuid;
  v_row_household := nullif(v_row ->> 'household_id', '')::uuid;

  if v_attributed is null then
    return new;
  end if;

  select household_id into v_profile_household
    from public.profile where id = v_attributed;

  if v_profile_household is distinct from v_row_household then
    raise exception 'REZET_ATTRIBUTION_FOREIGN_HOUSEHOLD';
  end if;

  return new;
end;
$$;

revoke all on function private.attribution_same_household() from public, anon, authenticated;

-- Limpieza de lo que ya pudiera existir antes de imponer la regla.
update public.recipe r set created_by = null
 where created_by is not null
   and not exists (select 1 from public.profile p
                    where p.id = r.created_by and p.household_id = r.household_id);

update public.cook_log c set cooked_by = null
 where cooked_by is not null
   and not exists (select 1 from public.profile p
                    where p.id = c.cooked_by and p.household_id = c.household_id);

drop trigger if exists recipe_attribution_trg on public.recipe;
create trigger recipe_attribution_trg
before insert or update of created_by, household_id on public.recipe
for each row execute function private.attribution_same_household('created_by');

drop trigger if exists cook_log_attribution_trg on public.cook_log;
create trigger cook_log_attribution_trg
before insert or update of cooked_by, household_id on public.cook_log
for each row execute function private.attribution_same_household('cooked_by');
```

- [ ] **Step 2: Escribir los tests, incluido el que habría pillado el fallo P0**

Añade a `app/supabase/tests/migrations.test.ts`:

```ts
  it('guardar una receta propia y salir del hogar siguen funcionando', async () => {
    const db = await applyMigrations();
    const ana = await createAuthUser(db);
    const bruno = await createAuthUser(db);
    await asUser(db, ana, "select public.create_household('Casa', 'Ana')");
    const code = await asUser(db, ana, 'select public.create_invite() as code');
    await asUser(db, bruno, `select public.redeem_invite('${(code as { rows: { code: string }[] }).rows[0].code}', 'Bruno')`);

    const h = await db.query<{ household_id: string }>('select household_id from public.profile limit 1');
    const householdId = h.rows[0].household_id;

    // Inserción normal con autoría propia: el trigger no debe estorbar.
    await asUser(
      db,
      bruno,
      `insert into public.recipe (household_id, name, base_servings, created_by)
       values ('${householdId}', 'Tortilla', 2, '${bruno}')`,
    );
    // Y salir del hogar (que pone created_by a null) tampoco.
    await asUser(db, bruno, 'select public.leave_household()');
    await db.close();
  }, 120_000);

  it('no se puede atribuir una fila a un perfil de otro hogar', async () => {
    const db = await applyMigrations();
    const ana = await createAuthUser(db);
    const mallory = await createAuthUser(db);
    await asUser(db, ana, "select public.create_household('Casa de Ana', 'Ana')");
    await asUser(db, mallory, "select public.create_household('Casa de Mallory', 'Mallory')");

    const m = await db.query<{ household_id: string }>(
      `select household_id from public.profile where id = '${mallory}'`,
    );

    await expect(
      asUser(
        db,
        mallory,
        `insert into public.recipe (household_id, name, base_servings, created_by)
         values ('${m.rows[0].household_id}', 'Trampa', 2, '${ana}')`,
      ),
    ).rejects.toThrow(/REZET_ATTRIBUTION_FOREIGN_HOUSEHOLD/);
    await db.close();
  }, 120_000);
```

Comprueba los nombres reales de las columnas de `recipe` en el esquema base antes de escribir el insert (`base_servings` podría llamarse distinto); ajústalos si hace falta.

- [ ] **Step 3: Ejecutar**

```bash
cd /home/jars/Programing/Rezet/app && npx vitest run supabase/tests/migrations.test.ts
```

Esperado: PASS los dos. Si el primero falla con `record "new" has no field …`, el trigger volvió a la forma mala: **para y repórtalo**.

- [ ] **Step 4: Gate y commit**

```bash
cd /home/jars/Programing/Rezet/app && npm run lint && npm test
cd /home/jars/Programing/Rezet
git add app/supabase/migrations/20260917220500_rezet_attribution_same_household.sql app/supabase/tests/migrations.test.ts
git commit -m "$(cat <<'EOF'
fix(rls): exigir que la autoría pertenezca al hogar de la fila

created_by/cooked_by aceptaban perfiles de otro hogar, y como la limpieza al
salir filtra por hogar, esa referencia dejaba a la víctima sin poder salir del
hogar ni borrar su cuenta.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Suscripción Realtime separada por evento

**Fingerprint:** `rezet-supabase:realtime:shopping_check-delete-events-leak-household-and-item-key` (parte cliente)

**Files:**
- Modify: `app/src/data/supabaseStore.tsx` (bloque Realtime, líneas ~304-335)

**Importante:** esta tarea y la Task 8 van **en la misma versión**. Por separado, el cliente pasaría un tiempo recibiendo los DELETE de todos los hogares, que es justo la fuga del hallazgo.

- [ ] **Step 1: Comprobar que `shopping_check` no recibe UPDATE**

```bash
cd /home/jars/Programing/Rezet && grep -rn "shopping_check" app/src/data/supabaseStore.tsx app/supabase/migrations/*.sql | grep -i update
```

Si aparece un UPDATE real (no un comentario), añade un tercer registro igual al de INSERT con `event: 'UPDATE'`.

- [ ] **Step 2: Separar los eventos**

Sustituye el registro de `shopping_check` por:

```tsx
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'shopping_check', filter: `household_id=eq.${householdId}` },
        () => queryClient.invalidateQueries({ queryKey: shoppingKey }),
      )
      .on(
        // Los DELETE no se pueden filtrar salvo con `replica identity full`, y
        // tras el cambio de clave primaria household_id ya no viaja en el evento.
        // Se invalida sin filtrar: el refetch pasa por RLS.
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'shopping_check' },
        () => queryClient.invalidateQueries({ queryKey: shoppingKey }),
      )
```

- [ ] **Step 3: Gate y commit**

```bash
cd /home/jars/Programing/Rezet/app && npm run lint && npm test
cd /home/jars/Programing/Rezet
git add app/src/data/supabaseStore.tsx
git commit -m "$(cat <<'EOF'
refactor(realtime): separar INSERT y DELETE en la lista de la compra

Prepara el cambio de clave primaria de shopping_check: los DELETE no se pueden
filtrar sin replica identity full, así que se escuchan sin filtro y se invalida
la consulta, cuyo refetch ya pasa por RLS.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Clave primaria subrogada en `shopping_check`

**Fingerprint:** `rezet-supabase:realtime:shopping_check-delete-events-leak-household-and-item-key` (parte servidor)

**Files:**
- Create: `app/supabase/migrations/20260917220600_rezet_shopping_check_surrogate_pk.sql`
- Modify: `app/supabase/tests/migrations.test.ts`

- [ ] **Step 1: Escribir la migración**

```sql
-- Auditoría run-2, hallazgo BAJO
-- (rezet-supabase:realtime:shopping_check-delete-events-leak-household-and-item-key).
--
-- La clave primaria era (household_id, item_key) y Realtime no aplica RLS a los
-- DELETE, así que cualquier suscriptor recibía el UUID del hogar ajeno y la
-- clave del artículo. Con una clave subrogada el evento solo lleva un id opaco.
--
-- Las tres sentencias deben aplicarse en la misma transacción (supabase db push
-- envuelve cada fichero en una): la tabla está publicada en supabase_realtime y
-- no puede quedarse sin clave primaria entre sentencia y sentencia.

alter table public.shopping_check add column if not exists id uuid not null default gen_random_uuid();
alter table public.shopping_check drop constraint if exists shopping_check_pkey;
alter table public.shopping_check add constraint shopping_check_pkey primary key (id);
alter table public.shopping_check add constraint shopping_check_household_item_key
  unique (household_id, item_key);
```

- [ ] **Step 2: Comprobar que los escritores siguen valiendo**

```bash
cd /home/jars/Programing/Rezet && grep -rn "shopping_check" app/supabase/migrations/20260905132555_rezet_transactional_rpcs.sql app/supabase/migrations/20260906011605_rezet_buy_checked_no_fake_expiry.sql app/src/data/supabaseStore.tsx
```

`buy_checked` borra por `(household_id, item_key)` y el store inserta y borra por esas dos columnas: la restricción única mantiene ambas cosas. Si encuentras un `on conflict (household_id, item_key)`, sigue siendo válido gracias a esa restricción; anótalo en el informe.

- [ ] **Step 3: Test**

Añade a `app/supabase/tests/migrations.test.ts`:

```ts
  it('shopping_check tiene clave subrogada y sigue siendo único por hogar y artículo', async () => {
    const db = await applyMigrations();
    const ana = await createAuthUser(db);
    await asUser(db, ana, "select public.create_household('Casa', 'Ana')");
    const h = await db.query<{ household_id: string }>('select household_id from public.profile limit 1');
    const hid = h.rows[0].household_id;

    const pk = await db.query<{ def: string }>(
      `select pg_get_constraintdef(oid) as def from pg_constraint where conname = 'shopping_check_pkey'`,
    );
    expect(pk.rows[0].def).toBe('PRIMARY KEY (id)');

    await asUser(db, ana, `insert into public.shopping_check (household_id, item_key) values ('${hid}', 'x|g')`);
    await expect(
      asUser(db, ana, `insert into public.shopping_check (household_id, item_key) values ('${hid}', 'x|g')`),
    ).rejects.toThrow();
    await db.close();
  }, 120_000);
```

- [ ] **Step 4: Ejecutar, gate y commit**

```bash
cd /home/jars/Programing/Rezet/app && npx vitest run supabase/tests/migrations.test.ts && npm run lint && npm test
cd /home/jars/Programing/Rezet
git add app/supabase/migrations/20260917220600_rezet_shopping_check_surrogate_pk.sql app/supabase/tests/migrations.test.ts
git commit -m "$(cat <<'EOF'
fix(realtime): clave subrogada en shopping_check

La clave primaria era (household_id, item_key) y Realtime no aplica RLS a los
DELETE, así que el evento entregaba el UUID del hogar ajeno y la clave del
artículo a cualquier suscriptor. Ahora solo lleva un id opaco.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Refuerzos del cliente web y del consentimiento MCP

**Files:**
- Modify: `app/src/data/supabaseClient.ts`
- Modify: `mcp/src/worker/html.ts`
- Modify: `mcp/src/worker/authHandler.ts`

- [ ] **Step 1: PKCE en el cliente web**

En `app/src/data/supabaseClient.ts`:

```ts
export const supabase = createClient(url, anonKey, {
  // Passkeys son experimentales en supabase-js: hay que optar explícitamente.
  // Requiere habilitar "Passkeys" en el dashboard (Authentication → Passkeys)
  // con el Relying Party ID del dominio real antes de publicar.
  //
  // flowType pkce: por defecto auth-js usa el flujo implícito, que devuelve los
  // tokens de sesión en el fragmento de la URL de retorno. Con pkce lo que
  // vuelve es un código que no sirve sin el verificador guardado en este
  // navegador.
  auth: { experimental: { passkey: true }, flowType: 'pkce' },
});
```

- [ ] **Step 2: Gate del cliente web**

```bash
cd /home/jars/Programing/Rezet/app && npm run lint && npm test
```

Si `tsc` se queja del literal, usa `flowType: 'pkce' as const`.

- [ ] **Step 3: Avisar de clientes MCP no verificados**

En `mcp/src/worker/authHandler.ts`, en la llamada a `consentPage` (líneas 65-70), añade el parámetro:

```ts
    redirectUri: authReq.redirectUri,
```

En `mcp/src/worker/html.ts`:

1. Amplía la firma de `consentPage` (línea ~73) con `redirectUri: string`.
2. Junto a las demás líneas de saneado (74-76), añade `const redirectUri = sanitizeText(opts.redirectUri);`.
3. Añade al `<style>` de `page()` (líneas ~58-63), siguiendo el estilo del fichero, que usa **hex literal** (no hay tokens de diseño en este fichero y no debe importarlos):

```css
  .warn { background: #fff4e5; color: #6b3f00; border: 1px solid #f0c68a; border-radius: 8px; padding: 0.75rem 1rem; }
  .warn code { word-break: break-all; }
```

4. Antes de los botones del formulario, renderiza el aviso solo cuando el host no es conocido:

```ts
const KNOWN_CLIENT_HOSTS = ['claude.ai', 'claude.com', 'localhost', '127.0.0.1'];

function isKnownClientHost(host: string): boolean {
  return KNOWN_CLIENT_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
}
```

```html
${isKnownClientHost(opts.redirectHost) ? '' : `<p class="warn">Este cliente no está verificado: cualquiera puede registrar uno con el nombre que quiera. Continúa solo si reconoces esta dirección: <code>${redirectUri}</code></p>`}
```

- [ ] **Step 4: Gate del Worker**

```bash
cd /home/jars/Programing/Rezet/mcp && ls tsconfig*.json && npx tsc --noEmit -p tsconfig.worker.json
```

Esperado: sin errores. Si ese fichero no existe, usa el tsconfig que sí esté.

- [ ] **Step 5: Commit**

```bash
cd /home/jars/Programing/Rezet
git add app/src/data/supabaseClient.ts mcp/src/worker/html.ts mcp/src/worker/authHandler.ts
git commit -m "$(cat <<'EOF'
fix(auth): usar PKCE en el cliente web y avisar de clientes MCP no verificados

auth-js usa el flujo implícito por defecto, que devuelve los tokens en el
fragmento de la URL. Y el nombre que muestra la pantalla de consentimiento del
MCP lo elige quien registra el cliente.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: Detectar Edge Functions desplegadas sin código

**Fingerprint:** `rezet-supabase:edge-functions:import-idea-photo-deployed-without-source`

**Files:**
- Modify: `.github/workflows/deploy.yml` (job `functions`)

**Aviso del revisor:** el paso tiene que ir **después** de `Deploy Edge Functions`, no antes. Si va antes, el primer despliegue falla y las funciones corregidas de las tasks 4 y 5 **nunca llegan a producción**, mientras sus migraciones sí (son otro job), y además el job `release` depende de `functions`, así que no se crearía la etiqueta ni la Release.

- [ ] **Step 1: Añadir el paso, después del despliegue**

En el job `functions` de `.github/workflows/deploy.yml`, **a continuación** del paso `Deploy Edge Functions`:

```yaml
      - name: Check for orphaned deployed functions
        run: |
          # `supabase functions deploy` nunca borra: si se elimina una función del
          # repositorio, sigue viva y servida en producción, fuera de revisión.
          supabase functions list --project-ref "$SUPABASE_PROJECT_REF" -o json \
            | jq -r '.[] | select(.status == "ACTIVE") | .slug' | LC_ALL=C sort > /tmp/deployed.txt
          find supabase/functions -mindepth 1 -maxdepth 1 -type d -printf '%f\n' \
            | LC_ALL=C sort > /tmp/insource.txt
          if comm -23 /tmp/deployed.txt /tmp/insource.txt | grep -q .; then
            echo "::error::Estas funciones están desplegadas pero no existen en el repositorio:"
            comm -23 /tmp/deployed.txt /tmp/insource.txt
            echo "::error::Bórralas con 'supabase functions delete <slug>' o restaura su código."
            exit 1
          fi
          echo "Sin funciones huérfanas."
```

- [ ] **Step 2: Comprobar YAML y shell**

```bash
cd /home/jars/Programing/Rezet
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/deploy.yml')); print('YAML OK')"
python3 - <<'EOF' > /tmp/orphan-step.sh
import yaml
wf = yaml.safe_load(open('.github/workflows/deploy.yml'))
step = [s for s in wf['jobs']['functions']['steps'] if s.get('name') == 'Check for orphaned deployed functions'][0]
print(step['run'])
EOF
bash -n /tmp/orphan-step.sh && echo "SHELL OK"
```

Esperado: `YAML OK` y `SHELL OK`.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/deploy.yml
git commit -m "$(cat <<'EOF'
ci: avisar de Edge Functions desplegadas sin código en el repositorio

`supabase functions deploy` nunca borra, así que import-idea-photo siguió viva
y servida en producción tras eliminarla del repo, fuera de revisión.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: Anotar la acción bloqueante para el informe**

`import-idea-photo` **sigue viva**. Con este paso, el despliegue **fallará a propósito** y sin etiqueta de versión hasta que alguien la borre:

```bash
cd app && npx supabase functions delete import-idea-photo --project-ref raepigwmunhguzkmzukd
```

Eso escribe en producción: lo decide el usuario **antes** del push a `main`. Déjalo bien visible en tu informe.

---

### Task 11: Versión y changelog de la Fase A

**Files:** `app/package.json`, `mcp/package.json`, `CHANGELOG.md`

- [ ] **Step 1: Subir la versión**

```bash
cd /home/jars/Programing/Rezet && node tools/release/bump-version.mjs minor
```

- [ ] **Step 2: Entrada bilingüe del changelog**

Siguiendo el formato de las entradas previas (castellano e inglés), redactado para personas usuarias y **sin detalles explotables**:

- Seguridad: corregido un control de acceso que permitía a una cuenta ajena entrar en un hogar; las fotos ya no se pueden listar desde fuera del hogar y se borran al borrar la receta.
- Invitaciones: las genera el servidor, caducan a los 7 días, dejan de servir cuando quien las creó sale del hogar. **Las invitaciones pendientes anteriores han caducado; genera una nueva si la necesitas.**
- Notificaciones, reconocimiento por foto y autoría de recetas: límites y validaciones nuevas en el servidor.

- [ ] **Step 3: Verificar**

```bash
cd /home/jars/Programing/Rezet/app && npm run lint && npm test && node --test ../tools/release/version.test.mjs
```

- [ ] **Step 4: Commit**

```bash
cd /home/jars/Programing/Rezet
git add app/package.json mcp/package.json CHANGELOG.md
git commit -m "Release X.Y.Z"
```

`X.Y.Z` es lo que haya escrito el script; léelo de `app/package.json`.

---

## FASE B — versión posterior, no en esta sesión

Requiere que la Fase A esté desplegada y que los clientes instalados se hayan actualizado (`UpdatePrompt` se lo ofrece al abrir la app). Espera al menos unos días.

**Actualización (revisión posterior a la Fase A):** el riesgo que motivaba esperar a esta fase con cuidado — que `create_invite()` dependiera del trigger de compatibilidad para rellenar `created_by`/`expires_at`, y que por tanto borrar ese trigger dejara todo código nuevo inservible — **ya está resuelto**. `create_invite()` y `revoke_invite()` (`20260918110100_rezet_create_invite_independent_of_trigger.sql`) ponen `created_by`/`expires_at` explícitos en su propio insert y dejan que el valor por defecto de la columna genere `code`; ya no leen nada de lo que el trigger reescriba. Un test del banco de pruebas simula la Fase B completa (revoca el INSERT, borra la política y el trigger) y confirma que `create_invite()` + `redeem_invite()` siguen funcionando de punta a punta (`migrations.test.ts`, "create_invite y redeem_invite siguen funcionando si se simula la Fase B"). La Task B1 de abajo sigue siendo necesaria — sigue habiendo que revocar el INSERT y borrar la política/el trigger/la función en producción, y actualizar el test de "sigue funcionando" con la versión real de las migraciones aplicadas — pero ya no hay que rediseñar `create_invite()` al hacerlo.

### Task B1: Revocar el INSERT directo en `household_invite`

**Riesgo asumido, decidido antes de ejecutar B1:** un cliente PWA **anterior a la 1.6.0** todavía crea invitaciones con un `insert` directo, y esa versión no mostraba errores (`if (!error && data) setCode(...)`; el aviso llegó en la 1.7.2, `InviteSheet.tsx:97-102`). Tras B1, en ese cliente el botón "Generar invitación" **no hace nada y no avisa de nada**. No hay forma de saber desde SQL si queda algún cliente así vivo: los códigos de esa época se caducaron en `20260917220200_rezet_server_minted_invites.sql:106-109`. Se acepta porque `UpdatePrompt` lleva ofreciendo la actualización desde la 1.6.0 y el arreglo es abrir la app otra vez. Clientes ≥ 1.6.0 no se ven afectados: ya usan la RPC.

- [ ] Confirmar que ningún cliente inserta ya: `grep -rn "household_invite" app/src mcp/src` → solo lecturas y RPC.
- [ ] Crear la migración (nótese que también hay que borrar la función `private.force_server_minted_invite()`, que a partir de aquí queda sin ningún trigger que la use):

```sql
-- Fase B de la auditoría run-2. La app ya genera invitaciones con
-- create_invite(), así que el INSERT directo del cliente deja de hacer falta y
-- el trigger de compatibilidad (y la función que lo respalda) sobran.
-- service_role va incluido: salta RLS, así que sin este revoke seguiría siendo
-- la única vía de crear un código sin pasar por create_invite(). update/delete
-- /truncate son grants por defecto de Supabase que nadie usa: RLS tapa los dos
-- primeros (no hay políticas), pero truncate no pasa por RLS.
revoke insert on public.household_invite from anon, authenticated, service_role;
revoke update, delete, truncate on public.household_invite from anon, authenticated;
drop policy if exists household_invite_insert on public.household_invite;
drop trigger if exists household_invite_server_mint_trg on public.household_invite;
drop function if exists private.force_server_minted_invite();
```

  El orden importa: el `drop function` va después del `drop trigger`, o falla por dependencia. No hacen falta `revoke` por columna: `household_invite` no tiene `attacl` en ninguna columna (al contrario que `profile` y `household`, ver `20260918100100`), así que el `revoke` de tabla se lo lleva todo.

- [ ] **Actualizar los tests que la revocación rompe** (si no, el job `test` de CI falla y no se despliega ni se etiqueta *nada*, ni Worker ni funciones — `deploy.yml:77-81`):
  - `app/supabase/tests/migrations.test.ts:180` "el insert directo del cliente antiguo produce un código válido igualmente" → pasa a esperar el fallo, o se borra por obsoleto.
  - `:209` "el insert directo de un no admin es rechazado" → ya no falla con `REZET_NOT_ADMIN` sino con `permission denied for table household_invite`; ajustar la aserción.
  - `:254` "el insert directo de un admin sigue funcionando y caduca el código pendiente anterior" → la parte de "sigue funcionando" desaparece; lo que queda vivo (crear invitación caduca la pendiente anterior) ya lo cubre el test de `create_invite()`.
- [ ] **Convertir el test de simulación en test real**: quitar el bloque `db.exec` que revoca y borra a mano en `migrations.test.ts:289` (si se deja, el test se vuelve una tautología que no prueba la migración).
- [ ] Añadir un test que compruebe que un insert directo como `authenticated` ahora falla.
- [ ] `npm run lint && npm test`, commit y nueva versión, igual que en la Fase A.

---

## Fuera del plan: acciones del propietario

1. **Borrar** la función huérfana `import-idea-photo` **antes** del push a `main` (Task 10, paso 4). Si no, el despliegue falla y no se etiqueta la versión.
2. **Leer** Authentication → URL Configuration en Supabase: si la lista de redirecciones tiene comodines, es un problema real de severidad alta (`NEEDS-VALIDATION.md`, pista 1).
3. **Leer** la cuota o tope de facturación de la clave de Gemini (pista 2).
4. **Limpiar** las fotos de Storage de hogares y cuentas ya borrados (SQL no puede hacerlo; haría falta una Edge Function).
5. **Decidir** qué hacer con las 725 recetas y fotos de cecotec.es en `app/public/ideas/` antes de difundir el repositorio: es cuestión de derechos de autor.
