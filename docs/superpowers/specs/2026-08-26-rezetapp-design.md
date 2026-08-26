# RezetApp · Diseño técnico completo (fases 0–5)

Fecha: 2026-08-26. Estado: borrador para revisión.
Complementa a `AGENTS.md` y `docs/01..07`; si contradice algo de ahí, manda
esto (es más reciente) y hay que actualizar el doc afectado en el mismo commit.

## 1. Objetivo y alcance

Construir RezetApp entera — el roadmap `docs/07-ROADMAP.md` fases 0 a 5 — en
oleadas paralelas ejecutadas por subagentes. Cada oleada deja el repo verde
(build, lint, tests) y mergeable.

Fuera de alcance (no se construye): lista de la compra propia, sync offline
con CRDT, reparto de gastos, recomendador propio, red social, telemetría,
APK con Capacitor (queda preparado como PWA; el APK es trabajo posterior).

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
  unidades, nutrición, consolidación, parser de ingredientes (reglas),
  detección de temporizadores, reglas de autorrelleno. 100 % testeado.
- **`lib/services`**: un módulo por agregado (`recipes`, `plan`, `pantry`,
  `foods`, `households`, `auth`, `cooking`, `shopping`, `ai`). Reciben un
  `Ctx { db, householdId, userId, locale }`, validan con zod, llaman a dominio,
  persisten, emiten eventos SSE. **Son la única capa que toca la DB.**
- **Adaptadores de entrada**: Server Actions/RSC, route handlers REST, MCP.
  Nunca contienen lógica; traducen entrada → servicio → salida.
- **`lib/ai`**: proveedor elegible (Anthropic, OpenAI, Ollama) vía Vercel AI
  SDK, con tope de gasto y log. Solo hace *extracción y propuesta*; nunca
  cálculos.

Regla de dependencia (lint con `eslint-plugin-boundaries`):
`domain` no importa nada del repo · `services` importa `domain`, `db`, `ai`,
`integrations` · `app/` importa `services` y `domain` (solo para formato) ·
nadie importa `app/`.

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
    settings/            hogar, miembros, IA, ShopList, tokens API, tema, exportar
  api/v1/**/route.ts     REST
  api/openapi.json/route.ts
  api/events/route.ts    SSE
  api/uploads/[...path]/route.ts
  mcp/route.ts
components/
  ui/                    shadcn (editados con tokens)
  icons/                 SVG a medida (currentColor, stroke 1.85, round)
  <feature>/             componentes por pantalla
lib/
  domain/                puro + tests colocalizados *.test.ts
  services/
  ai/                    provider.ts, budget.ts, tasks/{parse-ingredients,import-recipe,estimate-nutrition,propose-plan}.ts
  integrations/shoplist.ts
  auth/                  session.ts (jose), webauthn.ts, guards.ts
  i18n/                  next-intl config
  events/                bus.ts (EventEmitter tipado) para SSE
  validation/            esquemas zod compartidos (también alimentan OpenAPI y MCP)
db/
  schema/*.ts            un fichero por agregado, index.ts los reúne
  migrations/
  seed/                  foods base (USDA subset + traducciones es), tags
messages/es.json, en.json
scripts/                 migrate.ts, seed.ts, export.ts, import-mealie.ts, import-tandoor.ts
e2e/                     playwright
docker/                  Dockerfile, entrypoint.sh
docker-compose.yml, .env.example, README.md
```

## 4. Modelo de datos

Base: `docs/04-DATOS.md`. Cambios y añadidos respecto a ese doc:

- `households` + `default_servings int not null default 2`,
  `ai_provider enum('none','anthropic','openai','ollama') default 'none'`,
  `ai_model text`, `ai_base_url text` (Ollama), `ai_api_key_enc text`
  (cifrada con `APP_SECRET`, AES-GCM), `expiry_alert_days int default 3`,
  `shoplist_list_token`, `plan_rules jsonb` (fase 5, ver §9.6).
- `users` + `units`, `theme enum('system','light','dark')`, `accent`.
  Email es opcional en passkeys-only; lo mantenemos `unique` nullable para
  invitaciones futuras. `display_name` obligatorio.
- **Nueva `sessions`**: `id`, `user_id`, `household_id` (hogar activo),
  `expires_at`, `created_at`, `user_agent`. Cookie `rz_session` httpOnly,
  SameSite=Lax, contiene JWT firmado (jose, HS256 con `APP_SECRET`) con
  `sid`. Rotación a los 30 días, caducidad 90.
- **Nueva `webauthn_challenges`**: `id`, `challenge`, `user_id` nullable,
  `kind enum('register','login')`, `expires_at` (5 min). Se borra al usar.
- `webauthn_credentials` + `device_type`, `backed_up`, `name`, `created_at`,
  `last_used_at`.
- `recipes` + `kcal_per_serving numeric`, `protein/carbs/fat/fiber_per_serving`,
  `kcal_100g` (desnormalizados, recalculados al guardar ingredientes),
  `nutrition_is_estimated bool`, `yield_grams numeric nullable`,
  `search_vector tsvector` generado, `deleted_at` (soft delete).
- `recipe_ingredients.unit enum('g','ml','ud')` (base) + `display_unit text`
  y `display_quantity numeric` (lo que escribió el usuario, para mostrarlo tal
  cual si no hay conversión); `group_label text nullable` ("Para la salsa").
- `recipe_steps` + `image_url nullable`.
- `foods` + `search_name text` (normalizado sin acentos, para trigram),
  `aliases text[]`, `density_g_per_ml numeric nullable`, `grams_per_unit
  numeric nullable` (una cebolla ≈ 150 g), `merged_into_id nullable` (fase 5
  fusionar).
- `unit_aliases` (global): `alias`, `unit`, `factor_to_base`, `locale`
  (cdta→5 ml, cda→15 ml, taza→240 ml, oz→28.35 g…). Las tazas *por
  alimento* siguen en `foods.grams_per_cup`.
- `meal_plan_entries.slot enum('breakfast','lunch','dinner','snack')`, y
  `status enum('planned','cooked','skipped')` derivado de `cooked_at`.
- **Nueva `plan_proposals`**: `id`, `household_id`, `created_by` (`user_id`
  o `api_token_id`), `payload jsonb` (lista de altas/bajas), `status
  enum('pending','approved','rejected')`, `created_at`, `resolved_at`. La IA
  y el MCP escriben aquí; la UI aprueba en diff (fase 3).
- `cooking_log` + `pantry_deductions jsonb` (qué se restó, para deshacer) y
  `warnings jsonb` (los negativos dejados en 0).
- `api_tokens.scopes`: `recipes:read recipes:write plan:read plan:write
  pantry:read pantry:write shopping:push household:read`. Prefijo visible
  `rz_` + 32 bytes base64url; se guarda sha256.
- **Nueva `push_subscriptions`** (fase 5): `user_id`, `endpoint`, `keys jsonb`.
- **Nueva `collections`** (fase 5): filtros guardados, `household_id`, `name`,
  `query jsonb`.
- Todas las tablas de contenido: `household_id uuid not null` + índice.
  `foods.household_id` nullable (global). Soft delete solo en `recipes`.

Índices: los de `04-DATOS.md` más `sessions(user_id)`,
`plan_proposals(household_id, status)`, GIN trigram sobre `foods.search_name`
(extensión `pg_trgm`), GIN sobre `recipes.search_vector`.

## 5. `lib/domain` — contrato de funciones

Todo con tipos exportados en `lib/domain/types.ts`. Firmas de las principales:

```ts
// scaling.ts
scaleQuantity(qty: number, ratio: number, scalesLinearly: boolean): number   // DAMP=0.65
scaleRecipe(recipe: RecipeForScaling, targetServings: number): ScaledRecipe // marca nonLinear[]
isNonLinearByDefault(foodName: string, locale): boolean                     // sal, especias, levadura…

// quantities.ts
formatQuantity(qty: number, unit: DisplayUnit, locale): string   // "1 ½ cdta", "250 g", "0,5 l"
toDisplayUnit(qty: number, base: BaseUnit, food: FoodConversion, system: 'metric'|'imperial', preferred?: string): DisplayQuantity
toBaseUnit(qty: number, unit: string, food?: FoodConversion): {qty, unit: BaseUnit} | null   // null → no convertible, se conserva display

// nutrition.ts
recipeNutrition(ingredients: IngredientWithFood[], servings: number, yieldGrams?: number): Nutrition
   // → perServing, total, per100g, isEstimated (si algún food.is_estimated o food null)
aggregateNutrition(entries: {nutrition: Nutrition, servings: number}[]): Nutrition

// ingredients-parser.ts
parseIngredientLine(raw: string, locale: 'es'|'en'): ParsedIngredient
   // {quantity?, unit?, foodName, preparation?, confidence: 0..1, needsReview}
   // reglas: fracciones unicode, "1 y 1/2", rangos "2-3", "un/una", "al gusto", "pizca", "chorrito"

// pantry.ts
deductFromPantry(items: PantryItem[], needs: Need[]): {updated: PantryItem[], warnings: Warning[]}
expiringSoon(items: PantryItem[], today: Date, days: number): PantryItem[]

// shopping.ts
consolidateNeeds(entries: PlannedEntry[], pantry: PantryItem[]): ShoppingLine[]
   // ignora entradas con leftover_of_entry_id; agrupa por food_id; resta despensa; descarta ≤0
toShopListItem(line: ShoppingLine): {name: string, quantity: number|null}

// timers.ts
detectTimers(stepText: string, locale): TimerSpan[]   // "hornea 25 minutos" → 1500 s

// plan-rules.ts (fase 5)
applyPlanRules(rules: PlanRule[], candidates: RecipeSummary[], history: CookedHistory, week: Date): Slot[]
avoidRecentRepeats(candidates, history, days: number): RecipeSummary[]
```

Tests obligatorios: escalado lineal/no lineal, invariante kcal por ración al
escalar, fracciones bonitas, conversión taza-por-alimento y fallback sin dato,
consolidación con sobras y despensa, descuento con negativo→0+warning,
parser con ≥40 líneas reales en es y ≥20 en en (fixture JSON).

## 6. Auth, hogar e invitaciones

- Registro: nombre → `generateRegistrationOptions` → passkey → crea `users`,
  `households` ("Casa de <nombre>"), `household_members(owner)`, sesión.
- Login: `generateAuthenticationOptions` sin `allowCredentials` (discoverable
  credentials) → cookie.
- `rpID`/`origin` desde `APP_URL`. En dev `localhost`.
- Invitación: owner genera `household_invites` (token 24 h) → enlace
  `/invite/<token>` → si no hay sesión, registro con passkey; se añade como
  `member`. Un usuario puede estar en varios hogares; la sesión guarda el
  activo y hay selector en ajustes.
- Recuperación: un usuario puede registrar varias passkeys desde ajustes.
  Sin email/SMTP no hay recuperación por correo; el README lo dice.
- `guards.ts`: `requireSession()`, `requireHousehold()`, `requireRole('owner')`,
  `requireApiToken(scopes)`. REST y MCP aceptan `Authorization: Bearer rz_…`;
  la UI usa cookie.
- Toda consulta de servicio filtra por `ctx.householdId`. Test de aislamiento
  entre hogares en cada servicio.

## 7. UI: tema, tipografía, iconos, i18n

- `app/globals.css`: `@import "tailwindcss"`, tokens de `design-tokens.css`,
  mapeo de tokens shadcn (`--background: var(--bg)`, `--primary: var(--acc)`,
  `--primary-foreground: var(--on-acc)`, `--radius: var(--r-sm)`…).
- Fuentes con `next/font/google`: Outfit, DM Sans, JetBrains Mono. Sin CDN en
  runtime (self-hosted en build).
- `data-theme` y `data-accent` en `<html>` desde la preferencia del usuario;
  script inline anti-flash lee `localStorage` antes de hidratar.
- Iconos: `components/icons/*.tsx`, dibujados a mano. Los cinco de la barra
  (sol-plato, sartén, calendario, alacena, libro) + ~25 de interfaz (más,
  menos, reloj, aviso, fuego, nevera, congelador, armario, código de barras,
  enlace, foto, buscar, ajustes, salir, chevron, check, cerrar, arrastrar,
  sobras, estimado, enviar, copiar, eliminar, editar, usuario). Nunca lucide.
- `next-intl` con `messages/{es,en}.json` por namespace (`common`, `today`,
  `cook`, `plan`, `pantry`, `recipes`, `settings`, `auth`, `errors`). Lint
  que falla si hay literales JSX fuera de `messages/` (regla
  `react/jsx-no-literals` con allowlist de símbolos).
- Locale del usuario (`users.locale`), fallback `Accept-Language`, default `es`.
- Móvil primero: barra inferior 5 pestañas, área táctil ≥ 44 px, safe-area.
- Accesibilidad: foco visible, `prefers-reduced-motion`, contraste AA en
  ambos temas (test automático con axe en Playwright).

## 8. Las cinco pantallas (comportamiento)

### Hoy
Comidas de hoy por slot con estado (planificada/cocinada), anillo de kcal
del hogar (cocinado sobre planificado; informativo, sin objetivo), lo que
caduca en ≤ `expiry_alert_days`, atajos: "cocinar esto", "añadir a despensa",
"proponer semana" (si hay IA). Se actualiza por SSE.

### Cocinar
Entrada: desde una entrada del plan (`servings` del hueco) o desde una receta
(elige raciones). Un paso por pantalla, ingredientes del paso escalados
arriba, temporizadores detectados como botones, wake lock (Screen Wake Lock
API con fallback silencioso), swipe/teclas. Al terminar: "¿Cuántas raciones
has hecho?" → `cooking.logCooked` (descuento atómico + log + sobras
opcionales → crea entrada `leftover_of_entry_id` en el hueco que elija).
Lectura en voz alta (SpeechSynthesis) fase 5.

### Plan
Vista semana (default) y mes. Huecos por slot; arrastrar y soltar con
`@dnd-kit` (touch). Varias comidas por hueco. Chips: raciones (stepper si ≠
default), sobras, presupuesto de tiempo del día. Panel "Propuestas": lista de
`plan_proposals` pendientes con diff (añadir/quitar por día), aprobar o
descartar; SSE cuando llega una nueva. Botón "Generar compra" → resumen
consolidado → "Enviar a ShopList" (solo si está configurado) + "Abrir en
ShopList".

### Despensa
Lista por ubicación, buscador, caducidad en ámbar si < 7 días, stepper de
cantidad con unidad de presentación. Añadir: buscador de `foods` (trigram),
escáner de código de barras (`BarcodeDetector` si existe, fallback
`@zxing/browser`) → Open Food Facts → crea/actualiza `foods`. "Qué cocinar
con lo que caduca": consulta a `recipes.search` con `hasIngredients`.

### Recetas
Lista con búsqueda full-text, filtros (etiquetas jerárquicas, tiempo máx,
dificultad, "tengo los ingredientes"), colecciones guardadas (fase 5).
Detalle: cabecera, stepper de raciones con recálculo en vivo y aviso ámbar de
no lineales + nota, fila de kcal (grande por ración, pequeño total, por 100 g),
ingredientes agrupados, pasos con ingredientes asignados, notas, veces
cocinada, "Cocinar", "Añadir al plan". Editor: formulario con ingredientes
como líneas de texto que se parsean al vuelo (badge de confianza; clic para
corregir cantidad/unidad/alimento/preparación y `scales_linearly`). Importar:
URL (schema.org/Recipe JSON-LD y microdata, con `cheerio`), texto pegado,
foto/PDF (fase 5, vía IA con visión si el proveedor la tiene; Ollama →
modelo con visión o deshabilitado). Exportar JSON de todo el hogar y
migración desde Mealie/Tandoor (scripts CLI + botón en ajustes).

### Ajustes (dentro de Recetas → icono, y desde avatar)
Hogar (nombre, raciones por defecto, alerta caducidad), miembros (alérgenos,
`dietary_flags`, invitar, expulsar), IA (proveedor, modelo, clave, URL Ollama,
tope mensual, gasto actual, "probar"), ShopList (token de lista, URL función,
secreto — o solo activar si vienen por env), tokens API (crear con scopes,
revocar, ver última vez), apariencia (tema, acento, unidades, idioma),
passkeys, exportar, importar, notificaciones push (fase 5).

## 9. Servicios: reglas por agregado

1. **recipes**: crear/editar/borrar(soft)/buscar/importar/exportar. Al guardar
   ingredientes: parsear, resolver `food_id` (cascada §9.4), convertir a base,
   recalcular nutrición desnormalizada. Contador `times_cooked` lo actualiza
   `cooking`.
2. **plan**: CRUD de entradas en lote, mover, sobras, agregados nutricionales
   por rango, propuestas (crear/aprobar/rechazar; aprobar aplica en
   transacción).
3. **pantry**: CRUD, deltas (`adjust(foodId, deltaBase)`), caducidades,
   lookup por código de barras (OFF → cache en `foods`).
4. **foods** (resolución en cascada): (a) exacto/alias en `foods` del hogar y
   global; (b) trigram ≥ 0.6; (c) código de barras → OFF; (d) USDA sembrado
   (subset "Foundation + SR Legacy" ~8k alimentos crudos, con `name_es`
   traducido en el seed vía tabla estática incluida en el repo); (e) IA si
   está activa → `is_estimated=true`, `source='ai'`. La corrección manual
   pone `source='manual'` y gana siempre. Fusionar duplicados (fase 5) reapunta
   `recipe_ingredients` y `pantry_items` y marca `merged_into_id`.
5. **cooking.logCooked(entryId|recipeId, servingsCooked, leftovers?)**: en una
   transacción: snapshot de kcal, descuento de despensa (`deductFromPantry`),
   `cooking_log`, `recipes.times_cooked/last_cooked_at`, `entry.cooked_at`,
   entrada de sobras si procede. Emite evento `plan.changed`, `pantry.changed`.
6. **shopping**: `generate(range)` → `consolidateNeeds`; `push(lines)` →
   `pushToShopList` en lotes de 100; guarda `last_pushed_at` en el hogar.
7. **households/auth**: §6.
8. **ai**: §10.
9. **plan-rules** (fase 5): `households.plan_rules` = lista de reglas
   `{day, slot?, constraint: 'no-meat'|'max-minutes'|'tag'|'not-tag', value}`.
   El autorrelleno sin IA usa `applyPlanRules` + `avoidRecentRepeats` y crea
   una `plan_proposal` igual que la IA — misma UI de aprobación.

Todos los servicios exponen `z` schemas de entrada/salida en `lib/validation`;
REST y MCP los reutilizan.

## 10. IA (`lib/ai`)

- `getProvider(household)`: devuelve un `LanguageModel` del AI SDK o `null`
  (regla 3: todo funciona sin él). Anthropic/OpenAI con clave del hogar o de
  env (`AI_ANTHROPIC_API_KEY`…), Ollama con `ai_base_url`.
- `withBudget(household, op, fn)`: comprueba `ai_spent_this_month_cents <
  cap`, ejecuta, registra `ai_usage_log`, actualiza gasto. Ollama cuesta 0.
  Precios por modelo en una tabla estática editable en ajustes.
- Tareas (todas con `generateObject` + zod y `maxRetries: 2`):
  `parseIngredientsFallback` (solo líneas con `needsReview`),
  `importRecipeFromText/Image`, `estimateNutrition(foodName)` (devuelve por
  100 g + `is_estimated`), `proposePlan(context)` → escribe `plan_proposals`.
- Modelos por defecto en ajustes (constantes en `lib/ai/models.ts`, con
  precios): Anthropic → ids exactos se fijan en W2(e) consultando la
  documentación oficial del proveedor (no de memoria); OpenAI → el modelo "mini" vigente; Ollama →
  `qwen3:8b` (8 GB VRAM) / `qwen3:4b` (4 GB). Se validan con el botón "probar".
- Con modelos ≤ 8B: prompts cortos, un solo objeto de salida, sin tool
  calling en cadena (la orquestación multi-herramienta la hace el cliente
  MCP externo, no `lib/ai`).

## 11. REST `/api/v1` + OpenAPI

Recursos: `recipes`, `recipes/{id}` (con `?servings=`), `recipes/import`,
`plan?from&to`, `plan/entries` (batch), `plan/proposals`, `pantry`,
`pantry/adjust`, `pantry/barcode/{code}`, `foods/search`, `shopping/generate`,
`shopping/push`, `cooking/log`, `household`, `household/members`, `export`.
Auth: Bearer token con scopes o cookie de sesión. Errores `{error: {code,
message, details?}}`. `GET /api/openapi.json` generado desde zod; Swagger UI
en `/api/docs`.

## 12. MCP `/mcp`

- Transporte Streamable HTTP del SDK oficial (`@modelcontextprotocol/sdk`),
  stateless por petición; auth por Bearer `rz_…` (scopes → herramientas
  visibles). Sin sesión de cookie.
- Perfiles: `basic` (12 herramientas de `docs/05-MCP.md`) por defecto;
  `full` añade `update_recipe`, `delete_recipe`, `update_meal_plan_entry`,
  `delete_pantry_item`, `create_food`, `merge_foods`. El perfil lo fija el
  token (`api_tokens.mcp_profile`).
- `set_meal_plan` **no escribe el plan**: crea una `plan_proposal` y devuelve
  su id y el diff. La descripción de la herramienta lo dice.
- Esquemas zod estrictos (`.strict()`), errores con mensaje explicativo para
  que el modelo corrija. Descripciones con "úsala cuando… / no la uses
  para…".
- Prompts: `plan_week`, `prepare_shopping`, `cooking_session(recipe)`,
  `nutrition_summary(range)`.
- Recursos: `household://context` (lo mismo que `get_household_context`).
- Tests: cada herramienta con fixture; test de "modelo pequeño" opcional
  (`OLLAMA_TEST_MODEL`) que lanza los cuatro prompts contra Ollama y
  comprueba que llama a las herramientas correctas, marcado `skip` sin env.

## 13. ShopList

`lib/integrations/shoplist.ts` según `docs/06-SHOPLIST.md` con nombres en
inglés (`ShoppingLine`, `toShopListItem`, `pushToShopList`). Config por hogar
(`shoplist_list_token`) con fallback a env. Lotes de 100. Sin categoría. Enlace
profundo `https://shop.jarsss8.es/#/s/<token>`. La Edge Function va en el
repo de ShopList: aquí se deja `docs/06` con el contrato y un `curl` de
ejemplo; no se implementa en este repo.

## 14. Tiempo real (SSE)

`lib/events/bus.ts`: `emit(householdId, {type, payload})`. `GET /api/events`
mantiene la conexión, filtra por hogar de la sesión, heartbeat 25 s,
`Last-Event-ID` ignorado (los clientes refetch al reconectar). Tipos:
`plan.changed`, `pantry.changed`, `recipe.changed`, `proposal.created`.
Cliente: hook `useHouseholdEvents()` que invalida `router.refresh()` o estado
local según pantalla.

## 15. Docker y despliegue

- `Dockerfile` multi-stage (node:24-alpine → `output: 'standalone'`), usuario
  no root, `docker/entrypoint.sh`: espera Postgres, `drizzle-kit migrate`,
  seed idempotente de `foods` globales y `unit_aliases`, arranca.
- `docker-compose.yml`: `app` (puerto 3000, volumen `./data/uploads`) +
  `db` (postgres:17-alpine, volumen, healthcheck). `.env.example` con
  `APP_URL`, `APP_SECRET`, `DATABASE_URL`, `AI_*` opcionales, `SHOPLIST_*`
  opcionales. Sin S3, sin SMTP.
- README en español e inglés: instalación en 3 comandos, passkeys requieren
  HTTPS o `localhost`, cero telemetría, cómo conectar un cliente MCP de escritorio al endpoint.
- PWA: `manifest.webmanifest`, service worker mínimo (shell cacheado, sin
  sync de datos), iconos. Push web (VAPID, claves generadas en el primer
  arranque y guardadas en DB) para caducidades — fase 5.

## 16. Testing y calidad

- `vitest`: `lib/domain` 100 % de líneas; servicios con Postgres real
  (`testcontainers` o `DATABASE_URL_TEST`), cada uno con test de aislamiento
  entre hogares.
- `playwright`: registro con passkey (CDP virtual authenticator), invitar,
  crear receta y escalar, planificar, cocinar y comprobar despensa, MCP con
  `curl` de `tools/list`. Axe en las cinco pantallas, claro y oscuro.
- CI local: `pnpm check` = typecheck + eslint (boundaries, no-literals,
  no-explicit-any) + vitest. Es lo que cada subagente debe dejar en verde.

## 17. Plan de oleadas (input para `writing-plans`)

Contratos congelados al final de W1 y solo modificables por tarea explícita:
`db/schema/*`, `lib/domain/types.ts`, firmas de §5, `lib/validation/*`,
`components/icons` (nombres), `messages/*` (claves se añaden, no se renombran).

| Oleada | Tareas paralelas | Depende de |
|---|---|---|
| W0 | Esqueleto: Next 16, TS estricto, Tailwind 4, shadcn init, pnpm, vitest, playwright, eslint boundaries, compose + Dockerfile, README, `pnpm check` | — |
| W1 | (a) schema Drizzle + migración + seed foods/unit_aliases · (b) `lib/domain` + tests · (c) tema: globals.css, shadcn re-estilizado, fuentes, iconos, barra, anti-flash · (d) next-intl + mensajes base + lint no-literals · (e) auth passkeys + hogar + invitación + guards + e2e registro | W0 |
| W2 | (a) recetas: servicio + CRUD UI + editor con parser + importar URL/texto + exportar · (b) foods: resolución en cascada + OFF + búsqueda + ajustes de alimentos · (c) plan: servicio + calendario dnd + sobras + propuestas UI · (d) despensa: servicio + UI + escáner · (e) `lib/ai`: proveedores, presupuesto, tareas, ajustes IA · (f) shoplist client + shopping service + ajustes ShopList · (g) tokens API + ajustes apariencia/miembros | W1 |
| W3 | (a) cooking: modo cocina + logCooked atómico + sobras · (b) Hoy + SSE + hooks · (c) REST completo + OpenAPI + Swagger · (d) MCP: tools basic/full, prompts, recurso, tests, doc de conexión de clientes MCP | W2 |
| W4 | (a) reglas de autorrelleno + evitar repetición · (b) temporizadores + voz + modo pared · (c) importar foto/PDF + migración Mealie/Tandoor · (d) etiquetas jerárquicas + colecciones + fusionar alimentos · (e) alérgenos por miembro en propuestas + estadísticas plan vs realidad · (f) PWA + push caducidad | W3 |
| W5 | Integración final: e2e completo, axe, revisión de diseño contra `02-DISENO.md`, README, `AGENTS.md` sección Comandos, docs actualizados | W4 |

Cada tarea: rama/worktree propio, TDD, `pnpm check` verde, revisión por un
agente revisor antes de merge a `main`. El orquestador mergea en orden y
resuelve conflictos; si una tarea necesita cambiar un contrato congelado,
para y lo pide.

## 18. Riesgos conocidos

1. Base de alimentos: el seed USDA con traducción es un fichero grande; se
   genera en W1(a) con un script y se versiona comprimido.
2. Parser en español: fixture real y `needsReview` barato; la IA solo como
   fallback.
3. Modelos ≤ 8B: probar `qwen3:8b` en W3(d) con el test opcional.
4. Descuento de despensa: transacción única y test con concurrencia (dos
   `logCooked` a la vez sobre el mismo alimento).
5. Next 16 / React 19 / Tailwind 4 / shadcn: versiones recientes; W0 fija
   versiones exactas en `package.json` y documenta cualquier desvío.
