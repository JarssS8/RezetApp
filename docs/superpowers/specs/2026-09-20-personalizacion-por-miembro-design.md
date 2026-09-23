# Personalización por miembro — diseño

Fecha: 2026-09-20
Origen: sesión de brainstorming con el usuario. Punto de partida: `main` en `b156e40` (1.8.2).
Revisión: revisado por un agente independiente contra el código real; §16 recoge qué se aceptó y
qué no. Las correcciones ya están aplicadas en el cuerpo del documento.

## 1. Contexto

Rezet es hoy una app **de hogar**: el plan, la despensa, las recetas y la lista de la compra
son de todos, y el único número personal que existe —el objetivo de calorías— no es personal
en absoluto: vive en `household.kcal_target`
(`app/supabase/migrations/20260905131217_rezet_core_schema.sql:18`), uno por hogar.

Peor: **ningún cliente lo escribe**. No hay interfaz en Ajustes ni en Onboarding que lo
cambie, y el MCP tampoco lo toca; solo se lee (`app/src/data/supabaseStore.tsx:258,263`;
constante de demo en `app/src/data/store.tsx:60`). En producción es la constante 2100 para
todo el mundo. El objetivo de calorías de Rezet, hoy, es decorativo.

El anillo de la pantalla Hoy sí funciona como debe dentro de esa limitación: suma las
comidas **cocinadas** del día, `kcalPerServing × plan_entry.servings`, y lo compara con esa
constante (`app/src/screens/Today.tsx:39-50`). El fallo real no es que cuente lo planificado
—no lo hace—, sino que multiplica por las raciones **del plato entero**: una cena de 4
raciones cuenta como 4 raciones para la única persona que mira la pantalla, contra un
objetivo que nadie ha elegido.

Los ajustes personales tienen otro problema. `profile` tiene `locale`, `theme`, `accent` y
`units` desde el esquema original, la migración `20260918100100_rezet_tighten_profile_household_grants.sql`
concede UPDATE sobre esas cuatro columnas, y **la app nunca las escribe**: guarda todo en
`localStorage` (`app/src/store/prefs.tsx`). Cambias de móvil y empiezas de cero.

Y esa omisión ya produce un fallo en producción: `profile.locale` **sí se lee** en dos
sitios —la RPC `finish_cook`, para localizar los nombres de los `shortages`
(`20260905132618_rezet_fix_finish_cook_shortage_name.sql:33`), y el servidor MCP en sus dos
entradas (`mcp/src/supabase.ts:31`, `mcp/src/worker/supabaseAuth.ts:96`)—, así que como
nadie la escribe, **el MCP responde siempre en español** a cualquier usuario que tenga la
app en inglés. Arreglarlo es parte de este trabajo, no un efecto colateral.

Este documento diseña la capa personal que falta, dentro de un hogar compartido.

### Decisiones tomadas con el usuario

- Cada miembro tiene su propio objetivo de kcal, calculado con **Mifflin-St Jeor** (sexo,
  edad, altura, peso, actividad) y siempre editable a mano.
- Las comidas del plan cuentan **para todos** en cuanto se marcan cocinadas, a razón de
  **una ración por persona**, ajustable en el acto (½ / 1 / 1½ / 2) y descartable ("hoy no
  cené esto").
- Encima de eso, cada miembro registra **extras**: texto libre con kcal, una receta del
  hogar, un código de barras, o un favorito.
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
explícitamente el detalle completo. §3 y §4 son comunes; §5 a §10 son independientes entre
sí y cada uno puede convertirse en su propio plan sin releer el resto.

El sub-proyecto 4 (dietas y alérgenos) es el más caro: exige datos de ingredientes que la
app no tiene. Está diseñado para degradar con honestidad — "sin verificar" nunca se muestra
como "apto".

## 2. Objetivos y no objetivos

**Objetivos**

1. Cada persona del hogar ve números que son suyos: su objetivo, su consumo, su progreso.
2. Registrar lo que comes cuesta un toque en el caso normal y nunca más de tres.
3. Los datos de salud (sexo, edad, altura, peso) son privados de quien los introduce, frente
   a su hogar **y frente a su hogar después de irse**.
4. El registro de consumo de quien tiene cuenta es suyo: la casa no lee tu diario.
5. La pantalla principal la compone cada miembro.
6. Un hogar puede incluir a quien no tiene cuenta: niños, invitados, personas mayores.
7. Nada de lo anterior rompe el bucle central **plan − despensa = compra** ni el flujo de
   cocinar.
8. El modo demo sigue funcionando entero, sin cuenta y sin red.

**No objetivos**

- No se persiguen macros (proteína/grasa/hidratos), agua ni ejercicio. Solo kcal.
- No se importa un catálogo nutricional propio: las kcal salen de la receta, del usuario o
  de OpenFoodFacts.
- No es una app médica. No se dan consejos de salud; las fórmulas se presentan como
  estimación y el número siempre se puede escribir a mano.
- No se cambia la autenticación, el OAuth del MCP ni el modelo de hogares/invitaciones.
- No se añade router (sigue siendo la brecha conocida con `BUILD_FROM_ZERO.md` §2).
- No se soportan husos horarios por miembro: el repo es mono-zona por diseño
  (`setClock` a Madrid en el Worker MCP).

## 3. Decisiones transversales

### 3.1 Identidad: la tabla `member`

Hoy "miembro del hogar" es lo mismo que "fila en `profile`", que es lo mismo que "usuario de
`auth.users`". Con miembros sin cuenta eso deja de ser cierto.

```sql
create table member (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references household(id) on delete cascade,
  auth_user_id  uuid unique references profile(id) on delete set null,
  is_ward       boolean not null default false,
  display_name  text not null,
  avatar_path   text,
  color         text not null default 'green',
  sort_order    int  not null default 0,
  kcal_target   int  not null default 2100 check (kcal_target between 1000 and 5000),
  created_at    timestamptz not null default now(),
  deleted_at    timestamptz
);
create index member_household_idx on member (household_id) where deleted_at is null;
```

Reglas:

- `profile` **no se toca**. Sigue siendo la fuente de verdad de autenticación, del hogar
  (`private.current_household()`) y del rol de admin. `member` es la capa de producto.
- **`is_ward` es explícito, no inferido.** Un miembro es tutelado porque
  `create_ward_member` lo creó así, nunca porque `auth_user_id` esté a null. Ver 3.2: es la
  diferencia entre una regla y un accidente.
- **Borrado lógico.** Quien se va del hogar deja detrás su registro de consumo y las recetas
  que creó. Un `delete` real vaciaría el historial de los demás.
- `color` es uno de los siete acentos ya calibrados en `app/src/store/prefs.tsx::ACCENTS`.
  Nada de hex suelto (regla no negociable del repo). **No hay columna `accent` en `member`**:
  el acento de la interfaz es un ajuste de cuenta y vive en `profile` (3.5).
- `kcal_target` lleva `check` en la base de datos: la cota del cliente no protege de un
  `PATCH` directo a PostgREST.
- **No se duplican `locale`/`theme`/`accent`/`units` en `member`.** Ya están en `profile`
  con los grants correctos. Un miembro sin cuenta no tiene tema ni idioma porque no tiene
  dispositivo.

`display_name` **se queda en `profile`** para los miembros con cuenta y `member.display_name`
es su copia mantenida por las mismas RPC. No se revoca el UPDATE de tabla sobre `profile`:
hacerlo rompería el renombrado de cualquier PWA cacheada, exactamente como rompió el botón
de invitar en 1.6.0. La unificación queda para cuando esas versiones hayan caducado.

**Todo lo personal apunta a `member_id`, nunca a `profile.id`.** Es la razón de ser de la
tabla: si el registro de kcal o los gustos apuntaran a `profile`, añadir miembros sin cuenta
después obligaría a migrar cada una de esas tablas.

### 3.2 Privacidad en tres niveles

Rezet solo conoce hoy un nivel: "del hogar" (`private.current_household()`). Hacen falta tres.

| Nivel | Quién lo ve | Qué vive ahí |
|---|---|---|
| **Hogar** | todos los miembros con cuenta | plan, despensa, recetas, compra, `member` (nombre, avatar, color, `kcal_target`), gustos, dietas declaradas, turnos |
| **Propio** | solo quien lo escribe | `member_body`, `intake_share`, `intake_extra`, `member_dashboard`, `member_notify_pref` |
| **Tutelado** | cualquier miembro con cuenta del hogar, **solo si `is_ward`** | lo mismo, de un miembro sin cuenta |

Predicado único, reutilizado por **todas** las tablas personales:

```sql
create function private.can_act_for(p_member_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.member m
     where m.id = p_member_id
       and m.deleted_at is null
       and m.household_id = (select private.current_household())
       and (m.auth_user_id = (select auth.uid()) or m.is_ward)
  )
$$;
```

Tres condiciones, las tres necesarias:

- `household_id = current_household()` — sin esto, `is_ward` es una condición **global** y
  cualquier usuario de cualquier hogar podría escribir en un miembro tutelado ajeno con solo
  conocer su UUID. Es la misma forma del agujero que cerró
  `20260919100400_rezet_bind_fk_references_to_household.sql`.
- `is_ward` explícito — si la tutela se infiriera de `auth_user_id is null`, el
  `on delete set null` de 3.1 convertiría en tutelado a quien se va del hogar, y su peso
  pasaría a ser legible por quien se queda. Todas las salidas borran la fila `profile`
  (`20260907181314:201,245,350,362`; `20260919100100:66`), así que ese caso no es hipotético.
- `deleted_at is null` — un miembro borrado no es tutelable.

Y, como cinturón además de tirantes, **al salir del hogar se borra `member_body`** en la
misma transacción que borra el `profile` (5.1). Los datos corporales no sobreviven a la
salida en ninguna forma.

**Por qué esto no puede ir en `profile`:** `profile_select`
(`20260905131217_rezet_core_schema.sql:332`) permite `household_id = current_household()`.
Una columna `weight_kg` en `profile` sería legible por tu pareja el día que se añadiera. No
hay column-level security en Postgres para SELECT; la única separación real es otra tabla.

`kcal_target` sí vive en `member` (nivel hogar) a propósito: planificar comidas para la casa
necesita saber que Ana apunta a 1 900 y Jars a 2 600. Los datos que producen ese número no
salen de `member_body`.

La contrapartida del nivel *tutelado* se dice en la interfaz al crear un miembro sin cuenta:
**sus datos los ven todos los adultos del hogar.** No hay alternativa — alguien tiene que
registrar por él.

### 3.3 Contrato de las RPC nuevas

Toda RPC que reciba un `p_member_id` cumple, sin excepción:

1. `SECURITY DEFINER` + `set search_path = ''` + `revoke all … from public, anon` +
   `grant execute … to authenticated`, como el resto del repo.
2. Primera sentencia del cuerpo: comprobar `private.can_act_for(p_member_id)` y abortar si
   no. La RLS **no** protege una función `SECURITY DEFINER`; el chequeo es explícito o no
   existe.
3. Los parches `jsonb` se aplican **columna a columna con asignaciones literales**
   (`coalesce(p_patch->>'color', color)`), nunca con `execute format()` sobre las claves del
   jsonb. Una clave `auth_user_id` colada en un patch dinámico es una toma de cuenta.
4. Ninguna RPC acepta `household_id` como parámetro: siempre lo deriva de
   `private.current_household()`.

### 3.4 Las reglas nuevas viven en `domain/`

Regla no negociable del repo: la lógica de negocio es pura y está testeada. Tres módulos:

- **`domain/nutrition.ts`** — Mifflin-St Jeor, factores de actividad, ajuste por objetivo,
  redondeo y cotas.
- **`domain/intake.ts`** — el día de un miembro, la semana, la media y la racha.
- **`domain/dashboard.ts`** — normalización del layout de widgets.

Parte de la derivación compartida entre las dos capas de datos ya vive en
`app/src/domain/deriveStore.ts`; lo nuevo que ambas capas necesiten aterriza ahí, no
duplicado en cada store.

Cuatro pantallas van a mostrar "cuántas kcal llevo" (Hoy, el registro, el progreso, la hoja
de miembro). Si cada una lo calcula por su cuenta, divergirán, exactamente como ya advierte
la regla sobre `scaleQuantity`/`isCovered`.

### 3.5 Ajustes: el servidor manda, el dispositivo es caché

Los ajustes se quedan donde ya están en el esquema: **`profile`**, con el grant que
`20260918100100` ya concede sobre `locale`, `theme`, `accent`, `units`. Cero columnas nuevas,
cero grants nuevos. Lo único que falta es que la app los escriba y los lea.

Esto arregla de paso el fallo de §1: en cuanto `profile.locale` refleje el idioma real, el
MCP y los `shortages` de `finish_cook` dejan de contestar siempre en español.

**El árbol de providers tiene que cambiar.** Hoy `app/src/main.tsx:19-22` monta
`PrefsProvider` **encima** de `AuthProvider`, y las dos capas de datos consumen prefs
(`store.tsx:99`, `supabaseStore.tsx:7,178`). Así, `PrefsProvider` no puede leer la sesión y
no hay dónde aplicar "gana el servidor". La solución, sin invertir el árbol (invertirlo
rompería a los dos stores):

- `PrefsProvider` sigue arriba y expone, además de lo de hoy, un `hydrateFromServer(prefs)`.
- Un componente puente montado **dentro** de `AuthProvider` lee el `profile` de la sesión y
  llama a `hydrateFromServer` una vez por sesión.
- Cada `set*` de prefs escribe `localStorage` (inmediato) y, si hay sesión, `profile` con
  reintento silencioso.

Secuencia efectiva: arranque desde `localStorage` (instantáneo, funciona sin red) → con
sesión, gana el servidor → cada cambio va a los dos sitios. En demo no hay paso 2 ni 3.

`showIdeas` se queda **por dispositivo** (es una preferencia de pantalla, no de persona), y
se documenta así para que no se "arregle" por error más adelante. Igual `activeMemberId`
(5.5): es estado de dispositivo, vive en `prefs`, no en el contrato `Store`.

### 3.6 Dos espacios de identificadores, dos nombres

`p_member_id` ya significa **id de `profile`** en las RPC existentes
(`remove_member`, `promote_admin`, `demote_admin` —`20260919100100:17,77`—) y
`HouseholdDetail.members[].id` es un id de perfil (`supabaseStore.tsx:293-298`). Introducir
`member.id` con el mismo nombre y el mismo tipo `uuid` es una fábrica de escrituras cruzadas
silenciosas.

Convención, obligatoria a partir de aquí:

- SQL: lo que apunta a `profile` se llama `p_profile_id`; lo que apunta a `member`,
  `p_member_id`. Las tres RPC existentes se renombran de parámetro en la migración de
  fundación (renombrar un parámetro con nombre en PostgREST **sí** rompe a los clientes
  cacheados, así que se declara la nueva y se deja la vieja como envoltorio, marcada como
  obsoleta).
- TypeScript: `type ProfileId = string & { readonly __profile: unique symbol }` y
  `type MemberId = string & { readonly __member: unique symbol }`. El compilador es el único
  que va a acordarse de esto dentro de seis meses.

### 3.7 Compatibilidad con clientes viejos

`household.kcal_target` **no se borra**, pero su retirada es trivial: nadie lo escribe (§1),
así que una PWA cacheada seguirá mostrando 2100, que es exactamente lo que muestra hoy. Pasa
a ser el valor por defecto que hereda un `member` recién creado, y se retira cuando esas
versiones caduquen.

Ningún cliente viejo escribe en las tablas nuevas. El riesgo real está en las tablas
**viejas**, y por eso 3.1 no revoca nada de `profile`.

### 3.8 La capa de datos se parte

`app/src/data/supabaseStore.tsx` son 928 líneas y este trabajo le sumaría unas seis consultas
y ocho mutaciones. Se divide en `app/src/data/supabaseStore/` por dominio
(`useMembers`, `useIntake`, `usePreferences`, `useRecipesData`, `usePantryData`, `usePlanData`)
con un `index.tsx` que compone el mismo objeto `Store`.

El contrato `app/src/data/storeContext.ts` no cambia de forma para lo que ya existe: las
pantallas actuales no se enteran. Es refactor necesario para que quepa lo nuevo, no
oportunista; se hace **antes** de añadir nada, en su propio commit, con los tests existentes
en verde como prueba de equivalencia.

### 3.9 Pruebas

- Cada módulo de `domain/` con su fichero en `app/src/domain/__tests__/`.
- Cada migración nueva entra en el banco (`app/supabase/tests/migrations.test.ts`). Las que
  tocan privacidad llevan asserts de RLS vía `asUser`, y estos cuatro son obligatorios:
  1. A **no** lee el `member_body` de B, teniendo B cuenta, en el mismo hogar.
  2. A **no** lee el `intake_extra` de B, teniendo B cuenta, en el mismo hogar.
  3. A **sí** lee y escribe el `member_body` de un tutelado de su hogar.
  4. Al ejecutar `leave_household`, el `member_body` de quien se va **desaparece**, y su
     `member` no queda tutelable.
- Recordatorio del repo: el banco es Postgres 18 y producción no; verde prueba SQL y lógica,
  no paridad con producción.

## 4. Modelo de datos completo

Diez tablas nuevas y dos columnas. Cada una con RLS activada y su política escrita en el
sub-proyecto correspondiente — ninguna queda con "RLS activada" y el predicado sin decidir.

```sql
-- §5 Fundación
member                 (…3.1…)

-- §6 Nutrición personal
member_body      (member_id pk, sex, birth_year, height_cm, weight_kg,
                  activity, goal, updated_at)
intake_share     (member_id, plan_entry_id, servings, primary key (member_id, plan_entry_id))
intake_extra     (id, household_id, member_id, date, label, kcal, source,
                  recipe_id, created_by, created_at)

-- §7 Dashboard
member_dashboard (member_id pk, layout jsonb, updated_at)

-- §8 Gustos y dietas
member_recipe_pref (member_id, recipe_id, rating, updated_at,
                    primary key (member_id, recipe_id))
ingredient_diet    (household_id, ingredient_id, flag_key, source,
                    primary key (ingredient_id, flag_key))
member_diet        (member_id, flag_key, primary key (member_id, flag_key))

-- §9 Avisos
member_notify_pref (member_id pk, timers, expiring, cook_turn, log_reminder,
                    log_reminder_at, quiet_from, quiet_to, updated_at)

-- §10 Turnos (opcional)
household.turns_enabled   boolean not null default false
plan_entry.cook_member_id uuid null references member(id) on delete set null
shopping_turn    (household_id, week_start, member_id, primary key (household_id, week_start))
```

Patrón común, sin excepciones:

- `household_id` desnormalizado donde haga falta para el borrado en cascada y para anclar la
  integridad, **nunca como predicado de lectura de una tabla personal** (§3.2).
- Ningún rol con INSERT de tabla donde exista una RPC que deba ser el único camino.
- Toda FK que cruce hogares se comprueba con el mismo enfoque de
  `20260919100400_rezet_bind_fk_references_to_household.sql`.

## 5. Sub-proyecto 1 — Fundación de miembro

### 5.1 Migración de fundación

1. Crear `member` (§3.1) y `private.can_act_for` (§3.2).
2. `private.current_member()`, calco de `private.current_household()`
   (`20260905131217:193-204`): **`security definer`**, `stable`, `set search_path = ''`,
   con `limit 1`. Como `SECURITY INVOKER` leería `member` bajo RLS y, en cuanto una política
   de `member` la usara, Postgres daría recursión infinita (42P17).
3. Rellenar una fila por cada `profile` existente: `auth_user_id = profile.id`,
   `display_name`, `color = profile.accent`, `kcal_target = household.kcal_target`,
   `is_ward = false`.
4. `create unique index member_auth_uq on member (auth_user_id) where auth_user_id is not null`
   **o** `unique` en la columna, no ambos: un `UNIQUE` de Postgres ya admite varios NULL.
   Se elige el índice parcial y la columna se declara sin `unique`.
5. Renombrar los parámetros de las tres RPC existentes según §3.6, dejando envoltorios.

Las RPC `create_household` y `redeem_invite` crean también la fila `member` en la misma
transacción. `leave_household`, `remove_member`, `delete_household` y `delete_account`:

- marcan `member.deleted_at = now()` en vez de dejar la fila huérfana;
- **borran `member_body`** del miembro afectado (§3.2);
- no tocan `intake_extra` ni `intake_share`: el historial se conserva, sin nombre propio si
  hace falta.

### 5.2 Grants y RLS de `member`

```sql
alter table member enable row level security;

-- Lectura: todo el hogar, incluidos los borrados, para poder resolver la
-- atribución del historial ("lo registró X"). La UI los marca como inactivos.
create policy member_select on member for select to authenticated
  using (household_id = (select private.current_household()));

-- Escritura directa: solo sobre la propia fila, columna a columna.
create policy member_update_self on member for update to authenticated
  using (auth_user_id = (select auth.uid()) and deleted_at is null)
  with check (auth_user_id = (select auth.uid()) and deleted_at is null);
```

```sql
revoke update on public.member from authenticated;   -- primero la tabla…
grant update (display_name, avatar_path, color, sort_order, kcal_target)
  on public.member to authenticated;                 -- …y luego las columnas
```

El orden importa: `revoke update (col)` **no hace nada** mientras exista el grant de tabla.
El repo ya se equivocó una vez (`20260917070714` → `20260917070845`).

INSERT y DELETE: **ningún rol**. Solo por RPC, igual que se cerró `profile` en
`20260917220000_rezet_lock_profile_insert.sql`.

Escribir sobre un **tutelado** no pasa por grants de columna —una política no puede expresar
"solo si el objetivo es tutelado de mi hogar" sin convertirse en la trampa de §3.2— sino por
`set_member_settings`.

### 5.3 RPC nuevas

| RPC | Quién | Hace |
|---|---|---|
| `create_ward_member(p_display_name, p_color)` | admin del hogar | crea un `member` con `is_ward = true`. Deriva el hogar de `current_household()`. |
| `delete_ward_member(p_member_id)` | admin del hogar | `deleted_at = now()` sobre un miembro **con `is_ward`** del propio hogar. Rechaza si tiene cuenta (para eso está `remove_member`). |
| `set_member_settings(p_member_id, p_patch jsonb)` | `private.can_act_for` | escribe la lista blanca `display_name`, `color`, `avatar_path`, `sort_order`, `kcal_target`, con asignaciones literales (§3.3). Mantiene el espejo `profile.display_name` si el miembro tiene cuenta. |

Todas cumplen §3.3. Nada de topes numéricos en el cuerpo: si hacen falta límites, van como
`check` en la tabla.

### 5.4 Avatares

Bucket de Storage `avatars`, ruta **plana**: `<household_id>/<uuid>.jpg`. No anidada:
`20260919100300_rezet_bound_recipe_photo_paths.sql` existe precisamente para prohibir rutas
anidadas (escapan al barrido de huérfanos), y fija `^<household>/[^/]+$`. La política de
INSERT se calca de ahí, tal cual.

Sin avatar: inicial sobre el `color` del miembro, generada en el cliente. Es el caso por
defecto y tiene que verse bien — no es un hueco vacío.

Limpieza: `cleanup-orphan-photos` se extiende para barrer también avatares sin referencia con
más de 24 h, reusando su estructura y su `?dryRun=1`.

### 5.5 Interfaz

- **Hoja "Tu hogar"** (`app/src/sheets/HouseholdSheet.tsx`): avatar, color y objetivo por
  miembro. Botón "Añadir miembro sin cuenta" para admins, con el aviso de privacidad de §3.2
  **en el propio formulario**, no escondido en un enlace.
- **Hoja de miembro** (nueva): nombre, avatar, color; y —solo si eres tú o si es tutelado—
  objetivo de kcal, datos corporales y dietas.
- **Ajustes** (`SettingsSheet.tsx`): una línea de estado, "Sincronizado con tu cuenta" o
  "Solo en este dispositivo" en demo.
- **Selector de "quién eres"**: en un dispositivo compartido hace falta registrar por otro.
  Lista el propio miembro y los tutelados, nunca otro adulto con cuenta. Vive en `prefs`
  (estado de dispositivo), no en el contrato `Store`. **La defensa real es la RLS de §3.2**,
  no este selector: la interfaz no protege nada.

### 5.6 Modo demo

La demo no tiene concepto de hogar multiusuario y `HouseholdSheet` **nunca se renderiza** en
ella (`store.tsx:78-95`, patrón `onInvite={demo ? undefined : …}`). Para que la demo enseñe
esto hay que abrir superficie nueva, no solo sembrar datos:

- `seed.ts` siembra tres miembros: dos adultos con objetivos distintos y un menor tutelado.
- La demo monta una versión reducida de la hoja de miembro (cambiar objetivo, cambiar de
  miembro activo) sin las acciones de hogar, que siguen rechazando con el mensaje actual.

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

- **Sexo**: la fórmula solo admite dos constantes. La interfaz ofrece además "prefiero no
  decirlo", que **no usa la fórmula**: pide el número directamente. No se inventa una media
  para no dar una cifra falsa con aire de cálculo.
- **Edad** se deriva de `birth_year`: menos dato personal para el mismo resultado.
- **Cotas**: [1 200, 4 500], redondeo a 50, y el `check` de la tabla en [1 000, 5 000] como
  última línea. Por debajo de 1 200 la interfaz avisa y no ofrece guardar sin escribirlo a
  mano.
- **Menores**: Mifflin-St Jeor está validado en adultos. Con menos de 18 años la fórmula no
  se ofrece; se pide el número con una nota de una línea.
- El número siempre es editable. `member.kcal_target` guarda la cifra final; `member_body`
  guarda de dónde salió, para recalcular cuando cambie el peso.

```sql
create table member_body (
  member_id   uuid primary key references member(id) on delete cascade,
  sex         text check (sex in ('female','male')),     -- null = no declarado
  birth_year  int  check (birth_year between 1900 and 2100),
  height_cm   numeric(5,1) check (height_cm between 50 and 250),
  weight_kg   numeric(5,1) check (weight_kg between 15 and 400),
  activity    text not null default 'sedentary'
              check (activity in ('sedentary','light','moderate','active','very_active')),
  goal        text not null default 'maintain' check (goal in ('lose','maintain','gain')),
  updated_at  timestamptz not null default now()
);
alter table member_body enable row level security;

create policy member_body_rw on member_body for all to authenticated
  using ((select private.can_act_for(member_body.member_id)))
  with check ((select private.can_act_for(member_body.member_id)));
```

Sin grant de INSERT/UPDATE de tabla: la escritura pasa por
`set_member_body(p_member_id, p_patch)`, que cumple §3.3 y recalcula `member.kcal_target` en
la misma transacción si el objetivo estaba enlazado a la fórmula.

### 6.2 El día de un miembro (`domain/intake.ts`)

```
kcal(miembro, día) = Σ comidas del plan cocinadas ese día · kcalPorRación · raciónEfectiva
                   + Σ extras del miembro ese día
```

con `raciónEfectiva(miembro, entrada) = intake_share.servings ?? 1`, y `0` = "no lo comí".
`plan_entry.servings` **no entra en el cálculo personal**: sigue sirviendo solo para despensa
y compra.

La ración por defecto es **1**, decisión explícita del usuario frente a la alternativa
"raciones ÷ miembros". Coste conocido y aceptado: en un hogar de 4 que cocina 2 raciones, la
suma de los consumos personales supera lo cocinado hasta que alguien corrija. Mitigación, sin
cambiar la regla: la hoja de fin de cocción (6.6) muestra "2 raciones cocinadas · 4 personas
marcadas" cuando no cuadra, y ofrece repartir en un toque. Se avisa, no se decide por el
usuario.

Consecuencias que el módulo fija y testea:

- Una comida planificada pero **no cocinada** no cuenta para nadie. Cocinar es la señal.
- El valor por defecto es implícito: cocinar suma a todos sin escribir ninguna fila. Solo la
  **excepción** ocupa espacio.
- Borrar la entrada del plan borra su aportación y sus `intake_share` (`on delete cascade`).
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
  source        text not null check (source in ('manual','recipe','barcode')),
  recipe_id     uuid references recipe(id) on delete set null,
  created_by    uuid references member(id) on delete set null,
  created_at    timestamptz not null default now()
);
create index intake_extra_member_date_idx on intake_extra (member_id, date);
```

**RLS por miembro, no por hogar.** El diario de comidas de quien tiene cuenta no lo lee la
casa:

```sql
alter table intake_share enable row level security;
alter table intake_extra enable row level security;

create policy intake_share_rw on intake_share for all to authenticated
  using ((select private.can_act_for(intake_share.member_id)))
  with check ((select private.can_act_for(intake_share.member_id)));

create policy intake_extra_rw on intake_extra for all to authenticated
  using ((select private.can_act_for(intake_extra.member_id)))
  with check ((select private.can_act_for(intake_extra.member_id)));
```

`household_id` en `intake_extra` es ancla de integridad y cascada, **no** predicado de
lectura. Se comprueba con trigger, como en `20260919100400`, que `member_id` y `recipe_id`
pertenezcan a ese hogar.

No hay tabla de favoritos. Los "favoritos" son una **derivación**:

```sql
select label, kcal, count(*) as n
  from intake_extra
 where member_id = … and source = 'manual'
 group by label, kcal order by n desc limit 8
```

Una consulta en lugar de una tabla, un contador de uso, una RPC y una cuota. La experiencia
—"tus extras repetidos a un toque"— es idéntica.

### 6.3 Registrar: los cuatro caminos

El bloque "Tu día" de Hoy lista las comidas del plan de hoy con su ración, y debajo tus
extras. Cada comida tiene un stepper ½ / 1 / 1½ / 2 y un "no lo comí" — un toque, sin abrir
nada.

"Añadir" abre una hoja con cuatro pestañas:

1. **Favoritos** — los derivados de 6.2, los más usados primero. Un toque. Es la pestaña por
   defecto en cuanto haya al menos uno.
2. **Rápido** — nombre + kcal. Dos campos, teclado numérico.
3. **Receta** — reusa `RecipePickerSheet.tsx`; eliges raciones, las kcal salen de
   `kcalPerServing`.
4. **Código** — reusa el escáner de `app/src/sheets/PantryScanCapture.tsx`. Se añade
   `nutriments` a los campos pedidos a OpenFoodFacts (hoy pide
   `product_name,quantity,product_quantity,product_quantity_unit`,
   `PantryScanCapture.tsx:129`) y se lee `energy-kcal_100g`. Pides gramos y se calcula. Si el
   producto no trae kcal, cae a "Rápido" con el nombre puesto — nunca un callejón sin salida.
   El código de barras no se guarda: solo sirve para calcular una vez.

El CSP no cambia: `world.openfoodfacts.org` ya está en `connect-src` (`app/public/_headers:5`).

### 6.4 El anillo de Hoy

`app/src/screens/Today.tsx`:

- `kcalTarget` pasa de `household.kcal_target` a `member.kcal_target` del miembro activo.
- `done` pasa de `kcalPerServing × plan_entry.servings` de las cocinadas a `domain/intake.ts`.
- `planned` pasa a ser "lo que llevas + lo que te queda planificado hoy", con tu ración.
- El aviso al pasarse usa `--warn`/`--warn-ink`, nunca `--accent`: son tokens de papeles
  distintos.

"Cuánto te queda" ya existe (`Today.tsx:76-78`) y no es nuevo; lo que cambia es que por fin
se mide contra un objetivo que alguien ha elegido.

**Aviso de cambio visible:** hoy un hogar que planifica 2 raciones ve `2 × kcal`; a partir de
ahora verá `1 × kcal`. El número **baja a la mitad** en ese caso. Es la corrección del fallo
de §1, pero hay que decirlo en el CHANGELOG con esas palabras o parecerá un bug.

### 6.5 Progreso personal

Bloque "Tu semana": barras por día contra tu objetivo, media, y racha de días consecutivos
dentro del objetivo (±10 %). Derivado en `domain/intake.ts` de datos ya descargados.

La racha se calcula solo sobre días **pasados y completos**: contar el día en curso a las
nueve de la mañana sería mentir.

### 6.6 Integración con el modo Cook

`finish_cook` **no puede** servir para esto tal como está: devuelve el array de `shortages` y
nada más (`20260905132555:279`), y cuando `p_plan_entry_id is null` inserta él mismo la
entrada de plan (`:272`) sin devolver su `id`. El camino "cocinar algo no planificado" —justo
el que hay que cubrir— se queda sin `plan_entry_id` con el que escribir `intake_share`.
Cambiar su tipo de retorno rompería a las PWA cacheadas, que lo parsean como array.

Solución: **`finish_cook_v2(…, p_shares jsonb)`**, que devuelve
`{ "shortages": [...], "plan_entry_id": "…" }` y escribe los `intake_share` **dentro de la
misma transacción**. `finish_cook` se queda como envoltorio que llama a la nueva y devuelve
solo `shortages`, para los clientes viejos.

Escribir los shares dentro de la transacción no es cosmético: hacerlo fuera significa perder
en silencio un "no lo cené" si falla la segunda llamada.

En `CookFinishSheet.tsx`, bajo lo que ya hay: "Cuenta para: [avatares del hogar]", todos
marcados, ración por defecto, y el aviso de reparto de 6.2 si no cuadra con lo cocinado.

## 7. Sub-proyecto 3 — Dashboard de widgets

```sql
create table member_dashboard (
  member_id   uuid primary key references member(id) on delete cascade,
  layout      jsonb not null,
  updated_at  timestamptz not null default now()
);
alter table member_dashboard enable row level security;
create policy member_dashboard_rw on member_dashboard for all to authenticated
  using ((select private.can_act_for(member_dashboard.member_id)))
  with check ((select private.can_act_for(member_dashboard.member_id)));
```

`layout`: `[{ "id": "kcal_ring", "w": "full" }, …]`. Lo ausente está oculto. JSONB y no
tabla-por-fila porque se lee y se escribe siempre entero.

Va en tabla y no en `prefs` a propósito, contra la recomendación de simplificar: el usuario
pidió personalización **por miembro**, y `prefs` es por dispositivo. Un dashboard que no te
sigue al segundo dispositivo no es lo que se pidió.

### 7.1 Catálogo

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

Un widget cuyo sub-proyecto no esté implementado **no aparece en el catálogo**.

### 7.2 Rejilla

- ≥ 600 px: dos columnas. `full` ocupa las dos, `half` una.
- < 600 px: una columna, todo a ancho completo, **se respeta el orden**. En el móvil el
  tamaño no se nota; el orden sí.
- ≥ 900 px (barra lateral ya existente): tres columnas, `full` ocupa dos.

> **Desviación de implementación (revisión final de rama `feat/dashboard-widgets`, hallazgo
> Important I4):** se implementaron **dos columnas como máximo**, nunca tres, aunque esta
> sección pida tres desde 900px. `maxW.today` (`app/src/ui/tokens.ts`) — el ancho máximo del
> contenedor de Hoy, un token de diseño establecido — sigue en 600px, no en el ancho de la
> ventana; a tres columnas con `gap: 16` eso deja `(600 − 32) / 3 ≈ 189px` por columna, y una
> baldosa de receta con `minmax(200px, 1fr)` desborda ~11px. `columnsFor`
> (`app/src/domain/dashboard.ts`) nunca devuelve `3` por esto. Se puede recuperar la tercera
> columna que pide esta sección el día que se ensanche `maxW.today` lo suficiente para que
> quepa sin desbordar.

### 7.3 Edición

Modo "Personalizar" desde la cabecera de Hoy: asa de arrastre, control de tamaño e
interruptor por widget.

**La reordenación es código nuevo.** `app/src/motion/useSlotDrag.ts` es un gesto de *soltar
sobre un `data-slot`*, no una lista reordenable con reflujo; sirve de base de física
(springs, proyección de inercia) pero no se reutiliza tal cual. Nada de librerías de
componentes: primitivas propias, como el resto de `src/ui/`.

Accesibilidad: además del arrastre, "subir"/"bajar" por teclado con `aria-live` anunciando la
posición. Un dashboard que solo se ordena arrastrando es un dashboard que parte del hogar no
puede ordenar.

### 7.4 Compatibilidad del layout

`domain/dashboard.ts` normaliza siempre antes de pintar: ids desconocidos se descartan;
widgets nuevos se añaden al final, visibles, con su tamaño por defecto; tamaño inválido → el
primero de su lista; lista vacía o JSON corrupto → layout por defecto. Nada de esto lanza: un
dashboard roto por datos viejos sería una pantalla en blanco al abrir la app.

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
alter table member_recipe_pref enable row level security;
-- Nivel HOGAR a propósito: el agregado ("gusta a 3 de 4") es el producto.
create policy member_recipe_pref_select on member_recipe_pref for select to authenticated
  using (exists (select 1 from member m where m.id = member_recipe_pref.member_id
                   and m.household_id = (select private.current_household())));
create policy member_recipe_pref_write on member_recipe_pref for all to authenticated
  using ((select private.can_act_for(member_recipe_pref.member_id)))
  with check ((select private.can_act_for(member_recipe_pref.member_id)));
```

Leer es del hogar, escribir es tuyo. En `RecipeDetail`: dos botones y el agregado. Quién votó
qué es visible dentro del hogar — esconderlo crearía una ambigüedad peor en un grupo de
cuatro.

`for_you` puntúa: +3 tus "me gusta", −10 tus "no me gusta", +2 cobertura completa de
despensa, +1 no cocinada en dos semanas. Función pura con test; nada de aprendizaje
automático.

### 8.2 Dietas y alérgenos — el problema de datos

El catálogo actual guarda nombre, grupo, unidad y `sensitive`. **Nada sobre composición.**

Las marcas son una lista cerrada de ~20 claves (los 14 alérgenos de declaración obligatoria
de la UE más `meat`, `pork`, `fish`, `dairy`, `egg`, `alcohol`), como **`check` de texto** y
claves de i18n. No hay tabla `diet_flag`: una lista que solo cambia con una migración no
necesita una tabla para poder cambiar sin desplegar.

```sql
create table ingredient_diet (
  household_id  uuid references household(id) on delete cascade,  -- null = catálogo global
  ingredient_id uuid not null references ingredient(id) on delete cascade,
  flag_key      text not null check (flag_key in ( /* …lista cerrada… */ )),
  source        text not null check (source in ('seed','user')),
  primary key (ingredient_id, flag_key)
);

create table member_diet (
  member_id uuid not null references member(id) on delete cascade,
  flag_key  text not null,
  primary key (member_id, flag_key)
);
```

**El catálogo global es de solo lectura para todos.** `ingredient.household_id is null`
significa "compartido por todos los hogares" (`20260905131217:34-43`), y el esquema ya lo
protege: `ingredient_update` (`:348`) exige `household_id = current_household()`. Sus marcas
se escriben **solo por migración**, con `source = 'seed'`, y ningún rol tiene INSERT, UPDATE
ni DELETE sobre esas filas.

Sin esa regla, un usuario del hogar A cambiaría el resultado de "apta / no apta" en el hogar
B sobre harina, leche o nueces. En una función cuyo caso de uso declarado es la alergia a los
frutos secos, eso no es un fallo de multi-tenancy: es un riesgo de seguridad alimentaria con
superficie remota.

Si un hogar necesita corregir un ingrediente global, lo bifurca a uno propio. Las políticas:

```sql
alter table ingredient_diet enable row level security;
create policy ingredient_diet_select on ingredient_diet for select to authenticated
  using (household_id is null or household_id = (select private.current_household()));
create policy ingredient_diet_write on ingredient_diet for all to authenticated
  using (household_id = (select private.current_household()))
  with check (household_id = (select private.current_household())
              and source = 'user'
              and exists (select 1 from ingredient i
                           where i.id = ingredient_diet.ingredient_id
                             and i.household_id = (select private.current_household())));
```

`member_diet`: lectura de hogar (planificar necesita saber quién no puede comer qué),
escritura por `can_act_for`.

### 8.3 Tres estados, nunca dos

Una receta, para un miembro, es:

- **No apta** — algún ingrediente lleva una marca que el miembro evita.
- **Sin verificar** — ninguno la lleva, pero **al menos uno no está etiquetado**.
- **Apta** — todos etiquetados y ninguno choca.

"Sin verificar" no se pinta como "apta" en ningún sitio ni cuenta como apta en ningún filtro.
Una alergia a los frutos secos no admite un "probablemente". El filtro ofrece "apto para
todos" y, aparte, "sin conflictos conocidos": son cosas distintas y se etiquetan distinto.

`RecipeForm` pide las marcas de un ingrediente nuevo solo si algún miembro del hogar tiene
dietas declaradas.

### 8.4 Dónde se ve

- `RecipeDetail`: quién puede comerlo, y por qué no quien no puede.
- `RecipePickerSheet` al planificar: avisa si choca con alguien. **Avisa, no bloquea** — el
  hogar decide.
- `Recipes`: filtros nuevos.
- Hoja de miembro: sus dietas.

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
  updated_at      timestamptz not null default now()
);
alter table member_notify_pref enable row level security;
create policy member_notify_pref_rw on member_notify_pref for all to authenticated
  using ((select private.can_act_for(member_notify_pref.member_id)))
  with check ((select private.can_act_for(member_notify_pref.member_id)));
```

**Los temporizadores de cocina quedan exentos de las horas de silencio.** Un temporizador que
se traga porque son las 23:10 es comida quemada, no una notificación molesta. `quiet_from`/
`quiet_to` aplican a `expiring`, `cook_turn` y `log_reminder`, nunca a `timers`; `timers` solo
se apaga con su propio interruptor.

Sin columna de huso horario: el repo es mono-zona (§2, no objetivos).

Solo los miembros **con cuenta** reciben avisos: `push_subscription` y `cook_timer` cuelgan de
`profile` (`send-timer-notifications/index.ts:70,86-88`), así que la consulta del cron hace
`join` `profile → member (auth_user_id)` y, **si no hay fila `member`, se comporta como hoy**
(envía): una preferencia que no existe no puede silenciar a nadie.

`log_reminder` es un disparador nuevo (`pg_cron` a la hora local), **apagado por defecto**.
Una app que da la lata sin que se lo pidas se desinstala.

## 10. Sub-proyecto 6 — Turnos (opcional)

Apagado por defecto: `household.turns_enabled boolean not null default false`. Mientras esté
apagado, la interfaz no existe.

- `plan_entry.cook_member_id` — quién cocina esa comida.
- `shopping_turn(household_id, week_start, member_id)` — a quién le toca comprar.
- Chip "te toca" en Hoy y en el widget `whose_turn`; con `cook_turn` activo, aviso la mañana
  del día.

Ningún cálculo de despensa, compra o kcal depende de esto. Es informativo, y así se queda. Va
el último del plan de entrega precisamente porque es lo más prescindible de todo el
documento.

## 11. Cambios en el contrato `Store`

```ts
members: Member[];                  // vivos + borrados (para resolver atribución)
myMemberId: MemberId | null;

myBody: MemberBody | null;
setMyBody: (memberId: MemberId, patch: Partial<MemberBody>) => Promise<void>;
setKcalTarget: (memberId: MemberId, kcal: number) => Promise<void>;
createWardMember: (displayName: string, color: Accent) => Promise<MemberId>;
deleteWardMember: (memberId: MemberId) => Promise<void>;

intakeOfDay: (memberId: MemberId, date: string) => DayIntake;   // puro
setShare: (memberId: MemberId, planEntryId: string, servings: number) => Promise<void>;
addExtra: (input: ExtraInput) => Promise<string>;
removeExtra: (id: string) => Promise<void>;
frequentExtras: (memberId: MemberId) => FrequentExtra[];        // derivado, no tabla

dashboard: DashboardLayout;
setDashboard: (layout: DashboardLayout) => Promise<void>;

recipePrefs: Map<string, number>;
setRecipePref: (recipeId: string, rating: -1 | 1 | 0) => Promise<void>;
memberDiets: Map<MemberId, string[]>;
```

`activeMemberId`/`setActiveMember` **no** están aquí: son estado de dispositivo y viven en
`prefs` (§3.5).

Igual que `saveRecipe`/`pantryAdd`, lo que escribe devuelve `Promise` en las dos
implementaciones. El rango de fechas de `intake_extra` es el mismo que ya usa el plan (semana
actual ± 1), para no multiplicar consultas.

## 12. MCP

`mcp/` es un tercer cliente del mismo backend; **no se toca `app/src/data/*` para servirlo**.
Su usuario se resuelve a `member` por `auth_user_id`.

- **Atención al idioma:** el MCP lee `profile.locale` (`mcp/src/supabase.ts:31`,
  `mcp/src/worker/supabaseAuth.ts:96`). Como §3.5 hace que la app por fin **escriba** esa
  columna, el MCP empezará a responder en inglés a quien tenga la app en inglés. Es la
  corrección de un fallo latente, pero es un cambio de comportamiento observable y va al
  CHANGELOG.
- Se añaden `rezet_log_intake` y `rezet_my_day`: las dos que tienen sentido por voz.
- `rezet_plan_*` gana el campo de comensales solo si se implementa §10.

Las dos entradas comparten las herramientas: se escriben una vez. Recordatorio del repo:
**nunca refrescar la sesión de Supabase dentro de una herramienta.**

## 13. i18n

Todo el texto nuevo entra en `es.ts` y `en.ts` a la vez. Familias: `member.*`, `intake.*`,
`nutrition.*`, `dashboard.*`, `diet.*`, `notify.*`, `turns.*`. Las marcas de dieta y los
niveles de actividad son listas cerradas: van en el diccionario como cualquier otro texto.

## 14. Orden de entrega

| Fase | Contenido | Versión |
|---|---|---|
| 0 | Partir `supabaseStore.tsx` (§3.8), sin cambios funcionales | patch |
| 1 | Fundación `member` + `can_act_for` + ajustes en `profile` + avatar/color + tutelados (§5, §3.5, §3.6) | minor |
| 2 | Nutrición personal completa (§6) — **el corazón de lo pedido** | minor |
| 3 | Dashboard de widgets (§7) | minor |
| 4 | Avisos a tu medida (§9) | minor |
| 5 | Gustos + "Para ti" (§8.1) | minor |
| 6 | Dietas y alérgenos (§8.2-8.4) — el caro | minor |
| 7 | Turnos (§10) | minor |

Las fases 4 y 5 van antes que la 6 a propósito: dan valor por sí solas mientras se prepara el
trabajo de datos del etiquetado.

## 15. Riesgos

1. **El etiquetado de alérgenos es incompleto por definición.** Mitigación: el estado "sin
   verificar" (§8.3) y el catálogo global de solo lectura (§8.2). Riesgo residual aceptado:
   alguien ignora el aviso. La app no puede garantizar seguridad alimentaria y no debe dar a
   entender que lo hace.
2. **Fricción de registro.** Si registrar cuesta, se abandona en una semana. Mitigación: el
   valor por defecto no exige ninguna acción, favoritos en primera pestaña, recordatorio
   apagado por defecto.
3. **Privacidad de los datos corporales.** Mitigación: tabla aparte, `can_act_for` con las
   tres condiciones, borrado al salir del hogar, y los cuatro tests de RLS de §3.9 como
   obligatorios.
4. **La ración por defecto de 1 infla el consumo del hogar** cuando se cocina menos de lo que
   comen (§6.2). Decisión del usuario; mitigada con un aviso, no con un cambio de regla.
5. **Superficie de esquema**: diez tablas nuevas. Mitigación: el orden por fases; ninguna
   tabla se crea antes de la fase que la usa.
6. **Cambio visible en el anillo** (§6.4): el número baja donde se planifican 2+ raciones.
   Tiene que ir en el CHANGELOG con esas palabras.
7. **El MCP cambia de idioma** (§12) para quien tenga la app en inglés.

## 16. Respuesta a la revisión independiente

Revisión hecha por un agente sin contexto previo contra el código en `b156e40`. Todo lo que
se comprobó, se comprobó: los cinco bloqueantes eran reales.

**Aceptado e incorporado:** el `is_ward` explícito y el borrado de `member_body` al salir
(B1); el chequeo de hogar y la prohibición de SQL dinámico en las RPC (B2); la RLS del
registro por miembro en vez de por hogar (B3); `finish_cook_v2` con los shares dentro de la
transacción (B4); el catálogo global de alérgenos de solo lectura (B5); las dos correcciones
factuales de §1 (`profile.locale` sí se usa; el anillo cuenta lo cocinado) y el fallo latente
del idioma del MCP (I1, I2); que `kcal_target` es hoy una constante que nadie escribe (I3);
el puente de providers, porque `PrefsProvider` está encima de `AuthProvider` (I4); dejar los
ajustes en `profile` en vez de duplicarlos (I5); fusionar `color`/`accent` (I6); la
convención `p_profile_id`/`p_member_id` y los tipos marcados (I7); no revocar nada de
`profile` (I8); el aviso de reparto y el aviso de cambio visible en el anillo (I9); las
políticas RLS escritas para **todas** las tablas (I10); `current_member()` como
`security definer` con `limit 1` (I11); el `check` de `kcal_target` (I12); la ruta plana de
avatares (I13); los temporizadores exentos de horas de silencio y el join con `profile`
(I14); abrir superficie propia en demo (I15); leer también los miembros borrados (I16); y los
menores M1-M7. De los recortes: fuera `intake_favorite` (derivado), fuera `diet_flag` como
tabla, fuera `tz`/`servings`/`barcode`, fuera los topes numéricos en RPC.

**Rechazado, con motivo:**

- **Quitar §7 (dashboard de widgets)** — el usuario lo pidió explícitamente, con tamaños. La
  alternativa propuesta (interruptores en `prefs`, por dispositivo) no es lo que se pidió:
  no sigue al miembro entre dispositivos.
- **Quitar §10 (turnos)** — también pedido explícitamente, ya marcado como opcional y
  apagado por defecto, y colocado el último de la entrega.
- **Ración por defecto = raciones ÷ miembros** — el usuario eligió "1 ración ajustable" sobre
  esa misma alternativa, sabiendo el reparto. Se mitiga con el aviso de §6.2, no cambiando la
  decisión.
