# 04 · Modelo de datos

Postgres + Drizzle. Propuesta de partida — ajústala si algo no encaja, pero
mantén las invariantes de abajo.

## Invariantes

- **Toda tabla de contenido lleva `household_id`** con índice. Sin excepción.
- Los ids son `uuid` generados en el servidor.
- Las cantidades se guardan en **unidad base** (`g`, `ml`, `ud`) como `numeric`.
- Timestamps `timestamptz`, siempre UTC.
- Nada de `ON DELETE CASCADE` hacia arriba desde contenido a hogar sin pensarlo:
  borrar un hogar tiene que ser una operación explícita y confirmada.

## Entidades

### `households`
`id`, `name`, `created_at`, `default_servings`, `expiry_alert_days`,
`ai_provider` (`none | anthropic | openai | openai_compatible`), `ai_model`,
`ai_base_url`, `ai_api_key_enc`, `ai_monthly_cap_cents`, `ai_structured_output`,
`shoplist_list_token` (nullable), `shoplist_fn_url`, `shoplist_secret_enc`,
`shoplist_last_pushed_at` (nullable), `plan_rules`

(Sin `ai_spent_this_month_cents`: el gasto del mes es `SUM(cost_cents)` de `ai_usage_log`.)

### `users`
`id`, `email`, `display_name`, `avatar_url`, `locale`, `units` (`metric|imperial`),
`theme`, `accent`, `created_at`

### `household_members`
`household_id`, `user_id`, `role` (`owner|member`), `joined_at`
Más `dietary_flags` y `allergens` (array) — el agente los necesita para no
proponer nada que alguien no pueda comer.

### `household_invites`
`token`, `household_id`, `expires_at`, `created_by`

### `sessions`
`id` (32 bytes aleatorios, base64url), `user_id`, `household_id`, `expires_at`,
`created_at`, `last_seen_at`, `user_agent`

### `webauthn_challenges`
`id`, `challenge`, `user_id` (nullable), `kind` (`register | login`), `expires_at`

### `webauthn_credentials`
Lo que pida `@simplewebauthn/server`: `credential_id`, `public_key`, `counter`,
`transports`, `user_id`, `device_type`, `backed_up`, `name`, `created_at`,
`last_used_at`.

### `app_settings`
`key` (text, primary key), `value` (jsonb), `updated_at`. Guarda claves VAPID
generadas en el primer arranque y similares.

### `foods`
El catálogo de alimentos. Compartido entre hogares (semilla común) pero permite
entradas propias.
`id`, `household_id` (nullable → global), `name_es`, `name_en`, `search_name_es`,
`search_name_en`, `default_unit`, `kcal_100g`, `protein_100g`, `carbs_100g`,
`fat_100g`, `fiber_100g`, `density_g_per_ml`, `grams_per_unit`, `aliases` (text[]),
`source` (`off|usda|manual|ai`), `source_ref`, `barcode`, `allergens`,
`grams_per_cup`, `grams_per_tbsp`, `seasonal_months` (int[]), `is_estimated`,
`merged_into_id`

`is_estimated` es lo que pinta la etiqueta «estimado» en la interfaz. No lo omitas.

### `recipes`
`id`, `household_id`, `title`, `description`, `servings_base`, `prep_minutes`,
`cook_minutes`, `difficulty`, `source_url`, `image_urls` (text[]), `notes`,
`times_cooked`, `last_cooked_at`, `created_at`, `updated_at`, `kcal_per_serving`,
`protein/carbs/fat/fiber_per_serving`, `kcal_100g`, `nutrition_is_estimated`,
`yield_grams`, `search_vector`, `deleted_at`

### `recipe_ingredients`
`id`, `recipe_id`, `food_id` (nullable si no se resolvió), `raw_text`,
`quantity` (numeric nullable, unidad base), `unit` (enum nullable),
`display_quantity` (numeric nullable), `display_unit` (text nullable),
`preparation`, `step_index` (nullable), `scales_linearly` (bool, **default true**),
`group_label`, `sort_order`

`raw_text` guarda siempre el original: es lo que permite reparsear más tarde sin
perder información. `quantity` y `unit` son ambos null cuando no hay conversión
("1 pizca", "al gusto", "un chorrito"); `display_quantity` + `display_unit` es
siempre lo que escribió el usuario.

### `recipe_steps`
`id`, `recipe_id`, `index`, `text`, `timer_seconds` (nullable, detectado del texto),
`image_url` (nullable)

### `recipe_tags` / `tags`
Etiquetas jerárquicas: `tags.parent_id` nullable.

### `unit_aliases`
`alias`, `locale`, `unit` (`g | ml | ud`), `factor_to_base` (cdta→5 ml, cda→15 ml,
taza→240 ml, oz→28.35 g, l→1000 ml, kg→1000 g)

### `collections`
`id`, `household_id`, `name`, `query` (jsonb)

### `meal_plan_entries`
`id`, `household_id`, `date`, `slot` (`breakfast|lunch|dinner|snack`),
`recipe_id` (nullable), `custom_title` (nullable), `servings`,
`leftover_of_entry_id` (nullable), `time_budget_minutes` (nullable),
`cooked_at` (nullable), `skipped_at` (nullable), `sort_order`

`leftover_of_entry_id` es lo que hace que las sobras no generen compra. Estado
derivado en dominio: `cooked_at` → `cooked`; si no, `skipped_at` → `skipped`;
si no, `planned`.

### `pantry_items`
`id`, `household_id`, `food_id`, `quantity` (numeric, unidad base), `unit`
(`g | ml | ud`), `location` (`fridge | freezer | pantry`), `expires_at` (date
nullable), `opened_at` (nullable), `added_at`. Índice `(household_id, food_id)`
e `(household_id, expires_at)`.

### `plan_proposals`
`id`, `household_id`, `created_by_user_id` (nullable), `created_by_token_id`
(nullable), `source` (`ai | rules | mcp`), `payload` (jsonb), `status`
(`pending | approved | rejected`), `created_at`, `resolved_at`,
`resolved_by_user_id`

### `cooking_log`
`id`, `household_id`, `recipe_id`, `entry_id` (nullable), `servings_cooked`,
`cooked_at`, `kcal_per_serving_snapshot`, `pantry_deductions` (jsonb),
`warnings` (jsonb)

Snapshot porque la receta puede cambiar después y el histórico no debe moverse.
`pantry_deductions`: `[{pantry_item_id, food_id, requested, deducted}]`;
`warnings`: faltantes.

### `api_tokens`
`id`, `household_id`, `user_id`, `name`, `token_hash`, `scopes` (text[]),
`mcp_profile` (`basic | full`), `last_used_at`, `created_at`, `revoked_at`

Guarda el hash, nunca el token. Los scopes por módulo: `recipes:read`,
`recipes:write`, `plan:read`, `plan:write`, `pantry:read`, `pantry:write`,
`cooking:write`, `shopping:push`, `household:read`.

### `push_subscriptions`
`user_id`, `endpoint` (unique), `keys` (jsonb), `created_at`

### `ai_usage_log`
`id`, `household_id`, `provider`, `operation`, `tokens_in`, `tokens_out`,
`cost_cents`, `created_at` — lo que alimenta el tope de gasto mensual (índice
`(household_id, created_at)`).

## Índices que harán falta

- `household_id` en todas.
- `meal_plan_entries (household_id, date)`
- `pantry_items (household_id, expires_at)` — la consulta de "qué caduca" es
  constante.
- Índice GIN de búsqueda full-text sobre `recipes` (título + descripción) y sobre
  `recipe_ingredients.raw_text`.
- `foods (barcode)` y trigram sobre `foods.name_es` para la coincidencia difusa.

Véase `docs/superpowers/specs/2026-08-26-rezetapp-design.md` §4 para detalle
completo del modelo de datos.
