# RezetApp · Diseño técnico completo (fases 0–5)

Fecha: 2026-08-26. Estado: revisado (v2, tras revisión del autor).
Complementa a `AGENTS.md` y `docs/01..07`; si contradice algo de ahí, manda
esto (es más reciente). El apéndice A lista qué docs hay que actualizar.

## 1. Objetivo y alcance

Construir RezetApp entera — el roadmap `docs/07-ROADMAP.md` fases 0 a 5 — en
oleadas paralelas ejecutadas por subagentes. Cada oleada deja el repo verde
(build, lint, tests) y mergeable.

Fuera de alcance (no se construye): lista de la compra propia, sync offline
con CRDT, reparto de gastos, recomendador propio, red social, telemetría,
APK con Capacitor (queda PWA), **OAuth/OIDC para el MCP** (ver §12: queda
como tarea futura explícita).

## 2. Arquitectura en capas

```
┌─────────────┐ ┌─────────────┐ ┌─────────────┐
│  UI (Next)  │ │ REST /api/v1│ │  MCP /mcp   │   adaptadores de entrada
└──────┬──────┘ └──────┬──────┘ └──────┬──────┘
       └───────────────┼───────────────┘
                ┌──────▼──────┐
                │ lib/services│   casos de uso: leen/escriben DB, emiten eventos
                └──────┬──────┘
         ┌─────────────┼─────────────┐
   ┌─────▼─────┐ ┌─────▼─────┐ ┌─────▼──────┐
   │lib/domain │ │  db (Drz) │ │lib/ai, lib/│
   │  (puro)   │ │           │ │integrations│
   └───────────┘ └───────────┘ └────────────┘
```

- **`lib/domain`**: funciones puras, sin I/O. Escalado, formato de cantidades,
  unidades, nutrición, asignación de descuentos de despensa, consolidación,
  parser de ingredientes (reglas), detección de temporizadores, reglas de
  autorrelleno. 100 % testeado. Es isomórfico: va al bundle de cliente
  cuando hace falta (stepper de raciones en vivo).
- **`lib/services`**: un módulo por agregado. Reciben
  `Ctx { db, householdId, userId | apiTokenId, locale }`, validan con zod,
  llaman a dominio, persisten, emiten eventos SSE. **Única capa que toca la
  DB.**
- **Adaptadores de entrada**: Server Actions/RSC, route handlers REST, MCP.
  Nunca contienen lógica; traducen entrada → servicio → salida.
- **`lib/ai`**: proveedor elegible (Anthropic, OpenAI, servidor OpenAI-compatible) vía Vercel AI
  SDK, con tope de gasto y log. Solo *extracción y propuesta*; nunca cálculos.

Regla de dependencia (lint con `eslint-plugin-boundaries`):
`domain` no importa nada del repo · `services` importa `domain`, `db`, `ai`,
`integrations` · `app/` y `components/` importan `services` (solo desde
servidor) y `domain` (libremente) · nadie importa `app/`.

## 3. Estructura de directorios

```
app/
  layout.tsx, globals.css (tokens + Tailwind)
  (auth)/login, register, invite/[token]
  (app)/
    layout.tsx           barra inferior 5 pestañas
    today/               Hoy
    cook/[entryId]/      Cocinar (también cook/recipe/[id])
    plan/                Plan (semana | mes)
    pantry/              Despensa
    recipes/, recipes/[id], recipes/[id]/edit, recipes/new, recipes/import
    settings/            layout con secciones; UNA RUTA POR SECCIÓN:
      household/ members/ ai/ shoplist/ tokens/ appearance/ passkeys/
      data/ (exportar, importar, migrar) notifications/
  api/v1/**/route.ts     REST
  api/openapi.json/route.ts, api/docs/route.ts
  api/events/route.ts    SSE
  api/uploads/[...path]/route.ts   sirve ficheros de ./data/uploads
  mcp/route.ts
components/
  ui/                    shadcn (editados con tokens)
  icons/                 SVG a medida (currentColor, stroke 1.85, round)
  <feature>/             componentes por pantalla
lib/
  domain/                puro + tests colocalizados *.test.ts
  services/
  ai/                    provider.ts, budget.ts, models.ts, tasks/*.ts
  integrations/shoplist.ts, open-food-facts.ts
  auth/                  session.ts, webauthn.ts, guards.ts, crypto.ts (HKDF, AES-GCM)
  i18n/                  next-intl config; request.ts fusiona messages/<locale>/*.json
  events/                bus.ts (EventEmitter tipado) para SSE
  validation/            esquemas zod compartidos (REST, MCP, OpenAPI)
  uploads/               guardar/redimensionar imágenes (sharp)
db/
  schema/*.ts            un fichero por agregado, index.ts los reúne
  migrations/
  seed/                  foods base (subset USDA ~800 + name_es revisado), unit_aliases, tags
messages/
  es/{common,auth,today,cook,plan,pantry,recipes,settings,errors}.json
  en/…                   mismas claves; lint compara claves entre locales
scripts/                 migrate.ts, seed.ts, export.ts, import-mealie.ts, import-tandoor.ts, build-foods-seed.ts
e2e/                     playwright
docker/                  Dockerfile, entrypoint.sh
docker-compose.yml, .env.example, README.md, README.en.md
```

## 4. Modelo de datos

Base: `docs/04-DATOS.md`. Cambios y añadidos:

### Hogar, usuarios, sesión
- `households` + `default_servings int not null default 2`,
  `expiry_alert_days int not null default 3`,
  `ai_provider enum('none','anthropic','openai','openai_compatible') not null default 'none'`,
  `ai_model text`, `ai_base_url text` (servidor local: `llama-server`, Ollama
  `/v1`, LM Studio, vLLM), `ai_api_key_enc bytea`,
  `ai_monthly_cap_cents int not null default 0` (0 = sin tope),
  `ai_structured_output bool not null default true`,
  `shoplist_list_token text`, `shoplist_fn_url text`, `shoplist_secret_enc bytea`,
  `shoplist_last_pushed_at timestamptz`, `plan_rules jsonb not null default '[]'`.
  **Se elimina `ai_spent_this_month_cents`**: el gasto del mes es
  `SUM(cost_cents)` de `ai_usage_log` (índice `(household_id, created_at)`).
- Secretos por hogar cifrados con AES-GCM. Claves derivadas de `APP_SECRET`
  con HKDF-SHA256: `info='rezetapp/session'` para firmar cookies,
  `info='rezetapp/secrets'` para cifrar. Nunca se usa `APP_SECRET` directo.
- `users`: `email` nullable `unique`, `display_name not null`, `locale`,
  `units enum('metric','imperial')`, `theme enum('system','light','dark')`,
  `accent text`.
- **Nueva `sessions`**: `id` (32 bytes aleatorios, base64url), `user_id`,
  `household_id` (hogar activo), `expires_at`, `created_at`, `last_seen_at`,
  `user_agent`. Cookie `rz_session` = `<id>.<hmac>` (HMAC-SHA256 con la
  clave de sesión), httpOnly, SameSite=Lax, Secure fuera de localhost.
  Sin JWT. Caducidad 90 días, `last_seen_at` se actualiza como mucho cada
  hora.
- Cookie `rz_prefs` (no httpOnly, JSON `{theme, accent, locale}`) **espejo**
  de `users.*` que el servidor reescribe al guardar preferencias. `app/layout`
  pinta `data-theme`/`data-accent` desde ella en SSR → sin flash y sin
  `localStorage`. `theme='system'` no pone `data-theme` y manda la media
  query.
- **Nueva `webauthn_challenges`**: `id`, `challenge`, `user_id` nullable,
  `kind enum('register','login')`, `expires_at` (5 min). Se borra al usar.
- `webauthn_credentials` + `device_type`, `backed_up`, `name`, `created_at`,
  `last_used_at`.
- `household_invites`, `household_members` como en `04`.
- **Nueva `app_settings`**: `key text pk`, `value jsonb`, `updated_at`.
  Guarda claves VAPID generadas en el primer arranque y similares.

### Recetas y alimentos
- `recipes` + `kcal_per_serving`, `protein/carbs/fat/fiber_per_serving`,
  `kcal_100g` (todos numeric nullable, desnormalizados, recalculados al
  guardar ingredientes), `nutrition_is_estimated bool not null default false`,
  `yield_grams numeric nullable`, `search_vector tsvector` generado
  (`title || description`, config `spanish` + `english` por locale del
  hogar), `deleted_at` (soft delete).
- `recipe_ingredients`: `quantity numeric nullable` y `unit enum('g','ml','ud')
  nullable` (base; **ambos null cuando no hay conversión**: "1 pizca",
  "al gusto", "un chorrito"), `display_quantity numeric nullable`,
  `display_unit text nullable` (siempre lo que escribió el usuario, ya
  normalizado: `1.5` + `cdta`), `group_label text nullable`,
  `scales_linearly bool not null default true`, `raw_text`, `food_id`
  nullable, `preparation`, `step_index` nullable, `sort_order`.
- `recipe_steps` + `image_url nullable`.
- `foods` + `search_name_es text`, `search_name_en text` (normalizados sin
  acentos ni mayúsculas; índices GIN trigram sobre ambos), `aliases text[]`,
  `density_g_per_ml numeric nullable`, `grams_per_unit numeric nullable`,
  `grams_per_cup`, `grams_per_tbsp`, `merged_into_id uuid nullable`.
- `unit_aliases` (global): `alias`, `locale`, `unit enum('g','ml','ud')`,
  `factor_to_base numeric` (cdta→5 ml, cda→15 ml, taza→240 ml, oz→28.35 g,
  l→1000 ml, kg→1000 g). Las tazas *por alimento* se resuelven antes con
  `foods.grams_per_cup` si existe.
- `tags`, `recipe_tags`, `collections` (fase 5: `household_id`, `name`,
  `query jsonb`).

### Plan, despensa, cocina
- `meal_plan_entries`: `slot enum('breakfast','lunch','dinner','snack')`,
  `servings int not null`, `leftover_of_entry_id`, `time_budget_minutes`,
  `cooked_at timestamptz nullable`, **`skipped_at timestamptz nullable`**,
  `sort_order`. Estado derivado en dominio: `cooked_at` → `cooked`;
  si no, `skipped_at` → `skipped`; si no, `planned`.
- `pantry_items`: `location enum('fridge','freezer','pantry')`, `quantity
  numeric not null` (base), `unit enum('g','ml','ud') not null`, `expires_at
  date nullable`, `opened_at`, `added_at`. Índice `(household_id, food_id)`
  y `(household_id, expires_at)`.
- **Nueva `plan_proposals`**: `id`, `household_id`, `created_by_user_id`
  nullable, `created_by_token_id` nullable (check: exactamente uno no nulo),
  `source enum('ai','rules','mcp')`, `payload jsonb` (§9.2), `status
  enum('pending','approved','rejected')`, `created_at`, `resolved_at`,
  `resolved_by_user_id`.
- `cooking_log` + `pantry_deductions jsonb` (`[{pantry_item_id, food_id,
  requested, deducted}]`) y `warnings jsonb` (faltantes).
- `api_tokens`: `scopes text[]` de `recipes:read recipes:write plan:read
  plan:write pantry:read pantry:write cooking:write shopping:push
  household:read`; **`mcp_profile enum('basic','full') not null default
  'basic'`**. Token visible `rz_` + 32 bytes base64url; se guarda sha256.
- **Nueva `push_subscriptions`** (fase 5): `user_id`, `endpoint unique`,
  `keys jsonb`, `created_at`.
- `ai_usage_log` como en `04`.

Invariantes: toda tabla de contenido con `household_id uuid not null` +
índice (`foods.household_id` nullable = global). Soft delete solo en
`recipes`. Borrar hogar: operación explícita (§6). Extensión `pg_trgm`.

## 5. `lib/domain` — contrato de funciones

Tipos en `lib/domain/types.ts`. Firmas congeladas al final de W1:

```ts
// scaling.ts
scaleQuantity(qty: number, ratio: number, scalesLinearly: boolean): number   // DAMP = 0.65
scaleIngredient(i: Ingredient, ratio: number): Ingredient
   // escala quantity (base) y display_quantity con la misma regla; ambos pueden ser null
scaleRecipe(recipe: RecipeForScaling, targetServings: number): ScaledRecipe
   // ratio = target / servings_base; nonLinearIds[] para el aviso; tiempos/temperaturas NO se tocan
isNonLinearByDefault(foodName: string, locale: Locale): boolean

// quantities.ts
formatQuantity(qty: number | null, unit: string | null, locale: Locale): string
   // "1 ½ cdta", "250 g", "0,5 l"; null → "" (la UI muestra raw/preparation)
toBaseUnit(qty: number, unit: string, locale: Locale, food?: FoodConversion): {qty: number, unit: BaseUnit} | null
   // orden: unit_aliases → grams_per_cup/tbsp/unit del alimento → density (ml↔g) → null
toDisplayUnit(qty: number, base: BaseUnit, food: FoodConversion | null, system: UnitSystem, preferred?: string): DisplayQuantity

// nutrition.ts
recipeNutrition(ingredients: IngredientWithFood[], servings: number, yieldGrams?: number | null): Nutrition
   // perServing/total: suma de kcal_100g * gramos; ingredientes sin food o sin base → isEstimated=true y se ignoran
   // per100g: total / (yieldGrams ?? massSum); massSum = Σ (g directo | ml*density_g_per_ml | ml*1 si no hay density | ud*grams_per_unit)
   //          si algún ingrediente con cantidad no tiene forma de convertirse a gramos → per100g = null, isEstimated = true
aggregateNutrition(entries: {nutrition: Nutrition, servings: number}[]): Nutrition

// ingredients-parser.ts
parseIngredientLine(raw: string, locale: Locale): ParsedIngredient
   // {quantity?, unit?, foodName, preparation?, confidence: 0..1, needsReview}
   // fracciones unicode, "1 y 1/2", rangos "2-3" (→ media), "un/una", "al gusto", "pizca", "chorrito", "c/s"

// pantry.ts
allocateDeductions(items: PantryItem[], needs: Need[]): {allocations: Allocation[], unmatched: Need[]}
   // Allocation = {pantryItemId, foodId, quantity}. Por food_id: FIFO por expires_at asc NULLS LAST, luego added_at asc.
   // Si la despensa no cubre, se asigna lo que hay y el resto va a unmatched. PURO: no escribe.
   // El servicio aplica cada allocation con UPDATE atómico (§9.5); los warnings reales salen del RETURNING.
expiringSoon(items: PantryItem[], today: Date, days: number): PantryItem[]
entryStatus(e: {cooked_at, skipped_at}): 'planned' | 'cooked' | 'skipped'

// shopping.ts
consolidateNeeds(entries: PlannedEntry[], pantry: PantryItem[]): ShoppingLine[]
   // excluye: leftover_of_entry_id != null, cooked_at != null, skipped_at != null
   // escala cada receta a entry.servings
   // con food_id y base: agrupa por food_id, suma en base, resta despensa (suma de todos los items del food), descarta ≤ 0
   // con base pero sin food_id: agrupa por foodName normalizado, suma, NO resta despensa, unresolved: true
   // sin base: una línea por food_id (o nombre) con quantity null, sin sumar ni restar
toShopListItem(line: ShoppingLine): {name: string, quantity: number | null}

// timers.ts
detectTimers(stepText: string, locale: Locale): TimerSpan[]   // "hornea 25 minutos" → {start, end, seconds: 1500}

// plan-rules.ts (fase 5)
applyPlanRules(rules: PlanRule[], candidates: RecipeSummary[], history: CookedHistory, weekStart: Date): ProposalPayload
avoidRecentRepeats(candidates: RecipeSummary[], history: CookedHistory, days: number): RecipeSummary[]
```

Tests obligatorios: escalado lineal/no lineal y null; invariante kcal por
ración al escalar; fracciones bonitas; `toBaseUnit` con taza-por-alimento,
density y fallback null; `recipeNutrition` con y sin `yieldGrams`, con
ingrediente inconvertible → `per100g null`; `allocateDeductions` FIFO con
caducidades, varios ítems y faltante; `consolidateNeeds` con sobras, cocinadas,
saltadas, sin food_id y sin base; parser con ≥ 40 líneas reales en `es` y ≥ 20
en `en` (fixture JSON).

## 6. Auth, hogar e invitaciones

- Registro: nombre → `generateRegistrationOptions` con
  `authenticatorSelection: { residentKey: 'required', userVerification:
  'preferred' }` (obligatorio: el login usa credenciales descubribles) →
  crea `users`, `households` ("Casa de <nombre>"), `household_members(owner)`,
  sesión.
- Login: `generateAuthenticationOptions` sin `allowCredentials` → cookie.
- `rpID`/`origin` desde `APP_URL`. En dev `localhost`.
- Invitación: owner genera `household_invites` (token 24 h) → `/invite/<token>`
  → registro con passkey si no hay sesión → `member`. Un usuario puede estar
  en varios hogares; la sesión guarda el activo; selector en ajustes.
- Varias passkeys por usuario desde ajustes. Sin SMTP no hay recuperación por
  correo; el README lo dice.
- **Salir del hogar**: un `member` puede irse; el último `owner` no. **Borrar
  hogar**: solo `owner`, escribiendo el nombre del hogar para confirmar;
  borra en transacción todas las filas con ese `household_id` (sin
  `ON DELETE CASCADE` en el esquema), los tokens y las invitaciones.
- `guards.ts`: `requireSession()`, `requireHousehold()`, `requireRole('owner')`,
  `requireApiToken(scopes[])`. REST y MCP aceptan `Authorization: Bearer
  rz_…`; la UI usa cookie. `cooking:write` es necesario para `log_cooked`
  (además de nada más: el scope ya implica tocar plan y despensa).
- Toda consulta de servicio filtra por `ctx.householdId`. Test de aislamiento
  entre hogares en cada servicio.

## 7. UI: tema, tipografía, iconos, i18n

- `app/globals.css`: `@import "tailwindcss"`, tokens de `design-tokens.css`,
  `@theme inline` con mapeo a shadcn: `--background: var(--bg)`, `--card:
  var(--surf)`, `--muted: var(--surf-2)`, `--border: var(--line)`,
  `--foreground: var(--text)`, `--primary: var(--acc)`, `--primary-foreground:
  var(--on-acc)`, `--destructive`, y **radios explícitos**: `--radius-sm:
  var(--r-sm)`, `--radius-md: var(--r-md)`, `--radius-lg: var(--r-lg)`,
  `--radius-xl: var(--r-lg)` (no se usa la derivación por `--radius`).
- Fuentes con `next/font/google` (Outfit, DM Sans, JetBrains Mono),
  self-hosted en build.
- Tema/acento: fuente de verdad `users`; espejo en cookie `rz_prefs` (§4);
  SSR pinta `data-theme`/`data-accent`. Sin script inline ni `localStorage`.
- Iconos: `components/icons/*.tsx` a mano. Los cinco de la barra (sol-plato,
  sartén, calendario, alacena, libro) + ~25 de interfaz. Nunca lucide.
- `next-intl`; mensajes **un fichero por namespace y locale**
  (`messages/es/recipes.json`), fusionados en `lib/i18n/request.ts`. Lint:
  `react/jsx-no-literals` (allowlist de símbolos) + script que compara
  claves `es`/`en` y falla si difieren.
- Locale: `users.locale` → `rz_prefs` → `Accept-Language` → `es`.
- Móvil primero: barra inferior 5 pestañas, táctil ≥ 44 px, safe-area.
- Accesibilidad: foco visible, `prefers-reduced-motion`, AA en ambos temas
  (axe en Playwright).
- Ámbar de caducidad en filas de despensa: umbral fijo 7 días (visual);
  alerta de Hoy y notificaciones: `expiry_alert_days` (3 por defecto). Son
  dos cosas distintas a propósito: la fila avisa antes, Hoy solo lo urgente.

## 8. Las cinco pantallas (comportamiento)

### Hoy
Comidas de hoy por slot con estado (`planned`/`cooked`/`skipped`), anillo de
kcal del hogar (cocinado sobre planificado; informativo, sin objetivo), lo que
caduca en ≤ `expiry_alert_days`, atajos: "cocinar esto", "añadir a despensa",
"proponer semana" (si hay IA o reglas). Se actualiza por SSE.

### Cocinar
Entrada: desde una entrada del plan (`servings` del hueco) o desde una receta
(elige raciones). Un paso por pantalla, ingredientes del paso escalados,
temporizadores detectados como botones, wake lock (con fallback silencioso),
swipe/teclas. Al terminar: "¿Cuántas raciones has hecho?" y "¿Sobras?" →
`cooking.logCooked` (§9.5). Voz (SpeechSynthesis) y modo pared en fase 5.

### Plan
Semana (default) y mes. Huecos por slot; arrastrar y soltar con `@dnd-kit`.
Varias comidas por hueco. Chips: raciones (stepper si ≠ default), sobras,
saltada, presupuesto de tiempo del día. Panel "Propuestas": `plan_proposals`
pendientes con diff (añadir/quitar por día), aprobar o descartar; SSE al
llegar una nueva. "Generar compra" → resumen consolidado (líneas
`unresolved` y sin cantidad marcadas) → "Enviar a ShopList" (si configurado)
+ "Abrir en ShopList".

### Despensa
Lista por ubicación, buscador, caducidad en ámbar si < 7 días, stepper con
unidad de presentación. Añadir: buscador de `foods` (trigram en el locale del
usuario y en el otro), escáner (`BarcodeDetector` → fallback `@zxing/browser`)
→ Open Food Facts → crea/actualiza `foods`. "Qué cocinar con lo que caduca".

### Recetas
Lista con full-text, filtros (etiquetas, tiempo máx, dificultad, "tengo los
ingredientes"), colecciones (fase 5). Detalle: stepper de raciones con
recálculo en vivo (dominio en cliente) y aviso ámbar de no lineales + nota;
kcal grande por ración, total pequeño, por 100 g (o "—" si null) y etiqueta
«estimado» si procede; ingredientes agrupados; pasos con ingredientes; notas;
veces cocinada; "Cocinar"; "Añadir al plan". Editor: ingredientes como líneas
que se parsean al vuelo (badge de confianza; clic para corregir cantidad,
unidad, alimento, preparación y `scales_linearly`). Fotos: subida a
`POST /api/v1/uploads` (máx. 8 MB, `sharp` → webp máx. 1600 px, guarda en
`./data/uploads/<household>/<uuid>.webp`). Importar: URL (schema.org JSON-LD y
microdata con `cheerio`), texto pegado, foto/PDF (fase 5, solo si el proveedor
tiene visión). Exportar JSON; importar Mealie/Tandoor (fase 5).

### Ajustes
Una ruta por sección (§3): hogar (nombre, raciones por defecto, alerta
caducidad, salir/borrar hogar), miembros (alérgenos, `dietary_flags`, invitar,
expulsar), IA (proveedor, modelo, clave, URL del servidor local, tope, gasto del mes,
"probar"), ShopList (URL función, secreto, token de lista; o "usando
configuración del servidor" si vienen por env), tokens API (crear con scopes
y perfil MCP, revocar, última vez; con instrucciones de conexión MCP),
apariencia (tema, acento, unidades, idioma), passkeys, datos (exportar,
importar, migrar), notificaciones (fase 5).

## 9. Servicios: reglas por agregado

1. **recipes**: crear/editar/borrar(soft)/buscar/importar/exportar. Al
   guardar ingredientes: parsear, resolver `food_id` (§9.4), `toBaseUnit`,
   recalcular nutrición desnormalizada.
2. **plan**: CRUD de entradas en lote, mover, saltar/desaltar, sobras,
   agregados por rango, propuestas. `ProposalPayload = { add: {date, slot,
   recipe_id, servings}[], remove: entry_id[] }`. Aprobar aplica en
   transacción y marca `approved`; si una entrada de `remove` ya no existe,
   se ignora.
3. **pantry**: CRUD, `adjust(itemId, deltaBase)` atómico (`GREATEST(0, …)`),
   caducidades, `lookupBarcode` (OFF → cache en `foods`).
4. **foods** — resolución en cascada, **todo local salvo (c)**:
   (a) exacto o alias en `foods` (del hogar, luego global — que incluye el
   seed); (b) trigram ≥ 0.6 en `search_name_<locale>` y el otro idioma;
   (c) código de barras → Open Food Facts (remoto, sin clave) → crea `foods`
   `source='off'`; (d) IA si activa → `is_estimated=true`, `source='ai'`.
   No hay llamada remota a USDA FoodData Central: el subset viene sembrado.
   Corrección manual: `source='manual'`, gana siempre. Fusionar (fase 5)
   reapunta `recipe_ingredients` y `pantry_items` y marca `merged_into_id`.
5. **cooking.logCooked({entryId?, recipeId?, servingsCooked, leftovers?})**
   en **una transacción**:
   1. Si viene `recipeId` sin entrada: crea `meal_plan_entries` de hoy con
      `slot` por hora del día (o el que elija el usuario) y `servings =
      servingsCooked`. A partir de aquí siempre hay entrada.
   2. `SELECT … FOR UPDATE` de los `pantry_items` del hogar cuyos `food_id`
      están en la receta.
   3. `allocateDeductions` (dominio) sobre ese snapshot.
   4. Por cada allocation: `UPDATE pantry_items SET quantity = GREATEST(0,
      quantity - $q) WHERE id = $id RETURNING quantity`; `deducted = old -
      new`; si `deducted < requested` → warning. Ítems que quedan en 0 se
      conservan (el usuario decide si borrar).
   5. `cooking_log` con snapshot de kcal, `pantry_deductions`, `warnings`.
   6. `recipes.times_cooked += 1`, `last_cooked_at`; `entry.cooked_at = now`.
   7. Sobras: crea entradas con `leftover_of_entry_id = entry.id`,
      `servings` indicadas, en la fecha/slot elegidos (default: mañana, mismo
      slot).
   Emite `plan.changed`, `pantry.changed`. Test de concurrencia: dos
   `logCooked` simultáneos sobre el mismo alimento nunca dejan negativo ni
   descuentan de más.
6. **shopping**: `generate(range)` → `consolidateNeeds`; `push(lines)` →
   `pushToShopList` en lotes de 100; `shoplist_last_pushed_at`.
7. **households/auth**: §6, incluido salir y borrar hogar.
8. **ai**: §10.
9. **plan-rules** (fase 5): `households.plan_rules` = `{day, slot?,
   constraint: 'no-meat'|'max-minutes'|'tag'|'not-tag', value}[]`. El
   autorrelleno sin IA usa `applyPlanRules` + `avoidRecentRepeats` y crea una
   `plan_proposal` con `source='rules'` — misma UI de aprobación.

Todos los servicios exponen esquemas zod de entrada/salida en
`lib/validation`; REST y MCP los reutilizan.

## 10. IA (`lib/ai`)

- `getProvider(household)`: `LanguageModel` del AI SDK o `null`. Clave del
  hogar (descifrada) o de env (`AI_ANTHROPIC_API_KEY`, `AI_OPENAI_API_KEY`,
  `AI_LOCAL_BASE_URL`, `AI_LOCAL_MODEL`). Adaptadores: `@ai-sdk/anthropic`,
  `@ai-sdk/openai`, `@ai-sdk/openai-compatible` (local). Con backend local se
  envía `response_format: json_schema` (llama.cpp lo compila a gramática GBNF;
  Ollama lo acepta desde 0.5) — se activa con el flag
  `households.ai_structured_output bool default true`.
- `withBudget(household, op, fn)`: `SUM(cost_cents)` del mes < cap (si cap >
  0), ejecuta, registra `ai_usage_log`. El proveedor local cuesta 0. Precios en
  `lib/ai/models.ts`.
- Tareas (`generateObject` + zod, `maxRetries: 2`): `parseIngredientsFallback`
  (solo líneas `needsReview`), `importRecipeFromText/Image`,
  `estimateNutrition(foodName)`, `proposePlan(context)` → `plan_proposals`
  con `source='ai'`.
- Modelos por defecto en `models.ts`: ids exactos de Anthropic/OpenAI se fijan
  en W2(e) consultando la documentación oficial del proveedor; local →
  `qwen3-8b` Q4_K_M (8 GB VRAM) / `qwen3-4b` Q4_K_M (4 GB). Botón "probar".
  README documenta el arranque recomendado:
  `llama-server -m qwen3-8b-q4_k_m.gguf -ngl 99 -c 8192 -fa --jinja --port 8080`
  y la alternativa Ollama.
- Con modelos ≤ 8B: prompts cortos, un objeto de salida, sin tool calling en
  cadena.

## 11. REST `/api/v1` + OpenAPI

Recursos: `recipes`, `recipes/{id}?servings=`, `recipes/import`, `uploads`,
`plan?from&to`, `plan/entries` (batch), `plan/proposals`, `pantry`,
`pantry/adjust`, `pantry/barcode/{code}`, `foods/search`, `shopping/generate`,
`shopping/push`, `cooking/log`, `household`, `household/members`, `export`.
Auth: Bearer con scopes o cookie. Errores `{error: {code, message,
details?}}`. `GET /api/openapi.json` desde zod; Swagger UI en `/api/docs`.

## 12. MCP `/mcp`

- SDK oficial `@modelcontextprotocol/sdk`, transporte Streamable HTTP,
  stateless por petición. **Decisión de transporte el día 1 de W2(h)**: el
  SDK reciente trae `WebStandardStreamableHTTPServerTransport` (acepta
  `Request` web) → es la opción; si la versión instalada no lo trae, se usa
  `mcp-handler` (Vercel). Se documenta en `docs/05`.
- Auth: Bearer `rz_…`. **Límite conocido**: los conectores MCP de clientes
  web/móvil suelen exigir OAuth; con Bearer se conecta desde clientes de
  escritorio y vía `mcp-remote --header`. `docs/05` lo dice; OAuth/OIDC
  queda como tarea futura fuera de este spec.
- Perfiles por token (`api_tokens.mcp_profile`): `basic` (las 12 de
  `docs/05`), `full` (+ `update_recipe`, `delete_recipe`,
  `update_meal_plan_entry`, `delete_pantry_item`, `create_food`,
  `merge_foods`). Los scopes del token filtran además qué se expone.
- `set_meal_plan` **crea una `plan_proposal`** (`source='mcp'`) y devuelve id
  + diff. Nunca escribe el plan.
- Esquemas zod `.strict()`, errores explicativos, descripciones "úsala
  cuando… / no la uses para…".
- Prompts: `plan_week`, `prepare_shopping`, `cooking_session(recipe)`,
  `nutrition_summary(range)`. Recurso: `household://context`.
- **MCP mínimo en W2(h)**: transporte + auth + `get_household_context`,
  `search_recipes`, `get_recipe`, para poder usarlo con un cliente real
  mientras W3 avanza (conserva el espíritu de `docs/07` "fase 2 a
  propósito"). W3(d) completa el resto.
- Tests: cada herramienta con fixture; test opcional con `AI_LOCAL_BASE_URL` + `AI_LOCAL_TEST_MODEL`.

## 13. ShopList

`lib/integrations/shoplist.ts` según `docs/06` con identificadores en inglés
(`ShoppingLine`, `toShopListItem`, `pushToShopList`). Config por hogar
(`shoplist_fn_url`, `shoplist_secret_enc`, `shoplist_list_token`) con fallback
a env `SHOPLIST_FN_URL`, `SHOPLIST_IMPORT_SECRET`, `SHOPLIST_LIST_TOKEN`.
Lotes de 100. Sin categoría. Enlace `https://shop.jarsss8.es/#/s/<token>`.
La Edge Function vive en el repo de ShopList; aquí solo el contrato y un
`curl` de ejemplo en `docs/06`.

## 14. Tiempo real (SSE)

`lib/events/bus.ts`: `emit(householdId, {type, payload})`. `GET /api/events`
filtra por hogar de la sesión, heartbeat 25 s. Tipos: `plan.changed`,
`pantry.changed`, `recipe.changed`, `proposal.created`. Cliente:
`useHouseholdEvents()` → `router.refresh()` o estado local.

## 15. Docker y despliegue

- `Dockerfile` multi-stage (node:24-alpine, `output: 'standalone'`), usuario
  no root. **Migraciones sin `drizzle-kit` en runtime**: `scripts/migrate.ts`
  usa `migrate()` de `drizzle-orm/node-postgres/migrator`; se compila en el
  build y se copia junto a `db/migrations/` a la imagen. `entrypoint.sh`:
  espera Postgres → `node scripts/migrate.js` → `node scripts/seed.js`
  (idempotente) → `node server.js`.
- `docker-compose.yml`: `app` (3000, volumen `./data/uploads`) + `db`
  (postgres:17-alpine, volumen, healthcheck). `.env.example`: `APP_URL`,
  `APP_SECRET`, `DATABASE_URL`, `AI_*` y `SHOPLIST_*` opcionales.
- README (`es` + `en`): instalación en 3 comandos, passkeys requieren HTTPS o
  `localhost`, cero telemetría, conexión de clientes MCP y su límite (§12),
  **atribuciones**: USDA FoodData Central (dominio público) y Open Food Facts
  (ODbL, con enlace y aviso de licencia).
- PWA: manifest, service worker mínimo (shell), iconos. Push web (VAPID en
  `app_settings`) para caducidades — fase 5.

## 16. Testing y calidad

- `vitest`: `lib/domain` 100 % líneas; servicios contra Postgres real
  (`DATABASE_URL_TEST`, base efímera por fichero), aislamiento entre hogares
  en cada servicio, concurrencia en `logCooked`.
- `playwright`: registro con passkey (CDP virtual authenticator), invitar,
  receta y escalar, planificar, cocinar → despensa, `tools/list` del MCP.
  Axe en las cinco pantallas, claro y oscuro.
- `pnpm check` = typecheck + eslint (boundaries, no-literals, no-explicit-any)
  + i18n-keys + vitest. Cada subagente lo deja en verde.

## 17. Plan de oleadas (input para `writing-plans`)

Contratos congelados al final de W1, modificables solo por tarea explícita:
`db/schema/*`, `lib/domain/types.ts` y firmas §5, `lib/validation/*`, nombres
de `components/icons`, claves de `messages/*` (se añaden, no se renombran),
rutas de `settings/*`.

| Oleada | Tareas | Depende |
|---|---|---|
| **W0** (1 agente, secuencial) | Esqueleto: Next 16, TS estricto, Tailwind 4, shadcn init, pnpm, vitest, playwright, eslint boundaries + no-literals, next-intl con `messages/<locale>/*.json` y namespaces vacíos, **tema completo** (globals.css, shadcn re-estilizado, fuentes, radios, `rz_prefs`), **iconos** de la barra y básicos, `app/(app)/layout` con barra, `(auth)` layout, **shell de ajustes** con una ruta vacía por sección, Dockerfile + compose + migrate/seed scripts vacíos, README, `pnpm check`. Apéndice A aplicado. | — |
| **W1** (∥) | (a) schema Drizzle completo + migración + `build-foods-seed` (subset ~800, `name_es` generado una vez con IA y revisado, versionado) + seed `unit_aliases`/tags · (b) `lib/domain` + tests · (c) auth passkeys (`residentKey: 'required'`) + sesión HMAC + HKDF/AES-GCM + hogar + invitación + salir/borrar + guards + e2e registro · (d) `lib/validation` zod de todos los agregados + `lib/events` + hook SSE | W0 |
| **W2** (∥) | (a) recetas: servicio + CRUD UI + editor con parser + uploads + importar URL/texto + exportar · (b) foods: cascada + OFF + búsqueda + `settings/foods` · (c) plan: servicio + calendario dnd + saltar + sobras + propuestas UI · (d) despensa: servicio + UI + escáner · (e) `lib/ai` + `settings/ai` · (f) shoplist + shopping service + `settings/shoplist` · (g) tokens API + `settings/tokens|appearance|members|household|passkeys` · (h) **MCP mínimo** (transporte decidido, auth, 3 tools) | W1 |
| **W3** (∥) | (a) cooking: modo cocina + `logCooked` + sobras · (b) Hoy + SSE en pantallas · (c) REST completo + OpenAPI + Swagger · (d) MCP completo: 12 basic + full, prompts, recurso, tests, docs de conexión | W2 |
| **W4** (∥) | (a) reglas de autorrelleno + evitar repetición · (b) temporizadores + voz + modo pared · (c) importar foto/PDF + migración Mealie/Tandoor · (d) etiquetas jerárquicas + colecciones + fusionar alimentos · (e) alérgenos por miembro en propuestas + estadísticas plan vs realidad · (f) PWA + push caducidad | W3 |
| **W5** | Integración: e2e completo, axe, revisión de diseño contra `02-DISENO.md`, README, `AGENTS.md` sección Comandos, docs al día | W4 |

Cada tarea: worktree propio, TDD, `pnpm check` verde, revisión por agente
revisor antes de merge. Ningún commit lleva trailers ni menciones a
herramientas de IA; autor `JarssS8 <adriancgs@gmail.com>`. Si una tarea
necesita cambiar un contrato congelado, para y lo pide.

## 18. Riesgos conocidos

1. **Seed de alimentos**: el subset de ~800 y su traducción es la tarea más
   grande sin código; dueño W1(a), con script reproducible
   (`build-foods-seed.ts`) y fichero versionado en `db/seed/`.
2. Parser en español: fixture real y `needsReview` barato; IA solo fallback.
3. Modelos ≤ 8B eligen mal herramientas: probar `qwen3:8b` en W2(h) y W3(d).
4. Descuento de despensa concurrente: `FOR UPDATE` + `GREATEST` atómico +
   test de concurrencia (§9.5).
5. **Transporte MCP en Next**: `WebStandardStreamableHTTPServerTransport` o
   `mcp-handler`; decidir día 1 de W2(h).
6. **Bearer no vale para conectores OAuth**: documentado; OAuth fuera de
   alcance.
7. Migraciones en imagen standalone: sin `drizzle-kit` en runtime (§15).
8. Versiones recientes (Next 16, React 19, Tailwind 4, shadcn): W0 fija
   versiones exactas y documenta desvíos.

## Apéndice A · Docs a actualizar en W0

| Doc | Cambio |
|---|---|
| `AGENTS.md` | Migraciones: `scripts/migrate.ts` con `migrate()` de drizzle-orm, no `drizzle-kit` en runtime. Sesión: id opaco + HMAC, sin JWT. |
| `docs/03-DOMINIO.md` §6 | `ubicacion`/`caduca_el` → `location`/`expires_at`; FIFO por caducidad; negativo → `GREATEST(0)` atómico. §7: excluye cocinadas y saltadas; líneas sin base o sin `food_id`. |
| `docs/04-DATOS.md` | Tablas y columnas nuevas de §4; scopes con `cooking:write`; `mcp_profile`; sin `ai_spent_this_month_cents`; `skipped_at`; `plan_proposals`; `app_settings`. |
| `docs/05-MCP.md` | Transporte y límite Bearer/OAuth; `set_meal_plan` crea propuesta; perfiles por token; MCP mínimo en W2. |
| `docs/06-SHOPLIST.md` | Nombres en inglés; config por hogar cifrada con fallback a env. |
| `docs/07-ROADMAP.md` | Nota: se ejecuta en oleadas (§17); MCP mínimo adelantado a W2. |
| `docs/02-DISENO.md` | Radios: mapeo explícito `--radius-*`; ámbar 7 días vs alerta configurable. |
