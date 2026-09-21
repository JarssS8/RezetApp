# Avisos, gustos y turnos (fases 4, 5 y 7) — plan de implementación

> **Para agentes ejecutores:** SUB-SKILL OBLIGATORIA: `superpowers:subagent-driven-development`. Pasos con checkbox (`- [ ]`). Ejecuta las tareas **en orden**: cada una asume la anterior commiteada.

**Goal:** Que cada persona decida qué le avisa la app y cuándo, que pueda decir qué recetas le gustan y recibir sugerencias, y que un hogar pueda —si quiere— repartirse quién cocina y quién compra.

**Architecture:** Tres subsistemas pequeños e independientes que cuelgan de `member`, la identidad de producto que ya existe. Los tres comparten el mismo patrón: una tabla con RLS por `private.can_act_for` o por hogar según el nivel de privacidad que toque, y una pantalla que la edita. Los turnos nacen **apagados** y no afectan a ningún cálculo: son informativos.

**Tech Stack:** Supabase (Postgres + RLS + Edge Functions Deno + pg_cron), React 19 + TypeScript + Vite, TanStack Query, vitest, PGlite.

**Spec:** `docs/superpowers/specs/2026-09-20-personalizacion-por-miembro-design.md` — §9 (avisos), §8.1 (gustos y "Para ti"), §10 (turnos). Léelas.

## Estado de partida

Fases 1 y 2 desplegadas o fusionadas (1.10.0, 222 tests). Ya existen: `member` con `is_ward` y `deleted_at`, `private.can_act_for(member_id)`, `private.current_member()`, el contrato `Store` con `members`/`myMemberId`, los tipos marcados `MemberId`/`ProfileId`, los módulos `domain/nutrition.ts` y `domain/intake.ts`, y la infraestructura de avisos: tabla `cook_timer`, tabla `push_subscription` (ambas colgando de `profile`), la Edge Function `send-timer-notifications` y su `pg_cron`.

## Global Constraints

- **Ninguna tarea toca producción:** nada de `apply_migration`, `supabase db push`, `wrangler`, `supabase functions deploy`, ni `git push`.
- **Prefijo de migración** `YYYYMMDDHHMMSS`, mayor que `20260921090300`. Nombres de fichero exactos.
- **Toda función SQL nueva:** `set search_path = ''`, tablas como `public.<tabla>`, `revoke all … from public, anon` y el `grant execute` que toque. Toda RPC que reciba un `p_member_id` empieza comprobando `private.can_act_for(p_member_id)`.
- **Grants por columna:** `revoke update on <tabla> from authenticated` primero, `grant update (col, …)` después.
- **Las reglas de negocio viven en `domain/`**, puras y testeadas.
- **Banco de pruebas:** `app/supabase/tests/harness.ts`. **Solo `asUser` aplica RLS.**
- **Gate de cada tarea:** `cd app && npm run lint && npm test && npm run build`. Al empezar hay **222 tests** en verde.
- **Las Edge Functions no entran en ese gate** (`tsconfig` solo incluye `src`, no hay tests de Deno). Compruébalas aparte con `cd app && npx --yes deno@2 check --node-modules-dir=none supabase/functions/<fn>/index.ts`, y **si Deno no se puede instalar, dilo en el informe**: significa que ese código va a producción sin comprobar.
- **Solo tokens de color**, ningún hex suelto. `--accent`/`--warn` son rellenos; texto sobre fondo claro o tintado usa `--accent-ink`/`--warn-ink`; texto sobre relleno de acento usa `--onaccent`.
- **Nada de librerías de componentes.** Primitivas en `app/src/ui/`.
- **Toda cadena de interfaz va a `es.ts` Y `en.ts`** en la misma tarea.
- **Comentarios en castellano**, explicando el porqué.
- **Commits:** uno por tarea, terminado en `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- **Si tienes que quitar o cambiar algo que ya funcionaba, dilo en tu informe.** Quitar funcionalidad que nadie pidió quitar es un defecto, aunque el brief no la mencione.
- **Si algo no encaja con el plan, para y repórtalo. No improvises.**

## Orden y reparto de modelos

T1 → T2 → T3 → T4 → T5 → T6 → T7 → T8 → T9.

| Tareas | Modelo | Por qué |
|---|---|---|
| T1, T2, T5, T7 | **Sonnet** | SQL con RLS, y una Edge Function que decide a quién se avisa. |
| T3, T4, T6, T8 | **Sonnet** | Datos e interfaz. |
| T9 | **Haiku** | Cierre: versión y documentación. |

---

## Fase 4 — Avisos a tu medida

### Task 1: `member_notify_pref`

**Files:**
- Create: `app/supabase/migrations/20260921100000_rezet_notify_pref.sql`
- Modify: `app/supabase/tests/migrations.test.ts`

**Interfaces:**
- Produces: tabla `public.member_notify_pref`.

La decisión que da forma a la tabla, y que no se negocia: **los temporizadores de cocina quedan exentos de las horas de silencio.** Un temporizador que se traga porque son las 23:10 es comida quemada, no una notificación molesta. `quiet_from`/`quiet_to` aplican a los otros tres avisos; `timers` solo se apaga con su propio interruptor.

Sin columna de huso horario: el repo es mono-zona por diseño (`setClock` a Madrid en el Worker MCP).

- [ ] **Step 1: Escribir los tests**

Añade al final del `describe` de `migrations.test.ts`:

```ts
  it('notify_pref: cada uno ve y edita solo el suyo', async () => {
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

    await asUser(
      db,
      bea,
      `insert into public.member_notify_pref (member_id, expiring) values ('${beaMember.rows[0].id}', false)`,
    );

    const suyo = (await asUser(db, bea, 'select count(*)::int as n from public.member_notify_pref')) as {
      rows: { n: number }[];
    };
    expect(suyo.rows[0].n).toBe(1);

    const ajeno = (await asUser(db, ana, 'select count(*)::int as n from public.member_notify_pref')) as {
      rows: { n: number }[];
    };
    expect(ajeno.rows[0].n).toBe(0);
    await db.close();
  }, 120_000);

  it('notify_pref: un tutelado lo gestiona quien lo tutela', async () => {
    const db = await applyMigrations();
    const ana = await createAuthUser(db);
    await asUser(db, ana, "select public.create_household('Casa', 'Ana')");
    await asUser(db, ana, "select public.create_ward_member('Nico', 'amber')");
    const nico = await db.query<{ id: string }>(
      "select id from public.member where display_name = 'Nico'",
    );

    await asUser(
      db,
      ana,
      `insert into public.member_notify_pref (member_id) values ('${nico.rows[0].id}')`,
    );
    const n = (await asUser(db, ana, 'select count(*)::int as n from public.member_notify_pref')) as {
      rows: { n: number }[];
    };
    expect(n.rows[0].n).toBe(1);
    await db.close();
  }, 120_000);

  it('notify_pref: borrar el miembro se lleva sus preferencias', async () => {
    const db = await applyMigrations();
    const ana = await createAuthUser(db);
    await asUser(db, ana, "select public.create_household('Casa', 'Ana')");
    const yo = await db.query<{ id: string }>(
      `select id from public.member where auth_user_id = '${ana}'`,
    );
    await db.exec(
      `insert into public.member_notify_pref (member_id) values ('${yo.rows[0].id}')`,
    );
    await db.exec(`delete from public.member where id = '${yo.rows[0].id}'`);
    const quedan = await db.query<{ n: number }>(
      'select count(*)::int as n from public.member_notify_pref',
    );
    expect(quedan.rows[0].n).toBe(0);
    await db.close();
  }, 120_000);
```

- [ ] **Step 2: Ejecutar y ver que falla**

```bash
cd app && npx vitest run supabase/tests/migrations.test.ts
```
Esperado: FAIL, `relation "public.member_notify_pref" does not exist`.

- [ ] **Step 3: Escribir la migración**

```sql
-- Diseño §9 — qué te avisa la app y cuándo, por persona.
--
-- Nivel de privacidad "propio": lo que quieres que te moleste es tuyo, así
-- que reusa `can_act_for` como el resto de tablas personales.

create table public.member_notify_pref (
  member_id       uuid primary key references public.member(id) on delete cascade,
  timers          boolean not null default true,
  expiring        boolean not null default true,
  cook_turn       boolean not null default true,
  -- Apagado por defecto a propósito: una app que da la lata sin que se lo
  -- pidas se desinstala.
  log_reminder    boolean not null default false,
  log_reminder_at time not null default '21:00',
  quiet_from      time,
  quiet_to        time,
  updated_at      timestamptz not null default now()
);

alter table public.member_notify_pref enable row level security;

create policy member_notify_pref_rw on public.member_notify_pref for all
  to authenticated
  using ((select private.can_act_for(member_notify_pref.member_id)))
  with check ((select private.can_act_for(member_notify_pref.member_id)));

revoke all on public.member_notify_pref from anon, authenticated;
grant select, insert, update, delete on public.member_notify_pref to authenticated;

-- Los temporizadores de cocina NO entran en las horas de silencio: uno que
-- se traga porque son las 23:10 es comida quemada, no una notificación
-- molesta. `quiet_from`/`quiet_to` aplican a `expiring`, `cook_turn` y
-- `log_reminder`; `timers` solo se apaga con su propio interruptor.
comment on column public.member_notify_pref.timers is
  'Temporizadores de cocina. Exentos de las horas de silencio por diseño.';
```

- [ ] **Step 4: Ejecutar los tests**

```bash
cd app && npx vitest run supabase/tests/migrations.test.ts
```
Esperado: PASS.

- [ ] **Step 5: Gate y commit**

```bash
cd app && npm run lint && npm test && npm run build
git add app/supabase/migrations/20260921100000_rezet_notify_pref.sql app/supabase/tests/migrations.test.ts
git commit -m "feat(db): preferencias de aviso por miembro"
```

---

### Task 2: El cron respeta las preferencias

**Files:**
- Modify: `app/supabase/functions/send-timer-notifications/index.ts`
- Create: `app/supabase/functions/send-timer-notifications/quiet.ts` y su test

La función lee `cook_timer`, que cuelga de `profile`, y manda a `push_subscription`, que también. Las preferencias cuelgan de `member`. Así que hace falta un `join` `profile → member` por `auth_user_id`.

**La regla, y el motivo de que exista un módulo aparte para ella:** decidir si una hora cae dentro de una franja de silencio que puede cruzar la medianoche (23:00 a 08:00) es exactamente el tipo de cálculo con casos límite que no debe vivir enredado en el cuerpo de una Edge Function. Va en `quiet.ts`, puro y testeado.

- [ ] **Step 1: El módulo puro, con sus tests**

`quiet.ts` exporta `isQuiet(now: Date, from: string | null, to: string | null): boolean`. Casos que los tests tienen que fijar: franja normal (22:00-23:00), franja que cruza medianoche (23:00-08:00) con horas antes y después de las 00:00, franja nula (sin silencio), y los bordes exactos (¿la hora de inicio cuenta como silencio? ¿y la de fin?). Decide y documenta qué pasa en los bordes; lo importante es que esté fijado por un test.

Los tests de este módulo van en `app/supabase/functions/send-timer-notifications/quiet.test.ts` y **no** los recoge `npm test` (el `tsconfig` de la app solo incluye `src`). Córrelos con `npx --yes deno@2 test --no-check supabase/functions/send-timer-notifications/quiet.test.ts` desde `app/`, y **di en tu informe si Deno no se puede instalar**.

- [ ] **Step 2: Usarlo en la función**

En `index.ts`, tras leer los temporizadores vencidos, resuelve la preferencia del miembro correspondiente a cada `profile_id` y:
- si `timers` está a `false`, no mandes ese aviso;
- **no** apliques las horas de silencio a los temporizadores.

**Si no existe fila de preferencias para ese miembro, o no existe miembro, compórtate como hoy: manda.** Una preferencia que no existe no puede silenciar a nadie — es la diferencia entre "no quiero" y "no he dicho nada".

Marca el temporizador como avisado igual que ahora, se haya mandado o no: si no, el cron lo reintentaría para siempre.

- [ ] **Step 3: Comprobar y commitear**

```bash
cd app && npx --yes deno@2 check --node-modules-dir=none supabase/functions/send-timer-notifications/index.ts
cd app && npm run lint && npm test && npm run build
git commit -m "feat(push): respetar las preferencias de aviso de cada miembro"
```

---

### Task 3: Contrato y capas de datos de los avisos

**Files:**
- Modify: `app/src/types.ts`, `app/src/data/storeContext.ts`, `app/src/data/supabaseStore/useMembers.ts` (o un módulo nuevo si crece), `app/src/data/store.tsx`

**Interfaces:**
- Produces: tipo `NotifyPref`; y en `Store`: `notifyPref: NotifyPref | null`, `setNotifyPref: (memberId: MemberId, patch: Partial<NotifyPref>) => Promise<void>`.

Mismo patrón que `myBody`/`setMyBody` de la fase anterior. Dos avisos de lo que salió mal allí y que **no** hay que repetir:

1. **No devuelvas un `Map` desde una `queryFn`.** TanStack no le hace structural sharing, así que cada refetch cambia la identidad y dispara los efectos que dependen de ella — eso borró un formulario a medio escribir en la fase anterior. Devuelve un array plano y construye el índice en un `useMemo`.
2. **Manda en el patch solo las claves presentes.** Las ausentes las conserva el servidor.

Las dos capas tienen que comportarse igual: la demo es pública.

- [ ] **Step 1: Tipos, contrato y las dos capas**
- [ ] **Step 2: Gate y commit**

```bash
cd app && npm run lint && npm test && npm run build
git commit -m "feat(data): preferencias de aviso en las dos capas"
```

---

### Task 4: La pantalla de avisos

**Files:**
- Create: `app/src/sheets/NotifySheet.tsx`
- Modify: `app/src/sheets/SettingsSheet.tsx`, `app/src/App.tsx`, `app/src/i18n/es.ts`, `app/src/i18n/en.ts`

Diseño aprobado: una tarjeta con cuatro filas de interruptor —temporizadores de cocina (con la nota "nunca se silencian"), caduca pronto, te toca cocinar, recordarme registrar—, después una tarjeta de horas de silencio con dos campos de hora y una frase explicando que los temporizadores son la excepción, y al pie una nota diciendo que quien no tiene cuenta no recibe avisos porque no hay dónde enviárselos.

Se entra desde Ajustes, con una fila nueva.

Claves nuevas en los dos idiomas: `notifyTitle`, `notifyTimers`, `notifyTimersNever`, `notifyExpiring`, `notifyExpiringHint`, `notifyCookTurn`, `notifyCookTurnHint`, `notifyLogReminder`, `notifyLogReminderHint`, `notifyQuiet`, `notifyQuietHint`, `notifyQuietFrom`, `notifyQuietTo`, `notifyWardsNote`.

Accesibilidad: cada interruptor con su `<label>` asociado de verdad; los campos de hora, igual.

- [ ] **Step 1: La hoja, el enganche y los textos**
- [ ] **Step 2: Gate y commit**

```bash
cd app && npm run lint && npm test && npm run build
git commit -m "feat(ui): avisos a tu medida"
```

---

## Fase 5 — Gustos y "Para ti"

### Task 5: `member_recipe_pref`

**Files:**
- Create: `app/supabase/migrations/20260921100100_rezet_recipe_pref.sql`
- Modify: `app/supabase/tests/migrations.test.ts`

**La asimetría que define esta tabla:** **leer es del hogar, escribir es tuyo.** El agregado ("gusta a 3 de 4") es el producto: sirve para decidir qué se cocina. Esconder quién votó qué crearía una ambigüedad peor en un grupo de cuatro personas.

```sql
-- Diseño §8.1 — me gusta / no me gusta por persona.
--
-- Leer es de HOGAR y escribir es propio: el agregado ("gusta a 3 de 4") es
-- justo el producto, porque sirve para decidir qué se cocina. Esconder quién
-- votó qué crearía una ambigüedad peor en un grupo pequeño.

create table public.member_recipe_pref (
  member_id   uuid not null references public.member(id) on delete cascade,
  recipe_id   uuid not null references public.recipe(id) on delete cascade,
  rating      smallint not null check (rating in (-1, 1)),
  updated_at  timestamptz not null default now(),
  primary key (member_id, recipe_id)
);

create index member_recipe_pref_recipe_idx on public.member_recipe_pref (recipe_id);

alter table public.member_recipe_pref enable row level security;

create policy member_recipe_pref_select on public.member_recipe_pref for select
  to authenticated
  using (exists (
    select 1 from public.member m
     where m.id = member_recipe_pref.member_id
       and m.household_id = (select private.current_household())
  ));

create policy member_recipe_pref_write on public.member_recipe_pref for all
  to authenticated
  using ((select private.can_act_for(member_recipe_pref.member_id)))
  with check ((select private.can_act_for(member_recipe_pref.member_id)));

revoke all on public.member_recipe_pref from anon, authenticated;
grant select, insert, update, delete on public.member_recipe_pref to authenticated;
```

**Ojo con el orden de las políticas:** con dos políticas `for select` y `for all` sobre la misma tabla, Postgres las combina con OR. Comprueba con un test que un miembro **no** puede escribir sobre la fila de otro aunque pueda leerla, y que **sí** puede leerla. Si la combinación no da eso, cambia el enfoque a una sola política por operación (`for select`, `for insert`, `for update`, `for delete`) y dilo en tu informe.

- [ ] **Step 1: Tests (leer sí, escribir no, y aislamiento entre hogares)**
- [ ] **Step 2: Ver que fallan**
- [ ] **Step 3: La migración**
- [ ] **Step 4: Tests en verde**
- [ ] **Step 5: Gate y commit**

```bash
git commit -m "feat(db): me gusta y no me gusta por miembro"
```

---

### Task 6: Gustos en la interfaz, y "Para ti"

**Files:**
- Create: `app/src/domain/suggestions.ts` y su test
- Modify: `app/src/types.ts`, `app/src/data/storeContext.ts`, las dos capas de datos, `app/src/screens/RecipeDetail.tsx`, `app/src/screens/Today.tsx`, `app/src/i18n/es.ts`, `app/src/i18n/en.ts`

**La puntuación vive en `domain/suggestions.ts`**, pura y testeada, no en la pantalla:

```
+3  te gusta
−10 no te gusta
+2  la despensa da para cocinarla entera
+1  no la has cocinado en las últimas dos semanas
```

Nada de aprendizaje automático ni servicios externos: es una suma de cuatro términos, y así se puede explicar y testear. El `−10` es deliberadamente grande: una receta que has marcado como que no te gusta no debe aparecer aunque gane en todo lo demás. Fija eso con un test.

En `RecipeDetail`: dos botones (me gusta / no me gusta) y debajo el agregado del hogar con los avatares. Pulsar el mismo botón otra vez quita el voto.

En `Today`: un bloque "Para ti" con las tres mejores, usando la puntuación.

Claves nuevas en los dos idiomas: `likeAction`, `dislikeAction`, `likedByCount`, `forYou`, `forYouHint`.

- [ ] **Step 1: El módulo de dominio con sus tests**
- [ ] **Step 2: Contrato, capas y pantallas**
- [ ] **Step 3: Gate y commit**

```bash
git commit -m "feat(ui): gustos por persona y sugerencias para ti"
```

---

## Fase 7 — Turnos, apagados por defecto

### Task 7: Esquema de turnos

**Files:**
- Create: `app/supabase/migrations/20260921100200_rezet_turns.sql`
- Modify: `app/supabase/tests/migrations.test.ts`

```sql
-- Diseño §10 — turnos de cocina y compra. Opcionales y APAGADOS por
-- defecto: un hogar de dos personas no necesita coordinarse y no tiene por
-- qué cargar con una función de coordinación.
--
-- Nada de lo que hay aquí afecta a la despensa, a la compra ni a las
-- calorías. Es informativo, y así debe quedarse.

alter table public.household add column turns_enabled boolean not null default false;

alter table public.plan_entry add column cook_member_id uuid references public.member(id) on delete set null;
create index plan_entry_cook_member_idx on public.plan_entry (cook_member_id);

create table public.shopping_turn (
  household_id uuid not null references public.household(id) on delete cascade,
  week_start   date not null,
  member_id    uuid not null references public.member(id) on delete cascade,
  updated_at   timestamptz not null default now(),
  primary key (household_id, week_start)
);

alter table public.shopping_turn enable row level security;
create policy shopping_turn_rw on public.shopping_turn for all
  to authenticated
  using (household_id = (select private.current_household()))
  with check (household_id = (select private.current_household()));

revoke all on public.shopping_turn from anon, authenticated;
grant select, insert, update, delete on public.shopping_turn to authenticated;
```

**`turns_enabled` y `cook_member_id` necesitan grant de columna**, y `household`/`plan_entry` ya tienen grants existentes: recuerda revocar el de tabla antes de conceder columnas, o el `revoke` por columna no hará nada. Mira cómo se resolvió en `20260917070845` y **comprueba con un test** que las demás columnas siguen siendo escribibles después de tu cambio — romper la edición del plan sería una regresión grave.

Tests: que `cook_member_id` no pueda apuntar a un miembro de otro hogar (trigger de integridad, como `20260919100400`); que `shopping_turn` no se lea desde otro hogar; y el de las columnas que siguen escribibles.

- [ ] **Step 1: Tests** → **Step 2: fallan** → **Step 3: migración** → **Step 4: verde** → **Step 5: gate y commit**

```bash
git commit -m "feat(db): turnos de cocina y compra, apagados por defecto"
```

---

### Task 8: Turnos en la interfaz

**Files:**
- Create: `app/src/sheets/TurnsSheet.tsx`
- Modify: contrato y las dos capas, `app/src/screens/Plan.tsx`, `app/src/screens/Today.tsx`, `app/src/sheets/HouseholdSheet.tsx`, `app/src/i18n/es.ts`, `app/src/i18n/en.ts`

- El interruptor de "usar turnos en este hogar" va en la hoja del hogar, y **solo lo ve un admin**.
- **Mientras esté apagado, nada de esto existe para el usuario**: ni el chip en Hoy, ni los avatares en Plan, ni la hoja. Compruébalo.
- En `Plan`, cada comida deja asignar quién cocina; en `Today`, un chip "te toca" cuando es tuya.
- La compra de la semana se asigna en la hoja de turnos.

Claves nuevas en los dos idiomas: `turnsTitle`, `turnsEnable`, `turnsEnableHint`, `turnsYours`, `turnsWeekShopping`, `turnsAssign`, `turnsNobody`.

- [ ] **Step 1: Contrato, capas, pantallas y textos**
- [ ] **Step 2: Gate y commit**

```bash
git commit -m "feat(ui): turnos de cocina y compra"
```

---

### Task 9: Versión, changelog y documentación

**Files:** `CHANGELOG.md`, `CLAUDE.md`, versiones vía script.

- [ ] **Step 1:** `node tools/release/bump-version.mjs minor`
- [ ] **Step 2:** entrada bilingüe en `CHANGELOG.md`, con el formato de las anteriores. Tiene que decir: que cada uno elige qué le avisa y en qué horas, **y que los temporizadores de cocina nunca se silencian**; que se puede marcar qué recetas te gustan y que el hogar ve el agregado; que hay sugerencias "Para ti"; y que los turnos existen, son opcionales y vienen **apagados**.
- [ ] **Step 3:** en `CLAUDE.md`, actualiza la sección de huecos conocidos (las fases 4, 5 y 7 dejan de estar pendientes) y añade a la arquitectura que `domain/suggestions.ts` es donde vive la puntuación de sugerencias.
- [ ] **Step 4:** gate y commit `Release X.Y.Z`.
- [ ] **Step 5: Parar.** No despliegues.
