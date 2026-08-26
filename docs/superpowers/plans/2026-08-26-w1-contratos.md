# W1 · Contratos (schema, dominio, auth, validación, eventos) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dejar congelados los contratos de los que depende todo lo demás: esquema Drizzle completo con migración, `lib/domain` puro con tests, auth con passkeys + hogar + invitaciones, esquemas zod compartidos y bus de eventos SSE.

**Architecture:** Cuatro pistas paralelas (a: schema, b: dominio, c: auth, d: validación+eventos) sobre el esqueleto de W0. `lib/domain` no importa nada del repo; `lib/services` es la única capa que toca la DB; `app/` solo traduce entrada → servicio → salida. Al terminar W1 se congelan `db/schema/*`, `lib/domain/types.ts`, las firmas de §5 del spec, `lib/validation/*` y `lib/events/bus.ts`.

**Tech Stack:** Next 16.3 (App Router), TypeScript 5.9 strict, drizzle-orm 0.45.2 + drizzle-kit 0.31.10 + pg 8.23, PostgreSQL 17 (`pg_trgm`), @simplewebauthn/server 13.3.3 + /browser 13.3.0, zod 4.4.3, vitest 4.1.11, Playwright 1.62, next-intl 4.13.

**Spec:** `docs/superpowers/specs/2026-08-26-rezetapp-design.md` (§4, §5, §6, §9.7, §14, §16, §17).

## Global Constraints

- Identificadores en inglés; comentarios y docs en español. Nada de `any`.
- `household_id uuid not null` + índice en toda tabla de contenido (`foods.household_id` nullable = global).
- Cantidades en unidad base `g | ml | ud` como `numeric`. Timestamps `timestamptz`.
- Sin `ON DELETE CASCADE` desde contenido hacia `households`; borrar hogar es explícito (§6).
- Cada función de `lib/domain` con test; `lib/domain` no importa React, Next, HTTP ni `db/`.
- Textos de UI solo vía next-intl (`messages/<locale>/<namespace>.json`), claves iguales en `es` y `en`.
- Commits en español, imperativo, cortos, **sin trailers** ni menciones a herramientas de IA. Autor `JarssS8 <adriancgs@gmail.com>`.
- `pnpm check` (typecheck + lint + i18n-keys + test) en verde al cerrar cada tarea.
- Supuestos de W0 (ya existen): alias `@/*` a la raíz; `db/index.ts` exporta `db` (node-postgres) leyendo `DATABASE_URL`; `DATABASE_URL_TEST` para tests de servicios; `docker compose up db` levanta Postgres 17 en `localhost:5432` (`rezetapp`/`rezetapp`/`rezetapp`); shadcn en `components/ui/` (button, input, label, card, dialog, sheet, badge, separator, skeleton, sonner); `pnpm test -- <ruta>` ejecuta un fichero; `pnpm e2e` ejecuta Playwright; `scripts/migrate.ts` y `scripts/seed.ts` existen vacíos.
- Pistas paralelas: (a) Tareas 1–7 · (b) Tareas 8–15 · (c) Tareas 16–22 · (d) Tareas 23–24. Dentro de una pista, en orden. (c) y (d) consumen tipos de (a) y (b): si se ejecutan en worktrees separados, (c)/(d) arrancan cuando (a) haya mergeado la Tarea 5 y (b) la Tarea 8.

---

## Mapa de ficheros

| Fichero | Responsabilidad |
|---|---|
| `db/schema/_types.ts` | `bytea`, `tsvector`, enums compartidos |
| `db/schema/households.ts` | `households`, `users`, `household_members`, `household_invites`, `sessions`, `webauthn_credentials`, `webauthn_challenges`, `app_settings` |
| `db/schema/foods.ts` | `foods`, `unit_aliases`, `tags` |
| `db/schema/recipes.ts` | `recipes`, `recipe_ingredients`, `recipe_steps`, `recipe_tags`, `collections` |
| `db/schema/plan.ts` | `meal_plan_entries`, `plan_proposals`, `pantry_items`, `cooking_log` |
| `db/schema/tokens.ts` | `api_tokens`, `ai_usage_log`, `push_subscriptions` |
| `db/schema/index.ts` | re-exporta todo |
| `db/migrations/0000_*.sql` | migración inicial (+ `pg_trgm`) |
| `db/test/setup.ts` | `truncateAll()` para tests de servicios |
| `db/seed/unit-aliases.json`, `db/seed/tags.json`, `db/seed/foods.json`, `db/seed/foods-translations.json` | datos semilla versionados |
| `scripts/migrate.ts`, `scripts/seed.ts`, `scripts/build-foods-seed.ts`, `scripts/translate-foods.ts` | migrar, sembrar, construir seed de alimentos |
| `lib/domain/types.ts` | todos los tipos del dominio |
| `lib/domain/units-data.ts` | tabla estática de unidades canónicas y alias por locale (única fuente; `scripts/seed.ts` la vuelca a `unit_aliases`) |
| `lib/domain/scaling.ts`, `quantities.ts`, `nutrition.ts`, `ingredients-parser.ts`, `pantry.ts`, `shopping.ts`, `timers.ts` | funciones puras §5, cada una con `*.test.ts` |
| `lib/domain/__fixtures__/ingredients.es.json`, `ingredients.en.json` | líneas reales del parser |
| `lib/auth/crypto.ts` | HKDF, AES-GCM, HMAC de cookie |
| `lib/auth/session.ts` | crear/leer/destruir sesión y cookie `rz_session` |
| `lib/auth/webauthn.ts` | opciones y verificación de registro/login |
| `lib/auth/guards.ts` | `requireSession`, `requireHousehold`, `requireRole`, `requireApiToken` |
| `lib/services/ctx.ts` | tipo `Ctx` |
| `lib/services/households.ts` | crear hogar, invitar, aceptar, salir, borrar |
| `app/api/auth/{register,login}/{options,verify}/route.ts`, `app/api/auth/logout/route.ts` | endpoints WebAuthn |
| `app/(auth)/register/page.tsx`, `login/page.tsx`, `invite/[token]/page.tsx` + `components/auth/*` | pantallas de acceso |
| `e2e/auth.spec.ts` | registro e invitación con autenticador virtual |
| `lib/validation/{common,household,recipes,foods,plan,pantry,cooking,shopping,tokens}.ts` | zod compartido |
| `lib/events/bus.ts`, `app/api/events/route.ts`, `lib/events/use-household-events.ts` | SSE |

---

## Pista (a) · Schema y seed

### Task 1: Tipos custom, enums y tablas de hogar/usuario/sesión

**Files:**
- Create: `db/schema/_types.ts`, `db/schema/households.ts`, `db/schema/index.ts`
- Test: `db/schema/households.test.ts`

**Interfaces:**
- Produces: tablas `households`, `users`, `householdMembers`, `householdInvites`, `sessions`, `webauthnCredentials`, `webauthnChallenges`, `appSettings`; enums `aiProviderEnum`, `unitSystemEnum`, `themeEnum`, `householdRoleEnum`, `challengeKindEnum`, `baseUnitEnum`; helpers `bytea`, `tsvector`.

- [ ] **Step 1: Escribir `db/schema/_types.ts`**

```ts
import { customType, pgEnum } from 'drizzle-orm/pg-core'

// Tipos que drizzle no trae de serie
export const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return 'bytea'
  },
})

export const tsvector = customType<{ data: string }>({
  dataType() {
    return 'tsvector'
  },
})

// Enums compartidos entre agregados
export const baseUnitEnum = pgEnum('base_unit', ['g', 'ml', 'ud'])
export const aiProviderEnum = pgEnum('ai_provider', ['none', 'anthropic', 'openai', 'ollama'])
export const unitSystemEnum = pgEnum('unit_system', ['metric', 'imperial'])
export const themeEnum = pgEnum('theme', ['system', 'light', 'dark'])
export const householdRoleEnum = pgEnum('household_role', ['owner', 'member'])
export const challengeKindEnum = pgEnum('webauthn_challenge_kind', ['register', 'login'])
export const foodSourceEnum = pgEnum('food_source', ['off', 'usda', 'manual', 'ai'])
export const difficultyEnum = pgEnum('difficulty', ['easy', 'medium', 'hard'])
export const mealSlotEnum = pgEnum('meal_slot', ['breakfast', 'lunch', 'dinner', 'snack'])
export const pantryLocationEnum = pgEnum('pantry_location', ['fridge', 'freezer', 'pantry'])
export const proposalStatusEnum = pgEnum('proposal_status', ['pending', 'approved', 'rejected'])
export const proposalSourceEnum = pgEnum('proposal_source', ['ai', 'rules', 'mcp'])
export const mcpProfileEnum = pgEnum('mcp_profile', ['basic', 'full'])
```

- [ ] **Step 2: Escribir `db/schema/households.ts`**

```ts
import { sql } from 'drizzle-orm'
import {
  boolean, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uuid,
} from 'drizzle-orm/pg-core'
import {
  aiProviderEnum, bytea, challengeKindEnum, householdRoleEnum, themeEnum, unitSystemEnum,
} from './_types'

export const households = pgTable('households', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  defaultServings: integer('default_servings').notNull().default(2),
  expiryAlertDays: integer('expiry_alert_days').notNull().default(3),
  aiProvider: aiProviderEnum('ai_provider').notNull().default('none'),
  aiModel: text('ai_model'),
  aiBaseUrl: text('ai_base_url'),
  aiApiKeyEnc: bytea('ai_api_key_enc'),
  aiMonthlyCapCents: integer('ai_monthly_cap_cents').notNull().default(0),
  shoplistListToken: text('shoplist_list_token'),
  shoplistFnUrl: text('shoplist_fn_url'),
  shoplistSecretEnc: bytea('shoplist_secret_enc'),
  shoplistLastPushedAt: timestamp('shoplist_last_pushed_at', { withTimezone: true }),
  planRules: jsonb('plan_rules').notNull().default(sql`'[]'::jsonb`),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').unique(),
  displayName: text('display_name').notNull(),
  avatarUrl: text('avatar_url'),
  locale: text('locale').notNull().default('es'),
  units: unitSystemEnum('units').notNull().default('metric'),
  theme: themeEnum('theme').notNull().default('system'),
  accent: text('accent').notNull().default('huerta'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const householdMembers = pgTable(
  'household_members',
  {
    householdId: uuid('household_id').notNull().references(() => households.id),
    userId: uuid('user_id').notNull().references(() => users.id),
    role: householdRoleEnum('role').notNull().default('member'),
    dietaryFlags: text('dietary_flags').array().notNull().default(sql`'{}'::text[]`),
    allergens: text('allergens').array().notNull().default(sql`'{}'::text[]`),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.householdId, t.userId] }), index('household_members_user_idx').on(t.userId)],
)

export const householdInvites = pgTable(
  'household_invites',
  {
    token: text('token').primaryKey(),
    householdId: uuid('household_id').notNull().references(() => households.id),
    createdBy: uuid('created_by').notNull().references(() => users.id),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('household_invites_household_idx').on(t.householdId)],
)

export const sessions = pgTable(
  'sessions',
  {
    id: text('id').primaryKey(), // 32 bytes aleatorios en base64url
    userId: uuid('user_id').notNull().references(() => users.id),
    householdId: uuid('household_id').notNull().references(() => households.id),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    userAgent: text('user_agent'),
  },
  (t) => [index('sessions_user_idx').on(t.userId), index('sessions_household_idx').on(t.householdId)],
)

export const webauthnCredentials = pgTable(
  'webauthn_credentials',
  {
    credentialId: text('credential_id').primaryKey(), // base64url tal como lo da el navegador
    userId: uuid('user_id').notNull().references(() => users.id),
    publicKey: bytea('public_key').notNull(),
    counter: integer('counter').notNull().default(0),
    transports: text('transports').array().notNull().default(sql`'{}'::text[]`),
    deviceType: text('device_type').notNull(),
    backedUp: boolean('backed_up').notNull().default(false),
    name: text('name'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  },
  (t) => [index('webauthn_credentials_user_idx').on(t.userId)],
)

export const webauthnChallenges = pgTable('webauthn_challenges', {
  id: uuid('id').primaryKey().defaultRandom(),
  challenge: text('challenge').notNull(),
  userId: uuid('user_id').references(() => users.id),
  kind: challengeKindEnum('kind').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
})

export const appSettings = pgTable('app_settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export type Household = typeof households.$inferSelect
export type User = typeof users.$inferSelect
export type Session = typeof sessions.$inferSelect
export type WebauthnCredential = typeof webauthnCredentials.$inferSelect
```

- [ ] **Step 3: Escribir `db/schema/index.ts` (se amplía en tareas siguientes)**

```ts
export * from './_types'
export * from './households'
```

- [ ] **Step 4: Test de forma del esquema**

`db/schema/households.test.ts`:

```ts
import { getTableColumns, getTableName } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { households, sessions, users, webauthnCredentials } from './households'

describe('schema households', () => {
  it('households no tiene ai_spent_this_month_cents (se calcula de ai_usage_log)', () => {
    expect(Object.keys(getTableColumns(households))).not.toContain('aiSpentThisMonthCents')
  })
  it('sessions guarda hogar activo y user_agent', () => {
    const cols = Object.keys(getTableColumns(sessions))
    expect(cols).toEqual(expect.arrayContaining(['householdId', 'userId', 'expiresAt', 'lastSeenAt', 'userAgent']))
  })
  it('users.email es opcional y display_name obligatorio', () => {
    expect(getTableColumns(users).email.notNull).toBe(false)
    expect(getTableColumns(users).displayName.notNull).toBe(true)
  })
  it('nombres de tabla en snake_case', () => {
    expect(getTableName(webauthnCredentials)).toBe('webauthn_credentials')
  })
})
```

- [ ] **Step 5: Ejecutar y comprobar que pasa**

Run: `pnpm test -- db/schema/households.test.ts`
Expected: 4 passed

- [ ] **Step 6: Commit**

```bash
git add db/schema/_types.ts db/schema/households.ts db/schema/index.ts db/schema/households.test.ts
git commit -m "Añade esquema de hogares, usuarios y sesiones"
```

### Task 2: Tablas `foods`, `unit_aliases`, `tags`

**Files:**
- Create: `db/schema/foods.ts`
- Modify: `db/schema/index.ts`
- Test: `db/schema/foods.test.ts`

**Interfaces:**
- Produces: `foods`, `unitAliases`, `tags`, tipos `Food`, `Tag`.

- [ ] **Step 1: Escribir `db/schema/foods.ts`**

```ts
import { sql } from 'drizzle-orm'
import { boolean, index, integer, numeric, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { baseUnitEnum, foodSourceEnum } from './_types'
import { households } from './households'

const qty = (name: string) => numeric(name, { precision: 12, scale: 3, mode: 'number' })

export const foods = pgTable(
  'foods',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    householdId: uuid('household_id').references(() => households.id), // null = global
    nameEs: text('name_es').notNull(),
    nameEn: text('name_en').notNull(),
    searchNameEs: text('search_name_es').notNull(), // sin acentos ni mayúsculas
    searchNameEn: text('search_name_en').notNull(),
    aliases: text('aliases').array().notNull().default(sql`'{}'::text[]`),
    defaultUnit: baseUnitEnum('default_unit').notNull().default('g'),
    kcal100g: qty('kcal_100g'),
    protein100g: qty('protein_100g'),
    carbs100g: qty('carbs_100g'),
    fat100g: qty('fat_100g'),
    fiber100g: qty('fiber_100g'),
    source: foodSourceEnum('source').notNull().default('manual'),
    sourceRef: text('source_ref'),
    barcode: text('barcode'),
    allergens: text('allergens').array().notNull().default(sql`'{}'::text[]`),
    gramsPerCup: qty('grams_per_cup'),
    gramsPerTbsp: qty('grams_per_tbsp'),
    gramsPerUnit: qty('grams_per_unit'),
    densityGPerMl: qty('density_g_per_ml'),
    seasonalMonths: integer('seasonal_months').array().notNull().default(sql`'{}'::int[]`),
    isEstimated: boolean('is_estimated').notNull().default(false),
    mergedIntoId: uuid('merged_into_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('foods_household_idx').on(t.householdId),
    index('foods_barcode_idx').on(t.barcode),
    index('foods_search_es_trgm_idx').using('gin', t.searchNameEs.op('gin_trgm_ops')),
    index('foods_search_en_trgm_idx').using('gin', t.searchNameEn.op('gin_trgm_ops')),
    uniqueIndex('foods_source_ref_uidx').on(t.source, t.sourceRef).where(sql`source_ref IS NOT NULL AND household_id IS NULL`),
  ],
)

export const unitAliases = pgTable(
  'unit_aliases',
  {
    alias: text('alias').notNull(),
    locale: text('locale').notNull(),
    unit: baseUnitEnum('unit').notNull(),
    factorToBase: qty('factor_to_base').notNull(),
  },
  (t) => [uniqueIndex('unit_aliases_alias_locale_uidx').on(t.alias, t.locale)],
)

export const tags = pgTable(
  'tags',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    householdId: uuid('household_id').references(() => households.id), // null = global (seed)
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    parentId: uuid('parent_id'),
  },
  (t) => [index('tags_household_idx').on(t.householdId), uniqueIndex('tags_household_slug_uidx').on(t.householdId, t.slug)],
)

export type Food = typeof foods.$inferSelect
export type Tag = typeof tags.$inferSelect
```

- [ ] **Step 2: Añadir `export * from './foods'` a `db/schema/index.ts`**

- [ ] **Step 3: Test**

`db/schema/foods.test.ts`:

```ts
import { getTableColumns } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { foods, unitAliases } from './foods'

describe('schema foods', () => {
  it('foods tiene nombres de búsqueda en ambos idiomas y conversiones por alimento', () => {
    const cols = Object.keys(getTableColumns(foods))
    expect(cols).toEqual(expect.arrayContaining(['searchNameEs', 'searchNameEn', 'gramsPerCup', 'gramsPerTbsp', 'gramsPerUnit', 'densityGPerMl', 'isEstimated', 'mergedIntoId']))
  })
  it('foods.household_id es nullable (global)', () => {
    expect(getTableColumns(foods).householdId.notNull).toBe(false)
  })
  it('unit_aliases factor es numérico obligatorio', () => {
    expect(getTableColumns(unitAliases).factorToBase.notNull).toBe(true)
  })
})
```

- [ ] **Step 4: Ejecutar**

Run: `pnpm test -- db/schema/foods.test.ts`
Expected: 3 passed

- [ ] **Step 5: Commit**

```bash
git add db/schema/foods.ts db/schema/index.ts db/schema/foods.test.ts
git commit -m "Añade esquema de alimentos, unidades y etiquetas"
```

### Task 3: Tablas de recetas

**Files:**
- Create: `db/schema/recipes.ts`
- Modify: `db/schema/index.ts`
- Test: `db/schema/recipes.test.ts`

**Interfaces:**
- Produces: `recipes`, `recipeIngredients`, `recipeSteps`, `recipeTags`, `collections`; tipos `Recipe`, `RecipeIngredient`, `RecipeStep`.

- [ ] **Step 1: Escribir `db/schema/recipes.ts`**

```ts
import { sql } from 'drizzle-orm'
import { boolean, index, integer, jsonb, numeric, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { baseUnitEnum, difficultyEnum, tsvector } from './_types'
import { foods, tags } from './foods'
import { households } from './households'

const qty = (name: string) => numeric(name, { precision: 12, scale: 3, mode: 'number' })

export const recipes = pgTable(
  'recipes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    householdId: uuid('household_id').notNull().references(() => households.id),
    title: text('title').notNull(),
    description: text('description'),
    servingsBase: integer('servings_base').notNull().default(2),
    prepMinutes: integer('prep_minutes'),
    cookMinutes: integer('cook_minutes'),
    difficulty: difficultyEnum('difficulty'),
    sourceUrl: text('source_url'),
    imageUrls: text('image_urls').array().notNull().default(sql`'{}'::text[]`),
    notes: text('notes'),
    yieldGrams: qty('yield_grams'),
    kcalPerServing: qty('kcal_per_serving'),
    proteinPerServing: qty('protein_per_serving'),
    carbsPerServing: qty('carbs_per_serving'),
    fatPerServing: qty('fat_per_serving'),
    fiberPerServing: qty('fiber_per_serving'),
    kcal100g: qty('kcal_100g'),
    nutritionIsEstimated: boolean('nutrition_is_estimated').notNull().default(false),
    timesCooked: integer('times_cooked').notNull().default(0),
    lastCookedAt: timestamp('last_cooked_at', { withTimezone: true }),
    // Índice full-text bilingüe: una columna generada no puede depender del locale del hogar
    searchVector: tsvector('search_vector').generatedAlwaysAs(
      sql`to_tsvector('spanish', coalesce(title, '') || ' ' || coalesce(description, '')) || to_tsvector('english', coalesce(title, '') || ' ' || coalesce(description, ''))`,
    ),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('recipes_household_idx').on(t.householdId),
    index('recipes_search_idx').using('gin', t.searchVector),
  ],
)

export const recipeIngredients = pgTable(
  'recipe_ingredients',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    recipeId: uuid('recipe_id').notNull().references(() => recipes.id, { onDelete: 'cascade' }),
    foodId: uuid('food_id').references(() => foods.id),
    rawText: text('raw_text').notNull(),
    quantity: qty('quantity'), // base; null si no hay conversión
    unit: baseUnitEnum('unit'),
    displayQuantity: qty('display_quantity'),
    displayUnit: text('display_unit'), // id canónico de units-data ('tsp', 'cup', 'clove'…) o null
    preparation: text('preparation'),
    groupLabel: text('group_label'),
    stepIndex: integer('step_index'),
    scalesLinearly: boolean('scales_linearly').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => [
    index('recipe_ingredients_recipe_idx').on(t.recipeId),
    index('recipe_ingredients_food_idx').on(t.foodId),
    index('recipe_ingredients_raw_text_idx').using('gin', sql`to_tsvector('simple', ${t.rawText})`),
  ],
)

export const recipeSteps = pgTable(
  'recipe_steps',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    recipeId: uuid('recipe_id').notNull().references(() => recipes.id, { onDelete: 'cascade' }),
    index: integer('index').notNull(),
    text: text('text').notNull(),
    timerSeconds: integer('timer_seconds'),
    imageUrl: text('image_url'),
  },
  (t) => [index('recipe_steps_recipe_idx').on(t.recipeId)],
)

export const recipeTags = pgTable(
  'recipe_tags',
  {
    recipeId: uuid('recipe_id').notNull().references(() => recipes.id, { onDelete: 'cascade' }),
    tagId: uuid('tag_id').notNull().references(() => tags.id),
  },
  (t) => [primaryKey({ columns: [t.recipeId, t.tagId] })],
)

export const collections = pgTable(
  'collections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    householdId: uuid('household_id').notNull().references(() => households.id),
    name: text('name').notNull(),
    query: jsonb('query').notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('collections_household_idx').on(t.householdId)],
)

export type Recipe = typeof recipes.$inferSelect
export type RecipeIngredient = typeof recipeIngredients.$inferSelect
export type RecipeStep = typeof recipeSteps.$inferSelect
```

- [ ] **Step 2: Añadir `export * from './recipes'` a `db/schema/index.ts`**

- [ ] **Step 3: Test**

`db/schema/recipes.test.ts`:

```ts
import { getTableColumns } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { recipeIngredients, recipes } from './recipes'

describe('schema recipes', () => {
  it('quantity y unit base son nullable; display siempre existe', () => {
    const c = getTableColumns(recipeIngredients)
    expect(c.quantity.notNull).toBe(false)
    expect(c.unit.notNull).toBe(false)
    expect(c.rawText.notNull).toBe(true)
    expect(c.scalesLinearly.default).toBe(true)
  })
  it('recipes lleva nutrición desnormalizada y soft delete', () => {
    const cols = Object.keys(getTableColumns(recipes))
    expect(cols).toEqual(expect.arrayContaining(['kcalPerServing', 'kcal100g', 'nutritionIsEstimated', 'yieldGrams', 'deletedAt', 'searchVector']))
  })
})
```

- [ ] **Step 4: Ejecutar** — Run: `pnpm test -- db/schema/recipes.test.ts` — Expected: 2 passed

- [ ] **Step 5: Commit**

```bash
git add db/schema/recipes.ts db/schema/index.ts db/schema/recipes.test.ts
git commit -m "Añade esquema de recetas"
```

### Task 4: Tablas de plan, despensa y cocina

**Files:**
- Create: `db/schema/plan.ts`
- Modify: `db/schema/index.ts`
- Test: `db/schema/plan.test.ts`

**Interfaces:**
- Produces: `mealPlanEntries`, `planProposals`, `pantryItems`, `cookingLog`; tipos `MealPlanEntry`, `PantryItemRow`, `PlanProposal`.

- [ ] **Step 1: Escribir `db/schema/plan.ts`**

```ts
import { sql } from 'drizzle-orm'
import { check, date, index, integer, jsonb, numeric, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { baseUnitEnum, mealSlotEnum, pantryLocationEnum, proposalSourceEnum, proposalStatusEnum } from './_types'
import { foods } from './foods'
import { households, users } from './households'
import { recipes } from './recipes'

const qty = (name: string) => numeric(name, { precision: 12, scale: 3, mode: 'number' })

export const mealPlanEntries = pgTable(
  'meal_plan_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    householdId: uuid('household_id').notNull().references(() => households.id),
    date: date('date').notNull(),
    slot: mealSlotEnum('slot').notNull(),
    recipeId: uuid('recipe_id').references(() => recipes.id),
    customTitle: text('custom_title'),
    servings: integer('servings').notNull(),
    leftoverOfEntryId: uuid('leftover_of_entry_id'),
    timeBudgetMinutes: integer('time_budget_minutes'),
    cookedAt: timestamp('cooked_at', { withTimezone: true }),
    skippedAt: timestamp('skipped_at', { withTimezone: true }),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('meal_plan_entries_household_date_idx').on(t.householdId, t.date),
    check('meal_plan_entries_title_or_recipe', sql`recipe_id IS NOT NULL OR custom_title IS NOT NULL`),
  ],
)

export const planProposals = pgTable(
  'plan_proposals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    householdId: uuid('household_id').notNull().references(() => households.id),
    createdByUserId: uuid('created_by_user_id').references(() => users.id),
    createdByTokenId: uuid('created_by_token_id'), // FK a api_tokens se añade en tokens.ts vía SQL de migración (evita import circular)
    source: proposalSourceEnum('source').notNull(),
    payload: jsonb('payload').notNull(),
    status: proposalStatusEnum('status').notNull().default('pending'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    resolvedByUserId: uuid('resolved_by_user_id').references(() => users.id),
  },
  (t) => [
    index('plan_proposals_household_status_idx').on(t.householdId, t.status),
    check('plan_proposals_one_creator', sql`(created_by_user_id IS NOT NULL) <> (created_by_token_id IS NOT NULL)`),
  ],
)

export const pantryItems = pgTable(
  'pantry_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    householdId: uuid('household_id').notNull().references(() => households.id),
    foodId: uuid('food_id').notNull().references(() => foods.id),
    quantity: qty('quantity').notNull(),
    unit: baseUnitEnum('unit').notNull(),
    location: pantryLocationEnum('location').notNull().default('pantry'),
    expiresAt: date('expires_at'),
    openedAt: timestamp('opened_at', { withTimezone: true }),
    addedAt: timestamp('added_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('pantry_items_household_food_idx').on(t.householdId, t.foodId),
    index('pantry_items_household_expires_idx').on(t.householdId, t.expiresAt),
    check('pantry_items_quantity_nonnegative', sql`quantity >= 0`),
  ],
)

export const cookingLog = pgTable(
  'cooking_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    householdId: uuid('household_id').notNull().references(() => households.id),
    recipeId: uuid('recipe_id').notNull().references(() => recipes.id),
    entryId: uuid('entry_id').references(() => mealPlanEntries.id),
    servingsCooked: integer('servings_cooked').notNull(),
    cookedAt: timestamp('cooked_at', { withTimezone: true }).notNull().defaultNow(),
    kcalPerServingSnapshot: qty('kcal_per_serving_snapshot'),
    pantryDeductions: jsonb('pantry_deductions').notNull().default(sql`'[]'::jsonb`),
    warnings: jsonb('warnings').notNull().default(sql`'[]'::jsonb`),
  },
  (t) => [index('cooking_log_household_cooked_idx').on(t.householdId, t.cookedAt)],
)

export type MealPlanEntry = typeof mealPlanEntries.$inferSelect
export type PantryItemRow = typeof pantryItems.$inferSelect
export type PlanProposal = typeof planProposals.$inferSelect
```

- [ ] **Step 2: Añadir `export * from './plan'` a `db/schema/index.ts`**

- [ ] **Step 3: Test**

`db/schema/plan.test.ts`:

```ts
import { getTableColumns } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { cookingLog, mealPlanEntries, planProposals } from './plan'

describe('schema plan', () => {
  it('entradas del plan tienen cooked_at y skipped_at', () => {
    const cols = Object.keys(getTableColumns(mealPlanEntries))
    expect(cols).toEqual(expect.arrayContaining(['cookedAt', 'skippedAt', 'leftoverOfEntryId', 'servings']))
  })
  it('propuestas distinguen usuario y token creador', () => {
    const cols = Object.keys(getTableColumns(planProposals))
    expect(cols).toEqual(expect.arrayContaining(['createdByUserId', 'createdByTokenId', 'source']))
  })
  it('cooking_log guarda descuentos y avisos', () => {
    expect(Object.keys(getTableColumns(cookingLog))).toEqual(expect.arrayContaining(['pantryDeductions', 'warnings', 'kcalPerServingSnapshot']))
  })
})
```

- [ ] **Step 4: Ejecutar** — Run: `pnpm test -- db/schema/plan.test.ts` — Expected: 3 passed

- [ ] **Step 5: Commit**

```bash
git add db/schema/plan.ts db/schema/index.ts db/schema/plan.test.ts
git commit -m "Añade esquema de plan, despensa y registro de cocina"
```

### Task 5: Tokens, IA, push; migración inicial con `pg_trgm`; `scripts/migrate.ts`; test de invariantes en Postgres

**Files:**
- Create: `db/schema/tokens.ts`, `db/types.ts`, `db/migrations/0000_inicial.sql` (generado), `db/test/setup.ts`, `db/schema/invariants.test.ts`
- Modify: `db/schema/index.ts`, `scripts/migrate.ts` (W0 lo dejó funcional; aquí se exporta `runMigrations`). `drizzle.config.ts` y los scripts `db:*` de `package.json` **ya existen desde W0 Task 7**: no tocarlos.

**Interfaces:**
- Produces: `apiTokens`, `aiUsageLog`, `pushSubscriptions`; tipo `Db` en `db/types.ts` (conexión **o transacción**, para que los servicios acepten `tx`); `runMigrations(databaseUrl)` en `scripts/migrate.ts`; `truncateAll(db)` en `db/test/setup.ts`.

- [ ] **Step 1: Escribir `db/schema/tokens.ts`**

```ts
import { sql } from 'drizzle-orm'
import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { mcpProfileEnum } from './_types'
import { households, users } from './households'

export const API_SCOPES = [
  'recipes:read', 'recipes:write', 'plan:read', 'plan:write', 'pantry:read', 'pantry:write',
  'cooking:write', 'shopping:push', 'household:read',
] as const
export type ApiScope = (typeof API_SCOPES)[number]

export const apiTokens = pgTable(
  'api_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    householdId: uuid('household_id').notNull().references(() => households.id),
    userId: uuid('user_id').notNull().references(() => users.id),
    name: text('name').notNull(),
    tokenHash: text('token_hash').notNull(), // sha256 hex del token completo
    scopes: text('scopes').array().notNull().default(sql`'{}'::text[]`),
    mcpProfile: mcpProfileEnum('mcp_profile').notNull().default('basic'),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => [index('api_tokens_household_idx').on(t.householdId), uniqueIndex('api_tokens_hash_uidx').on(t.tokenHash)],
)

export const aiUsageLog = pgTable(
  'ai_usage_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    householdId: uuid('household_id').notNull().references(() => households.id),
    provider: text('provider').notNull(),
    model: text('model').notNull(),
    operation: text('operation').notNull(),
    tokensIn: integer('tokens_in').notNull().default(0),
    tokensOut: integer('tokens_out').notNull().default(0),
    costCents: integer('cost_cents').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('ai_usage_log_household_created_idx').on(t.householdId, t.createdAt)],
)

export const pushSubscriptions = pgTable(
  'push_subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id),
    endpoint: text('endpoint').notNull().unique(),
    keys: jsonb('keys').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('push_subscriptions_user_idx').on(t.userId)],
)

export type ApiToken = typeof apiTokens.$inferSelect
```

- [ ] **Step 2: Completar `db/schema/index.ts`**

```ts
export * from './_types'
export * from './households'
export * from './foods'
export * from './recipes'
export * from './plan'
export * from './tokens'
```

- [ ] **Step 3: `db/types.ts`**

`db/types.ts`:

```ts
import type { ExtractTablesWithRelations } from 'drizzle-orm'
import type { NodePgDatabase, NodePgQueryResultHKT } from 'drizzle-orm/node-postgres'
import type { PgTransaction } from 'drizzle-orm/pg-core'
import type * as schema from './schema'

// Conexión o transacción: toda función de servicio acepta ambas para poder componerse dentro de db.transaction()
export type Db = NodePgDatabase<typeof schema> | PgTransaction<NodePgQueryResultHKT, typeof schema, ExtractTablesWithRelations<typeof schema>>
```

`drizzle.config.ts`, `tsx` y los scripts `db:generate` / `db:migrate` / `db:seed` vienen de W0 Task 7; comprobar que existen con `cat drizzle.config.ts && pnpm db:migrate` antes de seguir.

- [ ] **Step 4: Generar la migración y añadir extensión + FK diferida**

Run: `pnpm db:generate --name inicial`
Expected: crea `db/migrations/0000_inicial.sql` y `db/migrations/meta/*`.

Editar `db/migrations/0000_inicial.sql`: insertar como **primera línea** `CREATE EXTENSION IF NOT EXISTS pg_trgm;` seguida de `--> statement-breakpoint`. Al **final** del fichero añadir:

```sql
--> statement-breakpoint
ALTER TABLE "plan_proposals" ADD CONSTRAINT "plan_proposals_created_by_token_id_fk" FOREIGN KEY ("created_by_token_id") REFERENCES "api_tokens"("id");
--> statement-breakpoint
ALTER TABLE "meal_plan_entries" ADD CONSTRAINT "meal_plan_entries_leftover_fk" FOREIGN KEY ("leftover_of_entry_id") REFERENCES "meal_plan_entries"("id");
--> statement-breakpoint
ALTER TABLE "foods" ADD CONSTRAINT "foods_merged_into_fk" FOREIGN KEY ("merged_into_id") REFERENCES "foods"("id");
--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "tags"("id");
```

(Las autorreferencias y la FK cruzada se escriben a mano en SQL para evitar imports circulares en TypeScript; drizzle-kit no las regenera porque el snapshot no las conoce — **documentar esto en `db/migrations/README.md`** con una línea: "las FKs de este bloque se mantienen a mano; al regenerar, conservarlas".)

- [ ] **Step 5: `scripts/migrate.ts`**

```ts
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { Pool } from 'pg'
import path from 'node:path'

// Aplica db/migrations con el migrador de drizzle-orm: no requiere drizzle-kit en runtime
export async function runMigrations(databaseUrl: string): Promise<void> {
  const pool = new Pool({ connectionString: databaseUrl })
  const db = drizzle(pool)
  try {
    await migrate(db, { migrationsFolder: path.join(process.cwd(), 'db', 'migrations') })
  } finally {
    await pool.end()
  }
}

if (process.argv[1]?.endsWith('migrate.ts') || process.argv[1]?.endsWith('migrate.js')) {
  const url = process.env.DATABASE_URL
  if (!url) {
    console.error('Falta DATABASE_URL')
    process.exit(1)
  }
  runMigrations(url).then(() => console.log('Migraciones aplicadas'))
}
```

- [ ] **Step 6: `db/test/setup.ts`**

```ts
import { sql } from 'drizzle-orm'
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from '@/db/schema'
import { runMigrations } from '@/scripts/migrate'

export type TestDb = NodePgDatabase<typeof schema>

const CONTENT_TABLES = [
  'cooking_log', 'plan_proposals', 'meal_plan_entries', 'pantry_items', 'recipe_tags', 'recipe_ingredients',
  'recipe_steps', 'recipes', 'collections', 'api_tokens', 'ai_usage_log', 'push_subscriptions',
  'webauthn_challenges', 'webauthn_credentials', 'sessions', 'household_invites', 'household_members',
  'tags', 'foods', 'users', 'households', 'app_settings',
]

let pool: Pool | null = null

// Devuelve una conexión a DATABASE_URL_TEST con migraciones aplicadas
export async function getTestDb(): Promise<TestDb> {
  const url = process.env.DATABASE_URL_TEST
  if (!url) throw new Error('Falta DATABASE_URL_TEST')
  if (!pool) {
    await runMigrations(url)
    pool = new Pool({ connectionString: url })
  }
  return drizzle(pool, { schema })
}

export async function truncateAll(db: TestDb): Promise<void> {
  await db.execute(sql.raw(`TRUNCATE ${CONTENT_TABLES.map((t) => `"${t}"`).join(', ')} CASCADE`))
}

export async function closeTestDb(): Promise<void> {
  await pool?.end()
  pool = null
}
```

- [ ] **Step 7: Test de invariantes contra Postgres real**

`db/schema/invariants.test.ts`:

```ts
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closeTestDb, getTestDb, type TestDb } from '@/db/test/setup'

// Tablas de contenido: TODAS llevan household_id (foods y tags nullable = global)
const CONTENT = ['recipes', 'recipe_ingredients', 'recipe_steps', 'meal_plan_entries', 'pantry_items', 'cooking_log', 'plan_proposals', 'api_tokens', 'ai_usage_log', 'collections', 'foods', 'tags']
const VIA_PARENT = new Set(['recipe_ingredients', 'recipe_steps']) // household_id a través de recipe_id

let db: TestDb
beforeAll(async () => { db = await getTestDb() })
afterAll(closeTestDb)

describe('invariantes del esquema', () => {
  it('pg_trgm instalado', async () => {
    const r = await db.execute(sql`SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm'`)
    expect(r.rows.length).toBe(1)
  })
  it('household_id en toda tabla de contenido', async () => {
    for (const table of CONTENT) {
      if (VIA_PARENT.has(table)) continue
      const r = await db.execute(sql`SELECT is_nullable FROM information_schema.columns WHERE table_name = ${table} AND column_name = 'household_id'`)
      expect(r.rows.length, `${table} sin household_id`).toBe(1)
      const nullable = (r.rows[0] as { is_nullable: string }).is_nullable
      expect(nullable).toBe(table === 'foods' || table === 'tags' ? 'YES' : 'NO')
    }
  })
  it('ninguna FK a households tiene ON DELETE CASCADE', async () => {
    const r = await db.execute(sql`
      SELECT tc.table_name, rc.delete_rule FROM information_schema.referential_constraints rc
      JOIN information_schema.table_constraints tc ON tc.constraint_name = rc.constraint_name
      JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = rc.unique_constraint_name
      WHERE ccu.table_name = 'households'`)
    for (const row of r.rows as { table_name: string; delete_rule: string }[]) {
      expect(row.delete_rule, row.table_name).not.toBe('CASCADE')
    }
  })
  it('índices trigram sobre foods.search_name_es/en', async () => {
    const r = await db.execute(sql`SELECT indexname FROM pg_indexes WHERE tablename = 'foods' AND indexdef LIKE '%gin_trgm_ops%'`)
    expect(r.rows.length).toBe(2)
  })
  it('pantry_items rechaza cantidades negativas', async () => {
    await expect(db.execute(sql`INSERT INTO pantry_items (household_id, food_id, quantity, unit) VALUES (gen_random_uuid(), gen_random_uuid(), -1, 'g')`)).rejects.toThrow()
  })
})
```

- [ ] **Step 8: Levantar Postgres de test y ejecutar**

Run:
```bash
docker compose up -d db
psql "postgres://rezetapp:rezetapp@localhost:5432/rezetapp" -c 'CREATE DATABASE rezetapp_test' 2>/dev/null || docker compose exec db psql -U rezetapp -c 'CREATE DATABASE rezetapp_test'
DATABASE_URL_TEST=postgres://rezetapp:rezetapp@localhost:5432/rezetapp_test pnpm test -- db/schema/invariants.test.ts
```
Expected: 5 passed. (Añadir `DATABASE_URL_TEST` a `.env.example` y al `vitest.config.ts` de W0 si no carga `.env.test`.)

- [ ] **Step 9: Commit**

```bash
git add db/schema/tokens.ts db/schema/index.ts db/types.ts drizzle.config.ts db/migrations scripts/migrate.ts db/test/setup.ts db/schema/invariants.test.ts package.json pnpm-lock.yaml .env.example
git commit -m "Completa esquema, migración inicial y migrador en runtime"
```

### Task 6: Seed idempotente de `unit_aliases` y etiquetas

**Files:**
- Create: `db/seed/tags.json`, `scripts/seed.ts` (sustituye el vacío de W0)
- Test: `scripts/seed.test.ts`
- Depende de: `lib/domain/units-data.ts` (Tarea 8). Si la pista (b) va por detrás, ejecutar esta tarea después de la 8.

**Interfaces:**
- Consumes: `UNIT_ALIASES` de `@/lib/domain/units-data` (`{ alias, locale, unit, factorToBase }[]`).
- Produces: `seedAll(db)`, `seedUnitAliases(db)`, `seedTags(db)`, `seedFoods(db)` (la última se rellena en Tarea 7).

- [ ] **Step 1: `db/seed/tags.json`** (etiquetas globales jerárquicas; `slug` único, `parent` = slug del padre)

```json
[
  { "slug": "tipo", "name": { "es": "Tipo de plato", "en": "Dish type" }, "parent": null },
  { "slug": "desayuno", "name": { "es": "Desayuno", "en": "Breakfast" }, "parent": "tipo" },
  { "slug": "primero", "name": { "es": "Primero", "en": "Starter" }, "parent": "tipo" },
  { "slug": "principal", "name": { "es": "Principal", "en": "Main" }, "parent": "tipo" },
  { "slug": "guarnicion", "name": { "es": "Guarnición", "en": "Side" }, "parent": "tipo" },
  { "slug": "postre", "name": { "es": "Postre", "en": "Dessert" }, "parent": "tipo" },
  { "slug": "snack", "name": { "es": "Picoteo", "en": "Snack" }, "parent": "tipo" },
  { "slug": "dieta", "name": { "es": "Dieta", "en": "Diet" }, "parent": null },
  { "slug": "vegetariano", "name": { "es": "Vegetariano", "en": "Vegetarian" }, "parent": "dieta" },
  { "slug": "vegano", "name": { "es": "Vegano", "en": "Vegan" }, "parent": "dieta" },
  { "slug": "sin-gluten", "name": { "es": "Sin gluten", "en": "Gluten-free" }, "parent": "dieta" },
  { "slug": "sin-lactosa", "name": { "es": "Sin lactosa", "en": "Dairy-free" }, "parent": "dieta" },
  { "slug": "tecnica", "name": { "es": "Técnica", "en": "Technique" }, "parent": null },
  { "slug": "horno", "name": { "es": "Horno", "en": "Oven" }, "parent": "tecnica" },
  { "slug": "olla", "name": { "es": "Olla / guiso", "en": "Stew" }, "parent": "tecnica" },
  { "slug": "sarten", "name": { "es": "Sartén", "en": "Pan" }, "parent": "tecnica" },
  { "slug": "sin-cocinar", "name": { "es": "Sin cocinar", "en": "No-cook" }, "parent": "tecnica" },
  { "slug": "batch", "name": { "es": "Batch cooking", "en": "Batch cooking" }, "parent": "tecnica" },
  { "slug": "rapido", "name": { "es": "Rápido (<20 min)", "en": "Quick (<20 min)" }, "parent": null },
  { "slug": "fiambrera", "name": { "es": "Para llevar", "en": "Lunchbox" }, "parent": null }
]
```

- [ ] **Step 2: Escribir `scripts/seed.ts`** (requiere `resolveJsonModule: true` en `tsconfig.json`; W0 lo activa, si no, activarlo aquí)

```ts
import { and, eq, isNull, sql } from 'drizzle-orm'
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from '@/db/schema'
import { UNIT_ALIASES } from '@/lib/domain/units-data'
import tagsSeed from '@/db/seed/tags.json'

type Db = NodePgDatabase<typeof schema>
type TagSeed = { slug: string; name: { es: string; en: string }; parent: string | null }

// Todo el seed es idempotente: upsert por clave natural
export async function seedUnitAliases(db: Db): Promise<number> {
  const rows = UNIT_ALIASES.map((u) => ({ alias: u.alias, locale: u.locale, unit: u.unit, factorToBase: u.factorToBase }))
  await db
    .insert(schema.unitAliases)
    .values(rows)
    .onConflictDoUpdate({
      target: [schema.unitAliases.alias, schema.unitAliases.locale],
      set: { unit: sql`excluded.unit`, factorToBase: sql`excluded.factor_to_base` },
    })
  return rows.length
}

export async function seedTags(db: Db): Promise<number> {
  const list = tagsSeed as TagSeed[]
  const idBySlug = new Map<string, string>()
  // Padres primero (parent null), luego hijos; dos pasadas bastan porque la jerarquía tiene dos niveles
  for (const pass of [0, 1]) {
    for (const t of list) {
      if ((t.parent === null) !== (pass === 0)) continue
      const parentId = t.parent ? (idBySlug.get(t.parent) ?? null) : null
      const [row] = await db
        .insert(schema.tags)
        .values({ householdId: null, slug: t.slug, name: t.name.es, parentId })
        .onConflictDoUpdate({ target: [schema.tags.householdId, schema.tags.slug], set: { name: t.name.es, parentId } })
        .returning({ id: schema.tags.id })
      if (row) idBySlug.set(t.slug, row.id)
    }
  }
  return list.length
}

// Se implementa en la Tarea 7
export async function seedFoods(db: Db): Promise<number> {
  return 0
}

export async function seedAll(db: Db): Promise<{ units: number; tags: number; foods: number }> {
  const units = await seedUnitAliases(db)
  const tags = await seedTags(db)
  const foods = await seedFoods(db)
  return { units, tags, foods }
}

if (process.argv[1]?.endsWith('seed.ts') || process.argv[1]?.endsWith('seed.js')) {
  const url = process.env.DATABASE_URL
  if (!url) {
    console.error('Falta DATABASE_URL')
    process.exit(1)
  }
  const pool = new Pool({ connectionString: url })
  seedAll(drizzle(pool, { schema }))
    .then((r) => console.log(`Seed: ${r.units} unidades, ${r.tags} etiquetas, ${r.foods} alimentos`))
    .finally(() => pool.end())
}
```

Nota: el índice único de `tags` es `(household_id, slug)`; en Postgres dos `NULL` no colisionan, así que para que el upsert de etiquetas globales funcione hay que declarar el índice con `NULLS NOT DISTINCT`. Añadir a la migración `0000_inicial.sql` (bloque manual del final): `DROP INDEX IF EXISTS "tags_household_slug_uidx"; CREATE UNIQUE INDEX "tags_household_slug_uidx" ON "tags" ("household_id", "slug") NULLS NOT DISTINCT;` y la misma nota en `db/migrations/README.md`.

- [ ] **Step 3: Test de idempotencia**

`scripts/seed.test.ts`:

```ts
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { closeTestDb, getTestDb, truncateAll, type TestDb } from '@/db/test/setup'
import { seedTags, seedUnitAliases } from './seed'

let db: TestDb
beforeAll(async () => { db = await getTestDb() })
beforeEach(async () => { await truncateAll(db) })
afterAll(closeTestDb)

describe('seed', () => {
  it('unit_aliases se puede ejecutar dos veces sin duplicar', async () => {
    const n = await seedUnitAliases(db)
    await seedUnitAliases(db)
    const r = await db.execute(sql`SELECT count(*)::int AS c FROM unit_aliases`)
    expect((r.rows[0] as { c: number }).c).toBe(n)
  })
  it('tags crea jerarquía y es idempotente', async () => {
    await seedTags(db)
    await seedTags(db)
    const r = await db.execute(sql`SELECT count(*)::int AS c, count(parent_id)::int AS children FROM tags WHERE household_id IS NULL`)
    const row = r.rows[0] as { c: number; children: number }
    expect(row.c).toBe(20)
    expect(row.children).toBe(15)
  })
})
```

- [ ] **Step 4: Ejecutar** — Run: `pnpm test -- scripts/seed.test.ts` — Expected: 2 passed

- [ ] **Step 5: Commit**

```bash
git add db/seed/tags.json scripts/seed.ts scripts/seed.test.ts db/migrations
git commit -m "Añade seed idempotente de unidades y etiquetas"
```

### Task 7: Seed de alimentos (~800) reproducible

**Files:**
- Create: `db/seed/foods-keywords.json`, `db/seed/foods-translations.json`, `db/seed/foods.json`, `scripts/build-foods-seed.ts`, `scripts/translate-foods.ts`, `db/seed/README.md`
- Modify: `scripts/seed.ts` (`seedFoods`)
- Test: `scripts/build-foods-seed.test.ts`

**Interfaces:**
- Produces: `db/seed/foods.json` con `FoodSeed[]`; `seedFoods(db)` upsert por `(source='usda', source_ref=fdcId)`.

Formato de `db/seed/foods.json` (una entrada):

```json
{
  "sourceRef": "170393",
  "nameEn": "Onions, raw",
  "nameEs": "Cebolla",
  "aliases": ["cebolla blanca", "cebolla amarilla", "onion"],
  "defaultUnit": "g",
  "kcal100g": 40, "protein100g": 1.1, "carbs100g": 9.34, "fat100g": 0.1, "fiber100g": 1.7,
  "gramsPerCup": 160, "gramsPerTbsp": null, "gramsPerUnit": 150, "densityGPerMl": null,
  "allergens": [], "seasonalMonths": []
}
```

Criterio de selección (documentado en `db/seed/README.md`): USDA FoodData Central, tipos **Foundation** y **SR Legacy** (dominio público). Se descarga el JSON completo de `https://fdc.nal.usda.gov/download-datasets` (ficheros `FoodData_Central_foundation_food_json_*.zip` y `FoodData_Central_sr_legacy_food_json_*.zip`), se descomprime en `./data/usda/` (ignorado por git). `build-foods-seed.ts` conserva los alimentos cuya `description` en minúsculas **empieza** por una palabra clave de `foods-keywords.json` y **no contiene** ninguna de las exclusiones (`baby food`, `fast foods`, `restaurant`, `infant`, `formula`, `snacks`, `candies`, `babyfood`), y prefiere la variante `raw` cuando hay varias con la misma palabra clave (máx. 3 por palabra clave). Nutrientes por id: 1008 kcal, 1003 proteína, 1005 carbohidratos, 1004 grasa, 1079 fibra. `foods-translations.json` mapea `sourceRef → { nameEs, aliases, gramsPerCup, gramsPerTbsp, gramsPerUnit, densityGPerMl, allergens, seasonalMonths }`; su primera versión la genera `translate-foods.ts` con un modelo de lenguaje (Ollama local vía API compatible con OpenAI) **una sola vez**, y después se mantiene a mano y se versiona: el script nunca sobrescribe entradas existentes.

- [ ] **Step 1: `db/seed/foods-keywords.json`** (~230 palabras clave en inglés, ordenadas por grupo; el script las usa como prefijo de `description`)

```json
{
  "exclude": ["baby food", "babyfood", "fast foods", "restaurant", "infant", "formula", "snacks", "candies", "school lunch", "usda commodity"],
  "keywords": [
    "onions", "garlic", "leeks", "shallots", "scallions", "tomatoes", "peppers, sweet", "peppers, hot", "carrots", "potatoes", "sweet potato", "pumpkin", "squash, winter", "squash, summer", "zucchini", "eggplant", "cucumber", "lettuce", "spinach", "chard", "kale", "cabbage", "cauliflower", "broccoli", "brussels sprouts", "artichokes", "asparagus", "green beans", "beans, snap", "peas, green", "corn, sweet", "mushrooms", "celery", "fennel", "beets", "radishes", "turnips", "parsnips", "endive", "arugula", "watercress", "avocados", "olives",
    "apples", "pears", "bananas", "oranges", "tangerines", "lemons", "limes", "grapefruit", "grapes", "strawberries", "raspberries", "blueberries", "blackberries", "cherries", "peaches", "nectarines", "apricots", "plums", "figs", "melons", "watermelon", "pineapple", "mango", "kiwifruit", "papayas", "pomegranates", "persimmons", "quinces", "dates", "raisins", "prunes", "coconut",
    "beef, ground", "beef, loin", "beef, chuck", "beef, round", "beef, rib", "veal", "pork, fresh, loin", "pork, fresh, shoulder", "pork, fresh, belly", "pork, cured, ham", "pork, cured, bacon", "lamb", "chicken, broiler", "chicken, breast", "chicken, thigh", "chicken, drumstick", "chicken, wing", "turkey", "duck", "rabbit", "sausage", "chorizo", "salami", "frankfurter", "liver",
    "fish, cod", "fish, hake", "fish, salmon", "fish, tuna", "fish, sardine", "fish, anchovy", "fish, mackerel", "fish, trout", "fish, sea bass", "fish, seabream", "fish, sole", "fish, swordfish", "fish, monkfish", "fish, tilapia", "mollusks, squid", "mollusks, octopus", "mollusks, mussel", "mollusks, clam", "mollusks, oyster", "mollusks, scallop", "crustaceans, shrimp", "crustaceans, crab", "crustaceans, lobster", "surimi",
    "egg, whole", "egg, white", "egg, yolk", "milk, whole", "milk, reduced fat", "milk, nonfat", "milk, goat", "cream, fluid", "cream, sour", "cream, whipped", "yogurt", "kefir", "cheese, mozzarella", "cheese, parmesan", "cheese, cheddar", "cheese, feta", "cheese, goat", "cheese, ricotta", "cheese, cottage", "cheese, cream", "cheese, brie", "cheese, blue", "cheese, gouda", "cheese, edam", "cheese, swiss", "cheese, provolone", "cheese, manchego", "butter", "margarine",
    "wheat flour", "flour, whole wheat", "bread, white", "bread, whole-wheat", "bread crumbs", "pasta, dry", "pasta, whole-wheat", "noodles", "couscous", "rice, white", "rice, brown", "rice, arborio", "quinoa", "oats", "barley", "bulgur", "cornmeal", "cornstarch", "semolina", "polenta", "tortillas", "crackers", "cereals ready-to-eat",
    "beans, kidney", "beans, white", "beans, black", "beans, pinto", "chickpeas", "lentils", "peas, split", "soybeans", "tofu", "tempeh", "edamame", "hummus",
    "nuts, almonds", "nuts, walnuts", "nuts, hazelnuts", "nuts, pistachio", "nuts, cashew", "nuts, pine nuts", "peanuts", "seeds, sunflower", "seeds, pumpkin", "seeds, sesame", "seeds, chia", "seeds, flaxseed", "peanut butter", "tahini",
    "oil, olive", "oil, sunflower", "oil, canola", "oil, coconut", "oil, sesame", "lard", "vinegar", "mayonnaise", "mustard", "ketchup", "soy sauce", "tomato products, canned, sauce", "tomato products, canned, paste", "tomatoes, crushed", "salsa", "pesto", "broth, chicken", "broth, beef", "broth, vegetable", "stock",
    "salt, table", "spices, pepper, black", "spices, paprika", "spices, cumin", "spices, oregano", "spices, thyme", "spices, rosemary", "spices, bay leaf", "spices, cinnamon", "spices, nutmeg", "spices, cloves", "spices, ginger", "spices, turmeric", "spices, curry powder", "spices, coriander", "spices, saffron", "spices, chili powder", "spices, garlic powder", "spices, onion powder", "spices, parsley", "spices, basil", "spices, dill", "spices, mint", "spices, cardamom", "spices, anise", "spices, fennel seed", "spices, mustard seed", "spices, caraway", "parsley, fresh", "basil, fresh", "cilantro", "mint, fresh", "dill weed, fresh", "chives", "ginger root", "vanilla extract",
    "sugars, granulated", "sugars, brown", "sugars, powdered", "honey", "syrups, maple", "molasses", "chocolate, dark", "cocoa, dry powder", "chocolate chips", "jams", "gelatin", "leavening agents, baking powder", "leavening agents, baking soda", "leavening agents, yeast",
    "wine, table, red", "wine, table, white", "beer", "alcoholic beverage, distilled", "coffee, brewed", "tea, brewed", "water, tap", "orange juice", "apple juice", "beverages, almond milk", "beverages, soy milk", "beverages, oat milk", "coconut milk"
  ]
}
```

- [ ] **Step 2: `scripts/build-foods-seed.ts`**

```ts
import fs from 'node:fs'
import path from 'node:path'

// Construye db/seed/foods.json a partir de las descargas de USDA FoodData Central (Foundation + SR Legacy)
// y de db/seed/foods-translations.json (mantenido a mano). Uso: pnpm tsx scripts/build-foods-seed.ts --input ./data/usda

type UsdaNutrient = { nutrient: { id: number }; amount?: number }
type UsdaFood = { fdcId: number; description: string; foodNutrients: UsdaNutrient[]; dataType: string }
type Keywords = { exclude: string[]; keywords: string[] }
export type Translation = {
  nameEs: string; aliases: string[]; gramsPerCup: number | null; gramsPerTbsp: number | null; gramsPerUnit: number | null
  densityGPerMl: number | null; allergens: string[]; seasonalMonths: number[]
}
export type FoodSeed = Translation & {
  sourceRef: string; nameEn: string; defaultUnit: 'g' | 'ml' | 'ud'
  kcal100g: number | null; protein100g: number | null; carbs100g: number | null; fat100g: number | null; fiber100g: number | null
}

const NUTRIENT = { kcal: 1008, protein: 1003, carbs: 1005, fat: 1004, fiber: 1079 } as const
const LIQUID_HINTS = ['milk', 'juice', 'oil', 'broth', 'stock', 'vinegar', 'wine', 'beer', 'coffee', 'tea', 'water', 'cream, fluid', 'beverages', 'soy sauce', 'syrup']

function nutrient(f: UsdaFood, id: number): number | null {
  const n = f.foodNutrients.find((x) => x.nutrient.id === id)
  return n?.amount ?? null
}

export function selectFoods(all: UsdaFood[], kw: Keywords, maxPerKeyword = 3): { keyword: string; food: UsdaFood }[] {
  const out: { keyword: string; food: UsdaFood }[] = []
  const taken = new Set<number>()
  for (const keyword of kw.keywords) {
    const candidates = all
      .filter((f) => {
        const d = f.description.toLowerCase()
        return d.startsWith(keyword) && !kw.exclude.some((e) => d.includes(e)) && !taken.has(f.fdcId)
      })
      // Preferir crudo, luego Foundation sobre SR Legacy, luego descripción corta
      .sort((a, b) => {
        const rawA = a.description.toLowerCase().includes('raw') ? 0 : 1
        const rawB = b.description.toLowerCase().includes('raw') ? 0 : 1
        if (rawA !== rawB) return rawA - rawB
        if (a.dataType !== b.dataType) return a.dataType === 'Foundation' ? -1 : 1
        return a.description.length - b.description.length
      })
      .slice(0, maxPerKeyword)
    for (const food of candidates) {
      taken.add(food.fdcId)
      out.push({ keyword, food })
    }
  }
  return out
}

export function toSeed(food: UsdaFood, keyword: string, tr: Translation | undefined): FoodSeed {
  const liquid = LIQUID_HINTS.some((h) => keyword.startsWith(h))
  return {
    sourceRef: String(food.fdcId),
    nameEn: food.description,
    nameEs: tr?.nameEs ?? food.description, // sin traducción aún: se ve el inglés y se marca en README
    aliases: tr?.aliases ?? [],
    defaultUnit: liquid ? 'ml' : 'g',
    kcal100g: nutrient(food, NUTRIENT.kcal),
    protein100g: nutrient(food, NUTRIENT.protein),
    carbs100g: nutrient(food, NUTRIENT.carbs),
    fat100g: nutrient(food, NUTRIENT.fat),
    fiber100g: nutrient(food, NUTRIENT.fiber),
    gramsPerCup: tr?.gramsPerCup ?? null,
    gramsPerTbsp: tr?.gramsPerTbsp ?? null,
    gramsPerUnit: tr?.gramsPerUnit ?? null,
    densityGPerMl: tr?.densityGPerMl ?? (liquid ? 1 : null),
    allergens: tr?.allergens ?? [],
    seasonalMonths: tr?.seasonalMonths ?? [],
  }
}

function readUsda(dir: string): UsdaFood[] {
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'))
  const all: UsdaFood[] = []
  for (const file of files) {
    const json = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')) as Record<string, UsdaFood[]>
    for (const list of Object.values(json)) if (Array.isArray(list)) all.push(...list)
  }
  return all
}

if (process.argv[1]?.endsWith('build-foods-seed.ts')) {
  const idx = process.argv.indexOf('--input')
  const input = idx >= 0 ? process.argv[idx + 1] : './data/usda'
  if (!input) throw new Error('Falta --input')
  const seedDir = path.join(process.cwd(), 'db', 'seed')
  const kw = JSON.parse(fs.readFileSync(path.join(seedDir, 'foods-keywords.json'), 'utf8')) as Keywords
  const translations = JSON.parse(fs.readFileSync(path.join(seedDir, 'foods-translations.json'), 'utf8')) as Record<string, Translation>
  const selected = selectFoods(readUsda(input), kw)
  const seed = selected.map(({ keyword, food }) => toSeed(food, keyword, translations[String(food.fdcId)]))
  fs.writeFileSync(path.join(seedDir, 'foods.json'), JSON.stringify(seed, null, 2) + '\n')
  const untranslated = seed.filter((s) => !translations[s.sourceRef]).length
  console.log(`foods.json: ${seed.length} alimentos, ${untranslated} sin traducción`)
}
```

- [ ] **Step 3: Test de selección y mapeo**

`scripts/build-foods-seed.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { selectFoods, toSeed } from './build-foods-seed'

const food = (fdcId: number, description: string, dataType = 'SR Legacy', kcal = 40) => ({
  fdcId, description, dataType, foodNutrients: [{ nutrient: { id: 1008 }, amount: kcal }, { nutrient: { id: 1003 }, amount: 1.1 }],
})

describe('build-foods-seed', () => {
  it('selecciona por prefijo, prefiere raw y limita por palabra clave', () => {
    const all = [food(1, 'Onions, raw'), food(2, 'Onions, cooked, boiled'), food(3, 'Onions, dehydrated'), food(4, 'Onions, frozen'), food(5, 'Babyfood, onions')]
    const r = selectFoods(all, { exclude: ['babyfood'], keywords: ['onions'] })
    expect(r.map((x) => x.food.fdcId)).toEqual([1, 2, 3])
  })
  it('no repite un alimento en dos palabras clave', () => {
    const all = [food(1, 'Beans, snap, green, raw')]
    const r = selectFoods(all, { exclude: [], keywords: ['beans, snap', 'green beans'] })
    expect(r).toHaveLength(1)
  })
  it('mapea nutrientes y aplica traducción', () => {
    const s = toSeed(food(1, 'Onions, raw'), 'onions', { nameEs: 'Cebolla', aliases: [], gramsPerCup: 160, gramsPerTbsp: null, gramsPerUnit: 150, densityGPerMl: null, allergens: [], seasonalMonths: [] })
    expect(s).toMatchObject({ sourceRef: '1', nameEs: 'Cebolla', kcal100g: 40, protein100g: 1.1, carbs100g: null, defaultUnit: 'g', gramsPerUnit: 150 })
  })
  it('líquidos: unidad ml y densidad 1 por defecto', () => {
    const s = toSeed(food(2, 'Milk, whole'), 'milk, whole', undefined)
    expect(s.defaultUnit).toBe('ml')
    expect(s.densityGPerMl).toBe(1)
    expect(s.nameEs).toBe('Milk, whole')
  })
})
```

- [ ] **Step 4: Ejecutar** — Run: `pnpm test -- scripts/build-foods-seed.test.ts` — Expected: 4 passed

- [ ] **Step 5: `scripts/translate-foods.ts`** (se ejecuta una vez; nunca sobrescribe)

```ts
import fs from 'node:fs'
import path from 'node:path'
import { createOpenAI } from '@ai-sdk/openai'
import { generateObject } from 'ai'
import { z } from 'zod'
import type { FoodSeed, Translation } from './build-foods-seed'

// Genera entradas que faltan en foods-translations.json usando un modelo local (Ollama, API compatible con OpenAI).
// Uso: OLLAMA_BASE_URL=http://localhost:11434/v1 OLLAMA_MODEL=qwen3:8b pnpm tsx scripts/translate-foods.ts
// Las entradas existentes se respetan siempre: la revisión manual manda.

const TranslationSchema = z.object({
  nameEs: z.string().min(2),
  aliases: z.array(z.string()).max(6),
  gramsPerCup: z.number().positive().nullable(),
  gramsPerTbsp: z.number().positive().nullable(),
  gramsPerUnit: z.number().positive().nullable(),
  densityGPerMl: z.number().positive().nullable(),
  allergens: z.array(z.enum(['gluten', 'lactose', 'egg', 'fish', 'shellfish', 'nuts', 'peanut', 'soy', 'sesame', 'celery', 'mustard', 'sulphites', 'lupin', 'mollusc'])),
  seasonalMonths: z.array(z.number().int().min(1).max(12)),
})

async function main(): Promise<void> {
  const seedDir = path.join(process.cwd(), 'db', 'seed')
  const foods = JSON.parse(fs.readFileSync(path.join(seedDir, 'foods.json'), 'utf8')) as FoodSeed[]
  const file = path.join(seedDir, 'foods-translations.json')
  const translations = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, Translation>
  const provider = createOpenAI({ baseURL: process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434/v1', apiKey: 'ollama' })
  const model = provider(process.env.OLLAMA_MODEL ?? 'qwen3:8b')
  let done = 0
  for (const f of foods) {
    if (translations[f.sourceRef]) continue
    const { object } = await generateObject({
      model,
      schema: TranslationSchema,
      prompt: `Alimento de la base USDA: "${f.nameEn}". Devuelve el nombre en español de España tal como lo escribiría alguien en una receta (singular, sin marca), hasta 6 alias comunes (incluye el inglés corto), gramos por taza y por cucharada si tiene sentido, gramos por unidad si se compra por piezas (una cebolla, un huevo), densidad g/ml solo para líquidos, alérgenos de la lista de 14 de la UE y meses de temporada en España (vacío si no aplica).`,
    })
    translations[f.sourceRef] = object
    done += 1
    fs.writeFileSync(file, JSON.stringify(translations, null, 2) + '\n')
    console.log(`${done}: ${f.nameEn} → ${object.nameEs}`)
  }
}

main()
```

Instalar solo como devDependencies: `pnpm add -D ai @ai-sdk/openai` (la app usa `lib/ai` en W2; aquí es una herramienta de build).

- [ ] **Step 6: Generar el seed real**

Run:
```bash
mkdir -p data/usda && echo "descarga manual: ver db/seed/README.md" 
# tras descomprimir los JSON de Foundation y SR Legacy en data/usda:
echo '{}' > db/seed/foods-translations.json
pnpm tsx scripts/build-foods-seed.ts --input ./data/usda
OLLAMA_BASE_URL=http://localhost:11434/v1 OLLAMA_MODEL=qwen3:8b pnpm tsx scripts/translate-foods.ts
pnpm tsx scripts/build-foods-seed.ts --input ./data/usda
```
Expected: `foods.json: ~800 alimentos, 0 sin traducción`. Revisar a mano `foods-translations.json` (nombres raros, `gramsPerUnit` absurdos) antes de commitear; corregir en el JSON, no en el prompt. Si no hay Ollama disponible, commitear `foods.json` con `nameEs = nameEn` para las no traducidas y abrir una tarea de revisión: el seed sigue siendo funcional.

- [ ] **Step 7: `seedFoods` en `scripts/seed.ts`**

Sustituir el stub por:

```ts
import foodsSeed from '@/db/seed/foods.json'
import type { FoodSeed } from './build-foods-seed'
import { normalizeSearchName } from '@/lib/domain/quantities'

export async function seedFoods(db: Db): Promise<number> {
  const list = foodsSeed as FoodSeed[]
  const CHUNK = 200
  for (let i = 0; i < list.length; i += CHUNK) {
    const rows = list.slice(i, i + CHUNK).map((f) => ({
      householdId: null,
      nameEs: f.nameEs,
      nameEn: f.nameEn,
      searchNameEs: normalizeSearchName(f.nameEs),
      searchNameEn: normalizeSearchName(f.nameEn),
      aliases: f.aliases,
      defaultUnit: f.defaultUnit,
      kcal100g: f.kcal100g, protein100g: f.protein100g, carbs100g: f.carbs100g, fat100g: f.fat100g, fiber100g: f.fiber100g,
      source: 'usda' as const,
      sourceRef: f.sourceRef,
      allergens: f.allergens,
      gramsPerCup: f.gramsPerCup, gramsPerTbsp: f.gramsPerTbsp, gramsPerUnit: f.gramsPerUnit, densityGPerMl: f.densityGPerMl,
      seasonalMonths: f.seasonalMonths,
      isEstimated: false,
    }))
    await db
      .insert(schema.foods)
      .values(rows)
      .onConflictDoUpdate({
        target: [schema.foods.source, schema.foods.sourceRef],
        targetWhere: sql`source_ref IS NOT NULL AND household_id IS NULL`,
        set: {
          nameEs: sql`excluded.name_es`, nameEn: sql`excluded.name_en`, searchNameEs: sql`excluded.search_name_es`, searchNameEn: sql`excluded.search_name_en`,
          aliases: sql`excluded.aliases`, kcal100g: sql`excluded.kcal_100g`, protein100g: sql`excluded.protein_100g`, carbs100g: sql`excluded.carbs_100g`,
          fat100g: sql`excluded.fat_100g`, fiber100g: sql`excluded.fiber_100g`, gramsPerCup: sql`excluded.grams_per_cup`, gramsPerTbsp: sql`excluded.grams_per_tbsp`,
          gramsPerUnit: sql`excluded.grams_per_unit`, densityGPerMl: sql`excluded.density_g_per_ml`, allergens: sql`excluded.allergens`,
          seasonalMonths: sql`excluded.seasonal_months`, updatedAt: sql`now()`,
        },
      })
  }
  return list.length
}
```

(`normalizeSearchName` viene de la Tarea 10. Las correcciones manuales del usuario sobre un alimento global se hacen creando una copia con `household_id` — el upsert del seed nunca pisa filas de hogar.)

- [ ] **Step 8: Test de seedFoods** — añadir a `scripts/seed.test.ts`:

```ts
  it('foods se siembra y re-siembra sin duplicar', async () => {
    const n = await seedFoods(db)
    await seedFoods(db)
    const r = await db.execute(sql`SELECT count(*)::int AS c FROM foods WHERE source = 'usda' AND household_id IS NULL`)
    expect((r.rows[0] as { c: number }).c).toBe(n)
    const cebolla = await db.execute(sql`SELECT name_es FROM foods WHERE search_name_es % 'cebolla' LIMIT 1`)
    expect(cebolla.rows.length).toBe(1)
  })
```

Run: `pnpm test -- scripts/seed.test.ts` — Expected: 3 passed

- [ ] **Step 9: `db/seed/README.md`** con: origen y licencia (USDA dominio público; Open Food Facts ODbL se cita en W2 cuando se use), cómo descargar, cómo regenerar, regla "las traducciones se revisan a mano y el script nunca las pisa", y cómo añadir una palabra clave.

- [ ] **Step 10: Commit**

```bash
git add db/seed scripts/build-foods-seed.ts scripts/build-foods-seed.test.ts scripts/translate-foods.ts scripts/seed.ts scripts/seed.test.ts package.json pnpm-lock.yaml .gitignore
git commit -m "Añade seed de alimentos reproducible desde USDA"
```

(`.gitignore` ya excluye `data/`.)

---

## Pista (b) · `lib/domain`

### Task 8: Tipos del dominio y tabla de unidades

**Files:**
- Create: `lib/domain/types.ts`, `lib/domain/units-data.ts`
- Test: `lib/domain/units-data.test.ts`

**Interfaces:**
- Produces: todos los tipos de §5; `CANONICAL_UNITS`, `UNIT_ALIASES`, `findUnit(alias, locale)`.

- [ ] **Step 1: `lib/domain/types.ts`**

```ts
export type Locale = 'es' | 'en'
export type BaseUnit = 'g' | 'ml' | 'ud'
export type UnitSystem = 'metric' | 'imperial'
export type EntryStatus = 'planned' | 'cooked' | 'skipped'

// Conversión por alimento (tazas, piezas, densidad). Todo nullable: si falta, no se inventa.
export interface FoodConversion {
  defaultUnit: BaseUnit | null
  gramsPerCup: number | null
  gramsPerTbsp: number | null
  gramsPerUnit: number | null
  densityGPerMl: number | null
}

export interface FoodNutrition extends FoodConversion {
  kcal100g: number | null
  protein100g: number | null
  carbs100g: number | null
  fat100g: number | null
  fiber100g: number | null
  isEstimated: boolean
}

export interface Ingredient {
  id: string
  foodId: string | null
  rawText: string
  quantity: number | null // unidad base
  unit: BaseUnit | null
  displayQuantity: number | null
  displayUnit: string | null // id canónico de units-data o null
  preparation: string | null
  groupLabel: string | null
  stepIndex: number | null
  scalesLinearly: boolean
  sortOrder: number
}

export interface IngredientWithFood extends Ingredient {
  food: FoodNutrition | null
}

export interface RecipeForScaling {
  servingsBase: number
  ingredients: Ingredient[]
}

export interface ScaledRecipe {
  servings: number
  ratio: number
  ingredients: Ingredient[]
  nonLinearIds: string[]
}

export interface Macros {
  kcal: number
  protein: number
  carbs: number
  fat: number
  fiber: number
}

export interface Nutrition {
  perServing: Macros
  total: Macros
  per100g: Macros | null
  isEstimated: boolean
}

export interface ParsedIngredient {
  quantity: number | null
  unit: string | null // id canónico
  foodName: string
  preparation: string | null
  confidence: number // 0..1
  needsReview: boolean
}

export interface DisplayQuantity {
  quantity: number
  unit: string // id canónico
}

export interface PantryItem {
  id: string
  foodId: string
  quantity: number
  unit: BaseUnit
  expiresAt: Date | null
  addedAt: Date
}

export interface Need {
  foodId: string
  quantity: number
  unit: BaseUnit
}

export interface Allocation {
  pantryItemId: string
  foodId: string
  quantity: number
}

export interface ShoppingIngredient extends Ingredient {
  foodName: string
}

export interface PlannedEntry {
  id: string
  servings: number
  leftoverOfEntryId: string | null
  cookedAt: Date | null
  skippedAt: Date | null
  recipe: { servingsBase: number; ingredients: ShoppingIngredient[] }
}

export interface ShoppingLine {
  foodId: string | null
  name: string
  quantity: number | null
  unit: BaseUnit | null
  unresolved: boolean
}

export interface TimerSpan {
  start: number
  end: number
  seconds: number
}
```

- [ ] **Step 2: `lib/domain/units-data.ts`**

```ts
import type { BaseUnit, Locale } from './types'

// Unidades canónicas. `base` + `factor` → conversión directa; `null` → cuenta por piezas o no convertible.
export interface CanonicalUnit {
  id: string
  base: BaseUnit | null
  factor: number | null
  kind: 'mass' | 'volume' | 'count' | 'vague'
  label: Record<Locale, { one: string; many: string }>
}

export const CANONICAL_UNITS: CanonicalUnit[] = [
  { id: 'g', base: 'g', factor: 1, kind: 'mass', label: { es: { one: 'g', many: 'g' }, en: { one: 'g', many: 'g' } } },
  { id: 'kg', base: 'g', factor: 1000, kind: 'mass', label: { es: { one: 'kg', many: 'kg' }, en: { one: 'kg', many: 'kg' } } },
  { id: 'oz', base: 'g', factor: 28.35, kind: 'mass', label: { es: { one: 'oz', many: 'oz' }, en: { one: 'oz', many: 'oz' } } },
  { id: 'lb', base: 'g', factor: 453.6, kind: 'mass', label: { es: { one: 'lb', many: 'lb' }, en: { one: 'lb', many: 'lb' } } },
  { id: 'ml', base: 'ml', factor: 1, kind: 'volume', label: { es: { one: 'ml', many: 'ml' }, en: { one: 'ml', many: 'ml' } } },
  { id: 'l', base: 'ml', factor: 1000, kind: 'volume', label: { es: { one: 'l', many: 'l' }, en: { one: 'l', many: 'l' } } },
  { id: 'floz', base: 'ml', factor: 29.57, kind: 'volume', label: { es: { one: 'fl oz', many: 'fl oz' }, en: { one: 'fl oz', many: 'fl oz' } } },
  { id: 'tsp', base: 'ml', factor: 5, kind: 'volume', label: { es: { one: 'cdta', many: 'cdtas' }, en: { one: 'tsp', many: 'tsp' } } },
  { id: 'tbsp', base: 'ml', factor: 15, kind: 'volume', label: { es: { one: 'cda', many: 'cdas' }, en: { one: 'tbsp', many: 'tbsp' } } },
  { id: 'cup', base: 'ml', factor: 240, kind: 'volume', label: { es: { one: 'taza', many: 'tazas' }, en: { one: 'cup', many: 'cups' } } },
  { id: 'ud', base: 'ud', factor: 1, kind: 'count', label: { es: { one: 'ud', many: 'uds' }, en: { one: 'pc', many: 'pcs' } } },
  { id: 'clove', base: null, factor: null, kind: 'count', label: { es: { one: 'diente', many: 'dientes' }, en: { one: 'clove', many: 'cloves' } } },
  { id: 'leaf', base: null, factor: null, kind: 'count', label: { es: { one: 'hoja', many: 'hojas' }, en: { one: 'leaf', many: 'leaves' } } },
  { id: 'sprig', base: null, factor: null, kind: 'count', label: { es: { one: 'rama', many: 'ramas' }, en: { one: 'sprig', many: 'sprigs' } } },
  { id: 'slice', base: null, factor: null, kind: 'count', label: { es: { one: 'loncha', many: 'lonchas' }, en: { one: 'slice', many: 'slices' } } },
  { id: 'can', base: null, factor: null, kind: 'count', label: { es: { one: 'lata', many: 'latas' }, en: { one: 'can', many: 'cans' } } },
  { id: 'jar', base: null, factor: null, kind: 'count', label: { es: { one: 'bote', many: 'botes' }, en: { one: 'jar', many: 'jars' } } },
  { id: 'packet', base: null, factor: null, kind: 'count', label: { es: { one: 'sobre', many: 'sobres' }, en: { one: 'packet', many: 'packets' } } },
  { id: 'handful', base: null, factor: null, kind: 'vague', label: { es: { one: 'puñado', many: 'puñados' }, en: { one: 'handful', many: 'handfuls' } } },
  { id: 'pinch', base: null, factor: null, kind: 'vague', label: { es: { one: 'pizca', many: 'pizcas' }, en: { one: 'pinch', many: 'pinches' } } },
  { id: 'splash', base: null, factor: null, kind: 'vague', label: { es: { one: 'chorrito', many: 'chorritos' }, en: { one: 'splash', many: 'splashes' } } },
]

// Alias → id canónico. Sin acentos, en minúsculas, singular y plural explícitos.
const ALIASES: Record<Locale, Record<string, string>> = {
  es: {
    g: 'g', gr: 'g', grs: 'g', gramo: 'g', gramos: 'g', kg: 'kg', kilo: 'kg', kilos: 'kg', kilogramo: 'kg', kilogramos: 'kg',
    ml: 'ml', mililitro: 'ml', mililitros: 'ml', l: 'l', litro: 'l', litros: 'l', cl: 'ml', oz: 'oz', onza: 'oz', onzas: 'oz', lb: 'lb', libra: 'lb', libras: 'lb',
    cdta: 'tsp', cdtas: 'tsp', cucharadita: 'tsp', cucharaditas: 'tsp', 'c/c': 'tsp',
    cda: 'tbsp', cdas: 'tbsp', cucharada: 'tbsp', cucharadas: 'tbsp', 'cucharada sopera': 'tbsp', 'cucharadas soperas': 'tbsp', 'c/s': 'tbsp',
    taza: 'cup', tazas: 'cup', vaso: 'cup', vasos: 'cup',
    ud: 'ud', uds: 'ud', unidad: 'ud', unidades: 'ud', pieza: 'ud', piezas: 'ud',
    diente: 'clove', dientes: 'clove', hoja: 'leaf', hojas: 'leaf', rama: 'sprig', ramas: 'sprig', ramita: 'sprig', ramitas: 'sprig',
    loncha: 'slice', lonchas: 'slice', rebanada: 'slice', rebanadas: 'slice', rodaja: 'slice', rodajas: 'slice', filete: 'slice', filetes: 'slice',
    lata: 'can', latas: 'can', bote: 'jar', botes: 'jar', tarro: 'jar', tarros: 'jar', sobre: 'packet', sobres: 'packet', paquete: 'packet', paquetes: 'packet',
    punado: 'handful', punados: 'handful', pizca: 'pinch', pizcas: 'pinch', pellizco: 'pinch', pellizcos: 'pinch', chorrito: 'splash', chorro: 'splash', chorritos: 'splash',
  },
  en: {
    g: 'g', gram: 'g', grams: 'g', kg: 'kg', kilo: 'kg', kilos: 'kg', kilogram: 'kg', kilograms: 'kg', oz: 'oz', ounce: 'oz', ounces: 'oz', lb: 'lb', lbs: 'lb', pound: 'lb', pounds: 'lb',
    ml: 'ml', milliliter: 'ml', milliliters: 'ml', millilitre: 'ml', millilitres: 'ml', l: 'l', liter: 'l', liters: 'l', litre: 'l', litres: 'l', 'fl oz': 'floz', floz: 'floz',
    tsp: 'tsp', teaspoon: 'tsp', teaspoons: 'tsp', tbsp: 'tbsp', tbs: 'tbsp', tablespoon: 'tbsp', tablespoons: 'tbsp', cup: 'cup', cups: 'cup',
    pc: 'ud', pcs: 'ud', piece: 'ud', pieces: 'ud', unit: 'ud', units: 'ud',
    clove: 'clove', cloves: 'clove', sprig: 'sprig', sprigs: 'sprig', slice: 'slice', slices: 'slice',
    can: 'can', cans: 'can', jar: 'jar', jars: 'jar', packet: 'packet', packets: 'packet', package: 'packet', sachet: 'packet',
    handful: 'handful', handfuls: 'handful', pinch: 'pinch', pinches: 'pinch', splash: 'splash', dash: 'splash',
  },
}

// Lo que se vuelca a la tabla unit_aliases (solo convertibles)
export const UNIT_ALIASES: { alias: string; locale: Locale; unit: BaseUnit; factorToBase: number }[] = (['es', 'en'] as Locale[]).flatMap((locale) =>
  Object.entries(ALIASES[locale]).flatMap(([alias, id]) => {
    const u = CANONICAL_UNITS.find((c) => c.id === id)
    if (!u || u.base === null || u.factor === null) return []
    // cl no está en la tabla canónica: 1 cl = 10 ml
    const factor = alias === 'cl' ? 10 : u.factor
    return [{ alias, locale, unit: u.base, factorToBase: factor }]
  }),
)

export function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

export function findUnit(alias: string, locale: Locale): CanonicalUnit | null {
  const key = stripAccents(alias.toLowerCase().trim().replace(/\.$/, ''))
  const id = ALIASES[locale][key] ?? ALIASES[locale === 'es' ? 'en' : 'es'][key] ?? CANONICAL_UNITS.find((c) => c.id === key)?.id
  return id ? (CANONICAL_UNITS.find((c) => c.id === id) ?? null) : null
}

export function unitLabel(id: string, qty: number, locale: Locale): string {
  const u = CANONICAL_UNITS.find((c) => c.id === id)
  if (!u) return id
  return qty === 1 ? u.label[locale].one : u.label[locale].many
}
```

- [ ] **Step 3: Test**

`lib/domain/units-data.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { CANONICAL_UNITS, UNIT_ALIASES, findUnit, unitLabel } from './units-data'

describe('units-data', () => {
  it('resuelve alias en español con plural y acentos', () => {
    expect(findUnit('cucharaditas', 'es')?.id).toBe('tsp')
    expect(findUnit('Puñado', 'es')?.id).toBe('handful')
    expect(findUnit('gr.', 'es')?.id).toBe('g')
  })
  it('cae al otro idioma y al id canónico', () => {
    expect(findUnit('tbsp', 'es')?.id).toBe('tbsp')
    expect(findUnit('cdta', 'en')?.id).toBe('tsp')
    expect(findUnit('floz', 'es')?.id).toBe('floz')
  })
  it('devuelve null para lo desconocido', () => {
    expect(findUnit('pechuga', 'es')).toBeNull()
  })
  it('UNIT_ALIASES solo contiene unidades convertibles y cl = 10 ml', () => {
    expect(UNIT_ALIASES.every((u) => ['g', 'ml', 'ud'].includes(u.unit))).toBe(true)
    expect(UNIT_ALIASES.find((u) => u.alias === 'cl')?.factorToBase).toBe(10)
    expect(UNIT_ALIASES.find((u) => u.alias === 'pizca')).toBeUndefined()
  })
  it('etiquetas por locale y número', () => {
    expect(unitLabel('tbsp', 2, 'es')).toBe('cdas')
    expect(unitLabel('cup', 1, 'en')).toBe('cup')
    expect(CANONICAL_UNITS.map((u) => u.id)).toContain('pinch')
  })
})
```

- [ ] **Step 4: Ejecutar** — Run: `pnpm test -- lib/domain/units-data.test.ts` — Expected: 5 passed

- [ ] **Step 5: Commit**

```bash
git add lib/domain/types.ts lib/domain/units-data.ts lib/domain/units-data.test.ts
git commit -m "Añade tipos del dominio y tabla de unidades"
```

### Task 9: Escalado no lineal

**Files:**
- Create: `lib/domain/scaling.ts`
- Test: `lib/domain/scaling.test.ts`

**Interfaces:**
- Consumes: `Ingredient`, `RecipeForScaling`, `ScaledRecipe`, `Locale`.
- Produces: `DAMP`, `scaleQuantity`, `scaleIngredient`, `scaleRecipe`, `isNonLinearByDefault`.

- [ ] **Step 1: Test que falla**

```ts
import { describe, expect, it } from 'vitest'
import { isNonLinearByDefault, scaleIngredient, scaleQuantity, scaleRecipe } from './scaling'
import type { Ingredient } from './types'

const ing = (over: Partial<Ingredient>): Ingredient => ({
  id: 'i1', foodId: 'f1', rawText: '', quantity: 100, unit: 'g', displayQuantity: 100, displayUnit: 'g',
  preparation: null, groupLabel: null, stepIndex: null, scalesLinearly: true, sortOrder: 0, ...over,
})

describe('scaleQuantity', () => {
  it('lineal multiplica', () => expect(scaleQuantity(100, 2, true)).toBe(200))
  it('no lineal amortigua con ratio^0.65', () => expect(scaleQuantity(10, 2, false)).toBeCloseTo(15.69, 2))
  it('ratio 1 no cambia nada', () => {
    expect(scaleQuantity(7, 1, false)).toBe(7)
    expect(scaleQuantity(7, 1, true)).toBe(7)
  })
  it('reducir también amortigua', () => expect(scaleQuantity(10, 0.5, false)).toBeCloseTo(6.37, 2))
})

describe('scaleIngredient', () => {
  it('escala base y display con la misma regla', () => {
    const r = scaleIngredient(ing({ quantity: 15, unit: 'ml', displayQuantity: 1, displayUnit: 'tbsp', scalesLinearly: false }), 2)
    expect(r.quantity).toBeCloseTo(23.54, 2)
    expect(r.displayQuantity).toBeCloseTo(1.57, 2)
  })
  it('null se queda null', () => {
    const r = scaleIngredient(ing({ quantity: null, unit: null, displayQuantity: null, displayUnit: 'pinch' }), 3)
    expect(r.quantity).toBeNull()
    expect(r.displayQuantity).toBeNull()
  })
})

describe('scaleRecipe', () => {
  it('calcula ratio y lista los no lineales', () => {
    const r = scaleRecipe({ servingsBase: 4, ingredients: [ing({ id: 'a' }), ing({ id: 'b', scalesLinearly: false, quantity: 5 })] }, 6)
    expect(r.ratio).toBe(1.5)
    expect(r.servings).toBe(6)
    expect(r.ingredients[0]?.quantity).toBe(150)
    expect(r.ingredients[1]?.quantity).toBeCloseTo(6.5, 1)
    expect(r.nonLinearIds).toEqual(['b'])
  })
  it('rechaza raciones no positivas', () => {
    expect(() => scaleRecipe({ servingsBase: 4, ingredients: [] }, 0)).toThrow()
  })
})

describe('isNonLinearByDefault', () => {
  it('detecta sal, especias, levadura y alcohol en español', () => {
    for (const n of ['sal', 'sal gruesa', 'pimienta negra', 'comino', 'levadura química', 'vino blanco', 'bicarbonato', 'esencia de vainilla', 'gelatina', 'orégano'])
      expect(isNonLinearByDefault(n, 'es'), n).toBe(true)
  })
  it('detecta en inglés', () => {
    for (const n of ['salt', 'baking powder', 'yeast', 'black pepper', 'white wine', 'vanilla extract']) expect(isNonLinearByDefault(n, 'en'), n).toBe(true)
  })
  it('ingredientes normales son lineales', () => {
    for (const n of ['harina', 'cebolla', 'pollo', 'aceite de oliva', 'flour', 'chicken']) expect(isNonLinearByDefault(n, 'es'), n).toBe(false)
  })
})
```

- [ ] **Step 2: Ejecutar para ver el fallo** — Run: `pnpm test -- lib/domain/scaling.test.ts` — Expected: FAIL, módulo no encontrado

- [ ] **Step 3: Implementar `lib/domain/scaling.ts`**

```ts
import { stripAccents } from './units-data'
import type { Ingredient, Locale, RecipeForScaling, ScaledRecipe } from './types'

// Exponente de amortiguación: duplicar la sal arruina el plato
export const DAMP = 0.65

export function scaleQuantity(qty: number, ratio: number, scalesLinearly: boolean): number {
  return scalesLinearly ? qty * ratio : qty * Math.pow(ratio, DAMP)
}

export function scaleIngredient(i: Ingredient, ratio: number): Ingredient {
  return {
    ...i,
    quantity: i.quantity === null ? null : scaleQuantity(i.quantity, ratio, i.scalesLinearly),
    displayQuantity: i.displayQuantity === null ? null : scaleQuantity(i.displayQuantity, ratio, i.scalesLinearly),
  }
}

// Tiempos, temperaturas y tamaño de molde no se tocan: la UI los avisa
export function scaleRecipe(recipe: RecipeForScaling, targetServings: number): ScaledRecipe {
  if (!(targetServings > 0) || !(recipe.servingsBase > 0)) throw new Error('Las raciones deben ser positivas')
  const ratio = targetServings / recipe.servingsBase
  const ingredients = recipe.ingredients.map((i) => scaleIngredient(i, ratio))
  return { servings: targetServings, ratio, ingredients, nonLinearIds: recipe.ingredients.filter((i) => !i.scalesLinearly).map((i) => i.id) }
}

const NON_LINEAR: Record<Locale, string[]> = {
  es: [
    'sal', 'pimienta', 'comino', 'pimenton', 'oregano', 'tomillo', 'romero', 'laurel', 'canela', 'nuez moscada', 'clavo', 'curry', 'cilantro seco', 'guindilla', 'cayena', 'azafran', 'cardamomo', 'anis', 'jengibre molido', 'curcuma', 'hierbas',
    'levadura', 'bicarbonato', 'impulsor', 'gelatina', 'agar',
    'vino', 'brandy', 'conac', 'coñac', 'ron', 'whisky', 'vermut', 'jerez', 'licor', 'cerveza', 'sidra',
    'esencia', 'extracto', 'aroma', 'colorante',
  ],
  en: [
    'salt', 'pepper', 'cumin', 'paprika', 'oregano', 'thyme', 'rosemary', 'bay', 'cinnamon', 'nutmeg', 'clove', 'curry', 'chili', 'cayenne', 'saffron', 'cardamom', 'anise', 'ground ginger', 'turmeric', 'herbs', 'spice',
    'yeast', 'baking powder', 'baking soda', 'gelatin', 'agar',
    'wine', 'brandy', 'cognac', 'rum', 'whisky', 'whiskey', 'vermouth', 'sherry', 'liqueur', 'beer', 'cider',
    'essence', 'extract', 'flavoring', 'food coloring',
  ],
}

// Heurística por nombre: se aplica al importar y el usuario puede corregirla
export function isNonLinearByDefault(foodName: string, locale: Locale): boolean {
  const name = stripAccents(foodName.toLowerCase())
  const words = name.split(/[\s,]+/)
  const lists = [NON_LINEAR[locale], NON_LINEAR[locale === 'es' ? 'en' : 'es']]
  return lists.some((list) => list.some((term) => (term.includes(' ') ? name.includes(term) : words.includes(term))))
}
```

- [ ] **Step 4: Ejecutar** — Run: `pnpm test -- lib/domain/scaling.test.ts` — Expected: 11 passed

- [ ] **Step 5: Commit**

```bash
git add lib/domain/scaling.ts lib/domain/scaling.test.ts
git commit -m "Añade escalado no lineal de cantidades"
```

### Task 10: Cantidades: formato, unidad base y unidad de presentación

**Files:**
- Create: `lib/domain/quantities.ts`
- Test: `lib/domain/quantities.test.ts`

**Interfaces:**
- Consumes: `findUnit`, `unitLabel`, `stripAccents`, tipos.
- Produces: `formatQuantity`, `formatNumber`, `toBaseUnit`, `toDisplayUnit`, `normalizeSearchName`.

- [ ] **Step 1: Test que falla**

```ts
import { describe, expect, it } from 'vitest'
import { formatQuantity, normalizeSearchName, toBaseUnit, toDisplayUnit } from './quantities'
import type { FoodConversion } from './types'

const flour: FoodConversion = { defaultUnit: 'g', gramsPerCup: 120, gramsPerTbsp: 8, gramsPerUnit: null, densityGPerMl: null }
const sugar: FoodConversion = { defaultUnit: 'g', gramsPerCup: 200, gramsPerTbsp: 12.5, gramsPerUnit: null, densityGPerMl: null }
const onion: FoodConversion = { defaultUnit: 'g', gramsPerCup: null, gramsPerTbsp: null, gramsPerUnit: 150, densityGPerMl: null }
const honey: FoodConversion = { defaultUnit: 'g', gramsPerCup: null, gramsPerTbsp: null, gramsPerUnit: null, densityGPerMl: 1.42 }
const none: FoodConversion = { defaultUnit: null, gramsPerCup: null, gramsPerTbsp: null, gramsPerUnit: null, densityGPerMl: null }

describe('formatQuantity', () => {
  it('masa y volumen sin decimales', () => {
    expect(formatQuantity(249.6, 'g', 'es')).toBe('250 g')
    expect(formatQuantity(0.4, 'ml', 'es')).toBe('0 ml')
  })
  it('≥10 entero', () => expect(formatQuantity(12.4, 'cup', 'es')).toBe('12 tazas'))
  it('kg, l, oz, lb con un decimal, sin fracciones', () => {
    expect(formatQuantity(1.5, 'l', 'es')).toBe('1,5 l')
    expect(formatQuantity(2, 'kg', 'es')).toBe('2 kg')
    expect(formatQuantity(0.75, 'lb', 'en')).toBe('0.8 lb')
  })
  it('fracciones bonitas', () => {
    expect(formatQuantity(0.5, 'tsp', 'es')).toBe('½ cdta')
    expect(formatQuantity(1.5, 'tsp', 'es')).toBe('1 ½ cdtas')
    expect(formatQuantity(0.33, 'cup', 'en')).toBe('⅓ cup')
    expect(formatQuantity(2.75, 'cup', 'en')).toBe('2 ¾ cups')
    expect(formatQuantity(0.25, 'cup', 'es')).toBe('¼ taza')
  })
  it('un decimal con coma si no hay fracción cercana', () => {
    expect(formatQuantity(1.4, 'tbsp', 'es')).toBe('1,4 cdas')
    expect(formatQuantity(1.4, 'tbsp', 'en')).toBe('1.4 tbsp')
  })
  it('null → cadena vacía; sin unidad → solo número', () => {
    expect(formatQuantity(null, 'g', 'es')).toBe('')
    expect(formatQuantity(3, null, 'es')).toBe('3')
  })
  it('unidad de recuento en singular y plural', () => {
    expect(formatQuantity(1, 'clove', 'es')).toBe('1 diente')
    expect(formatQuantity(2, 'clove', 'en')).toBe('2 cloves')
  })
})

describe('toBaseUnit', () => {
  it('unidades directas', () => {
    expect(toBaseUnit(1.5, 'kg', 'es')).toEqual({ qty: 1500, unit: 'g' })
    expect(toBaseUnit(2, 'l', 'en')).toEqual({ qty: 2000, unit: 'ml' })
    expect(toBaseUnit(3, 'ud', 'es')).toEqual({ qty: 3, unit: 'ud' })
    expect(toBaseUnit(1, 'oz', 'en')?.qty).toBeCloseTo(28.35)
  })
  it('taza es por alimento: harina ≠ azúcar', () => {
    expect(toBaseUnit(1, 'cup', 'es', flour)).toEqual({ qty: 120, unit: 'g' })
    expect(toBaseUnit(1, 'cup', 'es', sugar)).toEqual({ qty: 200, unit: 'g' })
    expect(toBaseUnit(2, 'tbsp', 'es', flour)).toEqual({ qty: 16, unit: 'g' })
    expect(toBaseUnit(3, 'tsp', 'es', flour)).toEqual({ qty: 8, unit: 'g' }) // tsp = tbsp/3
  })
  it('taza sin dato del alimento → volumen en ml', () => {
    expect(toBaseUnit(1, 'cup', 'es', none)).toEqual({ qty: 240, unit: 'ml' })
    expect(toBaseUnit(1, 'cup', 'es')).toEqual({ qty: 240, unit: 'ml' })
  })
  it('piezas con gramos por unidad → g; sin dato → ud', () => {
    expect(toBaseUnit(2, 'ud', 'es', onion)).toEqual({ qty: 300, unit: 'g' })
    expect(toBaseUnit(2, 'ud', 'es', none)).toEqual({ qty: 2, unit: 'ud' })
  })
  it('volumen con densidad y alimento por masa → g', () => {
    expect(toBaseUnit(1, 'tbsp', 'es', honey)?.qty).toBeCloseTo(21.3)
    expect(toBaseUnit(1, 'tbsp', 'es', honey)?.unit).toBe('g')
  })
  it('no convertible → null', () => {
    expect(toBaseUnit(1, 'pinch', 'es')).toBeNull()
    expect(toBaseUnit(2, 'clove', 'es')).toBeNull()
    expect(toBaseUnit(2, 'pechuga', 'es')).toBeNull()
  })
})

describe('toDisplayUnit', () => {
  it('métrico sube a kg/l a partir de 1000', () => {
    expect(toDisplayUnit(1500, 'g', null, 'metric')).toEqual({ quantity: 1.5, unit: 'kg' })
    expect(toDisplayUnit(250, 'ml', null, 'metric')).toEqual({ quantity: 250, unit: 'ml' })
  })
  it('imperial convierte masa y volumen', () => {
    expect(toDisplayUnit(453.6, 'g', null, 'imperial')).toEqual({ quantity: 1, unit: 'lb' })
    expect(toDisplayUnit(100, 'g', null, 'imperial').unit).toBe('oz')
    expect(toDisplayUnit(240, 'ml', null, 'imperial')).toEqual({ quantity: 1, unit: 'cup' })
  })
  it('unidad preferida por alimento', () => {
    expect(toDisplayUnit(240, 'g', flour, 'metric', 'cup')).toEqual({ quantity: 2, unit: 'cup' })
    expect(toDisplayUnit(300, 'g', onion, 'metric', 'ud')).toEqual({ quantity: 2, unit: 'ud' })
    expect(toDisplayUnit(300, 'g', none, 'metric', 'cup')).toEqual({ quantity: 300, unit: 'g' }) // sin dato, no inventa
  })
  it('ud se queda en ud', () => expect(toDisplayUnit(3, 'ud', null, 'imperial')).toEqual({ quantity: 3, unit: 'ud' }))
})

describe('normalizeSearchName', () => {
  it('quita acentos, mayúsculas y espacios repetidos', () => {
    expect(normalizeSearchName('  Pimentón  Dulce ')).toBe('pimenton dulce')
  })
})
```

- [ ] **Step 2: Ejecutar para ver el fallo** — Run: `pnpm test -- lib/domain/quantities.test.ts` — Expected: FAIL

- [ ] **Step 3: Implementar `lib/domain/quantities.ts`**

```ts
import { findUnit, stripAccents, unitLabel } from './units-data'
import type { BaseUnit, DisplayQuantity, FoodConversion, Locale, UnitSystem } from './types'

const FRACTIONS: [number, string][] = [[0.25, '¼'], [1 / 3, '⅓'], [0.5, '½'], [2 / 3, '⅔'], [0.75, '¾']]
const FRACTION_TOLERANCE = 0.05

export function normalizeSearchName(s: string): string {
  return stripAccents(s).toLowerCase().trim().replace(/\s+/g, ' ')
}

// Número según reglas de presentación de docs/03 §1
export function formatNumber(qty: number, unit: string | null, locale: Locale): string {
  const u = unit ? findUnit(unit, locale) : null
  if (u && (u.kind === 'mass' || u.kind === 'volume')) {
    if (u.id === 'g' || u.id === 'ml') return String(Math.round(qty))
    // kg, l, oz, lb, fl oz: un decimal, nunca fracciones
    const d = Math.round(qty * 10) / 10
    const str = Number.isInteger(d) ? String(d) : d.toFixed(1)
    return locale === 'es' ? str.replace('.', ',') : str
  }
  if (qty >= 10) return String(Math.round(qty))
  const whole = Math.floor(qty)
  const frac = qty - whole
  if (frac < FRACTION_TOLERANCE) return String(whole)
  if (frac > 1 - FRACTION_TOLERANCE) return String(whole + 1)
  const hit = FRACTIONS.find(([v]) => Math.abs(v - frac) < FRACTION_TOLERANCE)
  if (hit) return whole === 0 ? hit[1] : `${whole} ${hit[1]}`
  const oneDecimal = (Math.round(qty * 10) / 10).toFixed(1)
  return locale === 'es' ? oneDecimal.replace('.', ',') : oneDecimal
}

export function formatQuantity(qty: number | null, unit: string | null, locale: Locale): string {
  if (qty === null) return ''
  const num = formatNumber(qty, unit, locale)
  if (!unit) return num
  const u = findUnit(unit, locale)
  const label = u ? unitLabel(u.id, qty <= 1 ? 1 : 2, locale) : unit // singular hasta 1 inclusive ("¼ taza", "1 ½ cdtas")
  return `${num} ${label}`
}

const TSP_PER_TBSP = 3
const TBSP_PER_CUP = 16

// Orden: piezas → tazas/cucharadas por alimento → alias directo → densidad → null
export function toBaseUnit(qty: number, unit: string, locale: Locale, food?: FoodConversion): { qty: number; unit: BaseUnit } | null {
  const u = findUnit(unit, locale)
  if (!u) return null
  if (u.id === 'ud') {
    return food?.gramsPerUnit ? { qty: qty * food.gramsPerUnit, unit: 'g' } : { qty, unit: 'ud' }
  }
  if (food) {
    if (u.id === 'cup' && food.gramsPerCup) return { qty: qty * food.gramsPerCup, unit: 'g' }
    if (u.id === 'tbsp' && food.gramsPerTbsp) return { qty: qty * food.gramsPerTbsp, unit: 'g' }
    if (u.id === 'tsp' && food.gramsPerTbsp) return { qty: (qty * food.gramsPerTbsp) / TSP_PER_TBSP, unit: 'g' }
    if (u.id === 'cup' && food.gramsPerTbsp) return { qty: qty * food.gramsPerTbsp * TBSP_PER_CUP, unit: 'g' }
    if (u.id === 'tbsp' && food.gramsPerCup) return { qty: (qty * food.gramsPerCup) / TBSP_PER_CUP, unit: 'g' }
  }
  if (u.base === null || u.factor === null) return null
  const base = { qty: qty * u.factor, unit: u.base }
  if (base.unit === 'ml' && food?.defaultUnit === 'g' && food.densityGPerMl) return { qty: base.qty * food.densityGPerMl, unit: 'g' }
  return base
}

export function toDisplayUnit(qty: number, base: BaseUnit, food: FoodConversion | null, system: UnitSystem, preferred?: string): DisplayQuantity {
  if (preferred && food) {
    if (preferred === 'cup' && base === 'g' && food.gramsPerCup) return { quantity: qty / food.gramsPerCup, unit: 'cup' }
    if (preferred === 'tbsp' && base === 'g' && food.gramsPerTbsp) return { quantity: qty / food.gramsPerTbsp, unit: 'tbsp' }
    if (preferred === 'tsp' && base === 'g' && food.gramsPerTbsp) return { quantity: (qty * TSP_PER_TBSP) / food.gramsPerTbsp, unit: 'tsp' }
    if (preferred === 'ud' && base === 'g' && food.gramsPerUnit) return { quantity: qty / food.gramsPerUnit, unit: 'ud' }
  }
  if (base === 'ud') return { quantity: qty, unit: 'ud' }
  if (system === 'imperial') {
    if (base === 'g') return qty >= 453.6 ? { quantity: qty / 453.6, unit: 'lb' } : { quantity: qty / 28.35, unit: 'oz' }
    return qty >= 240 ? { quantity: qty / 240, unit: 'cup' } : { quantity: qty / 29.57, unit: 'floz' }
  }
  if (base === 'g') return qty >= 1000 ? { quantity: qty / 1000, unit: 'kg' } : { quantity: qty, unit: 'g' }
  return qty >= 1000 ? { quantity: qty / 1000, unit: 'l' } : { quantity: qty, unit: 'ml' }
}
```

- [ ] **Step 4: Ejecutar** — Run: `pnpm test -- lib/domain/quantities.test.ts` — Expected: todos pasan

- [ ] **Step 5: Commit**

```bash
git add lib/domain/quantities.ts lib/domain/quantities.test.ts
git commit -m "Añade formato de cantidades y conversión de unidades"
```

### Task 11: Nutrición por ración y por 100 g

**Files:**
- Create: `lib/domain/nutrition.ts`
- Test: `lib/domain/nutrition.test.ts`

**Interfaces:**
- Consumes: `IngredientWithFood`, `Nutrition`, `Macros`; `scaleRecipe` (para el test de invariante).
- Produces: `recipeNutrition`, `aggregateNutrition`, `EMPTY_MACROS`.

- [ ] **Step 1: Test que falla**

```ts
import { describe, expect, it } from 'vitest'
import { aggregateNutrition, recipeNutrition } from './nutrition'
import { scaleRecipe } from './scaling'
import type { FoodNutrition, IngredientWithFood } from './types'

const food = (over: Partial<FoodNutrition>): FoodNutrition => ({
  defaultUnit: 'g', gramsPerCup: null, gramsPerTbsp: null, gramsPerUnit: null, densityGPerMl: null,
  kcal100g: 100, protein100g: 10, carbs100g: 10, fat100g: 1, fiber100g: 1, isEstimated: false, ...over,
})
const ing = (over: Partial<IngredientWithFood>): IngredientWithFood => ({
  id: 'i', foodId: 'f', rawText: '', quantity: 100, unit: 'g', displayQuantity: 100, displayUnit: 'g', preparation: null,
  groupLabel: null, stepIndex: null, scalesLinearly: true, sortOrder: 0, food: food({}), ...over,
})

describe('recipeNutrition', () => {
  it('suma por gramos y reparte por ración', () => {
    const n = recipeNutrition([ing({ quantity: 200 }), ing({ id: 'j', quantity: 100, food: food({ kcal100g: 400, fat100g: 40 }) })], 4)
    expect(n.total.kcal).toBe(600)
    expect(n.perServing.kcal).toBe(150)
    expect(n.perServing.fat).toBeCloseTo(10.5)
    expect(n.isEstimated).toBe(false)
  })
  it('por 100 g con yieldGrams', () => {
    const n = recipeNutrition([ing({ quantity: 200 })], 2, 400)
    expect(n.per100g?.kcal).toBe(50)
  })
  it('por 100 g sin yield: suma de masas con densidad y gramos por unidad', () => {
    const n = recipeNutrition([
      ing({ quantity: 100, unit: 'g' }),
      ing({ id: 'm', quantity: 100, unit: 'ml', food: food({ densityGPerMl: 1.5, kcal100g: 0 }) }),
      ing({ id: 'u', quantity: 2, unit: 'ud', food: food({ gramsPerUnit: 50, kcal100g: 0 }) }),
    ], 1)
    // masa = 100 + 150 + 100 = 350 g; kcal = 100
    expect(n.per100g?.kcal).toBeCloseTo(28.57, 1)
  })
  it('ml sin densidad cuenta 1:1', () => {
    const n = recipeNutrition([ing({ quantity: 200, unit: 'ml', food: food({ kcal100g: 50 }) })], 1)
    expect(n.total.kcal).toBe(100)
    expect(n.per100g?.kcal).toBe(50)
  })
  it('ud sin gramos por unidad → per100g null y estimado', () => {
    const n = recipeNutrition([ing({ quantity: 2, unit: 'ud' })], 1)
    expect(n.per100g).toBeNull()
    expect(n.isEstimated).toBe(true)
  })
  it('ingrediente sin alimento o sin base se ignora y marca estimado', () => {
    const n = recipeNutrition([ing({}), ing({ id: 'x', food: null }), ing({ id: 'y', quantity: null, unit: null })], 1)
    expect(n.total.kcal).toBe(100)
    expect(n.isEstimated).toBe(true)
  })
  it('alimento estimado propaga la etiqueta', () => {
    expect(recipeNutrition([ing({ food: food({ isEstimated: true }) })], 1).isEstimated).toBe(true)
  })
  it('INVARIANTE: escalar la receta no cambia las kcal por ración', () => {
    const ingredients = [ing({ quantity: 300 }), ing({ id: 's', quantity: 5, scalesLinearly: false, food: food({ kcal100g: 0 }) })]
    const base = recipeNutrition(ingredients, 4)
    const scaled = scaleRecipe({ servingsBase: 4, ingredients }, 6)
    const after = recipeNutrition(scaled.ingredients.map((i, k) => ({ ...i, food: ingredients[k]?.food ?? null })), 6)
    expect(Math.round(after.perServing.kcal)).toBe(Math.round(base.perServing.kcal))
    expect(after.total.kcal).toBeCloseTo(base.total.kcal * 1.5)
  })
  it('raciones no positivas lanzan', () => expect(() => recipeNutrition([], 0)).toThrow())
})

describe('aggregateNutrition', () => {
  it('suma totales ponderando por raciones y calcula media por ración', () => {
    const a = recipeNutrition([ing({ quantity: 100 })], 1) // 100 kcal/ración
    const b = recipeNutrition([ing({ quantity: 300 })], 1) // 300 kcal/ración
    const agg = aggregateNutrition([{ nutrition: a, servings: 2 }, { nutrition: b, servings: 1 }])
    expect(agg.total.kcal).toBe(500)
    expect(agg.perServing.kcal).toBeCloseTo(166.67, 1)
    expect(agg.per100g).toBeNull()
  })
})
```

- [ ] **Step 2: Ejecutar para ver el fallo** — Run: `pnpm test -- lib/domain/nutrition.test.ts` — Expected: FAIL

- [ ] **Step 3: Implementar `lib/domain/nutrition.ts`**

```ts
import type { IngredientWithFood, Macros, Nutrition } from './types'

export const EMPTY_MACROS: Macros = { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 }

function add(a: Macros, b: Macros): Macros {
  return { kcal: a.kcal + b.kcal, protein: a.protein + b.protein, carbs: a.carbs + b.carbs, fat: a.fat + b.fat, fiber: a.fiber + b.fiber }
}
function scale(m: Macros, k: number): Macros {
  return { kcal: m.kcal * k, protein: m.protein * k, carbs: m.carbs * k, fat: m.fat * k, fiber: m.fiber * k }
}

// Gramos de un ingrediente para sumar masa. null si no hay forma de saberlo.
function gramsOf(i: IngredientWithFood): number | null {
  if (i.quantity === null || i.unit === null) return null
  if (i.unit === 'g') return i.quantity
  if (i.unit === 'ml') return i.quantity * (i.food?.densityGPerMl ?? 1)
  return i.food?.gramsPerUnit ? i.quantity * i.food.gramsPerUnit : null
}

// Nota para el futuro: si aceite o azúcar se marcan como no lineales, las kcal por ración dejarían de ser
// invariantes al escalar y habría que recalcular de verdad; hoy la desviación de sal/especias es despreciable.
export function recipeNutrition(ingredients: IngredientWithFood[], servings: number, yieldGrams?: number | null): Nutrition {
  if (!(servings > 0)) throw new Error('Las raciones deben ser positivas')
  let total = EMPTY_MACROS
  let massSum = 0
  let isEstimated = false
  let massComplete = true
  for (const i of ingredients) {
    if (i.quantity === null || i.unit === null) {
      // "al gusto", "una pizca": no cuenta y marca estimado si no es despreciable saberlo
      isEstimated = true
      continue
    }
    const grams = gramsOf(i)
    if (grams === null) {
      isEstimated = true
      massComplete = false
      continue
    }
    if (!i.food || i.food.kcal100g === null) {
      isEstimated = true
      massSum += grams
      continue
    }
    if (i.food.isEstimated) isEstimated = true
    const per100: Macros = {
      kcal: i.food.kcal100g, protein: i.food.protein100g ?? 0, carbs: i.food.carbs100g ?? 0, fat: i.food.fat100g ?? 0, fiber: i.food.fiber100g ?? 0,
    }
    total = add(total, scale(per100, grams / 100))
    massSum += grams
  }
  const divisor = yieldGrams && yieldGrams > 0 ? yieldGrams : massComplete && massSum > 0 ? massSum : null
  return {
    perServing: scale(total, 1 / servings),
    total,
    per100g: divisor === null ? null : scale(total, 100 / divisor),
    isEstimated,
  }
}

export function aggregateNutrition(entries: { nutrition: Nutrition; servings: number }[]): Nutrition {
  let total = EMPTY_MACROS
  let servings = 0
  let isEstimated = false
  for (const e of entries) {
    total = add(total, scale(e.nutrition.perServing, e.servings))
    servings += e.servings
    isEstimated = isEstimated || e.nutrition.isEstimated
  }
  return { total, perServing: servings > 0 ? scale(total, 1 / servings) : EMPTY_MACROS, per100g: null, isEstimated }
}
```

- [ ] **Step 4: Ejecutar** — Run: `pnpm test -- lib/domain/nutrition.test.ts` — Expected: 10 passed

- [ ] **Step 5: Commit**

```bash
git add lib/domain/nutrition.ts lib/domain/nutrition.test.ts
git commit -m "Añade cálculo nutricional por ración y por 100 g"
```

### Task 12: Parser de ingredientes (reglas) con fixtures reales

**Files:**
- Create: `lib/domain/ingredients-parser.ts`, `lib/domain/__fixtures__/ingredients.es.json`, `lib/domain/__fixtures__/ingredients.en.json`
- Test: `lib/domain/ingredients-parser.test.ts`

**Interfaces:**
- Consumes: `findUnit`, `stripAccents`, `ParsedIngredient`.
- Produces: `parseIngredientLine(raw, locale)`.

- [ ] **Step 1: Fixtures**

`lib/domain/__fixtures__/ingredients.es.json` (campo `expected` con lo que debe salir; `unit` es id canónico):

```json
[
  { "raw": "200 g de harina", "expected": { "quantity": 200, "unit": "g", "foodName": "harina", "preparation": null } },
  { "raw": "2 dientes de ajo picados", "expected": { "quantity": 2, "unit": "clove", "foodName": "ajo", "preparation": "picados" } },
  { "raw": "1 cebolla grande", "expected": { "quantity": 1, "unit": null, "foodName": "cebolla grande", "preparation": null } },
  { "raw": "sal al gusto", "expected": { "quantity": null, "unit": null, "foodName": "sal", "preparation": "al gusto" } },
  { "raw": "una pizca de pimienta negra", "expected": { "quantity": 1, "unit": "pinch", "foodName": "pimienta negra", "preparation": null } },
  { "raw": "1/2 taza de leche", "expected": { "quantity": 0.5, "unit": "cup", "foodName": "leche", "preparation": null } },
  { "raw": "½ cucharadita de comino", "expected": { "quantity": 0.5, "unit": "tsp", "foodName": "comino", "preparation": null } },
  { "raw": "1 y 1/2 cucharadas de aceite de oliva", "expected": { "quantity": 1.5, "unit": "tbsp", "foodName": "aceite de oliva", "preparation": null } },
  { "raw": "2-3 tomates maduros", "expected": { "quantity": 2.5, "unit": null, "foodName": "tomates maduros", "preparation": null } },
  { "raw": "un chorrito de vinagre", "expected": { "quantity": 1, "unit": "splash", "foodName": "vinagre", "preparation": null } },
  { "raw": "250 ml de nata para cocinar", "expected": { "quantity": 250, "unit": "ml", "foodName": "nata", "preparation": "para cocinar" } },
  { "raw": "1 kg de patatas", "expected": { "quantity": 1, "unit": "kg", "foodName": "patatas", "preparation": null } },
  { "raw": "3 huevos", "expected": { "quantity": 3, "unit": null, "foodName": "huevos", "preparation": null } },
  { "raw": "400 g de garbanzos cocidos, escurridos", "expected": { "quantity": 400, "unit": "g", "foodName": "garbanzos", "preparation": "cocidos, escurridos" } },
  { "raw": "1 lata de tomate triturado (400 g)", "expected": { "quantity": 1, "unit": "can", "foodName": "tomate triturado", "preparation": "(400 g)" } },
  { "raw": "2 cdas de perejil picado", "expected": { "quantity": 2, "unit": "tbsp", "foodName": "perejil", "preparation": "picado" } },
  { "raw": "100 g de queso parmesano rallado", "expected": { "quantity": 100, "unit": "g", "foodName": "queso parmesano", "preparation": "rallado" } },
  { "raw": "1 cdta de pimentón dulce", "expected": { "quantity": 1, "unit": "tsp", "foodName": "pimentón dulce", "preparation": null } },
  { "raw": "aceite de oliva virgen extra", "expected": { "quantity": null, "unit": null, "foodName": "aceite de oliva virgen extra", "preparation": null } },
  { "raw": "1 hoja de laurel", "expected": { "quantity": 1, "unit": "leaf", "foodName": "laurel", "preparation": null } },
  { "raw": "2 ramas de canela", "expected": { "quantity": 2, "unit": "sprig", "foodName": "canela", "preparation": null } },
  { "raw": "150 gr de azúcar", "expected": { "quantity": 150, "unit": "g", "foodName": "azúcar", "preparation": null } },
  { "raw": "1 l de caldo de pollo", "expected": { "quantity": 1, "unit": "l", "foodName": "caldo de pollo", "preparation": null } },
  { "raw": "3 zanahorias medianas, en rodajas", "expected": { "quantity": 3, "unit": null, "foodName": "zanahorias medianas", "preparation": "en rodajas" } },
  { "raw": "1 sobre de levadura química (16 g)", "expected": { "quantity": 1, "unit": "packet", "foodName": "levadura química", "preparation": "(16 g)" } },
  { "raw": "¼ de taza de nueces", "expected": { "quantity": 0.25, "unit": "cup", "foodName": "nueces", "preparation": null } },
  { "raw": "2 cucharadas soperas de mantequilla", "expected": { "quantity": 2, "unit": "tbsp", "foodName": "mantequilla", "preparation": null } },
  { "raw": "500 g de carne picada de ternera", "expected": { "quantity": 500, "unit": "g", "foodName": "carne picada de ternera", "preparation": null } },
  { "raw": "1 pechuga de pollo", "expected": { "quantity": 1, "unit": null, "foodName": "pechuga de pollo", "preparation": null } },
  { "raw": "6 lonchas de jamón serrano", "expected": { "quantity": 6, "unit": "slice", "foodName": "jamón serrano", "preparation": null } },
  { "raw": "1 pizca de nuez moscada", "expected": { "quantity": 1, "unit": "pinch", "foodName": "nuez moscada", "preparation": null } },
  { "raw": "zumo de medio limón", "expected": { "quantity": null, "unit": null, "foodName": "zumo de medio limón", "preparation": null } },
  { "raw": "1,5 kg de calabaza", "expected": { "quantity": 1.5, "unit": "kg", "foodName": "calabaza", "preparation": null } },
  { "raw": "2 latas de atún al natural", "expected": { "quantity": 2, "unit": "can", "foodName": "atún al natural", "preparation": null } },
  { "raw": "1 bote de garbanzos (400 g), escurridos", "expected": { "quantity": 1, "unit": "jar", "foodName": "garbanzos", "preparation": "(400 g), escurridos" } },
  { "raw": "pimienta negra recién molida", "expected": { "quantity": null, "unit": null, "foodName": "pimienta negra", "preparation": "recién molida" } },
  { "raw": "4 rebanadas de pan de molde", "expected": { "quantity": 4, "unit": "slice", "foodName": "pan de molde", "preparation": null } },
  { "raw": "1 diente de ajo", "expected": { "quantity": 1, "unit": "clove", "foodName": "ajo", "preparation": null } },
  { "raw": "3 cucharaditas de sal", "expected": { "quantity": 3, "unit": "tsp", "foodName": "sal", "preparation": null } },
  { "raw": "50 ml de vino blanco para desglasar", "expected": { "quantity": 50, "unit": "ml", "foodName": "vino blanco", "preparation": "para desglasar" } },
  { "raw": "2 puñados de espinacas frescas", "expected": { "quantity": 2, "unit": "handful", "foodName": "espinacas frescas", "preparation": null } },
  { "raw": "1 pellizco de azafrán", "expected": { "quantity": 1, "unit": "pinch", "foodName": "azafrán", "preparation": null } },
  { "raw": "unos 300 g de merluza", "expected": { "quantity": 300, "unit": "g", "foodName": "merluza", "preparation": null } },
  { "raw": "1 taza (240 ml) de arroz", "expected": { "quantity": 1, "unit": "cup", "foodName": "arroz", "preparation": "(240 ml)" } }
]
```

`lib/domain/__fixtures__/ingredients.en.json`:

```json
[
  { "raw": "2 cups all-purpose flour", "expected": { "quantity": 2, "unit": "cup", "foodName": "all-purpose flour", "preparation": null } },
  { "raw": "1 tbsp olive oil", "expected": { "quantity": 1, "unit": "tbsp", "foodName": "olive oil", "preparation": null } },
  { "raw": "3 cloves garlic, minced", "expected": { "quantity": 3, "unit": "clove", "foodName": "garlic", "preparation": "minced" } },
  { "raw": "1/2 tsp salt", "expected": { "quantity": 0.5, "unit": "tsp", "foodName": "salt", "preparation": null } },
  { "raw": "1 large onion, diced", "expected": { "quantity": 1, "unit": null, "foodName": "large onion", "preparation": "diced" } },
  { "raw": "400 g canned chickpeas, drained", "expected": { "quantity": 400, "unit": "g", "foodName": "canned chickpeas", "preparation": "drained" } },
  { "raw": "salt and pepper to taste", "expected": { "quantity": null, "unit": null, "foodName": "salt and pepper", "preparation": "to taste" } },
  { "raw": "1 ½ cups milk", "expected": { "quantity": 1.5, "unit": "cup", "foodName": "milk", "preparation": null } },
  { "raw": "2-3 ripe tomatoes", "expected": { "quantity": 2.5, "unit": null, "foodName": "ripe tomatoes", "preparation": null } },
  { "raw": "1 lb ground beef", "expected": { "quantity": 1, "unit": "lb", "foodName": "ground beef", "preparation": null } },
  { "raw": "8 oz cream cheese, softened", "expected": { "quantity": 8, "unit": "oz", "foodName": "cream cheese", "preparation": "softened" } },
  { "raw": "a pinch of nutmeg", "expected": { "quantity": 1, "unit": "pinch", "foodName": "nutmeg", "preparation": null } },
  { "raw": "1 can (14 oz) diced tomatoes", "expected": { "quantity": 1, "unit": "can", "foodName": "diced tomatoes", "preparation": "(14 oz)" } },
  { "raw": "2 eggs, beaten", "expected": { "quantity": 2, "unit": null, "foodName": "eggs", "preparation": "beaten" } },
  { "raw": "1 cup grated parmesan", "expected": { "quantity": 1, "unit": "cup", "foodName": "grated parmesan", "preparation": null } },
  { "raw": "juice of 1 lemon", "expected": { "quantity": null, "unit": null, "foodName": "juice of 1 lemon", "preparation": null } },
  { "raw": "1 bay leaf", "expected": { "quantity": 1, "unit": null, "foodName": "bay leaf", "preparation": null } },
  { "raw": "250 ml chicken stock", "expected": { "quantity": 250, "unit": "ml", "foodName": "chicken stock", "preparation": null } },
  { "raw": "2 tablespoons butter", "expected": { "quantity": 2, "unit": "tbsp", "foodName": "butter", "preparation": null } },
  { "raw": "1 teaspoon smoked paprika", "expected": { "quantity": 1, "unit": "tsp", "foodName": "smoked paprika", "preparation": null } },
  { "raw": "3 medium carrots, sliced", "expected": { "quantity": 3, "unit": null, "foodName": "medium carrots", "preparation": "sliced" } },
  { "raw": "1 kg potatoes, peeled and cubed", "expected": { "quantity": 1, "unit": "kg", "foodName": "potatoes", "preparation": "peeled and cubed" } },
  { "raw": "splash of white wine", "expected": { "quantity": null, "unit": "splash", "foodName": "white wine", "preparation": null } },
  { "raw": "½ cup chopped walnuts", "expected": { "quantity": 0.5, "unit": "cup", "foodName": "chopped walnuts", "preparation": null } }
]
```

- [ ] **Step 2: Test**

`lib/domain/ingredients-parser.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import es from './__fixtures__/ingredients.es.json'
import en from './__fixtures__/ingredients.en.json'
import { parseIngredientLine } from './ingredients-parser'

type Fixture = { raw: string; expected: { quantity: number | null; unit: string | null; foodName: string; preparation: string | null } }

describe('parseIngredientLine', () => {
  describe('es', () => {
    for (const f of es as Fixture[]) {
      it(f.raw, () => {
        const r = parseIngredientLine(f.raw, 'es')
        expect({ quantity: r.quantity, unit: r.unit, foodName: r.foodName, preparation: r.preparation }).toEqual(f.expected)
      })
    }
  })
  describe('en', () => {
    for (const f of en as Fixture[]) {
      it(f.raw, () => {
        const r = parseIngredientLine(f.raw, 'en')
        expect({ quantity: r.quantity, unit: r.unit, foodName: r.foodName, preparation: r.preparation }).toEqual(f.expected)
      })
    }
  })
  it('tiene al menos 40 casos en es y 20 en en', () => {
    expect((es as Fixture[]).length).toBeGreaterThanOrEqual(40)
    expect((en as Fixture[]).length).toBeGreaterThanOrEqual(20)
  })
  it('confianza: completo 1, sin unidad 0.8, sin cantidad 0.7, sin alimento → needsReview', () => {
    expect(parseIngredientLine('200 g de harina', 'es').confidence).toBe(1)
    expect(parseIngredientLine('3 huevos', 'es').confidence).toBe(0.8)
    expect(parseIngredientLine('aceite de oliva', 'es').confidence).toBe(0.7)
    const bad = parseIngredientLine('2 cdas de', 'es')
    expect(bad.needsReview).toBe(true)
    expect(bad.foodName).toBe('')
  })
  it('línea vacía → needsReview', () => expect(parseIngredientLine('   ', 'es').needsReview).toBe(true))
})
```

- [ ] **Step 3: Ejecutar para ver el fallo** — Run: `pnpm test -- lib/domain/ingredients-parser.test.ts` — Expected: FAIL

- [ ] **Step 4: Implementar `lib/domain/ingredients-parser.ts`**

```ts
import { findUnit, stripAccents } from './units-data'
import type { Locale, ParsedIngredient } from './types'

const UNICODE_FRACTIONS: Record<string, number> = { '¼': 0.25, '½': 0.5, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3, '⅛': 0.125 }
const NUMBER_WORDS: Record<Locale, Record<string, number>> = {
  es: { un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, medio: 0.5, media: 0.5 },
  en: { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, half: 0.5 },
}
const APPROX: Record<Locale, string[]> = { es: ['unos', 'unas', 'aprox', 'aproximadamente', 'sobre'], en: ['about', 'approx', 'approximately', 'around'] }
const TO_TASTE: Record<Locale, string[]> = { es: ['al gusto', 'a gusto', 'c/n', 'cantidad necesaria'], en: ['to taste', 'as needed'] }
// Participios que separan alimento de preparación cuando van al final, antes de coma, "y"/"and" o "en"
const PARTICIPLES: Record<Locale, string[]> = {
  es: ['picado', 'picada', 'picados', 'picadas', 'rallado', 'rallada', 'rallados', 'ralladas', 'troceado', 'troceada', 'troceados', 'troceadas', 'cortado', 'cortada', 'cortados', 'cortadas', 'pelado', 'pelada', 'pelados', 'peladas', 'cocido', 'cocida', 'cocidos', 'cocidas', 'escurrido', 'escurrida', 'escurridos', 'escurridas', 'fundido', 'fundida', 'derretido', 'derretida', 'batido', 'batida', 'batidos', 'molido', 'molida', 'machacado', 'machacada', 'machacados', 'fileteado', 'fileteada', 'desmenuzado', 'desmenuzada', 'laminado', 'laminada', 'laminados', 'laminadas', 'tamizado', 'tamizada', 'deshuesado', 'deshuesada', 'deshuesados', 'deshuesadas', 'descongelado', 'descongelada'],
  en: ['minced', 'diced', 'chopped', 'sliced', 'grated', 'drained', 'softened', 'beaten', 'peeled', 'cubed', 'melted', 'crushed', 'shredded', 'rinsed', 'thawed', 'toasted', 'crumbled', 'halved', 'quartered', 'juiced', 'zested', 'sifted', 'whisked', 'cooked', 'mashed', 'trimmed'],
}
const ADVERBS: Record<Locale, string[]> = { es: ['recien', 'bien', 'muy', 'finamente'], en: ['finely', 'freshly', 'roughly', 'thinly', 'coarsely'] }

function parseNumberToken(tok: string, locale: Locale): number | null {
  if (UNICODE_FRACTIONS[tok] !== undefined) return UNICODE_FRACTIONS[tok] ?? null
  const frac = /^(\d+)\/(\d+)$/.exec(tok)
  if (frac) return Number(frac[1]) / Number(frac[2])
  const dec = /^(\d+)(?:[.,](\d+))?$/.exec(tok)
  if (dec) return Number(`${dec[1]}.${dec[2] ?? '0'}`)
  const mixedUnicode = /^(\d+)([¼½¾⅓⅔⅛])$/.exec(tok)
  if (mixedUnicode) return Number(mixedUnicode[1]) + (UNICODE_FRACTIONS[mixedUnicode[2] ?? ''] ?? 0)
  return NUMBER_WORDS[locale][tok] ?? null
}

// Devuelve cantidad y el resto de la línea sin ella
function takeQuantity(text: string, locale: Locale): { quantity: number | null; rest: string } {
  let rest = text
  const first = rest.split(' ')[0] ?? ''
  if (APPROX[locale].includes(stripAccents(first))) rest = rest.slice(first.length).trim()
  const tokens = rest.split(' ')
  const t0 = tokens[0] ?? ''
  // rangos "2-3", "2 - 3", "2 a 3", "2 to 3" → media
  const rangeInline = /^(\d+(?:[.,]\d+)?)[-–](\d+(?:[.,]\d+)?)$/.exec(t0)
  const rangeSpaced = /^(\d+(?:[.,]\d+)?)\s*(?:-|–|a|to)\s*(\d+(?:[.,]\d+)?)$/.exec(tokens.slice(0, 3).join(' '))
  const m = rangeInline ?? rangeSpaced
  if (m) {
    const a = Number((m[1] ?? '0').replace(',', '.'))
    const b = Number((m[2] ?? '0').replace(',', '.'))
    return { quantity: (a + b) / 2, rest: tokens.slice(rangeInline ? 1 : 3).join(' ') }
  }
  const n0 = parseNumberToken(t0, locale)
  if (n0 === null) return { quantity: null, rest }
  // "1 y 1/2", "1 and 1/2", "1 ½"
  const conj = locale === 'es' ? 'y' : 'and'
  if (tokens[1] === conj && tokens[2] !== undefined) {
    const n2 = parseNumberToken(tokens[2], locale)
    if (n2 !== null && n2 < 1) return { quantity: n0 + n2, rest: tokens.slice(3).join(' ') }
  }
  if (tokens[1] !== undefined && UNICODE_FRACTIONS[tokens[1]] !== undefined) {
    return { quantity: n0 + (UNICODE_FRACTIONS[tokens[1]] ?? 0), rest: tokens.slice(2).join(' ') }
  }
  return { quantity: n0, rest: tokens.slice(1).join(' ') }
}

// Devuelve unidad canónica y el resto sin ella ni el "de"/"of" siguiente
function takeUnit(text: string, locale: Locale, hasQuantity: boolean): { unit: string | null; rest: string } {
  const tokens = text.split(' ')
  // Unidades de dos palabras primero ("cucharada sopera", "fl oz")
  for (const len of [2, 1]) {
    const candidate = tokens.slice(0, len).join(' ')
    if (!candidate) continue
    const u = findUnit(candidate, locale)
    if (!u) continue
    // En inglés, "leaf"/"slice" solo son unidad con cantidad delante y seguido de "of"; "bay leaf" es alimento
    if (locale === 'en' && (u.id === 'leaf' || u.id === 'slice') && tokens[len] !== 'of') continue
    if (!hasQuantity && u.kind !== 'vague') continue
    let rest = tokens.slice(len).join(' ')
    rest = rest.replace(locale === 'es' ? /^de (la |el |los |las )?/ : /^of (the )?/, '')
    return { unit: u.id, rest }
  }
  return { unit: null, rest: text }
}

function splitPreparation(text: string, locale: Locale): { food: string; preparation: string | null } {
  const parts: string[] = []
  let food = text
  // Paréntesis → preparación
  const paren = /\(([^)]*)\)/.exec(food)
  if (paren) {
    parts.push(`(${paren[1]})`)
    // "1 taza (240 ml) de arroz" → quitar el "de"/"of" que quedaba detrás del paréntesis
    food = food.replace(paren[0], ' ').replace(/\s+/g, ' ').trim().replace(/^(de|of) /, '')
  }
  // Coma → todo lo que sigue es preparación
  const comma = food.indexOf(',')
  if (comma >= 0) {
    parts.push(food.slice(comma + 1).trim())
    food = food.slice(0, comma).trim()
  }
  // "al gusto" / "to taste"
  for (const t of TO_TASTE[locale]) {
    if (stripAccents(food).endsWith(t)) {
      parts.unshift(food.slice(food.length - t.length).trim())
      food = food.slice(0, food.length - t.length).trim()
    }
  }
  // " para …" en español separa finalidad ("vino blanco para desglasar", "nata para cocinar"): el alimento queda más limpio para resolverlo
  if (locale === 'es') {
    const words = food.split(' ')
    const k = words.findIndex((w, i) => i > 0 && w === 'para')
    if (k > 0) {
      parts.unshift(words.slice(k).join(' '))
      food = words.slice(0, k).join(' ')
    }
  }
  // Participio al final del alimento (español: detrás del nombre)
  if (locale === 'es') {
    const ws = food.split(' ')
    const last = stripAccents(ws[ws.length - 1] ?? '')
    if (ws.length > 1 && PARTICIPLES.es.includes(last)) {
      let cut = ws.length - 1
      if (cut > 1 && ADVERBS.es.includes(stripAccents(ws[cut - 1] ?? ''))) cut -= 1
      parts.unshift(ws.slice(cut).join(' '))
      food = ws.slice(0, cut).join(' ')
    }
  }
  return { food: food.trim(), preparation: parts.length ? parts.join(', ').trim() : null }
}

export function parseIngredientLine(raw: string, locale: Locale): ParsedIngredient {
  const text = raw.trim().replace(/\s+/g, ' ').replace(/\s*,\s*/g, ', ').replace(/\s+\(/g, ' (')
  if (!text) return { quantity: null, unit: null, foodName: '', preparation: null, confidence: 0, needsReview: true }
  const lower = text.toLowerCase()
  const q = takeQuantity(lower, locale)
  let unitPart = q.rest
  // "¼ de taza" → quitar "de" entre número y unidad
  if (locale === 'es' && q.quantity !== null) unitPart = unitPart.replace(/^de /, '')
  // Si el "de" precedía a algo que no es unidad ("zumo de medio limón" no entra aquí porque no empieza por número)
  const u = takeUnit(unitPart, locale, q.quantity !== null)
  const originalCase = text.slice(text.length - u.rest.length) // conserva mayúsculas/acentos del original
  const { food, preparation } = splitPreparation(originalCase.trim() || u.rest, locale)
  let confidence = 1
  if (q.quantity === null) confidence = 0.7
  else if (u.unit === null) confidence = 0.8
  if (!food) confidence = 0.4
  return { quantity: q.quantity, unit: u.unit, foodName: food, preparation, confidence, needsReview: confidence < 0.6 }
}
```

- [ ] **Step 5: Ejecutar y ajustar hasta que pasen todas las fixtures**

Run: `pnpm test -- lib/domain/ingredients-parser.test.ts`
Expected: 44 + 24 + 3 passed. Si una fixture falla, corregir el parser (no la fixture) salvo que la fixture contradiga `docs/03` §5; en ese caso anotar en el commit qué se cambió y por qué.

- [ ] **Step 6: Commit**

```bash
git add lib/domain/ingredients-parser.ts lib/domain/ingredients-parser.test.ts lib/domain/__fixtures__
git commit -m "Añade parser de ingredientes por reglas con fixtures es/en"
```

### Task 13: Despensa: asignación FIFO, caducidades y estado de entrada

**Files:**
- Create: `lib/domain/pantry.ts`
- Test: `lib/domain/pantry.test.ts`

**Interfaces:**
- Produces: `allocateDeductions(items, needs)`, `expiringSoon(items, today, days)`, `entryStatus(e)`.

- [ ] **Step 1: Test que falla**

```ts
import { describe, expect, it } from 'vitest'
import { allocateDeductions, entryStatus, expiringSoon } from './pantry'
import type { PantryItem } from './types'

const item = (id: string, qty: number, over: Partial<PantryItem> = {}): PantryItem => ({
  id, foodId: 'f', quantity: qty, unit: 'g', expiresAt: null, addedAt: new Date('2026-01-01'), ...over,
})

describe('allocateDeductions', () => {
  it('FIFO por caducidad, nulls al final, luego added_at', () => {
    const items = [
      item('sin-fecha', 100, { addedAt: new Date('2025-12-01') }),
      item('tarde', 100, { expiresAt: new Date('2026-03-01') }),
      item('pronto', 100, { expiresAt: new Date('2026-02-01') }),
      item('sin-fecha-nuevo', 100, { addedAt: new Date('2026-01-15') }),
    ]
    const r = allocateDeductions(items, [{ foodId: 'f', quantity: 250, unit: 'g' }])
    expect(r.allocations.map((a) => [a.pantryItemId, a.quantity])).toEqual([['pronto', 100], ['tarde', 100], ['sin-fecha', 50]])
    expect(r.unmatched).toEqual([])
  })
  it('falta de existencias → asigna lo que hay y deja el resto en unmatched', () => {
    const r = allocateDeductions([item('a', 30)], [{ foodId: 'f', quantity: 100, unit: 'g' }])
    expect(r.allocations).toEqual([{ pantryItemId: 'a', foodId: 'f', quantity: 30 }])
    expect(r.unmatched).toEqual([{ foodId: 'f', quantity: 70, unit: 'g' }])
  })
  it('alimento sin ítems → todo unmatched', () => {
    const r = allocateDeductions([], [{ foodId: 'x', quantity: 5, unit: 'ud' }])
    expect(r.unmatched).toEqual([{ foodId: 'x', quantity: 5, unit: 'ud' }])
  })
  it('ignora ítems con otra unidad base', () => {
    const r = allocateDeductions([item('ml', 500, { unit: 'ml' })], [{ foodId: 'f', quantity: 100, unit: 'g' }])
    expect(r.allocations).toEqual([])
    expect(r.unmatched[0]?.quantity).toBe(100)
  })
  it('no asigna cantidades cero ni toca ítems a 0', () => {
    const r = allocateDeductions([item('vacio', 0), item('lleno', 50)], [{ foodId: 'f', quantity: 20, unit: 'g' }])
    expect(r.allocations).toEqual([{ pantryItemId: 'lleno', foodId: 'f', quantity: 20 }])
  })
  it('es puro: no muta la entrada', () => {
    const items = [item('a', 100)]
    allocateDeductions(items, [{ foodId: 'f', quantity: 40, unit: 'g' }])
    expect(items[0]?.quantity).toBe(100)
  })
})

describe('expiringSoon', () => {
  it('incluye lo que caduca en ≤ days (incluido hoy y ya caducado), ordenado', () => {
    const today = new Date('2026-08-26')
    const items = [
      item('a', 1, { expiresAt: new Date('2026-08-30') }),
      item('b', 1, { expiresAt: new Date('2026-08-20') }),
      item('c', 1, { expiresAt: new Date('2026-09-10') }),
      item('d', 1),
      item('e', 1, { expiresAt: new Date('2026-08-26') }),
    ]
    expect(expiringSoon(items, today, 3).map((i) => i.id)).toEqual(['b', 'e'])
    expect(expiringSoon(items, today, 7).map((i) => i.id)).toEqual(['b', 'e', 'a'])
  })
})

describe('entryStatus', () => {
  it('cooked gana a skipped; sin fechas → planned', () => {
    expect(entryStatus({ cookedAt: new Date(), skippedAt: new Date() })).toBe('cooked')
    expect(entryStatus({ cookedAt: null, skippedAt: new Date() })).toBe('skipped')
    expect(entryStatus({ cookedAt: null, skippedAt: null })).toBe('planned')
  })
})
```

- [ ] **Step 2: Ejecutar para ver el fallo** — Run: `pnpm test -- lib/domain/pantry.test.ts` — Expected: FAIL

- [ ] **Step 3: Implementar `lib/domain/pantry.ts`**

```ts
import type { Allocation, EntryStatus, Need, PantryItem } from './types'

const DAY_MS = 86_400_000

function fifo(a: PantryItem, b: PantryItem): number {
  if (a.expiresAt && b.expiresAt) return a.expiresAt.getTime() - b.expiresAt.getTime()
  if (a.expiresAt) return -1
  if (b.expiresAt) return 1
  return a.addedAt.getTime() - b.addedAt.getTime()
}

// Reparte cada necesidad entre los ítems del mismo alimento y unidad, gastando primero lo que caduca antes.
// Puro: el servicio aplica las allocations con UPDATE atómico y decide los avisos reales a partir del RETURNING.
export function allocateDeductions(items: PantryItem[], needs: Need[]): { allocations: Allocation[]; unmatched: Need[] } {
  const remaining = new Map(items.map((i) => [i.id, i.quantity]))
  const allocations: Allocation[] = []
  const unmatched: Need[] = []
  for (const need of needs) {
    let left = need.quantity
    const candidates = items.filter((i) => i.foodId === need.foodId && i.unit === need.unit).sort(fifo)
    for (const c of candidates) {
      if (left <= 0) break
      const avail = remaining.get(c.id) ?? 0
      if (avail <= 0) continue
      const take = Math.min(avail, left)
      allocations.push({ pantryItemId: c.id, foodId: need.foodId, quantity: take })
      remaining.set(c.id, avail - take)
      left -= take
    }
    if (left > 0) unmatched.push({ foodId: need.foodId, quantity: left, unit: need.unit })
  }
  return { allocations, unmatched }
}

export function expiringSoon(items: PantryItem[], today: Date, days: number): PantryItem[] {
  const limit = today.getTime() + days * DAY_MS
  return items.filter((i) => i.expiresAt !== null && i.expiresAt.getTime() <= limit).sort(fifo)
}

export function entryStatus(e: { cookedAt: Date | null; skippedAt: Date | null }): EntryStatus {
  if (e.cookedAt) return 'cooked'
  if (e.skippedAt) return 'skipped'
  return 'planned'
}
```

- [ ] **Step 4: Ejecutar** — Run: `pnpm test -- lib/domain/pantry.test.ts` — Expected: 8 passed

- [ ] **Step 5: Commit**

```bash
git add lib/domain/pantry.ts lib/domain/pantry.test.ts
git commit -m "Añade asignación FIFO de despensa y caducidades"
```

### Task 14: Consolidación para la compra

**Files:**
- Create: `lib/domain/shopping.ts`
- Test: `lib/domain/shopping.test.ts`

**Interfaces:**
- Consumes: `scaleRecipe`, `normalizeSearchName`, `formatQuantity`, `unitLabel`, tipos `PlannedEntry`, `ShoppingLine`, `PantryItem`.
- Produces: `consolidateNeeds(entries, pantry)`, `toShopListItem(line)`.

- [ ] **Step 1: Test que falla**

```ts
import { describe, expect, it } from 'vitest'
import { consolidateNeeds, toShopListItem } from './shopping'
import type { PantryItem, PlannedEntry, ShoppingIngredient } from './types'

const ing = (over: Partial<ShoppingIngredient>): ShoppingIngredient => ({
  id: 'i', foodId: 'harina', foodName: 'Harina', rawText: '', quantity: 100, unit: 'g', displayQuantity: 100, displayUnit: 'g',
  preparation: null, groupLabel: null, stepIndex: null, scalesLinearly: true, sortOrder: 0, ...over,
})
const entry = (over: Partial<PlannedEntry>, ingredients: ShoppingIngredient[]): PlannedEntry => ({
  id: 'e', servings: 2, leftoverOfEntryId: null, cookedAt: null, skippedAt: null, recipe: { servingsBase: 2, ingredients }, ...over,
})
const pantry = (foodId: string, qty: number, unit: PantryItem['unit'] = 'g'): PantryItem => ({ id: `p-${foodId}`, foodId, quantity: qty, unit, expiresAt: null, addedAt: new Date() })

describe('consolidateNeeds', () => {
  it('escala a las raciones del hueco, agrupa por alimento y resta despensa', () => {
    const lines = consolidateNeeds(
      [entry({ id: 'a', servings: 4 }, [ing({})]), entry({ id: 'b', servings: 2 }, [ing({ id: 'k' })])],
      [pantry('harina', 50)],
    )
    expect(lines).toEqual([{ foodId: 'harina', name: 'Harina', quantity: 250, unit: 'g', unresolved: false }])
  })
  it('descarta lo que la despensa cubre', () => {
    expect(consolidateNeeds([entry({}, [ing({})])], [pantry('harina', 500)])).toEqual([])
  })
  it('excluye sobras, cocinadas y saltadas', () => {
    const lines = consolidateNeeds(
      [
        entry({ id: 's', leftoverOfEntryId: 'x' }, [ing({})]),
        entry({ id: 'c', cookedAt: new Date() }, [ing({})]),
        entry({ id: 'k', skippedAt: new Date() }, [ing({})]),
        entry({ id: 'ok' }, [ing({})]),
      ],
      [],
    )
    expect(lines).toEqual([{ foodId: 'harina', name: 'Harina', quantity: 100, unit: 'g', unresolved: false }])
  })
  it('no lineal se escala amortiguado', () => {
    const lines = consolidateNeeds([entry({ servings: 4 }, [ing({ foodId: 'sal', foodName: 'Sal', quantity: 10, scalesLinearly: false })])], [])
    expect(lines[0]?.quantity).toBeCloseTo(15.69, 2)
  })
  it('sin food_id: agrupa por nombre normalizado, suma y no resta despensa', () => {
    const lines = consolidateNeeds(
      [entry({}, [ing({ foodId: null, foodName: 'Queso Feta', quantity: 100 }), ing({ id: 'z', foodId: null, foodName: 'queso feta', quantity: 50 })])],
      [pantry('queso-feta', 1000)],
    )
    expect(lines).toEqual([{ foodId: null, name: 'Queso Feta', quantity: 150, unit: 'g', unresolved: true }])
  })
  it('sin base: una línea sin cantidad, sin duplicar', () => {
    const lines = consolidateNeeds(
      [entry({}, [ing({ foodId: 'pimienta', foodName: 'Pimienta', quantity: null, unit: null, displayUnit: 'pinch' }), ing({ id: 'q', foodId: 'pimienta', foodName: 'Pimienta', quantity: null, unit: null })])],
      [pantry('pimienta', 100)],
    )
    expect(lines).toEqual([{ foodId: 'pimienta', name: 'Pimienta', quantity: null, unit: null, unresolved: false }])
  })
  it('mismo alimento en g y ml son líneas distintas', () => {
    const lines = consolidateNeeds([entry({}, [ing({ foodId: 'leche', foodName: 'Leche', unit: 'ml' }), ing({ id: 'g', foodId: 'leche', foodName: 'Leche', unit: 'g' })])], [])
    expect(lines).toHaveLength(2)
  })
  it('orden estable por nombre', () => {
    const lines = consolidateNeeds([entry({}, [ing({ foodId: 'z', foodName: 'Zanahoria' }), ing({ id: 'b', foodId: 'a', foodName: 'Ajo' })])], [])
    expect(lines.map((l) => l.name)).toEqual(['Ajo', 'Zanahoria'])
  })
})

describe('toShopListItem', () => {
  it('piezas → quantity entera; masa/volumen → unidad en el nombre; sin cantidad → solo nombre', () => {
    expect(toShopListItem({ foodId: 'h', name: 'Huevos', quantity: 5.2, unit: 'ud', unresolved: false })).toEqual({ name: 'Huevos', quantity: 6 })
    expect(toShopListItem({ foodId: 'l', name: 'Lentejas pardinas', quantity: 300, unit: 'g', unresolved: false })).toEqual({ name: 'Lentejas pardinas · 300 g', quantity: null })
    expect(toShopListItem({ foodId: 'l', name: 'Leche', quantity: 1500, unit: 'ml', unresolved: false })).toEqual({ name: 'Leche · 1,5 l', quantity: null })
    expect(toShopListItem({ foodId: 'p', name: 'Pimienta', quantity: null, unit: null, unresolved: false })).toEqual({ name: 'Pimienta', quantity: null })
  })
})
```

- [ ] **Step 2: Ejecutar para ver el fallo** — Run: `pnpm test -- lib/domain/shopping.test.ts` — Expected: FAIL

- [ ] **Step 3: Implementar `lib/domain/shopping.ts`**

```ts
import { formatQuantity, normalizeSearchName, toDisplayUnit } from './quantities'
import { scaleRecipe } from './scaling'
import type { BaseUnit, PantryItem, PlannedEntry, ShoppingLine } from './types'

type Bucket = { foodId: string | null; name: string; quantity: number | null; unit: BaseUnit | null; unresolved: boolean }

function keyOf(foodId: string | null, name: string, unit: BaseUnit | null): string {
  return `${foodId ?? `name:${normalizeSearchName(name)}`}|${unit ?? '-'}`
}

// Recorre el plan, escala, agrupa por alimento y unidad base, resta despensa, descarta ≤ 0 (docs/03 §7)
export function consolidateNeeds(entries: PlannedEntry[], pantry: PantryItem[]): ShoppingLine[] {
  const buckets = new Map<string, Bucket>()
  for (const e of entries) {
    if (e.leftoverOfEntryId !== null || e.cookedAt !== null || e.skippedAt !== null) continue
    const scaled = scaleRecipe(e.recipe, e.servings)
    for (const i of scaled.ingredients) {
      const src = e.recipe.ingredients.find((x) => x.id === i.id)
      const name = src?.foodName ?? i.rawText
      const hasBase = i.quantity !== null && i.unit !== null
      const key = keyOf(i.foodId, name, hasBase ? i.unit : null)
      const b = buckets.get(key) ?? { foodId: i.foodId, name, quantity: hasBase ? 0 : null, unit: hasBase ? i.unit : null, unresolved: i.foodId === null }
      if (hasBase && b.quantity !== null && i.quantity !== null) b.quantity += i.quantity
      buckets.set(key, b)
    }
  }
  const pantryByFood = new Map<string, number>()
  for (const p of pantry) pantryByFood.set(`${p.foodId}|${p.unit}`, (pantryByFood.get(`${p.foodId}|${p.unit}`) ?? 0) + p.quantity)
  const out: ShoppingLine[] = []
  for (const b of buckets.values()) {
    if (b.quantity !== null && b.unit !== null) {
      const have = b.foodId ? (pantryByFood.get(`${b.foodId}|${b.unit}`) ?? 0) : 0
      const needed = b.quantity - have
      if (needed <= 0) continue
      out.push({ foodId: b.foodId, name: b.name, quantity: needed, unit: b.unit, unresolved: b.unresolved })
    } else {
      out.push({ foodId: b.foodId, name: b.name, quantity: null, unit: null, unresolved: b.unresolved })
    }
  }
  return out.sort((a, z) => a.name.localeCompare(z.name, 'es'))
}

// Contrato de ShopList (docs/06): quantity solo cuenta piezas; masa y volumen van en el nombre
export function toShopListItem(line: ShoppingLine): { name: string; quantity: number | null } {
  if (line.quantity === null || line.unit === null) return { name: line.name, quantity: null }
  if (line.unit === 'ud') return { name: line.name, quantity: Math.ceil(line.quantity) }
  const d = toDisplayUnit(line.quantity, line.unit, null, 'metric')
  return { name: `${line.name} · ${formatQuantity(d.quantity, d.unit, 'es')}`, quantity: null }
}
```

- [ ] **Step 4: Ejecutar** — Run: `pnpm test -- lib/domain/shopping.test.ts` — Expected: 9 passed

- [ ] **Step 5: Commit**

```bash
git add lib/domain/shopping.ts lib/domain/shopping.test.ts
git commit -m "Añade consolidación de necesidades para la compra"
```

### Task 15: Temporizadores en el texto de los pasos e índice del dominio

**Files:**
- Create: `lib/domain/timers.ts`, `lib/domain/index.ts`
- Test: `lib/domain/timers.test.ts`

**Interfaces:**
- Produces: `detectTimers(stepText, locale)`; `lib/domain/index.ts` re-exporta todo (`plan-rules` se añade en W4).

- [ ] **Step 1: Test que falla**

```ts
import { describe, expect, it } from 'vitest'
import { detectTimers } from './timers'

describe('detectTimers', () => {
  it('minutos en español', () => {
    expect(detectTimers('Hornea 25 minutos a 180 ºC', 'es')).toEqual([{ start: 7, end: 17, seconds: 1500 }])
  })
  it('varias unidades y formas', () => {
    const r = detectTimers('Cuece 1 hora y deja reposar 10 min. Remueve cada 30 segundos.', 'es')
    expect(r.map((t) => t.seconds)).toEqual([3600, 600, 30])
  })
  it('rango usa el valor menor', () => {
    expect(detectTimers('Sofríe 8-10 minutos', 'es')[0]?.seconds).toBe(480)
    expect(detectTimers('Simmer for 20 to 25 minutes', 'en')[0]?.seconds).toBe(1200)
  })
  it('inglés con h/hr/mins/secs', () => {
    const r = detectTimers('Bake 1 hr, then rest 5 mins and whisk 45 secs', 'en')
    expect(r.map((t) => t.seconds)).toEqual([3600, 300, 45])
  })
  it('media hora y hora y media', () => {
    expect(detectTimers('Deja reposar media hora', 'es')[0]?.seconds).toBe(1800)
    expect(detectTimers('Cocina 1 hora y media', 'es')[0]?.seconds).toBe(5400)
  })
  it('ignora temperaturas y cantidades', () => {
    expect(detectTimers('Añade 200 g y 180 ºC', 'es')).toEqual([])
  })
})
```

- [ ] **Step 2: Ejecutar para ver el fallo** — Run: `pnpm test -- lib/domain/timers.test.ts` — Expected: FAIL

- [ ] **Step 3: Implementar `lib/domain/timers.ts`**

```ts
import type { Locale, TimerSpan } from './types'

const UNITS: Record<Locale, { h: string; m: string; s: string }> = {
  es: { h: 'h|hora|horas', m: 'min|mins|minuto|minutos', s: 's|seg|segs|segundo|segundos' },
  en: { h: 'h|hr|hrs|hour|hours', m: 'min|mins|minute|minutes', s: 's|sec|secs|second|seconds' },
}

function toSeconds(n: number, unit: string, locale: Locale): number {
  const u = UNITS[locale]
  if (new RegExp(`^(${u.h})$`).test(unit)) return n * 3600
  if (new RegExp(`^(${u.m})$`).test(unit)) return n * 60
  return n
}

// Detecta "25 minutos", "1 hora y media", "8-10 min", "20 to 25 minutes". En rangos se usa el menor.
export function detectTimers(stepText: string, locale: Locale): TimerSpan[] {
  const u = UNITS[locale]
  const num = String.raw`(\d+(?:[.,]\d+)?)`
  const range = String.raw`(?:\s*(?:-|–|a|to)\s*\d+(?:[.,]\d+)?)?`
  const unit = `(${u.h}|${u.m}|${u.s})`
  const half = locale === 'es' ? String.raw`(?:\s+y\s+media)?` : String.raw`(?:\s+and\s+a\s+half)?`
  const re = new RegExp(`${num}${range}\\s*${unit}${half}(?![a-záéíóú])`, 'gi')
  const out: TimerSpan[] = []
  const text = stepText
  for (const m of text.matchAll(re)) {
    const n = Number((m[1] ?? '0').replace(',', '.'))
    const unitWord = (m[2] ?? '').toLowerCase()
    let seconds = toSeconds(n, unitWord, locale)
    if (/\b(y media|and a half)$/i.test(m[0])) seconds += toSeconds(0.5, unitWord, locale)
    out.push({ start: m.index ?? 0, end: (m.index ?? 0) + m[0].length, seconds })
  }
  const halfHour = locale === 'es' ? /\bmedia hora\b/gi : /\bhalf an hour\b/gi
  for (const m of text.matchAll(halfHour)) out.push({ start: m.index ?? 0, end: (m.index ?? 0) + m[0].length, seconds: 1800 })
  return out.sort((a, b) => a.start - b.start)
}
```

- [ ] **Step 4: `lib/domain/index.ts`**

```ts
export * from './types'
export * from './units-data'
export * from './scaling'
export * from './quantities'
export * from './nutrition'
export * from './ingredients-parser'
export * from './pantry'
export * from './shopping'
export * from './timers'
```

- [ ] **Step 5: Ejecutar** — Run: `pnpm test -- lib/domain` — Expected: todo verde; comprobar cobertura de `lib/domain` al 100 % de líneas con `pnpm vitest run --coverage lib/domain` (configurar `coverage.include: ['lib/domain/**']` y `thresholds.lines: 100` en `vitest.config.ts`).

- [ ] **Step 6: Commit**

```bash
git add lib/domain/timers.ts lib/domain/timers.test.ts lib/domain/index.ts vitest.config.ts
git commit -m "Añade detección de temporizadores y cierra el dominio"
```

---

## Pista (c) · Auth, sesión, hogar

### Task 16: Criptografía: HKDF, AES-GCM y firma de cookie

**Files:**
- Create: `lib/auth/crypto.ts`
- Test: `lib/auth/crypto.test.ts`
- Modify: `.env.example` (`APP_SECRET`, con instrucción `openssl rand -base64 32`)

**Interfaces:**
- Produces: `deriveKeys(appSecret)`, `encryptSecret(plain, key)`, `decryptSecret(blob, key)`, `signValue(value, key)`, `verifySignedValue(signed, key)`, `getKeys()` (lee `APP_SECRET` una vez).

- [ ] **Step 1: Test que falla**

```ts
import { describe, expect, it } from 'vitest'
import { decryptSecret, deriveKeys, encryptSecret, signValue, verifySignedValue } from './crypto'

const keys = deriveKeys('secreto-de-prueba-con-suficiente-longitud')

describe('crypto', () => {
  it('deriva dos claves distintas y deterministas', () => {
    const again = deriveKeys('secreto-de-prueba-con-suficiente-longitud')
    expect(keys.session.equals(again.session)).toBe(true)
    expect(keys.secrets.equals(again.secrets)).toBe(true)
    expect(keys.session.equals(keys.secrets)).toBe(false)
    expect(keys.session.length).toBe(32)
  })
  it('cifra y descifra; dos cifrados del mismo texto difieren (IV aleatorio)', () => {
    const a = encryptSecret('sk-123', keys.secrets)
    const b = encryptSecret('sk-123', keys.secrets)
    expect(a.equals(b)).toBe(false)
    expect(decryptSecret(a, keys.secrets)).toBe('sk-123')
  })
  it('descifrar con otra clave o blob manipulado falla', () => {
    const blob = encryptSecret('x', keys.secrets)
    expect(() => decryptSecret(blob, keys.session)).toThrow()
    const tampered = Buffer.from(blob)
    tampered[tampered.length - 1] = (tampered[tampered.length - 1] ?? 0) ^ 1
    expect(() => decryptSecret(tampered, keys.secrets)).toThrow()
  })
  it('firma y verifica valores; rechaza alteraciones', () => {
    const signed = signValue('abc', keys.session)
    expect(signed.startsWith('abc.')).toBe(true)
    expect(verifySignedValue(signed, keys.session)).toBe('abc')
    expect(verifySignedValue('abd.' + signed.split('.')[1], keys.session)).toBeNull()
    expect(verifySignedValue('sin-punto', keys.session)).toBeNull()
    expect(verifySignedValue(signed, keys.secrets)).toBeNull()
  })
  it('exige secreto de al menos 32 caracteres', () => {
    expect(() => deriveKeys('corto')).toThrow()
  })
})
```

- [ ] **Step 2: Ejecutar para ver el fallo** — Run: `pnpm test -- lib/auth/crypto.test.ts` — Expected: FAIL

- [ ] **Step 3: Implementar `lib/auth/crypto.ts`**

```ts
import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes, timingSafeEqual } from 'node:crypto'

export interface DerivedKeys {
  session: Buffer // HMAC de cookies
  secrets: Buffer // AES-GCM de secretos por hogar
}

// APP_SECRET nunca se usa directo: dos claves por HKDF con `info` distinto
export function deriveKeys(appSecret: string): DerivedKeys {
  if (appSecret.length < 32) throw new Error('APP_SECRET debe tener al menos 32 caracteres')
  const derive = (info: string) => Buffer.from(hkdfSync('sha256', appSecret, 'rezetapp', info, 32))
  return { session: derive('rezetapp/session'), secrets: derive('rezetapp/secrets') }
}

let cached: DerivedKeys | null = null
export function getKeys(): DerivedKeys {
  if (!cached) {
    const secret = process.env.APP_SECRET
    if (!secret) throw new Error('Falta APP_SECRET')
    cached = deriveKeys(secret)
  }
  return cached
}

// Formato: iv(12) || tag(16) || ciphertext
export function encryptSecret(plain: string, key: Buffer): Buffer {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), enc])
}

export function decryptSecret(blob: Buffer, key: Buffer): string {
  const iv = blob.subarray(0, 12)
  const tag = blob.subarray(12, 28)
  const data = blob.subarray(28)
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')
}

function hmac(value: string, key: Buffer): string {
  return createHmac('sha256', key).update(value).digest('base64url')
}

export function signValue(value: string, key: Buffer): string {
  return `${value}.${hmac(value, key)}`
}

export function verifySignedValue(signed: string, key: Buffer): string | null {
  const dot = signed.lastIndexOf('.')
  if (dot <= 0) return null
  const value = signed.slice(0, dot)
  const sig = signed.slice(dot + 1)
  const expected = hmac(value, key)
  if (sig.length !== expected.length) return null
  return timingSafeEqual(Buffer.from(sig), Buffer.from(expected)) ? value : null
}
```

- [ ] **Step 4: Ejecutar** — Run: `pnpm test -- lib/auth/crypto.test.ts` — Expected: 5 passed

- [ ] **Step 5: Commit**

```bash
git add lib/auth/crypto.ts lib/auth/crypto.test.ts .env.example
git commit -m "Añade derivación de claves, cifrado y firma de cookies"
```

### Task 17: Sesiones y cookie `rz_session`

**Files:**
- Create: `lib/auth/session.ts`, `lib/auth/cookies.ts`
- Test: `lib/auth/session.test.ts` (contra Postgres de test)

**Interfaces:**
- Consumes: `sessions`, `householdMembers` (schema), `getKeys`, `signValue`, `verifySignedValue`.
- Produces: `createSession(db, {userId, householdId, userAgent}) → {id, cookieValue}`, `resolveSession(db, cookieValue) → SessionWithUser | null`, `destroySession(db, id)`, `switchHousehold(db, sessionId, householdId)`, `SESSION_COOKIE = 'rz_session'`, `PREFS_COOKIE = 'rz_prefs'`, `sessionCookieOptions(appUrl)`, `prefsCookieValue(user)`.

- [ ] **Step 1: Test que falla**

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { closeTestDb, getTestDb, truncateAll, type TestDb } from '@/db/test/setup'
import * as schema from '@/db/schema'
import { createSession, destroySession, resolveSession, switchHousehold } from './session'

process.env.APP_SECRET = 'secreto-de-prueba-con-suficiente-longitud-1234'
let db: TestDb
let userId: string
let h1: string
let h2: string

beforeAll(async () => { db = await getTestDb() })
afterAll(closeTestDb)
beforeEach(async () => {
  await truncateAll(db)
  const [u] = await db.insert(schema.users).values({ displayName: 'Ana' }).returning()
  const [a] = await db.insert(schema.households).values({ name: 'Casa A' }).returning()
  const [b] = await db.insert(schema.households).values({ name: 'Casa B' }).returning()
  if (!u || !a || !b) throw new Error('seed')
  userId = u.id; h1 = a.id; h2 = b.id
  await db.insert(schema.householdMembers).values([{ householdId: h1, userId, role: 'owner' }, { householdId: h2, userId, role: 'member' }])
})

describe('session', () => {
  it('crea sesión y la resuelve desde la cookie firmada', async () => {
    const s = await createSession(db, { userId, householdId: h1, userAgent: 'test' })
    expect(s.cookieValue).toMatch(/^[A-Za-z0-9_-]{43}\.[A-Za-z0-9_-]+$/)
    const r = await resolveSession(db, s.cookieValue)
    expect(r?.user.id).toBe(userId)
    expect(r?.session.householdId).toBe(h1)
    expect(r?.role).toBe('owner')
  })
  it('cookie manipulada o sesión caducada → null', async () => {
    const s = await createSession(db, { userId, householdId: h1, userAgent: null })
    expect(await resolveSession(db, s.cookieValue.slice(0, -2) + 'zz')).toBeNull()
    await db.update(schema.sessions).set({ expiresAt: new Date(Date.now() - 1000) })
    expect(await resolveSession(db, s.cookieValue)).toBeNull()
  })
  it('cambiar de hogar solo a uno del que es miembro', async () => {
    const s = await createSession(db, { userId, householdId: h1, userAgent: null })
    await switchHousehold(db, s.id, h2)
    expect((await resolveSession(db, s.cookieValue))?.session.householdId).toBe(h2)
    await expect(switchHousehold(db, s.id, '00000000-0000-0000-0000-000000000000')).rejects.toThrow()
  })
  it('destruir invalida', async () => {
    const s = await createSession(db, { userId, householdId: h1, userAgent: null })
    await destroySession(db, s.id)
    expect(await resolveSession(db, s.cookieValue)).toBeNull()
  })
})
```

- [ ] **Step 2: Ejecutar para ver el fallo** — Run: `pnpm test -- lib/auth/session.test.ts` — Expected: FAIL

- [ ] **Step 3: Implementar `lib/auth/cookies.ts`**

```ts
import type { User } from '@/db/schema'

export const SESSION_COOKIE = 'rz_session'
export const PREFS_COOKIE = 'rz_prefs'
export const SESSION_DAYS = 90

export interface CookieOptions {
  httpOnly: boolean
  sameSite: 'lax'
  secure: boolean
  path: string
  maxAge: number
}

export function sessionCookieOptions(appUrl: string): CookieOptions {
  return { httpOnly: true, sameSite: 'lax', secure: appUrl.startsWith('https://'), path: '/', maxAge: SESSION_DAYS * 86_400 }
}

export function prefsCookieOptions(appUrl: string): CookieOptions {
  return { httpOnly: false, sameSite: 'lax', secure: appUrl.startsWith('https://'), path: '/', maxAge: 365 * 86_400 }
}

export interface Prefs {
  theme: User['theme']
  accent: string
  locale: string
}

// Espejo de users.* para pintar data-theme/data-accent en SSR sin consultar la DB
export function prefsCookieValue(user: Pick<User, 'theme' | 'accent' | 'locale'>): string {
  const p: Prefs = { theme: user.theme, accent: user.accent, locale: user.locale }
  return JSON.stringify(p)
}

export function parsePrefsCookie(value: string | undefined): Prefs | null {
  if (!value) return null
  try {
    const p = JSON.parse(value) as Partial<Prefs>
    if (typeof p.theme !== 'string' || typeof p.accent !== 'string' || typeof p.locale !== 'string') return null
    return { theme: p.theme, accent: p.accent, locale: p.locale }
  } catch {
    return null
  }
}
```

- [ ] **Step 4: Implementar `lib/auth/session.ts`**

```ts
import { randomBytes } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import * as schema from '@/db/schema'
import type { Db } from '@/db/types'
import { getKeys, signValue, verifySignedValue } from './crypto'
import { SESSION_DAYS } from './cookies'

const HOUR_MS = 3_600_000

export interface SessionWithUser {
  session: schema.Session
  user: schema.User
  household: schema.Household
  role: 'owner' | 'member'
}

export async function createSession(db: Db, input: { userId: string; householdId: string; userAgent: string | null }): Promise<{ id: string; cookieValue: string }> {
  const id = randomBytes(32).toString('base64url')
  await db.insert(schema.sessions).values({
    id,
    userId: input.userId,
    householdId: input.householdId,
    userAgent: input.userAgent,
    expiresAt: new Date(Date.now() + SESSION_DAYS * 86_400_000),
  })
  return { id, cookieValue: signValue(id, getKeys().session) }
}

export async function resolveSession(db: Db, cookieValue: string | undefined): Promise<SessionWithUser | null> {
  if (!cookieValue) return null
  const id = verifySignedValue(cookieValue, getKeys().session)
  if (!id) return null
  const rows = await db
    .select({ session: schema.sessions, user: schema.users, household: schema.households, role: schema.householdMembers.role })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.users.id, schema.sessions.userId))
    .innerJoin(schema.households, eq(schema.households.id, schema.sessions.householdId))
    .innerJoin(schema.householdMembers, and(eq(schema.householdMembers.householdId, schema.sessions.householdId), eq(schema.householdMembers.userId, schema.sessions.userId)))
    .where(eq(schema.sessions.id, id))
    .limit(1)
  const row = rows[0]
  if (!row) return null
  if (row.session.expiresAt.getTime() < Date.now()) {
    await db.delete(schema.sessions).where(eq(schema.sessions.id, id))
    return null
  }
  // last_seen_at como mucho una vez por hora
  if (Date.now() - row.session.lastSeenAt.getTime() > HOUR_MS) {
    await db.update(schema.sessions).set({ lastSeenAt: new Date() }).where(eq(schema.sessions.id, id))
  }
  return row
}

export async function switchHousehold(db: Db, sessionId: string, householdId: string): Promise<void> {
  const [s] = await db.select().from(schema.sessions).where(eq(schema.sessions.id, sessionId)).limit(1)
  if (!s) throw new Error('Sesión no encontrada')
  const [m] = await db
    .select()
    .from(schema.householdMembers)
    .where(and(eq(schema.householdMembers.userId, s.userId), eq(schema.householdMembers.householdId, householdId)))
    .limit(1)
  if (!m) throw new Error('No eres miembro de ese hogar')
  await db.update(schema.sessions).set({ householdId }).where(eq(schema.sessions.id, sessionId))
}

export async function destroySession(db: Db, sessionId: string): Promise<void> {
  await db.delete(schema.sessions).where(eq(schema.sessions.id, sessionId))
}
```

- [ ] **Step 5: Ejecutar** — Run: `pnpm test -- lib/auth/session.test.ts` — Expected: 4 passed

- [ ] **Step 6: Commit**

```bash
git add lib/auth/session.ts lib/auth/cookies.ts lib/auth/session.test.ts
git commit -m "Añade sesiones con cookie firmada"
```

### Task 18: WebAuthn: registro y login con credenciales descubribles

**Files:**
- Create: `lib/auth/webauthn.ts`
- Test: `lib/auth/webauthn.test.ts`

**Interfaces:**
- Consumes: `@simplewebauthn/server` 13, `webauthnChallenges`, `webauthnCredentials`.
- Produces: `getRp()`, `startRegistration(db, displayName)`, `finishRegistration(db, {challengeId, response})`, `startLogin(db)`, `finishLogin(db, {challengeId, response})`, `addCredentialToUser(db, userId, ...)` (para ajustes → W2).

- [ ] **Step 1: Test que falla** (solo la parte determinista; la verificación real se prueba en e2e con autenticador virtual)

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'
import { closeTestDb, getTestDb, truncateAll, type TestDb } from '@/db/test/setup'
import { getRp, startLogin, startRegistration } from './webauthn'

process.env.APP_URL = 'http://localhost:3000'
let db: TestDb
beforeAll(async () => { db = await getTestDb() })
afterAll(closeTestDb)
beforeEach(async () => { await truncateAll(db) })

describe('webauthn', () => {
  it('rpID y origin salen de APP_URL', () => {
    expect(getRp()).toEqual({ rpID: 'localhost', origin: 'http://localhost:3000', rpName: 'RezetApp' })
    process.env.APP_URL = 'https://recetas.ejemplo.es'
    expect(getRp()).toEqual({ rpID: 'recetas.ejemplo.es', origin: 'https://recetas.ejemplo.es', rpName: 'RezetApp' })
    process.env.APP_URL = 'http://localhost:3000'
  })
  it('opciones de registro exigen credencial descubrible y guardan el reto 5 min', async () => {
    const { challengeId, options } = await startRegistration(db, 'Ana')
    expect(options.authenticatorSelection?.residentKey).toBe('required')
    expect(options.authenticatorSelection?.userVerification).toBe('preferred')
    expect(options.rp.id).toBe('localhost')
    expect(options.user.name).toBe('Ana')
    const r = await db.execute(sql`SELECT kind, expires_at FROM webauthn_challenges WHERE id = ${challengeId}`)
    const row = r.rows[0] as { kind: string; expires_at: Date }
    expect(row.kind).toBe('register')
    expect(row.expires_at.getTime() - Date.now()).toBeGreaterThan(4 * 60_000)
  })
  it('opciones de login no restringen credenciales', async () => {
    const { options } = await startLogin(db)
    expect(options.allowCredentials === undefined || options.allowCredentials.length === 0).toBe(true)
    expect(options.rpId).toBe('localhost')
  })
})
```

- [ ] **Step 2: Ejecutar para ver el fallo** — Run: `pnpm test -- lib/auth/webauthn.test.ts` — Expected: FAIL

- [ ] **Step 3: Implementar `lib/auth/webauthn.ts`**

```ts
import { and, eq, gt } from 'drizzle-orm'
import {
  generateAuthenticationOptions, generateRegistrationOptions, verifyAuthenticationResponse, verifyRegistrationResponse,
  type AuthenticationResponseJSON, type PublicKeyCredentialCreationOptionsJSON, type PublicKeyCredentialRequestOptionsJSON,
  type RegistrationResponseJSON,
} from '@simplewebauthn/server'
import * as schema from '@/db/schema'
import type { Db } from '@/db/types'

const CHALLENGE_MINUTES = 5

export function getRp(): { rpID: string; origin: string; rpName: string } {
  const url = new URL(process.env.APP_URL ?? 'http://localhost:3000')
  return { rpID: url.hostname, origin: url.origin, rpName: 'RezetApp' }
}

async function saveChallenge(db: Db, challenge: string, kind: 'register' | 'login', userId: string | null): Promise<string> {
  const [row] = await db
    .insert(schema.webauthnChallenges)
    .values({ challenge, kind, userId, expiresAt: new Date(Date.now() + CHALLENGE_MINUTES * 60_000) })
    .returning({ id: schema.webauthnChallenges.id })
  if (!row) throw new Error('No se pudo guardar el reto')
  return row.id
}

// Consume el reto: se borra al usarlo, caducado no vale
async function takeChallenge(db: Db, id: string, kind: 'register' | 'login'): Promise<{ challenge: string; userId: string | null }> {
  const [row] = await db
    .delete(schema.webauthnChallenges)
    .where(and(eq(schema.webauthnChallenges.id, id), eq(schema.webauthnChallenges.kind, kind), gt(schema.webauthnChallenges.expiresAt, new Date())))
    .returning()
  if (!row) throw new Error('Reto inválido o caducado')
  return { challenge: row.challenge, userId: row.userId }
}

export async function startRegistration(db: Db, displayName: string, userId: string | null = null): Promise<{ challengeId: string; options: PublicKeyCredentialCreationOptionsJSON }> {
  const { rpID, rpName } = getRp()
  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userName: displayName,
    userDisplayName: displayName,
    attestationType: 'none',
    // Obligatorio: el login usa credenciales descubribles (sin allowCredentials)
    authenticatorSelection: { residentKey: 'required', userVerification: 'preferred' },
  })
  const challengeId = await saveChallenge(db, options.challenge, 'register', userId)
  return { challengeId, options }
}

export interface VerifiedCredential {
  credentialId: string
  publicKey: Buffer
  counter: number
  transports: string[]
  deviceType: string
  backedUp: boolean
}

export async function finishRegistration(db: Db, input: { challengeId: string; response: RegistrationResponseJSON }): Promise<VerifiedCredential> {
  const { rpID, origin } = getRp()
  const { challenge } = await takeChallenge(db, input.challengeId, 'register')
  const v = await verifyRegistrationResponse({ response: input.response, expectedChallenge: challenge, expectedOrigin: origin, expectedRPID: rpID })
  if (!v.verified || !v.registrationInfo) throw new Error('Registro no verificado')
  const c = v.registrationInfo.credential
  return {
    credentialId: c.id,
    publicKey: Buffer.from(c.publicKey),
    counter: c.counter,
    transports: c.transports ?? [],
    deviceType: v.registrationInfo.credentialDeviceType,
    backedUp: v.registrationInfo.credentialBackedUp,
  }
}

export async function startLogin(db: Db): Promise<{ challengeId: string; options: PublicKeyCredentialRequestOptionsJSON }> {
  const { rpID } = getRp()
  const options = await generateAuthenticationOptions({ rpID, userVerification: 'preferred' })
  const challengeId = await saveChallenge(db, options.challenge, 'login', null)
  return { challengeId, options }
}

export async function finishLogin(db: Db, input: { challengeId: string; response: AuthenticationResponseJSON }): Promise<{ userId: string }> {
  const { rpID, origin } = getRp()
  const { challenge } = await takeChallenge(db, input.challengeId, 'login')
  const [cred] = await db.select().from(schema.webauthnCredentials).where(eq(schema.webauthnCredentials.credentialId, input.response.id)).limit(1)
  if (!cred) throw new Error('Credencial desconocida')
  const v = await verifyAuthenticationResponse({
    response: input.response,
    expectedChallenge: challenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    credential: { id: cred.credentialId, publicKey: new Uint8Array(cred.publicKey), counter: cred.counter, transports: cred.transports as AuthenticatorTransport[] },
  })
  if (!v.verified) throw new Error('Autenticación no verificada')
  await db
    .update(schema.webauthnCredentials)
    .set({ counter: v.authenticationInfo.newCounter, lastUsedAt: new Date() })
    .where(eq(schema.webauthnCredentials.credentialId, cred.credentialId))
  return { userId: cred.userId }
}

export async function saveCredential(db: Db, userId: string, c: VerifiedCredential, name: string | null): Promise<void> {
  await db.insert(schema.webauthnCredentials).values({
    credentialId: c.credentialId, userId, publicKey: c.publicKey, counter: c.counter, transports: c.transports, deviceType: c.deviceType, backedUp: c.backedUp, name,
  })
}
```

(`AuthenticatorTransport` es un tipo global del DOM lib; si `tsconfig` no incluye `dom`, importarlo como `AuthenticatorTransportFuture` de `@simplewebauthn/server`.)

- [ ] **Step 4: Ejecutar** — Run: `pnpm test -- lib/auth/webauthn.test.ts` — Expected: 3 passed

- [ ] **Step 5: Commit**

```bash
git add lib/auth/webauthn.ts lib/auth/webauthn.test.ts
git commit -m "Añade registro y login WebAuthn con credenciales descubribles"
```

### Task 19: Servicio de hogares: crear, invitar, aceptar, salir, borrar

**Files:**
- Create: `lib/services/ctx.ts`, `lib/services/households.ts`
- Test: `lib/services/households.test.ts`

**Interfaces:**
- Produces: `Ctx`; `createUserWithHousehold(db, {displayName, credential, locale})`, `createInvite(ctx) → {token, url}`, `getInvite(db, token)`, `acceptInvite(db, {token, userId})`, `registerViaInvite(db, {token, displayName, credential, locale})`, `leaveHousehold(ctx)`, `deleteHousehold(ctx, confirmName)`, `listHouseholdsOf(db, userId)`.

- [ ] **Step 1: `lib/services/ctx.ts`**

```ts
import type { Locale } from '@/lib/domain/types'
import type { Db } from '@/db/types'

export type { Db }

// Contexto de toda operación de servicio. Exactamente uno de userId/apiTokenId es no nulo.
export interface Ctx {
  db: Db
  householdId: string
  userId: string | null
  apiTokenId: string | null
  role: 'owner' | 'member' | null // null cuando actúa un token
  locale: Locale
}

export class ServiceError extends Error {
  constructor(public readonly code: 'not_found' | 'forbidden' | 'conflict' | 'validation', message: string) {
    super(message)
  }
}
```

- [ ] **Step 2: Test que falla**

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { eq, sql } from 'drizzle-orm'
import { closeTestDb, getTestDb, truncateAll, type TestDb } from '@/db/test/setup'
import * as schema from '@/db/schema'
import type { Ctx } from './ctx'
import { acceptInvite, createInvite, createUserWithHousehold, deleteHousehold, getInvite, leaveHousehold, listHouseholdsOf, registerViaInvite } from './households'
import type { VerifiedCredential } from '@/lib/auth/webauthn'

process.env.APP_URL = 'http://localhost:3000'
process.env.APP_SECRET = 'secreto-de-prueba-con-suficiente-longitud-1234'
let db: TestDb
const cred = (id: string): VerifiedCredential => ({ credentialId: id, publicKey: Buffer.from([1, 2, 3]), counter: 0, transports: ['internal'], deviceType: 'singleDevice', backedUp: false })
const ctxOf = (householdId: string, userId: string, role: 'owner' | 'member'): Ctx => ({ db, householdId, userId, apiTokenId: null, role, locale: 'es' })

beforeAll(async () => { db = await getTestDb() })
afterAll(closeTestDb)
beforeEach(async () => { await truncateAll(db) })

describe('households', () => {
  it('registro crea usuario, hogar "Casa de X", owner y credencial en una transacción', async () => {
    const r = await createUserWithHousehold(db, { displayName: 'Ana', credential: cred('c1'), locale: 'es' })
    const [h] = await db.select().from(schema.households).where(eq(schema.households.id, r.householdId))
    expect(h?.name).toBe('Casa de Ana')
    expect(h?.defaultServings).toBe(2)
    const members = await db.select().from(schema.householdMembers).where(eq(schema.householdMembers.userId, r.userId))
    expect(members[0]?.role).toBe('owner')
    const creds = await db.select().from(schema.webauthnCredentials).where(eq(schema.webauthnCredentials.userId, r.userId))
    expect(creds).toHaveLength(1)
  })
  it('invitación: token de 24 h, aceptar añade como member y marca usada', async () => {
    const a = await createUserWithHousehold(db, { displayName: 'Ana', credential: cred('c1'), locale: 'es' })
    const b = await createUserWithHousehold(db, { displayName: 'Bo', credential: cred('c2'), locale: 'en' })
    const inv = await createInvite(ctxOf(a.householdId, a.userId, 'owner'))
    expect(inv.url).toBe(`http://localhost:3000/invite/${inv.token}`)
    expect((await getInvite(db, inv.token))?.householdName).toBe('Casa de Ana')
    await acceptInvite(db, { token: inv.token, userId: b.userId })
    const hs = await listHouseholdsOf(db, b.userId)
    expect(hs.map((h) => h.role).sort()).toEqual(['member', 'owner'])
    await expect(acceptInvite(db, { token: inv.token, userId: b.userId })).rejects.toThrow()
  })
  it('un member no puede invitar', async () => {
    const a = await createUserWithHousehold(db, { displayName: 'Ana', credential: cred('c1'), locale: 'es' })
    await expect(createInvite(ctxOf(a.householdId, a.userId, 'member'))).rejects.toThrow()
  })
  it('registro vía invitación no crea hogar propio', async () => {
    const a = await createUserWithHousehold(db, { displayName: 'Ana', credential: cred('c1'), locale: 'es' })
    const inv = await createInvite(ctxOf(a.householdId, a.userId, 'owner'))
    const r = await registerViaInvite(db, { token: inv.token, displayName: 'Cai', credential: cred('c3'), locale: 'es' })
    expect(r.householdId).toBe(a.householdId)
    expect(await listHouseholdsOf(db, r.userId)).toHaveLength(1)
  })
  it('salir: member puede, último owner no', async () => {
    const a = await createUserWithHousehold(db, { displayName: 'Ana', credential: cred('c1'), locale: 'es' })
    const b = await createUserWithHousehold(db, { displayName: 'Bo', credential: cred('c2'), locale: 'en' })
    const inv = await createInvite(ctxOf(a.householdId, a.userId, 'owner'))
    await acceptInvite(db, { token: inv.token, userId: b.userId })
    await leaveHousehold(ctxOf(a.householdId, b.userId, 'member'))
    expect(await listHouseholdsOf(db, b.userId)).toHaveLength(1)
    await expect(leaveHousehold(ctxOf(a.householdId, a.userId, 'owner'))).rejects.toThrow()
  })
  it('borrar hogar: solo owner, con nombre exacto, elimina todo su contenido y sesiones', async () => {
    const a = await createUserWithHousehold(db, { displayName: 'Ana', credential: cred('c1'), locale: 'es' })
    await db.insert(schema.recipes).values({ householdId: a.householdId, title: 'Lentejas' })
    await db.insert(schema.sessions).values({ id: 's1', userId: a.userId, householdId: a.householdId, expiresAt: new Date(Date.now() + 1000) })
    await expect(deleteHousehold(ctxOf(a.householdId, a.userId, 'owner'), 'otro nombre')).rejects.toThrow()
    await expect(deleteHousehold(ctxOf(a.householdId, a.userId, 'member'), 'Casa de Ana')).rejects.toThrow()
    await deleteHousehold(ctxOf(a.householdId, a.userId, 'owner'), 'Casa de Ana')
    expect(await db.select().from(schema.households)).toHaveLength(0)
    expect(await db.select().from(schema.recipes)).toHaveLength(0)
    expect(await db.select().from(schema.sessions)).toHaveLength(0)
    const r = await db.execute(sql`SELECT count(*)::int AS c FROM users`)
    expect((r.rows[0] as { c: number }).c).toBe(1) // el usuario sigue existiendo
  })
})
```

- [ ] **Step 3: Ejecutar para ver el fallo** — Run: `pnpm test -- lib/services/households.test.ts` — Expected: FAIL

- [ ] **Step 4: Implementar `lib/services/households.ts`**

```ts
import { randomBytes } from 'node:crypto'
import { and, eq, gt, inArray, isNull } from 'drizzle-orm'
import * as schema from '@/db/schema'
import { saveCredential, type VerifiedCredential } from '@/lib/auth/webauthn'
import type { Locale } from '@/lib/domain/types'
import { type Ctx, type Db, ServiceError } from './ctx'

const INVITE_HOURS = 24

export async function createUserWithHousehold(db: Db, input: { displayName: string; credential: VerifiedCredential; locale: Locale }): Promise<{ userId: string; householdId: string }> {
  return db.transaction(async (tx) => {
    const [user] = await tx.insert(schema.users).values({ displayName: input.displayName, locale: input.locale }).returning()
    const [household] = await tx.insert(schema.households).values({ name: `Casa de ${input.displayName}` }).returning()
    if (!user || !household) throw new ServiceError('conflict', 'No se pudo crear el usuario')
    await tx.insert(schema.householdMembers).values({ householdId: household.id, userId: user.id, role: 'owner' })
    await saveCredential(tx, user.id, input.credential, null)
    return { userId: user.id, householdId: household.id }
  })
}

export async function listHouseholdsOf(db: Db, userId: string): Promise<{ id: string; name: string; role: 'owner' | 'member' }[]> {
  return db
    .select({ id: schema.households.id, name: schema.households.name, role: schema.householdMembers.role })
    .from(schema.householdMembers)
    .innerJoin(schema.households, eq(schema.households.id, schema.householdMembers.householdId))
    .where(eq(schema.householdMembers.userId, userId))
    .orderBy(schema.householdMembers.joinedAt)
}

export async function createInvite(ctx: Ctx): Promise<{ token: string; url: string; expiresAt: Date }> {
  if (ctx.role !== 'owner' || !ctx.userId) throw new ServiceError('forbidden', 'Solo el propietario puede invitar')
  const token = randomBytes(24).toString('base64url')
  const expiresAt = new Date(Date.now() + INVITE_HOURS * 3_600_000)
  await ctx.db.insert(schema.householdInvites).values({ token, householdId: ctx.householdId, createdBy: ctx.userId, expiresAt })
  const base = process.env.APP_URL ?? 'http://localhost:3000'
  return { token, url: `${base}/invite/${token}`, expiresAt }
}

export async function getInvite(db: Db, token: string): Promise<{ householdId: string; householdName: string; invitedBy: string } | null> {
  const [row] = await db
    .select({ householdId: schema.households.id, householdName: schema.households.name, invitedBy: schema.users.displayName })
    .from(schema.householdInvites)
    .innerJoin(schema.households, eq(schema.households.id, schema.householdInvites.householdId))
    .innerJoin(schema.users, eq(schema.users.id, schema.householdInvites.createdBy))
    .where(and(eq(schema.householdInvites.token, token), isNull(schema.householdInvites.usedAt), gt(schema.householdInvites.expiresAt, new Date())))
    .limit(1)
  return row ?? null
}

async function consumeInvite(tx: Db, token: string, userId: string): Promise<string> {
  const [inv] = await tx
    .update(schema.householdInvites)
    .set({ usedAt: new Date() })
    .where(and(eq(schema.householdInvites.token, token), isNull(schema.householdInvites.usedAt), gt(schema.householdInvites.expiresAt, new Date())))
    .returning({ householdId: schema.householdInvites.householdId })
  if (!inv) throw new ServiceError('not_found', 'Invitación inválida o caducada')
  await tx.insert(schema.householdMembers).values({ householdId: inv.householdId, userId, role: 'member' }).onConflictDoNothing()
  return inv.householdId
}

export async function acceptInvite(db: Db, input: { token: string; userId: string }): Promise<{ householdId: string }> {
  return db.transaction(async (tx) => ({ householdId: await consumeInvite(tx, input.token, input.userId) }))
}

// Registro desde un enlace de invitación: el usuario entra como member y NO recibe hogar propio
export async function registerViaInvite(db: Db, input: { token: string; displayName: string; credential: VerifiedCredential; locale: Locale }): Promise<{ userId: string; householdId: string }> {
  return db.transaction(async (tx) => {
    const [user] = await tx.insert(schema.users).values({ displayName: input.displayName, locale: input.locale }).returning()
    if (!user) throw new ServiceError('conflict', 'No se pudo crear el usuario')
    await saveCredential(tx, user.id, input.credential, null)
    const householdId = await consumeInvite(tx, input.token, user.id)
    return { userId: user.id, householdId }
  })
}

export async function leaveHousehold(ctx: Ctx): Promise<void> {
  if (!ctx.userId) throw new ServiceError('forbidden', 'Solo un usuario puede salir del hogar')
  await ctx.db.transaction(async (tx) => {
    const owners = await tx.select().from(schema.householdMembers).where(and(eq(schema.householdMembers.householdId, ctx.householdId), eq(schema.householdMembers.role, 'owner')))
    if (ctx.role === 'owner' && owners.length <= 1) throw new ServiceError('conflict', 'El último propietario no puede salir; borra el hogar o nombra otro propietario')
    await tx.delete(schema.householdMembers).where(and(eq(schema.householdMembers.householdId, ctx.householdId), eq(schema.householdMembers.userId, ctx.userId ?? '')))
    await tx.delete(schema.sessions).where(and(eq(schema.sessions.householdId, ctx.householdId), eq(schema.sessions.userId, ctx.userId ?? '')))
  })
}

// Borrado explícito y confirmado. Sin CASCADE en el esquema: el orden de aquí es el contrato.
export async function deleteHousehold(ctx: Ctx, confirmName: string): Promise<void> {
  if (ctx.role !== 'owner') throw new ServiceError('forbidden', 'Solo el propietario puede borrar el hogar')
  await ctx.db.transaction(async (tx) => {
    const [h] = await tx.select().from(schema.households).where(eq(schema.households.id, ctx.householdId)).limit(1)
    if (!h) throw new ServiceError('not_found', 'Hogar no encontrado')
    if (h.name !== confirmName) throw new ServiceError('validation', 'El nombre no coincide')
    const hid = ctx.householdId
    const recipeIds = (await tx.select({ id: schema.recipes.id }).from(schema.recipes).where(eq(schema.recipes.householdId, hid))).map((r) => r.id)
    await tx.delete(schema.cookingLog).where(eq(schema.cookingLog.householdId, hid))
    await tx.delete(schema.planProposals).where(eq(schema.planProposals.householdId, hid))
    await tx.delete(schema.mealPlanEntries).where(eq(schema.mealPlanEntries.householdId, hid))
    await tx.delete(schema.pantryItems).where(eq(schema.pantryItems.householdId, hid))
    if (recipeIds.length) {
      await tx.delete(schema.recipeTags).where(inArray(schema.recipeTags.recipeId, recipeIds))
      await tx.delete(schema.recipeIngredients).where(inArray(schema.recipeIngredients.recipeId, recipeIds))
      await tx.delete(schema.recipeSteps).where(inArray(schema.recipeSteps.recipeId, recipeIds))
    }
    await tx.delete(schema.recipes).where(eq(schema.recipes.householdId, hid))
    await tx.delete(schema.collections).where(eq(schema.collections.householdId, hid))
    await tx.delete(schema.tags).where(eq(schema.tags.householdId, hid))
    await tx.delete(schema.foods).where(eq(schema.foods.householdId, hid))
    await tx.delete(schema.aiUsageLog).where(eq(schema.aiUsageLog.householdId, hid))
    await tx.delete(schema.apiTokens).where(eq(schema.apiTokens.householdId, hid))
    await tx.delete(schema.householdInvites).where(eq(schema.householdInvites.householdId, hid))
    await tx.delete(schema.sessions).where(eq(schema.sessions.householdId, hid))
    await tx.delete(schema.householdMembers).where(eq(schema.householdMembers.householdId, hid))
    await tx.delete(schema.households).where(eq(schema.households.id, hid))
  })
}
```

- [ ] **Step 5: Ejecutar** — Run: `pnpm test -- lib/services/households.test.ts` — Expected: 6 passed

- [ ] **Step 6: Commit**

```bash
git add lib/services/ctx.ts lib/services/households.ts lib/services/households.test.ts
git commit -m "Añade servicio de hogares: registro, invitaciones, salir y borrar"
```

### Task 20: Guards para páginas, REST y tokens API

**Files:**
- Create: `lib/auth/guards.ts`, `lib/auth/api-tokens.ts`
- Test: `lib/auth/api-tokens.test.ts`

**Interfaces:**
- Produces: `getCurrentSession()`, `requireSession()`, `requireHousehold() → Ctx`, `requireRole('owner')`, `requireApiToken(request, scopes) → Ctx`, `generateApiToken()`, `hashToken(token)`, `ApiAuthError`.

- [ ] **Step 1: Test que falla (tokens)**

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { closeTestDb, getTestDb, truncateAll, type TestDb } from '@/db/test/setup'
import * as schema from '@/db/schema'
import { ApiAuthError, authenticateApiToken, generateApiToken, hashToken } from './api-tokens'

let db: TestDb
let householdId: string
let userId: string
beforeAll(async () => { db = await getTestDb() })
afterAll(closeTestDb)
beforeEach(async () => {
  await truncateAll(db)
  const [u] = await db.insert(schema.users).values({ displayName: 'Ana' }).returning()
  const [h] = await db.insert(schema.households).values({ name: 'Casa' }).returning()
  if (!u || !h) throw new Error('seed')
  userId = u.id; householdId = h.id
})

describe('api tokens', () => {
  it('genera token con prefijo rz_ y hash sha256', () => {
    const t = generateApiToken()
    expect(t).toMatch(/^rz_[A-Za-z0-9_-]{43}$/)
    expect(hashToken(t)).toMatch(/^[0-9a-f]{64}$/)
  })
  it('autentica por Bearer y exige scopes', async () => {
    const token = generateApiToken()
    await db.insert(schema.apiTokens).values({ householdId, userId, name: 'test', tokenHash: hashToken(token), scopes: ['recipes:read'] })
    const ctx = await authenticateApiToken(db, `Bearer ${token}`, ['recipes:read'])
    expect(ctx.householdId).toBe(householdId)
    expect(ctx.userId).toBeNull()
    expect(ctx.apiTokenId).toBeTruthy()
    await expect(authenticateApiToken(db, `Bearer ${token}`, ['recipes:write'])).rejects.toMatchObject({ status: 403 })
    await expect(authenticateApiToken(db, `Bearer rz_falso`, [])).rejects.toMatchObject({ status: 401 })
    await expect(authenticateApiToken(db, undefined, [])).rejects.toBeInstanceOf(ApiAuthError)
  })
  it('token revocado no vale y actualiza last_used_at al usarlo', async () => {
    const token = generateApiToken()
    const [row] = await db.insert(schema.apiTokens).values({ householdId, userId, name: 't', tokenHash: hashToken(token), scopes: [] }).returning()
    await authenticateApiToken(db, `Bearer ${token}`, [])
    const [after] = await db.select().from(schema.apiTokens)
    expect(after?.lastUsedAt).not.toBeNull()
    await db.update(schema.apiTokens).set({ revokedAt: new Date() })
    await expect(authenticateApiToken(db, `Bearer ${token}`, [])).rejects.toMatchObject({ status: 401 })
    expect(row).toBeTruthy()
  })
})
```

- [ ] **Step 2: Ejecutar para ver el fallo** — Run: `pnpm test -- lib/auth/api-tokens.test.ts` — Expected: FAIL

- [ ] **Step 3: Implementar `lib/auth/api-tokens.ts`**

```ts
import { createHash, randomBytes } from 'node:crypto'
import { and, eq, isNull } from 'drizzle-orm'
import * as schema from '@/db/schema'
import type { ApiScope } from '@/db/schema'
import type { Ctx, Db } from '@/lib/services/ctx'

export class ApiAuthError extends Error {
  constructor(public readonly status: 401 | 403, message: string) {
    super(message)
  }
}

export function generateApiToken(): string {
  return `rz_${randomBytes(32).toString('base64url')}`
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export async function authenticateApiToken(db: Db, authorization: string | undefined, requiredScopes: ApiScope[]): Promise<Ctx & { mcpProfile: 'basic' | 'full'; scopes: string[] }> {
  const token = authorization?.startsWith('Bearer ') ? authorization.slice(7).trim() : null
  if (!token || !token.startsWith('rz_')) throw new ApiAuthError(401, 'Token ausente')
  const [row] = await db
    .select({ token: schema.apiTokens, locale: schema.users.locale })
    .from(schema.apiTokens)
    .innerJoin(schema.users, eq(schema.users.id, schema.apiTokens.userId))
    .where(and(eq(schema.apiTokens.tokenHash, hashToken(token)), isNull(schema.apiTokens.revokedAt)))
    .limit(1)
  if (!row) throw new ApiAuthError(401, 'Token inválido o revocado')
  const missing = requiredScopes.filter((s) => !row.token.scopes.includes(s))
  if (missing.length) throw new ApiAuthError(403, `Faltan permisos: ${missing.join(', ')}`)
  await db.update(schema.apiTokens).set({ lastUsedAt: new Date() }).where(eq(schema.apiTokens.id, row.token.id))
  return {
    db,
    householdId: row.token.householdId,
    userId: null,
    apiTokenId: row.token.id,
    role: null,
    locale: row.locale === 'en' ? 'en' : 'es',
    mcpProfile: row.token.mcpProfile,
    scopes: row.token.scopes,
  }
}
```

- [ ] **Step 4: Implementar `lib/auth/guards.ts`** (solo servidor; usa `next/headers`)

```ts
import 'server-only'
import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { cache } from 'react'
import { db } from '@/db'
import type { ApiScope } from '@/db/schema'
import type { Ctx } from '@/lib/services/ctx'
import { ApiAuthError, authenticateApiToken } from './api-tokens'
import { SESSION_COOKIE } from './cookies'
import { resolveSession, type SessionWithUser } from './session'

// Una resolución por petición (React cache)
export const getCurrentSession = cache(async (): Promise<SessionWithUser | null> => {
  const jar = await cookies()
  return resolveSession(db, jar.get(SESSION_COOKIE)?.value)
})

export async function requireSession(): Promise<SessionWithUser> {
  const s = await getCurrentSession()
  if (!s) redirect('/login')
  return s
}

export async function requireHousehold(): Promise<Ctx & { session: SessionWithUser }> {
  const s = await requireSession()
  return { db, householdId: s.household.id, userId: s.user.id, apiTokenId: null, role: s.role, locale: s.user.locale === 'en' ? 'en' : 'es', session: s }
}

export async function requireRole(role: 'owner'): Promise<Ctx & { session: SessionWithUser }> {
  const ctx = await requireHousehold()
  if (ctx.role !== role) redirect('/today')
  return ctx
}

// Para REST y MCP: Bearer rz_… o, si no hay cabecera, la cookie de sesión (la UI llama a /api/v1 desde el navegador)
export async function requireApiToken(request: Request, scopes: ApiScope[]): Promise<Ctx> {
  const auth = request.headers.get('authorization') ?? undefined
  if (auth) return authenticateApiToken(db, auth, scopes)
  const s = await getCurrentSession()
  if (!s) throw new ApiAuthError(401, 'No autenticado')
  return { db, householdId: s.household.id, userId: s.user.id, apiTokenId: null, role: s.role, locale: s.user.locale === 'en' ? 'en' : 'es' }
}

export function apiErrorResponse(e: unknown): Response {
  if (e instanceof ApiAuthError) return Response.json({ error: { code: e.status === 401 ? 'unauthorized' : 'forbidden', message: e.message } }, { status: e.status })
  throw e
}

export async function currentUserAgent(): Promise<string | null> {
  return (await headers()).get('user-agent')
}
```

Instalar `pnpm add server-only`.

- [ ] **Step 5: Ejecutar** — Run: `pnpm test -- lib/auth/api-tokens.test.ts && pnpm typecheck` — Expected: 3 passed, sin errores de tipos

- [ ] **Step 6: Commit**

```bash
git add lib/auth/guards.ts lib/auth/api-tokens.ts lib/auth/api-tokens.test.ts package.json pnpm-lock.yaml
git commit -m "Añade guards de sesión y autenticación por token API"
```

### Task 21: Endpoints y pantallas de registro, login e invitación

**Files:**
- Create: `app/api/auth/register/options/route.ts`, `app/api/auth/register/verify/route.ts`, `app/api/auth/login/options/route.ts`, `app/api/auth/login/verify/route.ts`, `app/api/auth/logout/route.ts`, `app/(auth)/register/page.tsx`, `app/(auth)/login/page.tsx`, `app/(auth)/invite/[token]/page.tsx`, `components/auth/passkey-register-form.tsx`, `components/auth/passkey-login-button.tsx`, `lib/auth/set-session-cookie.ts`
- Modify: `messages/es/auth.json`, `messages/en/auth.json`, `app/(app)/layout.tsx` (llama a `requireSession()`), `lib/validation/household.ts` (Tarea 23 — si (d) aún no ha mergeado, definir aquí `RegisterBody` y mover después)

**Interfaces:**
- Consumes: Tareas 17–19; `startRegistration`/`startAuthentication` de `@simplewebauthn/browser`.
- Produces: contrato HTTP: `POST /api/auth/register/options {displayName, inviteToken?} → {challengeId, options}`; `POST /api/auth/register/verify {challengeId, displayName, inviteToken?, response} → {ok, redirect}`; `POST /api/auth/login/options → {challengeId, options}`; `POST /api/auth/login/verify {challengeId, response} → {ok, redirect}`; `POST /api/auth/logout`.

- [ ] **Step 1: Mensajes** — `messages/es/auth.json`:

```json
{
  "register": { "title": "Crea tu cuenta", "name": "Tu nombre", "namePlaceholder": "Ana", "submit": "Crear passkey", "hint": "Sin contraseñas: usarás la huella, la cara o el PIN de tu dispositivo.", "haveAccount": "¿Ya tienes cuenta?", "login": "Entrar" },
  "login": { "title": "Entrar", "submit": "Entrar con passkey", "noAccount": "¿Primera vez?", "register": "Crear cuenta" },
  "invite": { "title": "Te invitan a {household}", "by": "Invitación de {name}", "join": "Unirme", "joinAs": "Unirme como {name}", "invalid": "Esta invitación no es válida o ha caducado.", "newAccount": "Crea tu cuenta para unirte" },
  "errors": { "generic": "Algo ha fallado. Inténtalo otra vez.", "cancelled": "Operación cancelada.", "unsupported": "Tu navegador no soporta passkeys." }
}
```

`messages/en/auth.json` con las mismas claves en inglés (`"title": "Create your account"`, `"submit": "Create passkey"`, etc.).

- [ ] **Step 2: `lib/auth/set-session-cookie.ts`** (helper compartido por los verify)

```ts
import 'server-only'
import { cookies } from 'next/headers'
import { db } from '@/db'
import * as schema from '@/db/schema'
import { eq } from 'drizzle-orm'
import { PREFS_COOKIE, SESSION_COOKIE, prefsCookieOptions, prefsCookieValue, sessionCookieOptions } from './cookies'
import { createSession } from './session'

export async function startSessionFor(userId: string, householdId: string, userAgent: string | null): Promise<void> {
  const appUrl = process.env.APP_URL ?? 'http://localhost:3000'
  const s = await createSession(db, { userId, householdId, userAgent })
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1)
  const jar = await cookies()
  jar.set(SESSION_COOKIE, s.cookieValue, sessionCookieOptions(appUrl))
  if (user) jar.set(PREFS_COOKIE, prefsCookieValue(user), prefsCookieOptions(appUrl))
}
```

- [ ] **Step 3: Route handlers**

`app/api/auth/register/options/route.ts`:

```ts
import { z } from 'zod'
import { db } from '@/db'
import { startRegistration } from '@/lib/auth/webauthn'
import { getInvite } from '@/lib/services/households'

const Body = z.strictObject({ displayName: z.string().trim().min(1).max(60), inviteToken: z.string().optional() })

export async function POST(request: Request): Promise<Response> {
  const parsed = Body.safeParse(await request.json())
  if (!parsed.success) return Response.json({ error: { code: 'validation', message: 'Datos inválidos' } }, { status: 400 })
  if (parsed.data.inviteToken && !(await getInvite(db, parsed.data.inviteToken))) {
    return Response.json({ error: { code: 'invalid_invite', message: 'Invitación inválida' } }, { status: 400 })
  }
  const r = await startRegistration(db, parsed.data.displayName)
  return Response.json(r)
}
```

`app/api/auth/register/verify/route.ts`:

```ts
import { z } from 'zod'
import type { RegistrationResponseJSON } from '@simplewebauthn/server'
import { db } from '@/db'
import { finishRegistration } from '@/lib/auth/webauthn'
import { startSessionFor } from '@/lib/auth/set-session-cookie'
import { createUserWithHousehold, registerViaInvite } from '@/lib/services/households'

const Body = z.strictObject({
  challengeId: z.uuid(),
  displayName: z.string().trim().min(1).max(60),
  inviteToken: z.string().optional(),
  locale: z.enum(['es', 'en']).default('es'),
  response: z.custom<RegistrationResponseJSON>((v) => typeof v === 'object' && v !== null && 'id' in v),
})

export async function POST(request: Request): Promise<Response> {
  const parsed = Body.safeParse(await request.json())
  if (!parsed.success) return Response.json({ error: { code: 'validation', message: 'Datos inválidos' } }, { status: 400 })
  const { challengeId, displayName, inviteToken, locale, response } = parsed.data
  try {
    const credential = await finishRegistration(db, { challengeId, response })
    const r = inviteToken
      ? await registerViaInvite(db, { token: inviteToken, displayName, credential, locale })
      : await createUserWithHousehold(db, { displayName, credential, locale })
    await startSessionFor(r.userId, r.householdId, request.headers.get('user-agent'))
    return Response.json({ ok: true, redirect: '/today' })
  } catch (e) {
    return Response.json({ error: { code: 'webauthn', message: e instanceof Error ? e.message : 'Error' } }, { status: 400 })
  }
}
```

`app/api/auth/login/options/route.ts`:

```ts
import { db } from '@/db'
import { startLogin } from '@/lib/auth/webauthn'

export async function POST(): Promise<Response> {
  return Response.json(await startLogin(db))
}
```

`app/api/auth/login/verify/route.ts`:

```ts
import { z } from 'zod'
import type { AuthenticationResponseJSON } from '@simplewebauthn/server'
import { db } from '@/db'
import { finishLogin } from '@/lib/auth/webauthn'
import { startSessionFor } from '@/lib/auth/set-session-cookie'
import { acceptInvite, listHouseholdsOf } from '@/lib/services/households'

const Body = z.strictObject({
  challengeId: z.uuid(),
  inviteToken: z.string().optional(),
  response: z.custom<AuthenticationResponseJSON>((v) => typeof v === 'object' && v !== null && 'id' in v),
})

export async function POST(request: Request): Promise<Response> {
  const parsed = Body.safeParse(await request.json())
  if (!parsed.success) return Response.json({ error: { code: 'validation', message: 'Datos inválidos' } }, { status: 400 })
  try {
    const { userId } = await finishLogin(db, { challengeId: parsed.data.challengeId, response: parsed.data.response })
    let householdId: string | undefined
    if (parsed.data.inviteToken) householdId = (await acceptInvite(db, { token: parsed.data.inviteToken, userId })).householdId
    const households = await listHouseholdsOf(db, userId)
    householdId ??= households[0]?.id
    if (!householdId) return Response.json({ error: { code: 'no_household', message: 'Sin hogar' } }, { status: 409 })
    await startSessionFor(userId, householdId, request.headers.get('user-agent'))
    return Response.json({ ok: true, redirect: '/today' })
  } catch (e) {
    return Response.json({ error: { code: 'webauthn', message: e instanceof Error ? e.message : 'Error' } }, { status: 401 })
  }
}
```

`app/api/auth/logout/route.ts`:

```ts
import { cookies } from 'next/headers'
import { db } from '@/db'
import { SESSION_COOKIE } from '@/lib/auth/cookies'
import { getKeys, verifySignedValue } from '@/lib/auth/crypto'
import { destroySession } from '@/lib/auth/session'

export async function POST(): Promise<Response> {
  const jar = await cookies()
  const value = jar.get(SESSION_COOKIE)?.value
  const id = value ? verifySignedValue(value, getKeys().session) : null
  if (id) await destroySession(db, id)
  jar.delete(SESSION_COOKIE)
  return Response.json({ ok: true })
}
```

- [ ] **Step 4: Componentes cliente**

`components/auth/passkey-register-form.tsx`:

```tsx
'use client'
import { startRegistration } from '@simplewebauthn/browser'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function PasskeyRegisterForm({ inviteToken, locale }: { inviteToken?: string; locale: 'es' | 'en' }) {
  const t = useTranslations('auth')
  const router = useRouter()
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const opt = await fetch('/api/auth/register/options', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ displayName, inviteToken }) })
      if (!opt.ok) throw new Error('options')
      const { challengeId, options } = (await opt.json()) as { challengeId: string; options: Parameters<typeof startRegistration>[0]['optionsJSON'] }
      const response = await startRegistration({ optionsJSON: options })
      const ver = await fetch('/api/auth/register/verify', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ challengeId, displayName, inviteToken, locale, response }) })
      const data = (await ver.json()) as { ok?: boolean; redirect?: string }
      if (!ver.ok || !data.redirect) throw new Error('verify')
      router.push(data.redirect)
    } catch (err) {
      const name = err instanceof Error ? err.name : ''
      setError(name === 'NotAllowedError' ? t('errors.cancelled') : name === 'NotSupportedError' ? t('errors.unsupported') : t('errors.generic'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" data-testid="register-form">
      <div className="flex flex-col gap-2">
        <Label htmlFor="displayName">{t('register.name')}</Label>
        <Input id="displayName" name="displayName" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder={t('register.namePlaceholder')} required maxLength={60} autoComplete="name" />
      </div>
      <p className="text-sm text-[var(--text-2)]">{t('register.hint')}</p>
      {error && <p role="alert" className="text-sm text-[var(--warn)]">{error}</p>}
      <Button type="submit" disabled={busy || !displayName.trim()}>{t('register.submit')}</Button>
    </form>
  )
}
```

`components/auth/passkey-login-button.tsx`:

```tsx
'use client'
import { startAuthentication } from '@simplewebauthn/browser'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/components/ui/button'

export function PasskeyLoginButton({ inviteToken }: { inviteToken?: string }) {
  const t = useTranslations('auth')
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onClick() {
    setBusy(true)
    setError(null)
    try {
      const opt = await fetch('/api/auth/login/options', { method: 'POST' })
      const { challengeId, options } = (await opt.json()) as { challengeId: string; options: Parameters<typeof startAuthentication>[0]['optionsJSON'] }
      const response = await startAuthentication({ optionsJSON: options })
      const ver = await fetch('/api/auth/login/verify', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ challengeId, inviteToken, response }) })
      const data = (await ver.json()) as { redirect?: string }
      if (!ver.ok || !data.redirect) throw new Error('verify')
      router.push(data.redirect)
    } catch (err) {
      setError(err instanceof Error && err.name === 'NotAllowedError' ? t('errors.cancelled') : t('errors.generic'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {error && <p role="alert" className="text-sm text-[var(--warn)]">{error}</p>}
      <Button type="button" onClick={onClick} disabled={busy} data-testid="login-button">{t('login.submit')}</Button>
    </div>
  )
}
```

- [ ] **Step 5: Páginas**

`app/(auth)/register/page.tsx`:

```tsx
import { getLocale, getTranslations } from 'next-intl/server'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { PasskeyRegisterForm } from '@/components/auth/passkey-register-form'
import { Card } from '@/components/ui/card'
import { getCurrentSession } from '@/lib/auth/guards'

export default async function RegisterPage() {
  if (await getCurrentSession()) redirect('/today')
  const t = await getTranslations('auth')
  const locale = (await getLocale()) === 'en' ? 'en' : 'es'
  return (
    <Card className="mx-auto w-full max-w-sm p-6">
      <h1 className="font-[var(--f-display)] text-2xl font-semibold">{t('register.title')}</h1>
      <div className="mt-6">
        <PasskeyRegisterForm locale={locale} />
      </div>
      <p className="mt-6 text-sm text-[var(--text-2)]">
        {t('register.haveAccount')} <Link href="/login" className="text-[var(--acc-ink)] underline">{t('register.login')}</Link>
      </p>
    </Card>
  )
}
```

`app/(auth)/login/page.tsx`:

```tsx
import { getTranslations } from 'next-intl/server'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { PasskeyLoginButton } from '@/components/auth/passkey-login-button'
import { Card } from '@/components/ui/card'
import { getCurrentSession } from '@/lib/auth/guards'

export default async function LoginPage() {
  if (await getCurrentSession()) redirect('/today')
  const t = await getTranslations('auth')
  return (
    <Card className="mx-auto w-full max-w-sm p-6">
      <h1 className="font-[var(--f-display)] text-2xl font-semibold">{t('login.title')}</h1>
      <div className="mt-6">
        <PasskeyLoginButton />
      </div>
      <p className="mt-6 text-sm text-[var(--text-2)]">
        {t('login.noAccount')} <Link href="/register" className="text-[var(--acc-ink)] underline">{t('login.register')}</Link>
      </p>
    </Card>
  )
}
```

`app/(auth)/invite/[token]/page.tsx`:

```tsx
import { getLocale, getTranslations } from 'next-intl/server'
import { redirect } from 'next/navigation'
import { db } from '@/db'
import { PasskeyLoginButton } from '@/components/auth/passkey-login-button'
import { PasskeyRegisterForm } from '@/components/auth/passkey-register-form'
import { Card } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { getCurrentSession } from '@/lib/auth/guards'
import { acceptInvite, getInvite } from '@/lib/services/households'
import { switchHousehold } from '@/lib/auth/session'

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const t = await getTranslations('auth')
  const invite = await getInvite(db, token)
  if (!invite) return <Card className="mx-auto w-full max-w-sm p-6"><p role="alert">{t('invite.invalid')}</p></Card>
  const session = await getCurrentSession()
  if (session) {
    // Ya identificado: aceptar y cambiar el hogar activo
    const { householdId } = await acceptInvite(db, { token, userId: session.user.id })
    await switchHousehold(db, session.session.id, householdId)
    redirect('/today')
  }
  const locale = (await getLocale()) === 'en' ? 'en' : 'es'
  return (
    <Card className="mx-auto w-full max-w-sm p-6">
      <h1 className="font-[var(--f-display)] text-2xl font-semibold">{t('invite.title', { household: invite.householdName })}</h1>
      <p className="mt-1 text-sm text-[var(--text-2)]">{t('invite.by', { name: invite.invitedBy })}</p>
      <h2 className="mt-6 text-base font-medium">{t('invite.newAccount')}</h2>
      <div className="mt-3"><PasskeyRegisterForm inviteToken={token} locale={locale} /></div>
      <Separator className="my-6" />
      <PasskeyLoginButton inviteToken={token} />
    </Card>
  )
}
```

- [ ] **Step 6: Proteger `(app)`** — en `app/(app)/layout.tsx` (de W0) añadir al principio del componente `const session = await requireSession()` y pasar `session.user.displayName` a la barra si la muestra.

- [ ] **Step 7: Comprobar** — Run: `pnpm check` — Expected: verde (i18n-keys pasa si `en/auth.json` tiene las mismas claves). Manual: `pnpm dev`, abrir `http://localhost:3000/register` en Chrome, crear passkey, aterrizar en `/today`.

- [ ] **Step 8: Commit**

```bash
git add app/api/auth app/\(auth\) components/auth lib/auth/set-session-cookie.ts messages app/\(app\)/layout.tsx
git commit -m "Añade registro, login e invitación con passkeys"
```

### Task 22: E2E de registro e invitación con autenticador virtual

**Files:**
- Create: `e2e/helpers/webauthn.ts`, `e2e/auth.spec.ts`
- Modify: `playwright.config.ts` (de W0: `webServer` con `pnpm dev` y `DATABASE_URL_TEST`; `use.browserName: 'chromium'`)

**Interfaces:**
- Produces: `enableVirtualAuthenticator(page)` para reutilizar en W2+.

- [ ] **Step 1: `e2e/helpers/webauthn.ts`**

```ts
import type { CDPSession, Page } from '@playwright/test'

// Autenticador virtual CTAP2 interno con credenciales descubribles y verificación de usuario
export async function enableVirtualAuthenticator(page: Page): Promise<{ cdp: CDPSession; authenticatorId: string }> {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('WebAuthn.enable')
  const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
  })
  return { cdp, authenticatorId }
}
```

- [ ] **Step 2: `e2e/auth.spec.ts`**

```ts
import { expect, test } from '@playwright/test'
import { enableVirtualAuthenticator } from './helpers/webauthn'

test.describe('passkeys', () => {
  test('registro crea hogar y entra en Hoy', async ({ page }) => {
    await enableVirtualAuthenticator(page)
    await page.goto('/register')
    await page.getByLabel(/nombre|name/i).fill('Ana')
    await page.getByRole('button', { name: /crear passkey|create passkey/i }).click()
    await expect(page).toHaveURL(/\/today$/)
    await expect(page.getByRole('navigation')).toBeVisible()
  })

  test('login con credencial descubrible', async ({ page }) => {
    const { cdp, authenticatorId } = await enableVirtualAuthenticator(page)
    await page.goto('/register')
    await page.getByLabel(/nombre|name/i).fill('Bo')
    await page.getByRole('button', { name: /crear passkey|create passkey/i }).click()
    await expect(page).toHaveURL(/\/today$/)
    await page.request.post('/api/auth/logout')
    await page.goto('/login')
    await page.getByTestId('login-button').click()
    await expect(page).toHaveURL(/\/today$/)
    const { credentials } = await cdp.send('WebAuthn.getCredentials', { authenticatorId })
    expect(credentials.length).toBe(1)
  })

  test('invitación: segunda persona entra como miembro', async ({ browser }) => {
    const owner = await browser.newPage()
    await enableVirtualAuthenticator(owner)
    await owner.goto('/register')
    await owner.getByLabel(/nombre|name/i).fill('Ana')
    await owner.getByRole('button', { name: /crear passkey|create passkey/i }).click()
    await expect(owner).toHaveURL(/\/today$/)
    // Crear invitación por la API interna (la UI de ajustes llega en W2)
    const res = await owner.request.post('/api/v1/household/invites')
    expect(res.ok()).toBeTruthy()
    const { url } = (await res.json()) as { url: string }

    const guest = await browser.newPage()
    await enableVirtualAuthenticator(guest)
    await guest.goto(url)
    await expect(guest.getByRole('heading', { level: 1 })).toContainText('Casa de Ana')
    await guest.getByLabel(/nombre|name/i).fill('Bo')
    await guest.getByRole('button', { name: /crear passkey|create passkey/i }).click()
    await expect(guest).toHaveURL(/\/today$/)
    const ctx = await guest.request.get('/api/v1/household')
    const body = (await ctx.json()) as { name: string; members: { displayName: string; role: string }[] }
    expect(body.name).toBe('Casa de Ana')
    expect(body.members.map((m) => `${m.displayName}:${m.role}`).sort()).toEqual(['Ana:owner', 'Bo:member'])
  })
})
```

- [ ] **Step 3: Endpoints mínimos que usa el e2e** — crear `app/api/v1/household/route.ts` (GET: hogar + miembros) y `app/api/v1/household/invites/route.ts` (POST: `createInvite`), ambos con `requireApiToken(request, ['household:read'])` / `requireHousehold()` + `requireRole('owner')`:

```ts
// app/api/v1/household/route.ts
import { eq } from 'drizzle-orm'
import * as schema from '@/db/schema'
import { apiErrorResponse, requireApiToken } from '@/lib/auth/guards'

export async function GET(request: Request): Promise<Response> {
  try {
    const ctx = await requireApiToken(request, ['household:read'])
    const [h] = await ctx.db.select().from(schema.households).where(eq(schema.households.id, ctx.householdId)).limit(1)
    const members = await ctx.db
      .select({ userId: schema.users.id, displayName: schema.users.displayName, role: schema.householdMembers.role, allergens: schema.householdMembers.allergens, dietaryFlags: schema.householdMembers.dietaryFlags })
      .from(schema.householdMembers)
      .innerJoin(schema.users, eq(schema.users.id, schema.householdMembers.userId))
      .where(eq(schema.householdMembers.householdId, ctx.householdId))
    return Response.json({ id: h?.id, name: h?.name, defaultServings: h?.defaultServings, expiryAlertDays: h?.expiryAlertDays, members })
  } catch (e) {
    return apiErrorResponse(e)
  }
}
```

```ts
// app/api/v1/household/invites/route.ts
import { apiErrorResponse, requireApiToken } from '@/lib/auth/guards'
import { createInvite } from '@/lib/services/households'
import { ServiceError } from '@/lib/services/ctx'

export async function POST(request: Request): Promise<Response> {
  try {
    const ctx = await requireApiToken(request, ['household:read'])
    const inv = await createInvite(ctx)
    return Response.json(inv, { status: 201 })
  } catch (e) {
    if (e instanceof ServiceError) return Response.json({ error: { code: e.code, message: e.message } }, { status: e.code === 'forbidden' ? 403 : 400 })
    return apiErrorResponse(e)
  }
}
```

- [ ] **Step 4: Ejecutar** — Run: `pnpm e2e -- e2e/auth.spec.ts` — Expected: 3 passed (Chromium; `webServer` de Playwright arranca `pnpm dev` con `DATABASE_URL=$DATABASE_URL_TEST`, `APP_URL=http://localhost:3000`, `APP_SECRET` de prueba).

- [ ] **Step 5: Commit**

```bash
git add e2e app/api/v1/household playwright.config.ts
git commit -m "Añade e2e de passkeys e invitación con autenticador virtual"
```

---

## Pista (d) · Validación compartida y eventos

### Task 23: Esquemas zod por agregado

**Files:**
- Create: `lib/validation/common.ts`, `household.ts`, `recipes.ts`, `foods.ts`, `plan.ts`, `pantry.ts`, `cooking.ts`, `shopping.ts`, `tokens.ts`, `index.ts`
- Test: `lib/validation/validation.test.ts`

**Interfaces:**
- Produces: esquemas y tipos inferidos que REST (W3c), MCP (W2h/W3d) y formularios (W2) reutilizan. Nombres: `IdSchema`, `LocaleSchema`, `BaseUnitSchema`, `DateSchema`, `DateRangeSchema`, `PaginationSchema`, `RegisterBodySchema`, `HouseholdUpdateSchema`, `MemberUpdateSchema`, `RecipeInputSchema`, `RecipeIngredientInputSchema`, `RecipeStepInputSchema`, `RecipeSearchSchema`, `RecipeImportSchema`, `FoodInputSchema`, `FoodSearchSchema`, `MealSlotSchema`, `PlanEntryInputSchema`, `PlanBatchSchema`, `ProposalPayloadSchema`, `PantryItemInputSchema`, `PantryAdjustSchema`, `LogCookedSchema`, `ShoppingGenerateSchema`, `ShoppingPushSchema`, `ApiTokenCreateSchema`, `ApiScopeSchema`.

- [ ] **Step 1: Test que falla**

```ts
import { describe, expect, it } from 'vitest'
import {
  ApiTokenCreateSchema, DateRangeSchema, LogCookedSchema, PantryAdjustSchema, PlanBatchSchema, ProposalPayloadSchema, RecipeInputSchema, RecipeSearchSchema,
} from './index'

const uuid = '11111111-1111-4111-8111-111111111111'

describe('validation', () => {
  it('DateRangeSchema exige from ≤ to y máximo 92 días', () => {
    expect(DateRangeSchema.safeParse({ from: '2026-08-01', to: '2026-08-31' }).success).toBe(true)
    expect(DateRangeSchema.safeParse({ from: '2026-08-31', to: '2026-08-01' }).success).toBe(false)
    expect(DateRangeSchema.safeParse({ from: '2026-01-01', to: '2026-12-31' }).success).toBe(false)
  })
  it('RecipeInputSchema: título, raciones ≥ 1, ingredientes con raw_text, pasos ordenados; rechaza claves extra', () => {
    const ok = RecipeInputSchema.safeParse({
      title: 'Lentejas', servingsBase: 4, ingredients: [{ rawText: '200 g de lentejas', scalesLinearly: true }], steps: [{ text: 'Cuece 30 min' }],
    })
    expect(ok.success).toBe(true)
    expect(RecipeInputSchema.safeParse({ title: '', servingsBase: 4, ingredients: [], steps: [] }).success).toBe(false)
    expect(RecipeInputSchema.safeParse({ title: 'x', servingsBase: 0, ingredients: [], steps: [] }).success).toBe(false)
    expect(RecipeInputSchema.safeParse({ title: 'x', servingsBase: 1, ingredients: [], steps: [], extra: 1 }).success).toBe(false)
  })
  it('RecipeSearchSchema: filtros opcionales con defaults', () => {
    const r = RecipeSearchSchema.parse({})
    expect(r).toMatchObject({ limit: 20, offset: 0 })
    expect(RecipeSearchSchema.safeParse({ maxMinutes: -1 }).success).toBe(false)
    expect(RecipeSearchSchema.safeParse({ hasIngredients: [uuid], tags: ['rapido'] }).success).toBe(true)
  })
  it('PlanBatchSchema: altas con fecha ISO y slot, bajas por id', () => {
    expect(PlanBatchSchema.safeParse({ add: [{ date: '2026-08-27', slot: 'dinner', recipeId: uuid, servings: 2 }], remove: [uuid] }).success).toBe(true)
    expect(PlanBatchSchema.safeParse({ add: [{ date: '27/08/2026', slot: 'dinner', recipeId: uuid, servings: 2 }], remove: [] }).success).toBe(false)
    expect(PlanBatchSchema.safeParse({ add: [{ date: '2026-08-27', slot: 'tea', recipeId: uuid, servings: 2 }], remove: [] }).success).toBe(false)
  })
  it('ProposalPayloadSchema es el mismo contrato que PlanBatchSchema', () => {
    expect(ProposalPayloadSchema.safeParse({ add: [], remove: [] }).success).toBe(true)
  })
  it('PantryAdjustSchema: delta distinto de 0', () => {
    expect(PantryAdjustSchema.safeParse({ itemId: uuid, delta: -50 }).success).toBe(true)
    expect(PantryAdjustSchema.safeParse({ itemId: uuid, delta: 0 }).success).toBe(false)
  })
  it('LogCookedSchema: entryId o recipeId, no ambos vacíos', () => {
    expect(LogCookedSchema.safeParse({ recipeId: uuid, servingsCooked: 3 }).success).toBe(true)
    expect(LogCookedSchema.safeParse({ entryId: uuid, servingsCooked: 3, leftovers: { servings: 1, date: '2026-08-28', slot: 'lunch' } }).success).toBe(true)
    expect(LogCookedSchema.safeParse({ servingsCooked: 3 }).success).toBe(false)
  })
  it('ApiTokenCreateSchema: scopes conocidos y perfil', () => {
    expect(ApiTokenCreateSchema.safeParse({ name: 'Escritorio', scopes: ['recipes:read', 'plan:read'], mcpProfile: 'basic' }).success).toBe(true)
    expect(ApiTokenCreateSchema.safeParse({ name: 'x', scopes: ['admin'] }).success).toBe(false)
  })
})
```

- [ ] **Step 2: Ejecutar para ver el fallo** — Run: `pnpm test -- lib/validation/validation.test.ts` — Expected: FAIL

- [ ] **Step 3: Implementar**

`lib/validation/common.ts`:

```ts
import { z } from 'zod'

export const IdSchema = z.uuid()
export const LocaleSchema = z.enum(['es', 'en'])
export const BaseUnitSchema = z.enum(['g', 'ml', 'ud'])
export const DateSchema = z.iso.date() // YYYY-MM-DD
export const MealSlotSchema = z.enum(['breakfast', 'lunch', 'dinner', 'snack'])

const MAX_RANGE_DAYS = 92
export const DateRangeSchema = z
  .strictObject({ from: DateSchema, to: DateSchema })
  .refine((r) => r.from <= r.to, { message: 'from debe ser ≤ to' })
  .refine((r) => (Date.parse(r.to) - Date.parse(r.from)) / 86_400_000 <= MAX_RANGE_DAYS, { message: `Máximo ${MAX_RANGE_DAYS} días` })

export const PaginationSchema = z.object({ limit: z.coerce.number().int().min(1).max(100).default(20), offset: z.coerce.number().int().min(0).default(0) })

export const ErrorBodySchema = z.object({ error: z.object({ code: z.string(), message: z.string(), details: z.unknown().optional() }) })
export type ErrorBody = z.infer<typeof ErrorBodySchema>
```

`lib/validation/household.ts`:

```ts
import { z } from 'zod'
import { IdSchema, LocaleSchema } from './common'

export const RegisterBodySchema = z.strictObject({ displayName: z.string().trim().min(1).max(60), inviteToken: z.string().optional(), locale: LocaleSchema.default('es') })
export const HouseholdUpdateSchema = z.strictObject({
  name: z.string().trim().min(1).max(80).optional(),
  defaultServings: z.number().int().min(1).max(50).optional(),
  expiryAlertDays: z.number().int().min(0).max(60).optional(),
})
export const ALLERGENS = ['gluten', 'lactose', 'egg', 'fish', 'shellfish', 'nuts', 'peanut', 'soy', 'sesame', 'celery', 'mustard', 'sulphites', 'lupin', 'mollusc'] as const
export const MemberUpdateSchema = z.strictObject({ userId: IdSchema, allergens: z.array(z.enum(ALLERGENS)).optional(), dietaryFlags: z.array(z.string().max(30)).max(10).optional() })
export const UserPrefsSchema = z.strictObject({
  displayName: z.string().trim().min(1).max(60).optional(),
  locale: LocaleSchema.optional(),
  units: z.enum(['metric', 'imperial']).optional(),
  theme: z.enum(['system', 'light', 'dark']).optional(),
  accent: z.enum(['huerta', 'miel', 'tomate', 'pistacho', 'higo', 'berenjena', 'arandano', 'canela']).optional(),
})
export const DeleteHouseholdSchema = z.strictObject({ confirmName: z.string().min(1) })
```

`lib/validation/recipes.ts`:

```ts
import { z } from 'zod'
import { BaseUnitSchema, IdSchema, PaginationSchema } from './common'

export const RecipeIngredientInputSchema = z.strictObject({
  rawText: z.string().trim().min(1).max(200),
  foodId: IdSchema.nullable().optional(),
  quantity: z.number().nonnegative().nullable().optional(),
  unit: BaseUnitSchema.nullable().optional(),
  displayQuantity: z.number().nonnegative().nullable().optional(),
  displayUnit: z.string().max(20).nullable().optional(),
  preparation: z.string().max(120).nullable().optional(),
  groupLabel: z.string().max(60).nullable().optional(),
  stepIndex: z.number().int().min(0).nullable().optional(),
  scalesLinearly: z.boolean().default(true),
})
export const RecipeStepInputSchema = z.strictObject({ text: z.string().trim().min(1).max(2000), timerSeconds: z.number().int().positive().nullable().optional(), imageUrl: z.string().max(300).nullable().optional() })
export const RecipeInputSchema = z.strictObject({
  title: z.string().trim().min(1).max(160),
  description: z.string().max(2000).nullable().optional(),
  servingsBase: z.number().int().min(1).max(100),
  prepMinutes: z.number().int().min(0).nullable().optional(),
  cookMinutes: z.number().int().min(0).nullable().optional(),
  difficulty: z.enum(['easy', 'medium', 'hard']).nullable().optional(),
  sourceUrl: z.url().nullable().optional(),
  imageUrls: z.array(z.string().max(300)).max(10).default([]),
  notes: z.string().max(4000).nullable().optional(),
  yieldGrams: z.number().positive().nullable().optional(),
  tags: z.array(z.string().max(60)).max(20).default([]),
  ingredients: z.array(RecipeIngredientInputSchema).max(100),
  steps: z.array(RecipeStepInputSchema).max(100),
})
export type RecipeInput = z.infer<typeof RecipeInputSchema>

export const RecipeSearchSchema = PaginationSchema.extend({
  q: z.string().max(120).optional(),
  tags: z.array(z.string()).optional(),
  maxMinutes: z.coerce.number().int().min(0).optional(),
  difficulty: z.enum(['easy', 'medium', 'hard']).optional(),
  hasIngredients: z.array(IdSchema).optional(), // que la receta contenga estos alimentos
  onlyWithPantry: z.coerce.boolean().optional(), // "tengo los ingredientes"
  sort: z.enum(['relevance', 'recent', 'most_cooked', 'title']).default('relevance'),
})
export const RecipeImportSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('url'), url: z.url() }),
  z.strictObject({ kind: z.literal('text'), text: z.string().min(10).max(20_000) }),
  z.strictObject({ kind: z.literal('image'), uploadId: z.string().max(200) }),
])
export const RecipeGetQuerySchema = z.object({ servings: z.coerce.number().int().min(1).max(100).optional() })
```

`lib/validation/foods.ts`:

```ts
import { z } from 'zod'
import { BaseUnitSchema, PaginationSchema } from './common'
import { ALLERGENS } from './household'

export const FoodInputSchema = z.strictObject({
  nameEs: z.string().trim().min(1).max(120),
  nameEn: z.string().trim().min(1).max(120),
  aliases: z.array(z.string().max(60)).max(10).default([]),
  defaultUnit: BaseUnitSchema.default('g'),
  kcal100g: z.number().min(0).nullable().optional(),
  protein100g: z.number().min(0).nullable().optional(),
  carbs100g: z.number().min(0).nullable().optional(),
  fat100g: z.number().min(0).nullable().optional(),
  fiber100g: z.number().min(0).nullable().optional(),
  barcode: z.string().regex(/^\d{8,14}$/).nullable().optional(),
  allergens: z.array(z.enum(ALLERGENS)).default([]),
  gramsPerCup: z.number().positive().nullable().optional(),
  gramsPerTbsp: z.number().positive().nullable().optional(),
  gramsPerUnit: z.number().positive().nullable().optional(),
  densityGPerMl: z.number().positive().nullable().optional(),
  seasonalMonths: z.array(z.number().int().min(1).max(12)).default([]),
})
export const FoodSearchSchema = PaginationSchema.extend({ q: z.string().trim().min(1).max(80), locale: z.enum(['es', 'en']).default('es') })
export const BarcodeSchema = z.string().regex(/^\d{8,14}$/)
```

`lib/validation/plan.ts`:

```ts
import { z } from 'zod'
import { DateSchema, IdSchema, MealSlotSchema } from './common'

export const PlanEntryInputSchema = z
  .strictObject({
    date: DateSchema,
    slot: MealSlotSchema,
    recipeId: IdSchema.nullable().optional(),
    customTitle: z.string().trim().min(1).max(120).nullable().optional(),
    servings: z.number().int().min(1).max(100),
    timeBudgetMinutes: z.number().int().min(0).nullable().optional(),
    leftoverOfEntryId: IdSchema.nullable().optional(),
  })
  .refine((e) => e.recipeId || e.customTitle, { message: 'recipeId o customTitle' })
export const PlanBatchSchema = z.strictObject({ add: z.array(PlanEntryInputSchema).max(60).default([]), remove: z.array(IdSchema).max(60).default([]) })
export type PlanBatch = z.infer<typeof PlanBatchSchema>
// Las propuestas (IA, reglas, MCP) usan exactamente el mismo contrato que el lote
export const ProposalPayloadSchema = PlanBatchSchema
export type ProposalPayload = z.infer<typeof ProposalPayloadSchema>
export const PlanEntryMoveSchema = z.strictObject({ entryId: IdSchema, date: DateSchema, slot: MealSlotSchema, sortOrder: z.number().int().min(0).default(0) })
export const PlanEntryPatchSchema = z.strictObject({ servings: z.number().int().min(1).max(100).optional(), skipped: z.boolean().optional(), timeBudgetMinutes: z.number().int().min(0).nullable().optional() })
export const ProposalDecisionSchema = z.strictObject({ decision: z.enum(['approve', 'reject']) })
```

`lib/validation/pantry.ts`:

```ts
import { z } from 'zod'
import { BaseUnitSchema, DateSchema, IdSchema } from './common'

export const PantryLocationSchema = z.enum(['fridge', 'freezer', 'pantry'])
export const PantryItemInputSchema = z.strictObject({
  foodId: IdSchema,
  quantity: z.number().min(0),
  unit: BaseUnitSchema,
  location: PantryLocationSchema.default('pantry'),
  expiresAt: DateSchema.nullable().optional(),
  openedAt: z.iso.datetime().nullable().optional(),
})
export const PantryAdjustSchema = z.strictObject({ itemId: IdSchema, delta: z.number().refine((d) => d !== 0, { message: 'delta ≠ 0' }) })
export const PantryQuerySchema = z.object({ location: PantryLocationSchema.optional(), expiresBefore: DateSchema.optional(), q: z.string().max(80).optional() })
```

`lib/validation/cooking.ts`:

```ts
import { z } from 'zod'
import { DateSchema, IdSchema, MealSlotSchema } from './common'

export const LogCookedSchema = z
  .strictObject({
    entryId: IdSchema.optional(),
    recipeId: IdSchema.optional(),
    servingsCooked: z.number().int().min(1).max(100),
    slot: MealSlotSchema.optional(), // solo cuando se cocina desde receta sin entrada
    leftovers: z.strictObject({ servings: z.number().int().min(1).max(100), date: DateSchema, slot: MealSlotSchema }).optional(),
  })
  .refine((v) => v.entryId || v.recipeId, { message: 'entryId o recipeId' })
export type LogCookedInput = z.infer<typeof LogCookedSchema>
```

`lib/validation/shopping.ts`:

```ts
import { z } from 'zod'
import { BaseUnitSchema, DateRangeSchema, IdSchema } from './common'

export const ShoppingGenerateSchema = DateRangeSchema
export const ShoppingLineSchema = z.strictObject({ foodId: IdSchema.nullable(), name: z.string().min(1), quantity: z.number().positive().nullable(), unit: BaseUnitSchema.nullable(), unresolved: z.boolean() })
export const ShoppingPushSchema = z.strictObject({ lines: z.array(ShoppingLineSchema).min(1).max(500) })
```

`lib/validation/tokens.ts`:

```ts
import { z } from 'zod'
import { API_SCOPES } from '@/db/schema/tokens'

export const ApiScopeSchema = z.enum(API_SCOPES)
export const ApiTokenCreateSchema = z.strictObject({ name: z.string().trim().min(1).max(60), scopes: z.array(ApiScopeSchema).min(0).max(API_SCOPES.length), mcpProfile: z.enum(['basic', 'full']).default('basic') })
```

`lib/validation/index.ts`: `export * from './common'` … (todos los ficheros).

- [ ] **Step 4: Ejecutar** — Run: `pnpm test -- lib/validation/validation.test.ts` — Expected: 8 passed

- [ ] **Step 5: Commit**

```bash
git add lib/validation
git commit -m "Añade esquemas zod compartidos por agregado"
```

### Task 24: Bus de eventos, endpoint SSE y hook de cliente

**Files:**
- Create: `lib/events/bus.ts`, `app/api/events/route.ts`, `lib/events/use-household-events.ts`
- Test: `lib/events/bus.test.ts`

**Interfaces:**
- Produces: `HouseholdEvent`, `emitHouseholdEvent(householdId, event)`, `subscribeHousehold(householdId, listener) → unsubscribe`; `GET /api/events` (SSE, cookie de sesión); `useHouseholdEvents(handler)`.

- [ ] **Step 1: Test que falla**

```ts
import { describe, expect, it, vi } from 'vitest'
import { emitHouseholdEvent, subscribeHousehold } from './bus'

describe('bus de eventos', () => {
  it('entrega solo al hogar suscrito y permite desuscribir', () => {
    const a = vi.fn()
    const b = vi.fn()
    const offA = subscribeHousehold('h1', a)
    subscribeHousehold('h2', b)
    emitHouseholdEvent('h1', { type: 'pantry.changed', payload: { foodIds: ['f1'] } })
    expect(a).toHaveBeenCalledWith({ type: 'pantry.changed', payload: { foodIds: ['f1'] } })
    expect(b).not.toHaveBeenCalled()
    offA()
    emitHouseholdEvent('h1', { type: 'plan.changed', payload: { dates: ['2026-08-27'] } })
    expect(a).toHaveBeenCalledTimes(1)
  })
  it('un listener que lanza no rompe a los demás', () => {
    subscribeHousehold('h3', () => { throw new Error('boom') })
    const ok = vi.fn()
    subscribeHousehold('h3', ok)
    emitHouseholdEvent('h3', { type: 'recipe.changed', payload: { recipeId: 'r' } })
    expect(ok).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Ejecutar para ver el fallo** — Run: `pnpm test -- lib/events/bus.test.ts` — Expected: FAIL

- [ ] **Step 3: `lib/events/bus.ts`**

```ts
// Bus en proceso: una sola instancia de la app (spec §14). Sin Redis.
export type HouseholdEvent =
  | { type: 'plan.changed'; payload: { dates: string[] } }
  | { type: 'pantry.changed'; payload: { foodIds: string[] } }
  | { type: 'recipe.changed'; payload: { recipeId: string } }
  | { type: 'proposal.created'; payload: { proposalId: string } }

type Listener = (e: HouseholdEvent) => void

const listeners = new Map<string, Set<Listener>>()

export function subscribeHousehold(householdId: string, listener: Listener): () => void {
  const set = listeners.get(householdId) ?? new Set<Listener>()
  set.add(listener)
  listeners.set(householdId, set)
  return () => {
    set.delete(listener)
    if (set.size === 0) listeners.delete(householdId)
  }
}

export function emitHouseholdEvent(householdId: string, event: HouseholdEvent): void {
  const set = listeners.get(householdId)
  if (!set) return
  for (const l of Array.from(set)) {
    try {
      l(event)
    } catch (err) {
      console.error('[events] listener falló', err)
    }
  }
}
```

- [ ] **Step 4: `app/api/events/route.ts`**

```ts
import { getCurrentSession } from '@/lib/auth/guards'
import { subscribeHousehold } from '@/lib/events/bus'

export const dynamic = 'force-dynamic'
const HEARTBEAT_MS = 25_000

export async function GET(): Promise<Response> {
  const session = await getCurrentSession()
  if (!session) return new Response('Unauthorized', { status: 401 })
  const householdId = session.household.id
  const encoder = new TextEncoder()
  let unsubscribe: (() => void) | null = null
  let timer: ReturnType<typeof setInterval> | null = null
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (chunk: string) => {
        try {
          controller.enqueue(encoder.encode(chunk))
        } catch {
          // cliente desconectado
        }
      }
      send(`: connected\n\n`)
      unsubscribe = subscribeHousehold(householdId, (e) => send(`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`))
      timer = setInterval(() => send(`: ping\n\n`), HEARTBEAT_MS)
    },
    cancel() {
      unsubscribe?.()
      if (timer) clearInterval(timer)
    },
  })
  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' },
  })
}
```

- [ ] **Step 5: `lib/events/use-household-events.ts`**

```ts
'use client'
import { useEffect, useRef } from 'react'
import type { HouseholdEvent } from './bus'

// Suscripción SSE por hogar. Los clientes refrescan datos al recibir el evento; sin Last-Event-ID (spec §14).
export function useHouseholdEvents(handler: (e: HouseholdEvent) => void, types?: HouseholdEvent['type'][]): void {
  const ref = useRef(handler)
  ref.current = handler
  useEffect(() => {
    const es = new EventSource('/api/events')
    const wanted: HouseholdEvent['type'][] = types ?? ['plan.changed', 'pantry.changed', 'recipe.changed', 'proposal.created']
    const onEvent = (ev: MessageEvent<string>) => {
      try {
        ref.current(JSON.parse(ev.data) as HouseholdEvent)
      } catch {
        // datos malformados: ignorar
      }
    }
    for (const t of wanted) es.addEventListener(t, onEvent as EventListener)
    return () => es.close()
  }, [types])
}
```

- [ ] **Step 6: Ejecutar y comprobar a mano**

Run: `pnpm test -- lib/events/bus.test.ts` — Expected: 2 passed.
Manual: con sesión iniciada en el navegador, `curl -N -b "rz_session=<cookie>" http://localhost:3000/api/events` muestra `: connected` y un `: ping` a los 25 s.

- [ ] **Step 7: Commit**

```bash
git add lib/events app/api/events
git commit -m "Añade bus de eventos y endpoint SSE por hogar"
```

---

## Cierre de W1

- [ ] `pnpm check` verde en `main` tras mergear las cuatro pistas.
- [ ] Cobertura `lib/domain` = 100 % líneas.
- [ ] `docs/04-DATOS.md` actualizado con las tablas/columnas de §4 del spec (si W0 no lo hizo ya por el Apéndice A).
- [ ] Anunciar contratos congelados: `db/schema/*`, `lib/domain/types.ts` + firmas, `lib/validation/*`, `lib/events/bus.ts`, `lib/services/ctx.ts`, contrato HTTP de `/api/auth/*`.

## Decisiones tomadas en este plan que no estaban en el spec

1. Unidades canónicas con id en inglés (`tsp`, `cup`, `clove`…) en `lib/domain/units-data.ts`, única fuente; `unit_aliases` en DB se siembra desde ahí. `recipe_ingredients.display_unit` guarda el id canónico.
2. `toBaseUnit`: piezas → `grams_per_unit` si existe (si no, `ud`); volumen con `density_g_per_ml` se convierte a `g` solo si `foods.default_unit = 'g'`.
3. Parser: rangos → media; "un chorrito" → cantidad 1 + unidad `splash`; participios en español separan preparación solo si van al final, antes de coma o de "y"; en inglés no se separan participios delante del nombre (`diced tomatoes` es alimento).
4. `detectTimers`: en rangos se usa el valor menor.
5. `recipes.search_vector` bilingüe (`spanish || english`) porque una columna generada no puede depender del hogar.
6. FKs autorreferentes y `plan_proposals.created_by_token_id → api_tokens` en SQL manual al final de la migración inicial; `tags_household_slug_uidx` con `NULLS NOT DISTINCT` para el upsert de etiquetas globales.
7. Registro vía invitación NO crea hogar propio. Salir del hogar borra las sesiones de ese usuario en ese hogar.
8. Endpoints WebAuthn en `/api/auth/*` (fuera de `/api/v1`): son de la UI, no de la API pública.
9. `requireApiToken` acepta también cookie de sesión si no hay `Authorization` (la UI llama a `/api/v1` desde el navegador).
10. `Ctx.role` es `null` cuando actúa un token.
11. Seed de alimentos: selección por prefijo de descripción con ~230 palabras clave (máx. 3 por palabra, prefiere `raw`), traducción generada una vez con Ollama vía API compatible con OpenAI (`scripts/translate-foods.ts`) y revisada a mano; el script nunca pisa traducciones existentes.
12. `ai` y `@ai-sdk/openai` entran como devDependencies ya en W1 solo para el script de traducción.
13. Cobertura 100 % de `lib/domain` se impone como threshold en `vitest.config.ts`.
