# Personalización por miembro — diseño

Fecha: 2026-09-20
Origen: sesión de brainstorming con el usuario. Punto de partida: `main` en `a700359` (1.8.2).

## 1. Contexto

Rezet es hoy una app **de hogar**: el plan, la despensa, las recetas y la lista de la
compra son de todos, y el único número personal que existe —el objetivo de calorías— no
es personal en absoluto: vive en `household.kcal_target`
(`app/supabase/migrations/20260905131217_rezet_core_schema.sql:19`), uno por hogar.

Eso produce un fallo visible hoy: el anillo de la pantalla Hoy
(`app/src/screens/Today.tsx:40-52`) suma las kcal de **todas** las comidas planificadas del
día multiplicadas por sus raciones, y las compara contra ese objetivo único. Una cena de
4 raciones cuenta como 4 raciones para la única persona que mira la pantalla. El número no
significa nada para nadie.

Los ajustes personales tienen el problema simétrico. `profile` ya tiene columnas `locale`,
`theme`, `accent` y `units` desde el esquema original, y **ninguna se usa**: la app guarda
todo eso en `localStorage` (`app/src/store/prefs.tsx`). Cambias de móvil y empiezas de cero.

Este documento diseña la capa personal que falta, dentro de un hogar compartido.

### Decisiones tomadas con el usuario

- Cada miembro tiene su propio objetivo de kcal, calculado con **Mifflin-St Jeor** (sexo,
  edad, altura, peso, actividad) y siempre editable a mano.
- Las comidas del plan cuentan **para todos** en cuanto se marcan cocinadas, a razón de
  **una ración por persona**, ajustable en el acto (½ / 1 / 1½ / 2) y descartable ("hoy no
  cené esto").
- Encima de eso, cada miembro registra **extras**: texto libre con kcal, una receta del
  hogar, un código de barras, o un favorito guardado.
- El dashboard (pantalla Hoy) se compone de **widgets con tamaño**, reordenables, por
  miembro.
- Identidad: tabla `member` con `auth_user_id` nullable, para que existan **miembros sin
  cuenta** (niños, invitados).
- Entran además: ajustes que te siguen entre dispositivos, avatar y color por miembro,
  dietas y alergias, gustos y sugerencias, avisos a tu medida, progreso personal, y turnos
  de cocina y compra **opcionales** (apagados por defecto).

### Aviso de alcance, aceptado por el usuario

Esto son seis subsistemas, no una funcionalidad. Se avisó de que una spec única de los seis
es grande y envejecerá en las partes que tarden en implementarse; el usuario pidió
explícitamente el detalle completo de los seis. Se entrega así, y el documento se ordena
para que cada sub-proyecto pueda convertirse en su propio plan de implementación sin releer
el resto: §3 y §4 son comunes, §5 a §10 son independientes entre sí.

El sub-proyecto 4 (dietas y alérgenos) es, con diferencia, el más caro: exige datos de
ingredientes que la app no tiene hoy. Está diseñado para degradar con honestidad —
"sin verificar" nunca se muestra como "apto".

## 2. Objetivos y no objetivos

**Objetivos**

1. Cada persona del hogar ve números que son suyos: su objetivo, su consumo, su progreso.
2. Registrar lo que comes cuesta un toque en el caso normal y nunca más de tres.
3. Los datos de salud (sexo, edad, altura, peso) son privados de quien los introduce, incluso
   frente a su propio hogar.
4. La pantalla principal la compone cada miembro.
5. Un hogar puede incluir a quien no tiene cuenta: niños, invitados, personas mayores.
6. Nada de lo anterior rompe el bucle central **plan − despensa = compra** ni el flujo de
   cocinar.
7. El modo demo sigue funcionando entero, sin cuenta y sin red.

**No objetivos**

- No se persiguen macros (proteína/grasa/hidratos), agua ni ejercicio. Solo kcal.
- No se importa un catálogo nutricional propio: las kcal salen de la receta, del usuario o
  de OpenFoodFacts.
- No es una app médica. No se dan consejos de salud ni se diagnostica nada; las fórmulas se
  presentan como estimación y el número siempre se puede escribir a mano.
- No se cambia la autenticación, el OAuth del MCP ni el modelo de hogares/invitaciones.
- No se añade router (sigue siendo la brecha conocida con `BUILD_FROM_ZERO.md` §2).

## 3. Decisiones transversales

### 3.1 Identidad: la tabla `member`

Hoy "miembro del hogar" es lo mismo que "fila en `profile`", que es lo mismo que "usuario de
`auth.users`". Con miembros sin cuenta eso deja de ser cierto.

```sql
create table member (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references household(id) on delete cascade,
  auth_user_id  uuid unique references profile(id) on delete set null,
  display_name  text not null,
  avatar_path   text,
  color         text not null default 'green',
  sort_order    int  not null default 0,
  -- ajustes que te siguen (§3.5)
  locale        text not null default 'es',
  theme         text not null default 'system',
  accent        text not null default 'green',
  units         text not null default 'metric',
  -- objetivo visible para el hogar; los datos que lo producen, no (§3.2)
  kcal_target   int  not null default 2100,
  created_at    timestamptz not null default now(),
  deleted_at    timestamptz
);
create index member_household_idx on member (household_id) where deleted_at is null;
```

Reglas:

- `profile` **no se toca**. Sigue siendo la fuente de verdad de autenticación, del hogar
  (`private.current_household()`) y del rol de admin. `member` es la capa de producto.
- `auth_user_id` nullable: nulo = miembro sin cuenta.
- **Borrado lógico.** Quien se va del hogar deja detrás su registro de consumo y las recetas
  que creó. Un `delete` real vaciaría el historial de los demás. `deleted_at` lo conserva y
  lo oculta de toda lista.
- `color` es uno de los siete acentos ya calibrados en `app/src/store/prefs.tsx::ACCENTS`.
  Nada de hex suelto (regla no negociable del repo).

`display_name` se muda de `profile` a `member`. `profile.display_name` se mantiene como
espejo de solo lectura (escrito por las mismas RPC) hasta que no queden PWA cacheadas que lo
lean; su eliminación es una migración posterior, fuera de este diseño.

**Todo lo personal apunta a `member_id`, nunca a `profile.id`.** Es la razón de ser de la
tabla: si el registro de kcal o los gustos apuntaran a `profile`, añadir miembros sin cuenta
después obligaría a migrar cada una de esas tablas.

### 3.2 Privacidad en tres niveles

Rezet solo conoce hoy un nivel: "del hogar" (`private.current_household()`). Hacen falta tres.

| Nivel | Quién lo ve | Qué vive ahí |
|---|---|---|
| **Hogar** | todos los miembros con cuenta | plan, despensa, recetas, compra, `member` (nombre, avatar, color, `kcal_target`), dietas, gustos agregados, turnos |
| **Propio** | solo quien lo escribe | `member_body` (sexo, edad, altura, peso, actividad), preferencias de aviso |
| **Tutelado** | el propio miembro **si tiene cuenta**; si no, cualquier miembro con cuenta del hogar | registro de consumo, favoritos de registro |

El nivel *propio* se implementa con RLS sobre el vínculo de cuenta, no sobre el hogar:

```sql
create policy member_body_own on member_body for all to authenticated
  using (exists (select 1 from member m
                 where m.id = member_body.member_id
                   and m.auth_user_id = (select auth.uid())))
  with check (/* mismo predicado */);

-- y, para miembros sin cuenta, tutela del hogar:
create policy member_body_ward on member_body for all to authenticated
  using (exists (select 1 from member m
                 where m.id = member_body.member_id
                   and m.auth_user_id is null
                   and m.household_id = (select private.current_household())))
  with check (/* mismo predicado */);
```

**Por qué esto no puede ir en `profile`:** `profile_select`
(`20260905131217_rezet_core_schema.sql:332`) permite `household_id = current_household()`.
Una columna `weight_kg` en `profile` sería legible por tu pareja el día que se añadiera. No
hay column-level security en Postgres para SELECT; la única separación real es otra tabla.

`kcal_target` sí vive en `member` (nivel hogar) a propósito: planificar comidas para la casa
necesita saber que Ana apunta a 1 900 y Jars a 2 600. Los datos que producen ese número no
salen de `member_body`.

La contrapartida del nivel *tutelado* es explícita y se dice en la interfaz al crear un
miembro sin cuenta: **sus datos los ven todos los adultos del hogar.** No hay alternativa —
alguien tiene que registrar por él.

### 3.3 Las reglas nuevas viven en `domain/`

Regla no negociable del repo: la lógica de negocio es pura y está testeada. Tres módulos
nuevos:

- **`domain/nutrition.ts`** — Mifflin-St Jeor, factores de actividad, ajuste por objetivo,
  redondeo y cotas de seguridad.
- **`domain/intake.ts`** — el día de un miembro: comidas del plan cocinadas × ración
  efectiva, menos exclusiones, más extras. También la semana, la media y la racha.
- **`domain/dashboard.ts`** — normalización del layout de widgets: ids desconocidos,
  tamaños inválidos, widgets nuevos tras una actualización, deduplicación.

Cuatro pantallas van a mostrar "cuántas kcal llevo" (Hoy, el registro, el progreso, la hoja
de miembro). Si cada una lo calcula por su cuenta, divergirán, exactamente como ya advierte
la regla sobre `scaleQuantity`/`isCovered`.

### 3.4 Compatibilidad con clientes viejos

`household.kcal_target` **no se borra**. Una PWA cacheada anterior a esta versión lo sigue
leyendo y seguiría mostrando su anillo antiguo. Pasa a cumplir un solo papel nuevo: valor
por defecto que hereda un `member` recién creado. Su eliminación queda para cuando se
retiren esas versiones, igual que se hizo con las invitaciones en 1.6.0.

Ningún cliente viejo escribe en las tablas nuevas, así que no hay riesgo de corrupción; el
único síntoma es un número desactualizado hasta que se acepte la actualización del service
worker.

### 3.5 Ajustes: el servidor manda, el dispositivo es caché

`app/src/store/prefs.tsx` sigue siendo el punto de lectura de toda la interfaz —no se
reescribe ninguna pantalla— pero cambia su origen de datos:

1. Arranque: lee `localStorage` y pinta (instantáneo, sin parpadeo, funciona sin red).
2. Con sesión y `member` cargado: si el servidor difiere, **gana el servidor**, se aplica y
   se reescribe el `localStorage`.
3. Cada cambio del usuario escribe en los dos sitios; el servidor con reintento silencioso.
4. Modo demo: nunca hay paso 2 ni 3; todo queda local, como hoy.

`showIdeas` se queda **por dispositivo** (es una preferencia de pantalla, no de persona), y
se documenta así para que no se "arregle" por error más adelante.

### 3.6 La capa de datos se parte

`app/src/data/supabaseStore.tsx` son 928 líneas y este trabajo le sumaría unas seis consultas
y ocho mutaciones. Se divide en `app/src/data/supabaseStore/` por dominio
(`useMembers`, `useIntake`, `usePreferences`, `useRecipesData`, `usePantryData`, `usePlanData`)
con un `index.tsx` que compone el mismo objeto `Store`.

El contrato `app/src/data/storeContext.ts` no cambia de forma para lo que ya existe: las
pantallas actuales no se enteran. Es refactor necesario para que quepa lo nuevo, no
oportunista; se hace **antes** de añadir nada, en su propio commit, con los tests existentes
en verde como prueba de equivalencia.

### 3.7 Pruebas

- Cada módulo de `domain/` con su fichero en `app/src/domain/__tests__/`.
- Cada migración nueva entra en el banco (`app/supabase/tests/migrations.test.ts`), y las que
  tocan privacidad llevan asserts de RLS vía `asUser`:
  - un miembro **no** puede leer el `member_body` de otro miembro con cuenta;
  - sí puede leer el de un miembro sin cuenta de su hogar;
  - nadie ve nada de otro hogar;
  - un no-admin no puede crear ni borrar miembros sin cuenta.
- Recordatorio del repo: el banco es Postgres 18 y producción no; verde prueba SQL y lógica,
  no paridad con producción.

## 4. Modelo de datos completo

Resumen de todo lo que se crea. El detalle de uso está en el sub-proyecto de cada una.

```sql
-- §5 Fundación
member                      (/* véase 3.1 */)

-- §6 Nutrición personal
member_body      (member_id pk, sex, birth_year, height_cm, weight_kg,
                  activity, goal, updated_at)                    -- privado
intake_share     (member_id, plan_entry_id, servings numeric,
                  primary key (member_id, plan_entry_id))        -- excepción al "1 ración"
intake_extra     (id, household_id, member_id, date, label, kcal,
                  source, recipe_id, servings, barcode, created_by, created_at)
intake_favorite  (id, household_id, member_id, label, kcal, source,
                  recipe_id, barcode, used_count, created_at)

-- §7 Dashboard
member_dashboard (member_id pk, layout jsonb, updated_at)

-- §8 Gustos y dietas
member_recipe_pref (member_id, recipe_id, rating smallint, updated_at,
                    primary key (member_id, recipe_id))
diet_flag          (key pk, name_es, name_en, kind)              -- catálogo global
ingredient_diet    (ingredient_id, flag_key, source,
                    primary key (ingredient_id, flag_key))
member_diet        (member_id, flag_key, primary key (member_id, flag_key))

-- §9 Avisos
member_notify_pref (member_id pk, timers, expiring, cook_turn, log_reminder,
                    log_reminder_at, quiet_from, quiet_to, tz, updated_at)

-- §10 Turnos (opcional)
household.turns_enabled  boolean not null default false
plan_entry.cook_member_id uuid null references member(id) on delete set null
shopping_turn    (household_id, week_start, member_id, primary key (household_id, week_start))
```

Todas llevan `household_id` directo o alcanzable en un salto, RLS activada, y ningún rol con
INSERT directo donde haya una RPC (`SECURITY DEFINER`) que deba ser el único camino.

## 5. Sub-proyecto 1 — Fundación de miembro

### 5.1 Migración de fundación

1. Crear `member` (§3.1).
2. Rellenar una fila por cada `profile` existente: `auth_user_id = profile.id`,
   `display_name`, `locale`/`theme`/`accent`/`units` copiados de `profile`,
   `kcal_target = household.kcal_target`, `color` = `accent`.
3. Índice único parcial:
   `create unique index member_auth_uq on member (auth_user_id) where auth_user_id is not null`.
4. RLS: SELECT y UPDATE de campos propios para el hogar; ver 5.2.
5. Helper `private.current_member()` análogo a `private.current_household()`:
   `select id from member where auth_user_id = auth.uid() and deleted_at is null`.
   Marcado `stable`, usado entre paréntesis (`(select private.current_member())`) en cada
   política, igual que el resto del esquema, para que Postgres lo evalúe una vez por consulta.

Las RPC existentes `create_household` y `redeem_invite` pasan a crear también la fila
`member` en la misma transacción. `leave_household`, `remove_member`, `delete_household` y
`delete_account` marcan `deleted_at` en vez de dejar huérfana la fila.

### 5.2 Grants y RLS

- SELECT: `household_id = current_household() and deleted_at is null`.
- UPDATE: **columna a columna**, nunca a nivel de tabla (regla no negociable del repo: un
  `revoke update (col)` no hace nada mientras exista el grant de tabla).
  - solo sobre la **propia** fila (`auth_user_id = auth.uid()`): `display_name`,
    `avatar_path`, `color`, `locale`, `theme`, `accent`, `units`, `kcal_target`. Es el
    camino directo del caso común, sin round-trip de RPC en cada cambio de tema.
  - **nada** sobre miembros sin cuenta: escribir en la fila de otro solo pasa por
    `set_member_settings` (5.3), que comprueba la tutela. Un grant de columna no puede
    expresar "solo si el objetivo no tiene cuenta", así que la política de UPDATE se acota a
    la propia fila y la tutela vive en la RPC.
- INSERT y DELETE: **ningún rol**. Solo por RPC (`create_ward_member`, `delete_ward_member`),
  porque crear miembros es crear identidad dentro de un hogar — el mismo razonamiento que
  cerró `profile` en `20260917220000_rezet_lock_profile_insert.sql`.

### 5.3 RPC nuevas

| RPC | Quién | Hace |
|---|---|---|
| `create_ward_member(p_display_name, p_color)` | admin del hogar | crea un `member` sin cuenta. Tope de 12 miembros vivos por hogar. |
| `delete_ward_member(p_member_id)` | admin del hogar | marca `deleted_at` en un miembro **sin cuenta** del propio hogar. Rechaza si tiene cuenta (para eso está `remove_member`). |
| `set_member_settings(p_member_id, p_patch jsonb)` | el propio miembro, o cualquiera con cuenta si el objetivo no tiene cuenta | escribe la lista blanca de columnas de 5.2. Evita repartir grants por columna a cada caso. |

### 5.4 Avatares

Bucket de Storage `avatars`, misma forma que `recipe-photos`: ruta
`<household_id>/<member_id>/<uuid>.jpg`, lectura acotada al hogar (calco de
`20260917220100_rezet_scope_recipe_photos_read.sql`), escritura solo dentro del propio hogar
(calco de `20260919100300_rezet_bound_recipe_photo_paths.sql`).

Sin avatar: inicial sobre el `color` del miembro, generada en el cliente. Es el caso por
defecto y tiene que verse bien — no es un hueco vacío.

Limpieza: el cron `cleanup-orphan-photos` se extiende para barrer también avatares sin
referencia con más de 24 h, reusando su estructura y su `?dryRun=1`.

### 5.5 Interfaz

- **Hoja "Tu hogar"** (`app/src/sheets/HouseholdSheet.tsx`): la lista pasa a mostrar avatar,
  color y objetivo de kcal. Botón "Añadir miembro sin cuenta" para admins, con el aviso de
  privacidad de §3.2 en el propio formulario, no escondido en un enlace.
- **Hoja de miembro** (nueva): nombre, avatar, color, y —solo si eres tú, o si el miembro no
  tiene cuenta— objetivo de kcal, datos corporales y dietas.
- **Ajustes** (`SettingsSheet.tsx`): tema/acento/idioma/unidades siguen donde están; se añade
  una línea de estado, "Sincronizado con tu cuenta", o "Solo en este dispositivo" en demo.
- **Selector de "quién eres"**: en un dispositivo compartido hace falta poder registrar
  como otro miembro. Va en la cabecera de los bloques personales de Hoy, no como cambio de
  sesión: cambia el sujeto del registro, nunca la identidad de autenticación. Solo lista
  miembros sin cuenta más el propio, porque registrar por otro adulto con cuenta sería
  escribir en datos ajenos.

### 5.6 Modo demo

`app/src/data/seed.ts` pasa a sembrar tres miembros: dos adultos con objetivos distintos y
un menor sin cuenta. Sin esto, la demo no enseña la funcionalidad principal de esta entrega.

## 6. Sub-proyecto 2 — Nutrición personal

### 6.1 Objetivo de kcal (`domain/nutrition.ts`)

Mifflin-St Jeor, metabolismo basal:

```
hombre:  TMB = 10·peso(kg) + 6,25·altura(cm) − 5·edad + 5
mujer:   TMB = 10·peso(kg) + 6,25·altura(cm) − 5·edad − 161
```

Gasto diario = TMB × factor de actividad:

| Actividad | Factor |
|---|---|
| `sedentary` — trabajo sentado, sin ejercicio | 1,2 |
| `light` — ejercicio ligero 1-3 días/semana | 1,375 |
| `moderate` — 3-5 días/semana | 1,55 |
| `active` — 6-7 días/semana | 1,725 |
| `very_active` — trabajo físico o doble sesión | 1,9 |

Objetivo = gasto × ajuste: `lose` −15 %, `maintain` 0, `gain` +10 %.

Detalles que van en el módulo, no en la pantalla:

- **Sexo**: la fórmula solo admite dos constantes. La interfaz ofrece además "prefiero no
  decirlo", que **no usa la fórmula**: pide el número directamente. No se inventa una media
  para no dar una cifra falsa con aire de cálculo.
- **Edad** se deriva de `birth_year`, no se guarda la fecha completa: menos dato personal
  para el mismo resultado.
- **Cotas**: el resultado se acota a [1 200, 4 500] y se redondea a 50. Por debajo de 1 200 la
  interfaz avisa de que es una estimación fuera de rango habitual y **no** ofrece guardarlo
  sin escribirlo a mano.
- **Menores**: Mifflin-St Jeor está validado en adultos. Para un miembro con menos de 18 años
  la fórmula no se ofrece; se pide el número directamente con una nota de una línea. No es
  una app médica (§2).
- El número calculado siempre es editable. `member.kcal_target` guarda la cifra final;
  `member_body` guarda de dónde salió, para poder recalcular cuando cambie el peso.

```sql
create table member_body (
  member_id   uuid primary key references member(id) on delete cascade,
  sex         text check (sex in ('female','male')),     -- null = no declarado
  birth_year  int  check (birth_year between 1900 and 2100),
  height_cm   numeric(5,1) check (height_cm between 50 and 250),
  weight_kg   numeric(5,1) check (weight_kg between 15 and 400),
  activity    text not null default 'sedentary',
  goal        text not null default 'maintain',
  updated_at  timestamptz not null default now()
);
```

RLS: §3.2. Sin grant de INSERT/UPDATE de tabla; una RPC `set_member_body(p_member_id, p_patch)`
con la misma regla de tutela, que además recalcula y escribe `member.kcal_target` en la misma
transacción si el miembro tenía el objetivo enlazado a la fórmula.

### 6.2 El día de un miembro (`domain/intake.ts`)

La regla, en una línea:

```
kcal(miembro, día) = Σ comidas del plan cocinadas ese día · kcalPorRación · raciónEfectiva
                   + Σ extras del miembro ese día
```

donde `raciónEfectiva(miembro, entrada) = intake_share.servings ?? 1`, y `0` significa "no lo
comí". `plan_entry.servings` **no entra en el cálculo personal**: sigue sirviendo solo para
despensa y compra. Esto es lo que arregla el fallo del anillo descrito en §1.

Consecuencias que el módulo fija y testea:

- Una comida planificada pero **no cocinada** no cuenta para nadie. Cocinar es la señal.
- Marcar cocinado desde el modo Cook suma a todos los miembros a la vez, sin escribir
  ninguna fila: el valor por defecto es implícito. Solo la **excepción** ocupa espacio.
- Descocinar (borrar la entrada del plan) hace desaparecer su aportación, incluidas las
  `intake_share` asociadas (`on delete cascade`).
- Los extras son independientes del plan y sobreviven a cualquier cambio en él.

```sql
create table intake_share (
  member_id     uuid not null references member(id) on delete cascade,
  plan_entry_id uuid not null references plan_entry(id) on delete cascade,
  servings      numeric(4,2) not null check (servings between 0 and 6),
  updated_at    timestamptz not null default now(),
  primary key (member_id, plan_entry_id)
);

create table intake_extra (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references household(id) on delete cascade,
  member_id     uuid not null references member(id) on delete cascade,
  date          date not null,
  label         text not null,
  kcal          int  not null check (kcal between 0 and 10000),
  source        text not null check (source in ('manual','recipe','barcode','favorite')),
  recipe_id     uuid references recipe(id) on delete set null,
  servings      numeric(4,2),
  barcode       text,
  created_by    uuid references member(id) on delete set null,
  created_at    timestamptz not null default now()
);
create index intake_extra_member_date_idx on intake_extra (member_id, date);
```

`created_by` distingue "lo registré yo" de "me lo registró mi padre": necesario para el nivel
tutelado y para que el historial sea legible.

`household_id` está desnormalizado a propósito en `intake_extra` — es el patrón que ya sigue
el esquema (`shopping_check`, `pantry_item`) y lo que permite una política RLS de un solo
predicado, sin subconsulta por fila. La integridad la garantiza el mismo enfoque de
`20260919100400_rezet_bind_fk_references_to_household.sql`, que hay que replicar: comprobar
que `member_id` y `recipe_id` pertenecen a ese `household_id`.

### 6.3 Registrar: los cuatro caminos

El bloque "Tu día" de Hoy lista las comidas del plan de hoy con su ración, y debajo tus
extras. Cada comida del plan tiene un stepper ½ / 1 / 1½ / 2 y un "no lo comí" — un toque,
sin abrir nada.

El botón "Añadir" abre una hoja con cuatro pestañas, en este orden:

1. **Favoritos** — lo más usado primero, ordenado por `used_count`. Un toque y listo. Es la
   pestaña por defecto en cuanto haya al menos un favorito.
2. **Rápido** — nombre + kcal. Dos campos, teclado numérico, guardar. Casilla "guardar como
   favorito".
3. **Receta** — reusa `RecipePickerSheet.tsx`; eliges raciones y las kcal salen de
   `kcalPerServing`. Registra una receta del hogar que no estaba planificada.
4. **Código** — reusa el escáner de `app/src/sheets/PantryScanCapture.tsx`. La llamada a
   OpenFoodFacts añade `nutriments` a los campos pedidos (hoy pide
   `product_name,quantity,product_quantity,product_quantity_unit`,
   `PantryScanCapture.tsx:129`) y se lee `energy-kcal_100g`. Pides gramos consumidos y se
   calcula. Si el producto no trae kcal, cae a la pestaña "Rápido" con el nombre ya puesto —
   nunca un callejón sin salida.

El CSP no cambia: `world.openfoodfacts.org` ya está en `connect-src`
(`app/public/_headers:5`). Pedir un campo más de la misma API no abre ningún origen nuevo.

```sql
create table intake_favorite (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references household(id) on delete cascade,
  member_id     uuid not null references member(id) on delete cascade,
  label         text not null,
  kcal          int  not null check (kcal between 0 and 10000),
  source        text not null,
  recipe_id     uuid references recipe(id) on delete set null,
  barcode       text,
  used_count    int  not null default 0,
  created_at    timestamptz not null default now()
);
```

Tope de 50 favoritos por miembro, comprobado en la RPC. Los favoritos son personales pero
legibles por el hogar, por la tutela.

### 6.4 El anillo de Hoy

`app/src/screens/Today.tsx` cambia de fuente:

- `kcalTarget` pasa de `household.kcal_target` a `member.kcal_target` del miembro activo.
- `done` pasa de "kcal de las comidas cocinadas × raciones del plan" a `domain/intake.ts`.
- `planned` pasa a ser "lo que llevas + lo que te queda planificado hoy", con tu ración, no
  la del plato entero.
- Se añade la parte que faltaba: cuánto te queda **para tu objetivo**, y un aviso suave al
  pasarte, con `--warn` y `--warn-ink` (nunca `--accent` para un aviso: son tokens de
  papeles distintos).

En un hogar de un solo miembro la pantalla se ve exactamente igual que hoy, con el número ya
correcto.

### 6.5 Progreso personal

Bloque "Tu semana": barras por día contra tu objetivo, media, y racha de días consecutivos
dentro del objetivo (±10 %). Todo derivado en `domain/intake.ts` de datos que ya tienes
descargados; ninguna consulta nueva más allá de pedir el rango de fechas de la semana.

La racha se calcula solo sobre días **pasados y completos**: contar el día en curso como
"dentro del objetivo" a las nueve de la mañana sería mentir.

### 6.6 Integración con el modo Cook

Al terminar de cocinar (`CookFinishSheet.tsx`) aparece, bajo lo que ya hay, una línea:
"Cuenta para: [avatares del hogar]", con todos marcados y la ración por defecto. Desmarcar a
alguien escribe su `intake_share` a 0. Es la única forma de que "plan auto" no obligue a
corregir después.

Esto **no** toca la RPC `finish_cook` (despensa, `cookedCount`, `shortages` siguen igual);
son escrituras separadas en `intake_share`, después y sin bloquear el cierre de la hoja.

## 7. Sub-proyecto 3 — Dashboard de widgets

### 7.1 Almacenamiento

```sql
create table member_dashboard (
  member_id   uuid primary key references member(id) on delete cascade,
  layout      jsonb not null,
  updated_at  timestamptz not null default now()
);
```

`layout` es una lista ordenada:
`[{ "id": "kcal_ring", "w": "full" }, { "id": "quick_log", "w": "half" }, …]`.
Lo ausente está oculto. JSONB y no tabla-por-fila porque se lee y se escribe siempre entero,
nunca se consulta por dentro.

### 7.2 Catálogo de widgets

| id | Qué muestra | Tamaños | Requiere |
|---|---|---|---|
| `kcal_ring` | tu anillo y tu objetivo | full, half | §6 |
| `today_meals` | comidas del plan de hoy | full | — |
| `quick_log` | favoritos de registro a un toque | full, half | §6 |
| `week_progress` | tu semana y tu racha | full, half | §6 |
| `cookable_now` | recetas que ya puedes cocinar | full, half | — |
| `expiring_soon` | despensa a punto de caducar | full, half | — |
| `shopping_summary` | qué falta para la semana | full, half | — |
| `for_you` | sugerencias según tus gustos | full, half | §8 |
| `whose_turn` | a quién le toca cocinar | half | §10 |

Un widget cuyo sub-proyecto no esté implementado **no aparece en el catálogo**: no se muestran
huecos "próximamente".

### 7.3 Rejilla

- ≥ 600 px: dos columnas. `full` ocupa las dos, `half` una.
- < 600 px: una columna, todo a ancho completo, **se respeta el orden**. Es el caso
  mayoritario y hay que decirlo sin adornos: en el móvil el tamaño no se nota, el orden sí.
- ≥ 900 px (la barra lateral ya existente): tres columnas, `full` ocupa dos.

### 7.4 Edición

Modo "Personalizar" desde la cabecera de Hoy: cada widget muestra un asa de arrastre, un
control de tamaño y un interruptor. El arrastre usa el motor de `app/src/motion/` —
el mismo que ya mueve recetas al plan—, no una librería nueva (regla no negociable: nada de
librerías de componentes con sus propias métricas).

Accesibilidad: además del arrastre, cada widget tiene "subir"/"bajar" por teclado y lector de
pantalla, con `aria-live` anunciando la posición nueva. Un dashboard que solo se puede
ordenar arrastrando es un dashboard que parte del hogar no puede ordenar.

### 7.5 Compatibilidad del layout

`domain/dashboard.ts` normaliza siempre antes de pintar:

- ids desconocidos (widget retirado en una versión posterior) → se descartan;
- widgets nuevos que el usuario nunca ha visto → se añaden al final con su tamaño por
  defecto, visibles, para que una versión nueva no pase desapercibida;
- tamaño no válido para ese widget → el primero de su lista;
- lista vacía o JSON corrupto → layout por defecto.

Nada de esto lanza. Un dashboard roto por datos viejos sería una pantalla en blanco al abrir
la app.

## 8. Sub-proyecto 4 — Gustos y dietas

**El más caro. Léase el aviso de §1.**

### 8.1 Gustos

```sql
create table member_recipe_pref (
  member_id   uuid not null references member(id) on delete cascade,
  recipe_id   uuid not null references recipe(id) on delete cascade,
  rating      smallint not null check (rating in (-1, 1)),
  updated_at  timestamptz not null default now(),
  primary key (member_id, recipe_id)
);
```

En `RecipeDetail` aparecen dos botones (me gusta / no me gusta) y, debajo, el agregado del
hogar: "gusta a 3 de 4". Quién ha votado qué **sí** es visible dentro del hogar: esconderlo
crearía una ambigüedad peor ("¿a quién no le gusta?") en un grupo de cuatro personas.

`for_you` puntúa: +3 tus "me gusta", −10 tus "no me gusta", +2 cobertura completa de despensa,
+1 no cocinada en las últimas dos semanas. Función pura en `domain/` con test; nada de
aprendizaje automático ni servicios externos.

### 8.2 Dietas y alérgenos — el problema de datos

Para decir "esta receta no es apta para Ana" hace falta saber qué hay dentro de cada
ingrediente. El catálogo actual guarda nombre, grupo (`fresco`/`seco`/`conserva`), unidad y
`sensitive`. **No hay nada sobre composición.**

```sql
create table diet_flag (                 -- catálogo global, sin household_id
  key      text primary key,             -- 'gluten','lactose','nuts','shellfish','egg',
  kind     text not null,                --   'fish','soy','sesame','meat','pork','alcohol'…
  name_es  text not null,
  name_en  text not null
);

create table ingredient_diet (
  ingredient_id uuid not null references ingredient(id) on delete cascade,
  flag_key      text not null references diet_flag(key),
  source        text not null check (source in ('seed','user')),
  primary key (ingredient_id, flag_key)
);

create table member_diet (
  member_id uuid not null references member(id) on delete cascade,
  flag_key  text not null references diet_flag(key),
  primary key (member_id, flag_key)
);
```

Los 14 alérgenos de declaración obligatoria de la UE más un puñado de marcas dietéticas
(`meat`, `pork`, `fish`, `dairy`, `egg`, `alcohol`) cubren vegetariano, vegano, sin gluten,
sin lactosa y las alergias comunes.

Los ingredientes del **catálogo global** (`household_id is null`) se etiquetan en la propia
migración, uno a uno, revisados a mano. Los creados por usuarios llegan sin etiquetar.

### 8.3 Tres estados, nunca dos

Aquí está la decisión que importa. Una receta, para un miembro, es:

- **No apta** — algún ingrediente lleva una marca que el miembro evita.
- **Sin verificar** — ningún ingrediente la lleva, pero **al menos uno no está etiquetado**.
- **Apta** — todos los ingredientes están etiquetados y ninguno choca.

"Sin verificar" no se pinta como "apta" en ningún sitio, ni se cuenta como apta en ningún
filtro. Una alergia a los frutos secos no admite un "probablemente". El filtro de Recetas
ofrece "apto para todos" y, aparte, "sin conflictos conocidos", que son cosas distintas y se
etiquetan distinto.

Al crear un ingrediente nuevo, `RecipeForm` pide sus marcas si algún miembro del hogar tiene
dietas declaradas. Es una pregunta más en el formulario, y solo cuando sirve para algo.

### 8.4 Dónde se ve

- `RecipeDetail`: fila de avatares con quién puede comerlo, y por qué no quien no puede.
- `RecipePickerSheet` al planificar: aviso si la receta choca con alguien del hogar. Avisa,
  no bloquea — el hogar decide, no la app.
- `Recipes`: filtros nuevos.
- Hoja de miembro: sus dietas, editables por él (o por un adulto si no tiene cuenta).

## 9. Sub-proyecto 5 — Avisos a tu medida

```sql
create table member_notify_pref (
  member_id       uuid primary key references member(id) on delete cascade,
  timers          boolean not null default true,
  expiring        boolean not null default true,
  cook_turn       boolean not null default true,
  log_reminder    boolean not null default false,
  log_reminder_at time not null default '21:00',
  quiet_from      time,
  quiet_to        time,
  tz              text not null default 'Europe/Madrid',
  updated_at      timestamptz not null default now()
);
```

Solo los miembros **con cuenta** reciben avisos: el push va contra `push_subscription`, que
cuelga de `profile`. Un miembro sin cuenta no tiene dispositivo donde recibirlos; su
recordatorio, si hace falta, llega a quien le tutela.

`supabase/functions/send-timer-notifications` filtra por la preferencia del tipo de aviso y
por las horas de silencio, evaluadas en la `tz` del miembro. El cron ya existe y ya tiene
tope por ejecución y allowlist de destinos; esta es una condición más en la consulta, no una
función nueva.

El recordatorio de registro (`log_reminder`) sí es un disparador nuevo: un `pg_cron` que, a la
hora local de cada miembro, avisa si no ha registrado nada ese día. Está **apagado por
defecto**. Una app que da la lata sin que se lo pidas se desinstala.

## 10. Sub-proyecto 6 — Turnos (opcional)

Apagado por defecto: `household.turns_enabled boolean not null default false`. Mientras esté
apagado, ni la columna ni la interfaz existen para el usuario — sin esto, un hogar de dos
personas se come una función de coordinación que no necesita.

- `plan_entry.cook_member_id` — quién cocina esa comida. Se asigna desde `Plan` y desde la
  hoja de la comida.
- `shopping_turn(household_id, week_start, member_id)` — a quién le toca comprar esta semana.
- Chip "te toca" en Hoy y en el widget `whose_turn`; si `cook_turn` está activo en los avisos,
  notificación la mañana del día que te toca.

Ningún cálculo de despensa, compra o kcal depende de esto. Es puramente informativo, y así
debe quedarse.

## 11. Cambios en el contrato `Store`

Añadidos a `app/src/data/storeContext.ts`, implementados en las dos capas:

```ts
members: Member[];                 // vivos del hogar, ordenados
activeMemberId: string;            // yo, o el miembro que estoy registrando
setActiveMember: (id: string) => void;

myBody: MemberBody | null;                                  // null si no tengo acceso
setMyBody: (patch: Partial<MemberBody>) => Promise<void>;
setKcalTarget: (memberId: string, kcal: number) => Promise<void>;

intakeOfDay: (memberId: string, date: string) => DayIntake;  // puro, sobre datos ya cargados
setShare: (memberId: string, planEntryId: string, servings: number) => Promise<void>;
addExtra: (input: ExtraInput) => Promise<string>;
removeExtra: (id: string) => Promise<void>;
favorites: IntakeFavorite[];
saveFavorite: (input: FavoriteInput) => Promise<string>;
removeFavorite: (id: string) => Promise<void>;

dashboard: DashboardLayout;
setDashboard: (layout: DashboardLayout) => Promise<void>;

recipePrefs: Map<string, number>;   // receta -> mi voto
setRecipePref: (recipeId: string, rating: -1 | 1 | 0) => Promise<void>;
memberDiets: Map<string, string[]>;
```

Igual que `saveRecipe`/`pantryAdd`, lo que escribe devuelve `Promise` en **las dos**
implementaciones: la demo resuelve al momento, y las pantallas no distinguen.

El rango de fechas descargado de `intake_extra` es el mismo que ya usa el plan (semana
actual ± 1), para no multiplicar consultas.

## 12. MCP

`mcp/` es un tercer cliente del mismo backend; **no se toca `app/src/data/*` para servirlo**
(regla del repo). Su usuario se resuelve a `member` por `auth_user_id`.

- Las herramientas existentes siguen funcionando: nada de lo que leen cambia de forma.
- Se añaden `rezet_log_intake` (registrar un extra) y `rezet_my_day` (cuánto llevo hoy, contra
  mi objetivo). Son exactamente las que tienen sentido por voz.
- `rezet_plan_*` gana el campo opcional de comensales solo si se implementa §10.

Las dos entradas (stdio y Worker) comparten las herramientas, así que se escriben una vez.
Recordatorio del repo: **nunca refrescar la sesión de Supabase dentro de una herramienta.**

## 13. i18n

Todo el texto nuevo entra en `app/src/i18n/es.ts` y `en.ts` a la vez. Familias de claves:
`member.*`, `intake.*`, `nutrition.*`, `dashboard.*`, `diet.*`, `notify.*`, `turns.*`.

Cuidado con los nombres de alérgenos y actividades: son listas cerradas y se traducen desde
`diet_flag.name_es`/`name_en` (datos), no desde el diccionario, porque el catálogo puede
crecer sin desplegar la app.

## 14. Orden de entrega

Cada fase es desplegable por sí sola y deja la app en un estado coherente. Versión nueva por
fase (skill `releasing-versions`, `CHANGELOG.md` bilingüe).

| Fase | Contenido | Versión |
|---|---|---|
| 0 | Partir `supabaseStore.tsx` (§3.6), sin cambios funcionales | patch |
| 1 | Fundación `member` + ajustes sincronizados + avatar/color + miembros sin cuenta (§5) | minor |
| 2 | Nutrición personal completa (§6) — **el corazón de lo pedido** | minor |
| 3 | Dashboard de widgets (§7) | minor |
| 4 | Avisos a tu medida (§9) — barato y depende solo de la fase 1 | minor |
| 5 | Gustos + "Para ti" (§8.1) | minor |
| 6 | Dietas y alérgenos (§8.2-8.4) — el caro | minor |
| 7 | Turnos, apagados por defecto (§10) | minor |

Las fases 4 y 5 van antes que la 6 a propósito: dan valor por sí solas mientras se prepara el
trabajo de datos del etiquetado.

## 15. Riesgos

1. **El etiquetado de alérgenos es incompleto por definición.** Mitigación: el estado "sin
   verificar" de §8.3, que nunca se presenta como seguro. Riesgo residual aceptado: alguien
   ignora el aviso. La app no puede garantizar seguridad alimentaria y no debe dar a entender
   que lo hace.
2. **Fricción de registro.** Si registrar cuesta, se abandona en una semana. Mitigación: el
   valor por defecto no exige ninguna acción (plan auto), favoritos en primera pestaña, y el
   recordatorio apagado por defecto para no compensar la fricción a base de molestar.
3. **Privacidad de los datos corporales.** Mitigación: tabla aparte, RLS por cuenta, tests de
   RLS obligatorios en el banco de migraciones, y aviso explícito para miembros sin cuenta.
4. **Superficie de esquema.** Doce tablas nuevas es mucho para un hogar de cuatro personas.
   Mitigación: la fase 0 y el orden por fases; ninguna tabla se crea antes de la fase que la
   usa.
5. **Clientes viejos.** §3.4. Síntoma acotado a un número desactualizado, nunca a datos
   corruptos.
6. **`household.kcal_target` queda como deuda.** Se documenta en `CLAUDE.md` en la sección de
   huecos conocidos, con la condición de retirada.
