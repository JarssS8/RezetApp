# Plan complementario de seguridad — Rezet (Fase A-bis)

> **Para agentes ejecutores:** SUB-SKILL OBLIGATORIA: `superpowers:subagent-driven-development`. Pasos con checkbox (`- [ ]`).

**Goal:** Cerrar lo que el diseño previo del repositorio pedía y el primer plan no implementó, para desplegar todo junto en una sola versión.

**Contexto imprescindible.** Existen dos documentos y hay que entender cómo encajan:

- `docs/superpowers/specs/2026-09-17-security-audit-fixes-design.md` (commit `8fa6793`) — diseño escrito **antes**, a partir de la auditoría run-1. Recoge decisiones tomadas con el usuario.
- `docs/superpowers/plans/2026-09-17-security-fixes.md` — plan ya **ejecutado** (12 commits, `5d6041c`..`bb1bd9b`, versión 1.6.0), construido sobre la auditoría run-2, que es posterior y validó los hallazgos contra la configuración real de producción.

Lo ya implementado cubre los 7 hallazgos confirmados. Este plan añade lo que el diseño pedía y quedó fuera. Donde ambos difieren, manda el diseño, **salvo en cinco puntos** que se conservan como están y se documentan en la Task C10:

1. **Dos fases en vez de una sola versión.** El usuario lo eligió explícitamente después de escribirse el diseño: una PWA cacheada no puede quedarse con las invitaciones rotas. Lo único que queda para la Fase B es revocar el `INSERT` directo sobre `household_invite`.
2. **El trigger de atribución rechaza en vez de forzar.** El diseño quería forzar `created_by = auth.uid()`; lo implementado lanza `REZET_ATTRIBUTION_FOREIGN_HOUSEHOLD` cuando la atribución es de otro hogar. Protege lo mismo, falla de forma visible en vez de silenciosa y ya tiene tests. Por lo mismo, no se revocan las columnas `created_by`/`cooked_by` del grant de INSERT/UPDATE que pedía el diseño §3.3.
3. **Las pruebas de base de datos van contra PGlite, no contra producción con `ROLLBACK`.** El diseño §4 proponía lo segundo; el banco de pruebas es mejor (no toca producción y corre en cada `npm test`), pero es Postgres 18 mientras producción no lo es: **un banco en verde no es prueba sobre producción**, solo detecta errores de SQL y de lógica.
4. **No se escribe migración de reversión.** El diseño §4 la pedía. Cada migración es aditiva y reversible a mano con las definiciones que guardan los ficheros anteriores; si el usuario la quiere, es trabajo aparte.
5. **La cuota vive en `recognition_usage` con ventana móvil**, no en `ai_usage(profile_id, day, count)` como decía §3.5. Equivalente y ya desplegado en 1.6.0.

**Tech Stack:** Supabase (Postgres + RLS + Edge Functions Deno; el banco de pruebas es PGlite 0.5.8 = Postgres 18, que no es la versión de producción), React 19 + TypeScript + Vite, Cloudflare Workers, vitest, PGlite.

## Global Constraints

- **Ninguna tarea toca producción:** nada de `apply_migration`, `db push`, `wrangler deploy`, `supabase functions deploy/delete`, `supabase secrets set`, ni `git push`. Todo se despliega al final por CI, con la skill `deploying-to-main` y confirmación del usuario.
- **Prefijo de migración** `YYYYMMDDHHMMSS` mayor que `20260917220600`. Usa los nombres exactos de cada tarea.
- **Toda función SQL nueva:** `set search_path = ''`, tablas como `public.<tabla>`, `revoke all … from public, anon;` y el `grant execute` que toque.
- **Banco de pruebas:** `app/supabase/tests/harness.ts` ya existe (`applyMigrations()`, `asUser(db, uid, sql)`, `createAuthUser(db)`). Solo `asUser` aplica RLS; fuera de ahí eres superusuario y RLS no se evalúa. Toda migración nueva tiene que aplicar limpia en él.
- **Gate de cada tarea:** `cd app && npm run lint && npm test`. Para tareas del MCP, además `cd mcp && npx tsc --noEmit -p tsconfig.worker.json`.
- **Comentarios en castellano**, explicando el porqué. Tokens de color en `app/src/` (no en `mcp/src/worker/html.ts`).
- **Commits:** uno por tarea, `fix(ámbito): …` / `feat(ámbito): …`, con `Co-Authored-By:` según la atribución activa de tu sesión.
- **Las Edge Functions no entran en `npm run lint && npm test`.** `app/tsconfig.json` incluye solo `src`, y no hay tests de Deno, así que ese gate pasa escribas lo que escribas en `app/supabase/functions/`. *(Actualización posterior a este plan: desde `038d6d9` el job `test` de CI sí hace `npx deno check` de cada función antes de desplegar — `deploy.yml:83-87`. Sigue sin haber tests de Deno.)* Para C4, C5 y C6 intenta además `npx --yes deno@2 check supabase/functions/<fn>/index.ts` desde `app/`; si Deno no se puede instalar en esta máquina, **dilo en el informe**: significa que ese código va a producción sin comprobar y solo lo cubre la prueba manual.
- **Si algo no encaja con lo que dice el plan, para y repórtalo.** No improvises.

## Orden

C1 → C2 → C3 → C4 → C5 → C6 → C7 → C8 → C9 → C10. C10 (documentación y versión) va la última.

---

### Task C1: Invitaciones solo para admins, con lista y revocación

**Diseño §3.2.** Hoy `create_invite()` (implementado en la Fase A) deja invitar a cualquier miembro, igual que antes. El diseño exige que solo inviten los admins, que las pendientes se puedan ver y anular, y que al crear una nueva caduquen las anteriores sin usar.

**Files:**
- Create: `app/supabase/migrations/20260918100000_rezet_admin_only_invites.sql`
- Modify: `app/src/sheets/InviteSheet.tsx`, `app/src/sheets/AccountHouseholdSheet.tsx`, `app/src/i18n/es.ts`, `app/src/i18n/en.ts`, `app/supabase/tests/migrations.test.ts`
- Puede requerir: `app/src/data/storeContext.ts`, `app/src/data/supabaseStore.tsx`, `app/src/data/store.tsx` si añades las operaciones al contrato `Store` (mira cómo está resuelto `setKomprappListToken` y sigue ese patrón; si prefieres llamar a `supabase.rpc` desde el sheet, como hace hoy `InviteSheet`, también vale — pero sé coherente y dilo en el informe).

- [ ] **Step 1: Migración**

Redeclara ambas RPC (copia el cuerpo actual de `20260917220200_rezet_server_minted_invites.sql` y cámbialo solo donde se indica):

```sql
-- Diseño §3.2: invitar pasa a ser cosa de admins, y crear una invitación
-- caduca las anteriores sin usar del hogar, para que no se acumulen códigos
-- vivos que nadie recuerda haber creado.

create or replace function public.create_invite()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household_id uuid;
  v_is_admin boolean;
  v_code text;
begin
  select household_id, is_admin into v_household_id, v_is_admin
    from public.profile where id = (select auth.uid());
  if v_household_id is null then
    raise exception 'REZET_NO_HOUSEHOLD';
  end if;
  if not v_is_admin then
    raise exception 'REZET_NOT_ADMIN: solo un administrador de este hogar puede gestionar las invitaciones';
  end if;

  update public.household_invite
     set expires_at = now()
   where household_id = v_household_id
     and used_at is null
     and expires_at > now();

  insert into public.household_invite (household_id)
    values (v_household_id)
  returning code into v_code;

  return v_code;
end;
$$;

revoke all on function public.create_invite() from public, anon;
grant execute on function public.create_invite() to authenticated;

create or replace function public.revoke_invite(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household_id uuid;
  v_is_admin boolean;
begin
  select household_id, is_admin into v_household_id, v_is_admin
    from public.profile where id = (select auth.uid());
  if v_household_id is null then
    raise exception 'REZET_NO_HOUSEHOLD';
  end if;
  if not v_is_admin then
    raise exception 'REZET_NOT_ADMIN: solo un administrador de este hogar puede gestionar las invitaciones';
  end if;

  update public.household_invite
     set expires_at = now()
   where id = p_id
     and household_id = v_household_id
     and used_at is null;
end;
$$;

revoke all on function public.revoke_invite(uuid) from public, anon;
grant execute on function public.revoke_invite(uuid) to authenticated;
```

Fíjate en tres cosas:

- El `insert` ya no calcula el código: lo pone el trigger `household_invite_server_mint_trg` y se lee con `returning`. Funciona porque los triggers BEFORE INSERT corren antes de evaluar `RETURNING` (así se arregló un fallo real en la Fase A).
- `revoke_invite` ahora caduca en vez de marcar `used_at`, para no confundir "anulada" con "usada".
- **Deuda anotada para la Fase B:** al depender del trigger para `created_by` y `expires_at`, cuando la Fase B lo retire habrá que devolver esas dos columnas al `insert` (`created_by = (select auth.uid())`, `expires_at = now() + interval '7 days'`) o `redeem_invite` rechazará todos los códigos nuevos por creador nulo. Déjalo escrito en la sección "Fase B" de este plan, no solo aquí.
- El error lleva `:` detrás de la etiqueta a propósito: `app/src/data/householdErrors.ts` define `REZET_NOT_ADMIN = 'REZET_NOT_ADMIN:'` y `stripHouseholdErrorTag` limpia con `/^REZET_[A-Z_]+:\s*/`. Sin los dos puntos, la interfaz enseñaría la etiqueta cruda.

- [ ] **Step 2: Tests**

**Primero arregla el test que este cambio rompe.** `app/supabase/tests/migrations.test.ts`, test `'una invitación de quien ya salió del hogar deja de servir'` (~línea 104): Bruno entra por `redeem_invite`, que lo crea con `is_admin = false`, y luego llama a `create_invite`, que ahora fallará. Arréglalo promoviéndolo antes, **no** relajando la comprobación de admin:

```ts
await asUser(db, ana, `select public.promote_admin('${bruno}'::uuid)`);
const stash = await asUser(db, bruno, 'select public.create_invite() as code');
```

`promote_admin(p_member_id uuid)` está en `20260907181314_rezet_multi_admin_household_and_delete_account.sql:257`. Es el **único** test de la Fase A que rompe: los demás llaman a `create_invite` como Ana (fundadora, admin) o insertan directamente en la tabla, camino que esta tarea no toca.

Después añade: (a) un miembro no admin recibe `REZET_NOT_ADMIN` al llamar a `create_invite`; (b) un admin sí puede; (c) crear una segunda invitación caduca la primera, y canjear la primera falla; (d) `revoke_invite` de un no admin falla.

- [ ] **Step 3: Interfaz**

**Trampa verificada, no la pases por alto.** `AccountHouseholdSheet.tsx` solo usa `useAuth()`, y `household.members` de `useData()` **no está cargado ahí**: `householdMembersQ` (`supabaseStore.tsx:289`) es `enabled: householdSheetOpen`, y `App.tsx:183-197` no incluye `accountHousehold` ni `invite` en ese flag. Si gateas la fila con `members`, la ocultas a **todos** los admins reales. `Profile` (`auth.tsx:5-10`) tampoco tiene `isAdmin` hoy. Así que:

1. `app/src/data/auth.tsx`: añade `isAdmin: boolean` a `interface Profile` (línea 5), añade `is_admin` al `.select(...)` de `loadProfile` (línea 49) y mapea `isAdmin: data.is_admin as boolean`. La política `profile_select` ya permite leer la propia fila: no hace falta migración.
2. `app/src/data/store.tsx` (modo demo) y cualquier fixture de `Profile` tienen que ganar el campo, o `npm run lint` falla.
3. `AccountHouseholdSheet.tsx`: `const { profile } = useAuth();` y envuelve la fila de invitar en `{profile?.isAdmin && ( … )}`.
4. En `InviteSheet.tsx`, lista las invitaciones pendientes del hogar con un botón "Anular" por fila que llame a `revoke_invite`. RLS ya acota al hogar; en PostgREST el filtro se escribe `.is('used_at', null).gt('expires_at', new Date().toISOString())`. Usa los primitivos de `app/src/ui/` y los tokens de color; nada de hex suelto.
5. `InviteSheet.tsx:50-52` hace hoy `if (!error && data) setCode(...)`: un no admin que llegue al botón no vería **nada**. Muestra el toast del error (clave nueva `inviteNotAdminError`), pasando el mensaje por `stripHouseholdErrorTag`.
6. Textos nuevos en `es.ts` y `en.ts`, siguiendo la nomenclatura de las claves existentes.

- [ ] **Step 4: Gate y commit**

```bash
cd /home/jars/Programing/Rezet/app && npm run lint && npm test
```

Commit: `feat(invites): restringir la invitación a admins y permitir anularla`.

---

### Task C2: Endurecer permisos de `profile` y `household`

**Diseño §3.1 y §3.3 (último punto).**

**Files:** Create `app/supabase/migrations/20260918100100_rezet_tighten_profile_household_grants.sql`; Modify `app/supabase/tests/migrations.test.ts`.

- [ ] **Step 1: Migración**

```sql
-- Diseño §3.1: red de seguridad sobre las columnas que deciden pertenencia y
-- rol. El INSERT directo ya está revocado (Fase A); esto cierra el UPDATE y
-- hace que el trigger guardián también mire los INSERT, por si algún día
-- alguien vuelve a conceder INSERT sin darse cuenta.

-- `revoke update (columna)` es INOCUO mientras siga vivo el grant de tabla: este
-- repositorio ya lo comprobó con household.komprapp_list_token (ver la cabecera
-- de 20260917070714 y la corrección de 20260917070845). Hay que quitar el UPDATE
-- de tabla y volver a conceder columna a columna.
revoke update on public.profile from anon, authenticated;
grant update (display_name, locale, theme, accent, units, onboarded_at)
  on public.profile to authenticated;

create or replace function private.protect_profile_household()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if current_user <> 'postgres' then
      raise exception 'REZET_PROFILE_DIRECT_INSERT';
    end if;
    return new;
  end if;

  if new.household_id is distinct from old.household_id then
    raise exception 'household_id no se puede modificar directamente';
  end if;
  if new.is_admin is distinct from old.is_admin and current_user <> 'postgres' then
    raise exception 'is_admin no se puede modificar directamente';
  end if;
  return new;
end;
$$;

drop trigger if exists profile_protect_household_trg on public.profile;
create trigger profile_protect_household_trg
before insert or update on public.profile
for each row execute function private.protect_profile_household();

-- Diseño §3.3: del hogar, el cliente solo debe poder cambiar el nombre y el
-- objetivo de kcal. `komprapp_list_token` ya estaba revocado (20260917070845)
-- y se fija por su propia RPC.
revoke update on public.household from anon, authenticated;
grant update (name, kcal_target) on public.household to authenticated;
```

**No hace falta que verifiques `current_user` en PGlite: ya está verificado contra producción.** La cabecera de `20260907181314_rezet_multi_admin_household_and_delete_account.sql:30-42` documenta que PostgREST ejecuta como `anon`/`authenticated`, que las RPC de este repositorio son propiedad de `postgres`, y que ese mismo `current_user <> 'postgres'` lleva vivo desde entonces protegiendo `is_admin` sin romper `promote_admin`. `create_household` (`20260917220000`) y `redeem_invite` (`20260917220200`) son ambas `security definer`, así que sus inserts de `profile` pasan la rama nueva. El banco de pruebas coincide, pero eso es coincidencia, no prueba.

**Consecuencia que sí debes anotar:** tras este cambio, `service_role` tampoco puede insertar en `profile`. Hoy nada lo hace (`mcp/src/supabase.ts:33` y `worker/supabaseAuth.ts:95` solo leen; ninguna Edge Function escribe `profile`), pero déjalo dicho en el informe.

**Lo que sí tienes que probar** es que `create_household` y `redeem_invite` siguen funcionando después del cambio.

- [ ] **Step 2: Tests**

(a) `create_household` y `redeem_invite` siguen funcionando; (b) un `update public.household set name = 'x'` como `authenticated` funciona, y `kcal_target` también.

Y sobre todo, **una comprobación de privilegios, no de comportamiento**. El test "conductual" obvio (`update profile set is_admin` falla) pasaría igualmente aunque el `revoke` fuera inocuo, porque lo bloquea el trigger que existe desde `20260907181314`. Lo que detecta la regresión real es:

```ts
const priv = await db.query<{ h: boolean; a: boolean; d: boolean }>(
  `select has_column_privilege('authenticated','public.profile','household_id','UPDATE') as h,
          has_column_privilege('authenticated','public.profile','is_admin','UPDATE') as a,
          has_column_privilege('authenticated','public.profile','display_name','UPDATE') as d`,
);
expect(priv.rows[0]).toEqual({ h: false, a: false, d: true });
```

Haz lo mismo con `household`: `name` y `kcal_target` en `true`, `komprapp_list_token` en `false`.

- [ ] **Step 3: Gate y commit** — `fix(rls): cerrar los permisos de escritura sobre profile y household`.

---

### Task C3: Endurecer las RPC transaccionales

**Diseño §3.3.** Tres cambios independientes sobre funciones existentes.

**Files:** Create `app/supabase/migrations/20260918100200_rezet_harden_transactional_rpcs.sql`; Modify `app/supabase/tests/migrations.test.ts`.

- [ ] **Step 1: Leer los cuerpos actuales**

Ya están localizados; no los busques por tu cuenta, porque la heurística del "fichero más nuevo" falla aquí (`20260915165859` es posterior a `20260915141642` pero solo declara `save_recipe`):

| Función | Firma real | Fichero : líneas |
|---|---|---|
| `save_recipe(payload jsonb)` | un solo `jsonb` | `app/supabase/migrations/20260915165859_rezet_recipe_source_idea.sql:11-133` |
| `finish_cook(p_recipe_id uuid, p_servings integer, p_plan_entry_id uuid, p_today date, p_slot meal_slot)` | cinco parámetros | `app/supabase/migrations/20260915141642_rezet_recipe_ingredient_to_taste.sql:141-…` |
| `leave_household()` / `delete_account()` | sin parámetros | `app/supabase/migrations/20260917220200_rezet_server_minted_invites.sql:116` / `:180` |

**`save_recipe` y `finish_cook` son SECURITY INVOKER** (ninguna declara `security definer`). `create or replace function` reinicia los atributos que omitas: si al copiarlas les añades `security definer`, saltarían todas las políticas RLS en las que se apoyan. Déjalas como están.

- [ ] **Step 2: Tres cambios**

1. **`save_recipe`**: la ruta llega dentro del `jsonb` y se escribe en **dos** ramas (update en la línea 41, insert en la 63), así que la comprobación va **una sola vez arriba**, justo después del `if v_household_id is null`. Usa el mismo `nullif(…, '')` que usan esas ramas, porque el cliente puede mandar cadena vacía:

```sql
  -- La ruta la elige el cliente y acaba en un bucket compartido: solo se acepta
  -- dentro de la carpeta del propio hogar.
  if nullif(payload->>'photo_path', '') is not null and (
       payload->>'photo_path' !~ ('^' || v_household_id::text || '/')
       or position('..' in payload->>'photo_path') > 0
     ) then
    raise exception 'REZET_INVALID_PHOTO_PATH';
  end if;
```

Compatible con los dos sitios que suben fotos (`RecipeForm.tsx:137` e `IdeaDetail.tsx:57`), que construyen `${householdId}/${crypto.randomUUID()}.${ext}`.

2. **`finish_cook`**: el `select` es `select (cooked_at is not null) into v_already_cooked from public.plan_entry where id = … and household_id = …;`. Añádele `for update` al final. Es válido: una lista de selección con expresiones no impide `FOR UPDATE`, y `authenticated` tiene UPDATE sobre `plan_entry`.

3. **`leave_household` y `delete_account`**: antes de contar miembros y admins, bloquea la fila del hogar:

```sql
  perform 1 from public.household where id = v_household_id for update;
```

Copia esas dos funciones desde `20260917220200_rezet_server_minted_invites.sql`, que es donde están sus versiones vigentes (la Fase A las redeclaró).

- [ ] **Step 3: Tests**

Un `save_recipe` con `photo_path` de otro hogar o con `..` debe fallar; uno con la ruta correcta debe seguir funcionando. Para los bloqueos `for update` no hay test razonable en PGlite (es de concurrencia): dilo en el informe, no inventes uno que no prueba nada.

- [ ] **Step 4: Gate y commit** — `fix(rpc): validar photo_path y bloquear filas en las RPC de ciclo de vida`.

---

### Task C4: Alinear la cuota de IA con el diseño y dejar de filtrar detalles

**Diseño §3.5.** La Fase A dejó 30 llamadas/hora; el diseño decidió **50 al día por usuario**. Además: no loguear el cuerpo de Gemini ni el texto del modelo, y limitar CORS al origen de la app.

**Files:** Modify `app/supabase/functions/recognize-pantry-item/index.ts`, `app/supabase/tests/migrations.test.ts`. **No lleva migración**: `consume_recognition_quota(p_profile, p_limit, p_window)` (`20260917220400:16`) ya recibe límite y ventana como parámetros, así que el cambio es solo de la llamada. No crees un fichero de migración vacío.

- [ ] **Step 1: (sin migración)**

Confirma leyendo `20260917220400_rezet_recognition_quota.sql` que la RPC acepta ambos parámetros y pasa al paso 2.

- [ ] **Step 2: Cambios en la Edge Function**

- Llama a la cuota con `p_limit: 50, p_window: "1 day"` (hoy es `30` / `"1 hour"`, en las líneas 107-111).
- Sustituye los `console.error` que vuelcan la respuesta de Gemini o el texto del modelo por mensajes sin contenido (por ejemplo solo el código de estado). Revisa el fichero entero: hay más de uno.
- CORS: sustituye el `*` por una **lista**, no por un origen único, o quien desarrolle a continuación se queda sin la función en `npm run dev`:

```ts
const ALLOWED_ORIGINS = new Set([
  Deno.env.get("APP_ORIGIN") ?? "https://rezet.jarsss8.es",
  "http://localhost:5173", // vite dev
]);
```

Devuelve el `Origin` de la petición cuando esté en la lista (si no, el de producción), añade `Vary: Origin` y mantén `OPTIONS` funcionando. **Anota en el informe** que conviene definir `APP_ORIGIN` en los secretos de la función.

- [ ] **Step 3: Ajustar el test de cuota**

El test existente (`3, interval '1 hour'`) sigue siendo válido. **No añadas uno que repita lo mismo con `'1 day'`**: probaría un parámetro que no ha cambiado. Lo que no está cubierto es el reinicio de ventana:

```ts
// La ventana se reinicia: con un día, una llamada de hace 25 h ya no cuenta.
await db.query(`update public.recognition_usage set window_start = now() - interval '25 hours' where profile_id = '${ana}'`);
expect((await call()).rows[0].ok).toBe(true);
```

Y di claramente en el informe que **el cambio de la Edge Function en sí no lo cubre ningún test**: solo prueba manual tras desplegar.

- [ ] **Step 4: Gate y commit** — `fix(edge): cuota diaria de 50 fotos y menos detalle en errores y CORS`.

---

### Task C5: Autenticar el cron y acotar filas por perfil

**Diseño §3.6.**

**Files:** Create `app/supabase/migrations/20260918100400_rezet_timer_cron_secret.sql`; Modify `app/supabase/functions/send-timer-notifications/index.ts`, `app/supabase/tests/migrations.test.ts`.

**Riesgo que hay que evitar:** si la función empieza a exigir una cabecera que el secreto de función aún no tiene configurado, las notificaciones dejan de salir en silencio. Por eso el despliegue es tolerante: **la función solo rechaza cuando el secreto está configurado en su entorno y no coincide**; si no está configurado, registra un aviso y sigue.

- [ ] **Step 1: Migración**

```sql
-- Diseño §3.6: el cron se identifica con un secreto propio, no solo con la
-- publishable key (que es pública y viaja en el bundle del cliente).
select vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'timer_cron_secret');

-- Sin `cron.unschedule`: `cron.schedule(nombre, …)` ya reemplaza el job con ese
-- nombre (así se creó en 20260905151005), y unschedule lanza excepción si el
-- nombre no existe, lo que abortaría la migración entera.
select cron.schedule(
  'send-timer-notifications-every-minute',
  '* * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
           || '/functions/v1/send-timer-notifications',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'publishable_key'),
      'x-rezet-cron', (select decrypted_secret from vault.decrypted_secrets where name = 'timer_cron_secret')
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);

-- Límite de filas por perfil: un usuario no puede inflar el trabajo del cron.
-- AFTER INSERT, no BEFORE: `insert … on conflict do update` dispara los BEFORE
-- INSERT también en las filas que acaban actualizando, y tanto
-- useCookTimerSync.ts:26 como push.ts:71 hacen upsert. Con BEFORE, al llegar al
-- tope, reenviar un temporizador o un endpoint YA existente fallaría para
-- siempre aunque no añada ninguna fila.
create or replace function private.limit_rows_per_profile()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_count int;
begin
  execute format('select count(*) from public.%I where profile_id = $1', tg_argv[0])
    into v_count using new.profile_id;
  if v_count > tg_argv[1]::int then   -- en AFTER la fila nueva ya está contada
    raise exception 'REZET_TOO_MANY_ROWS';
  end if;
  return null;  -- ignorado en AFTER
end;
$$;

revoke all on function private.limit_rows_per_profile() from public, anon, authenticated;

drop trigger if exists push_subscription_limit_trg on public.push_subscription;
create trigger push_subscription_limit_trg
after insert on public.push_subscription
for each row execute function private.limit_rows_per_profile('push_subscription', '10');

drop trigger if exists cook_timer_limit_trg on public.cook_timer;
create trigger cook_timer_limit_trg
after insert on public.cook_timer
for each row execute function private.limit_rows_per_profile('cook_timer', '50');
```

Ya está comprobado: `cook_timer.profile_id` (`20260905150404:22`) y `push_subscription.profile_id` (`20260905131217:163`) existen, `TG_ARGV` es 0-based, y `format(… %I …)` con `execute … using` funciona bajo `set search_path = ''`. Al no usar `cron.unschedule`, tampoco hace falta tocar el PRELUDE del harness.

- [ ] **Step 2: Cambios en la Edge Function**

Esta función **no recibe `req` ni responde a `OPTIONS`**: su firma es `Deno.serve(async () => {` (línea 32) porque la llama el cron, no un navegador. Cambia la firma a `Deno.serve(async (req) => {` y pon el bloque justo después, antes de leer `SUPABASE_URL`:

```ts
const cronSecret = Deno.env.get("TIMER_CRON_SECRET");
if (cronSecret) {
  if (req.headers.get("x-rezet-cron") !== cronSecret) {
    return new Response("unauthorized", { status: 401 });
  }
} else {
  // Despliegue tolerante: mientras el secreto no esté configurado en la
  // función, no se rechaza nada, para no cortar los avisos en silencio.
  console.warn("send-timer-notifications: TIMER_CRON_SECRET sin configurar");
}
```

Y sustituye las respuestas de error que devuelvan detalle interno por mensajes genéricos.

- [ ] **Step 3: Tests**

Comprueba en el banco que los dos triggers de límite funcionan: la fila número 11 de `push_subscription` para un perfil falla con `REZET_TOO_MANY_ROWS`, y la 51 de `cook_timer` también. Ojo con el `CHECK` de host de `endpoint` (Fase A): usa endpoints válidos.

**Y el caso que el test obvio no cubre:** con el perfil ya en el tope, un `insert … on conflict … do update` de una fila **que ya existe** tiene que seguir funcionando. Ese es justo el motivo de usar AFTER en vez de BEFORE, así que pruébalo explícitamente con la clave de conflicto real de `cook_timer` (mírala en `useCookTimerSync.ts:26`).

- [ ] **Step 4: Gate y commit** — `fix(push): autenticar el cron y limitar filas por perfil`.

- [ ] **Step 5: Anotar la acción del usuario**

Tras desplegar, hay que copiar el valor de `timer_cron_secret` del Vault al secreto `TIMER_CRON_SECRET` de la función. Se lee con:

```sql
select decrypted_secret from vault.decrypted_secrets where name = 'timer_cron_secret';
```

Hasta entonces `send-timer-notifications` acepta todo (con aviso en el log) y `cleanup-orphan-photos` (Task C6) **no borra nada**. Déjalo bien visible en tu informe.

---

### Task C6: Limpieza de fotos huérfanas

**Diseño §3.4, segunda mitad.**

**Files:** Create `app/supabase/functions/cleanup-orphan-photos/index.ts`, `app/supabase/migrations/20260918100500_rezet_cleanup_orphan_photos_cron.sql`.

- [ ] **Step 1: Edge Function**

Escríbela siguiendo el estilo de `send-timer-notifications/index.ts` (mismo patrón de cliente con service role y de respuestas JSON). Comportamiento:

1. Exige la cabecera `x-rezet-cron`, pero **aquí falla cerrado, al revés que en la Task C5**: si `TIMER_CRON_SECRET` no está en el entorno, responde `503 {"error":"not configured"}` y no borra nada. Allí la tolerancia evita cortar avisos en silencio; aquí lo único que hace la función es borrar, así que no hacer nada es inocuo y borrar sin autenticar no lo es. Recuerda que la publishable key viaja en el bundle del cliente: sin esto, cualquiera dispara un barrido.
2. Lista los objetos del bucket `recipe-photos` con el cliente de service role, paginando (`list` devuelve como mucho 100 por llamada; recorre carpeta a carpeta: el primer nivel son los `household_id`).
3. Selecciona todos los `photo_path` no nulos de `public.recipe`, **paginando explícitamente** con `.range(from, from + 999)` hasta agotar, y **aborta con 500 sin borrar nada** si cualquier página devuelve `error`, o si el conjunto sale vacío mientras el bucket no lo está. Un borrado por ruta es irreversible: ante la duda, no borrar.
4. Borra los objetos que **no** estén en esa lista **y** cuyo `created_at` tenga más de 24 horas (margen para una subida en curso que aún no se ha guardado como receta).
5. Devuelve un recuento. No registres rutas completas en el log.
6. Acepta `?dryRun=1`: cuenta lo que borraría y responde sin borrar. Es la única forma de comprobar esta función antes de soltarla, porque no hay test ni tipado que la cubra.

- [ ] **Step 2: Cron diario**

```sql
-- Diseño §3.4: las fotos de recetas borradas seguían servidas por URL. El
-- borrado en el cliente (Fase A) cubre lo que se borre a partir de ahora;
-- esto barre lo viejo y lo que dejen los borrados de hogar y de cuenta, que
-- desde SQL no pueden tocar Storage.
select cron.schedule(
  'cleanup-orphan-photos-daily',
  '17 4 * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
           || '/functions/v1/cleanup-orphan-photos',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'publishable_key'),
      'x-rezet-cron', (select decrypted_secret from vault.decrypted_secrets where name = 'timer_cron_secret')
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);
```

- [ ] **Step 3: Gate y commit** — `feat(edge): limpieza diaria de fotos huérfanas`.

Deja dicho en el informe que esta función **no tiene ninguna verificación automática** (está fuera de `tsc` y no hay tests de Deno), y que el propietario debería invocarla una vez con `?dryRun=1` antes de que el cron la ejecute de verdad.

Nota para el informe: la comprobación de CI de la Task 10 del plan anterior compara funciones desplegadas contra carpetas del repositorio, así que esta función nueva no la hace fallar; la huérfana `import-idea-photo` sí, y sigue siendo acción del usuario.

---

### Task C7: Cabeceras de seguridad y limpieza al cerrar sesión

**Diseño §3.8, primeros dos puntos.**

**Files:** Create `app/public/_headers`; Modify `app/src/data/auth.tsx` (función `signOut`, línea ~141).

- [ ] **Step 1: Escribir las cabeceras**

`_headers` **está soportado** en assets estáticos de Workers (documentación de Cloudflare, *Workers → Static assets → Headers*): no hace falta comprobarlo ni añadir un Worker script. Crea `app/public/_headers`; Vite copia `public/` a `dist/`.

Orígenes ya verificados, para que no tengas que deducirlos (y porque deducirlos mal rompe la app en silencio):

- **`https://world.openfoodfacts.org`** — `sheets/PantryScanCapture.tsx:128` lo consulta al escanear un código de barras, dentro de un `try/catch` que se traga el fallo: sin este origen, escanear deja de encontrar productos y nadie ve un error.
- Ambos proyectos de Supabase (el principal y el de komprapp) son `*.supabase.co`, API y WebSocket.
- El origen de komprapp (`https://shop.jarsss8.es`, en `app/src/domain/komprappExport.ts:8`) solo se usa para construir enlaces, no para `fetch`: no necesita `connect-src`.
- Todo lo de Ideas (`/ideas/*.json`, `/ideas/photos/*`) es del mismo origen.
- `script-src 'self'` basta: `vite.config.ts` usa `injectRegister: false`, no hay scripts en línea y `@zxing/browser` es JavaScript puro (sin WebAssembly). No hace falta `font-src`: no hay fuentes externas.

Si añades algún origen más, justifícalo con el `grep` que lo encontró.

```
/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  X-Frame-Options: DENY
  Content-Security-Policy: default-src 'self'; frame-ancestors 'none'; base-uri 'self'; object-src 'none'; img-src 'self' data: blob: https://*.supabase.co; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://world.openfoodfacts.org; style-src 'self' 'unsafe-inline'; script-src 'self'; manifest-src 'self'; worker-src 'self'
```

**Comprueba la CSP** (`npm run dev` no aplica `_headers`; usa `npm run build && npx wrangler dev` si puedes hacerlo sin desplegar). Los cuatro flujos que hay que mirar con la consola abierta, porque son los que tienen orígenes o APIs propias: **escanear un código de barras**, **añadir a la despensa con foto**, **exportar a komprapp** y **la lista de la compra en dos pestañas** (que usa el WebSocket de Realtime). Una CSP que rompa la app en silencio es peor que no ponerla: si no puedes verificarla, **dilo claramente en el informe** y deja la cabecera como `Content-Security-Policy-Report-Only`.

- [ ] **Step 2: Limpieza al cerrar sesión**

En `auth.tsx::signOut`, antes de `supabase.auth.signOut()`: da de baja la suscripción push (ya existe `unsubscribeFromPush()` en `app/src/data/push.ts`), borra los `cook_timer` del propio perfil, y limpia `rezet.cook` (`useCookSession.ts:47`) y `rezet.tab` (`App.tsx:169`) de `localStorage`. Existen además `rezet.pendingInvite`, `rezet.prefs` y `rezet.seenScanTutorial`: el diseño solo pide las dos primeras, así que **decide y di en el informe** qué haces con `rezet.pendingInvite` (borrarla parece lo correcto: es de un flujo de alta que ya no aplica). Envuelve cada paso para que un fallo no impida cerrar sesión.

- [ ] **Step 3: Gate y commit** — `fix(app): cabeceras de seguridad y limpieza al cerrar sesión`.

---

### Task C8: Higiene del servidor MCP

**Diseño §3.8, tercer punto.**

**Files:** Modify `mcp/src/login.ts`, `mcp/src/errors.ts`, `mcp/src/tools/pantry.ts`, y el fichero que construye el texto de miembros del hogar (búscalo: `grep -rn "display_name" mcp/src/tools mcp/src/mappers.ts`).

- [ ] **Step 1: Escapar en el listener local**

`mcp/src/login.ts` **líneas 86-90** (el fichero tiene 185 líneas en total, no 263) interpola `error` y `error_description` de la query en HTML sin escapar. Escápalos (reutiliza un `sanitizeText` como el de `mcp/src/worker/html.ts` o escribe uno equivalente ahí mismo).

- [ ] **Step 2: Errores sin texto crudo de Postgres**

En `mcp/src/errors.ts`, los `case` de `PostgrestError` incluyen `e.message` en la respuesta. Sustituye por mensajes fijos que conserven el significado (no encontrado, no permitido, unidad inválida…) sin devolver el texto del servidor. Mantén el código de error en el log si hace falta depurar.

- [ ] **Step 3: Filtro explícito por hogar**

En `mcp/src/tools/pantry.ts` (~línea 78), la relectura de `pantry_item` se apoya solo en RLS. Añade `.eq('household_id', ctx.householdId)` — defensa en profundidad, coherente con el resto de consultas.

- [ ] **Step 4: Texto no confiable — comprobar y, probablemente, no hacer nada**

El diseño pedía envolver el nombre de los miembros del hogar antes de que llegue a un modelo. **Hoy no llega:** `displayName` solo se usa en `mcp/src/supabase.ts` para construir el contexto y ninguna herramienta lo devuelve. Confírmalo con `grep -rn "displayName" mcp/src` y **déjalo como no-op en el informe**. La superficie real de texto escrito por personas son los nombres de recetas e ingredientes en `mcp/src/mappers.ts`, y marcar eso es una decisión del usuario, no de este plan: propónselo, no lo hagas por tu cuenta.

- [ ] **Step 5: Gate y commit**

```bash
cd /home/jars/Programing/Rezet/mcp && npx tsc --noEmit -p tsconfig.worker.json && npx tsc --noEmit -p tsconfig.json && npm test
cd /home/jars/Programing/Rezet/app && npm run lint && npm test
```

Commit: `fix(mcp): escapar entradas, ocultar errores de Postgres y acotar la despensa`.

---

### Task C9: Endurecer el despliegue

**Diseño §3.9.**

**Files:** Modify `.github/workflows/deploy.yml`, `.gitignore`.

- [ ] **Step 1: Atar los jobs de despliegue a `main`**

**Cuidado con la precedencia**: `&&` liga más fuerte que `||` en las expresiones de GitHub, así que anteponer la condición a un `A || B` sin paréntesis produce `(rama && A) || B` — y `workflow_dispatch` con `force_all: true` desde cualquier rama seguiría aplicando migraciones en producción, que es justo lo que esta tarea quiere impedir.

El job `migrations` es el único cuya condición no está entre paréntesis. Déjala exactamente así:

```yaml
    if: >-
      github.ref == 'refs/heads/main' &&
      (needs.changes.outputs.migrations == 'true' || github.event.inputs.force_all == 'true')
```

En `functions`, `app` y `mcp` el `(… || …)` ya está entre paréntesis: basta anteponer `github.ref == 'refs/heads/main' &&` justo después de `!cancelled() &&`. En `release` no hay `||`: anteponerlo tal cual.

- [ ] **Step 2: Fijar las acciones por SHA**

Sustituye cada `uses: owner/action@vN` por `uses: owner/action@<sha40>  # vN`. Obtén el SHA real de cada etiqueta con:

```bash
gh api repos/<owner>/<repo>/git/ref/tags/<tag> --jq '.object.sha'
```

(y si el objeto es un tag anotado, resuelve con `gh api repos/<owner>/<repo>/git/tags/<sha> --jq '.object.sha'`). Son: `actions/checkout@v7`, `actions/setup-node@v7`, `dorny/paths-filter@v4`, `supabase/setup-cli@v3`, `cloudflare/wrangler-action@v4`, y cualquier otra que encuentres. **No inventes ningún SHA**: si una consulta falla, para y repórtalo.

- [ ] **Step 3: Acotar `SUPABASE_DB_URL`**

Hoy está en el `env:` del job `migrations`, así que lo ven todos sus pasos, incluidos `actions/checkout` y `supabase/setup-cli`. Lo usan **tres** pasos: `Check secrets`, `Pending migrations` y `Apply migrations`. Quita el `env:` del job y pon `env: { SUPABASE_DB_URL: ${{ secrets.SUPABASE_DB_URL }} }` en **esos tres**. Si lo dejas en uno solo, `Check secrets` falla y el job no despliega nada.

- [ ] **Step 4: `.gitignore`**

`app/.gitignore` ignora `*.local`, `.env.local` y `.env.*.local`, pero **no** `.env` (verifícalo: `git check-ignore -v app/.env` sale con código 1). Añade `.env` a **`app/.gitignore`**, no al `.gitignore` raíz, que tiene un bloque delicado de negaciones de `.claude/`.

- [ ] **Step 5: Verificar y commitear**

```bash
cd /home/jars/Programing/Rezet
python3 - <<'EOF'
import yaml
w = yaml.safe_load(open('.github/workflows/deploy.yml'))
for j in ('migrations', 'functions', 'app', 'mcp', 'release'):
    c = ' '.join(w['jobs'][j]['if'].split())
    assert "github.ref == 'refs/heads/main'" in c, f'{j}: sin comprobación de rama'
    assert '||' not in c or '(' in c, f'{j}: || sin paréntesis (precedencia)'
    print(j, 'OK')
EOF
git check-ignore -v app/.env
```

El `yaml.safe_load` a secas **no** detecta el fallo de precedencia: parsea tan feliz. Por eso el script comprueba los paréntesis.

Commit: `ci: fijar acciones por SHA, atar el despliegue a main y acotar secretos`.

---

### Task C10: Documentación y versión

**Files:** Modify `docs/superpowers/specs/2026-09-17-security-audit-fixes-design.md`, `CHANGELOG.md`, `app/package.json`, `mcp/package.json`.

- [ ] **Step 1: Poner el diseño al día**

Añade al documento una sección "Estado de ejecución" que recoja, sin reescribir lo anterior:

- Qué se implementó y en qué versión (1.6.0 la primera tanda, la que salga ahora para esta).
- Las **cinco desviaciones deliberadas** respecto al diseño, con su motivo (están enumeradas en la cabecera de este plan): dos fases en vez de una sola versión; trigger de atribución que rechaza en vez de forzar, y por tanto sin revocar las columnas `created_by`/`cooked_by`; pruebas contra PGlite en vez de contra producción con `ROLLBACK`; sin migración de reversión; y cuota en `recognition_usage` con ventana móvil en vez de `ai_usage(profile_id, day, count)`.
- Que `create_invite()` devuelve solo `code`, mientras el diseño §3.2 pedía `code`, `id` y `expires_at`. La lista de invitaciones pendientes se obtiene con una consulta aparte.
- Que los tests de dominio que pedía §4 para `photo_path` y la ventana de cuota no se han escrito: esa lógica vive en SQL y en la Edge Function, y se cubre desde el banco de migraciones (el `photo_path`) o no se cubre (la Edge Function).
- Que la auditoría run-2 (`~/security-audit-skill/Rezet/run-2/`) es posterior a este diseño y confirmó los hallazgos contra la configuración real.
- Lo que sigue pendiente y es acción del usuario: borrar `import-idea-photo`, copiar `timer_cron_secret` al secreto de la función, revisar la lista de redirecciones de Supabase Auth y el tope de facturación de Gemini.

- [ ] **Step 2: Versión**

Lee `.claude/skills/releasing-versions/SKILL.md` y sigue su procedimiento. `node tools/release/bump-version.mjs minor` (invitar pasa a ser solo de admins: es un cambio de comportamiento visible).

Entrada bilingüe en `CHANGELOG.md`, en términos de usuario. Debe incluir, en "Importante": **invitar a alguien pasa a ser cosa de los administradores del hogar**, y que al crear una invitación nueva caducan las anteriores.

- [ ] **Step 3: Gate y commit**

```bash
cd /home/jars/Programing/Rezet/app && npm run lint && npm test && node --test ../tools/release/version.test.mjs
```

Commit: `Release X.Y.Z`.

---

## Fase B (más adelante, no en esta sesión)

Sin cambios respecto al plan anterior: revocar el `INSERT` directo sobre `household_invite`, quitar su política y el trigger de compatibilidad, una vez que los clientes instalados se hayan actualizado.

## Acciones del propietario, antes o justo después de desplegar

1. **Antes del push:** borrar la función huérfana — `cd app && npx supabase functions delete import-idea-photo --project-ref raepigwmunhguzkmzukd`. Si no, CI falla a propósito y no se etiqueta la versión.
2. **Después del despliegue:** copiar `timer_cron_secret` del Vault al secreto `TIMER_CRON_SECRET` de las funciones `send-timer-notifications` y `cleanup-orphan-photos`; y definir `APP_ORIGIN` en `recognize-pantry-item`.
3. **Leer** la lista de redirecciones de Supabase Auth (comodines = problema real) y el tope de facturación de la clave de Gemini.
4. **Decidir** qué hacer con las 725 recetas y fotos de cecotec.es antes de difundir el repositorio.
