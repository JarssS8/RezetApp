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
`id`, `name`, `created_at`, `ai_provider`, `ai_monthly_cap_cents`,
`ai_spent_this_month_cents`, `shoplist_list_token` (nullable)

### `users`
`id`, `email`, `display_name`, `avatar_url`, `locale`, `units` (`metric|imperial`),
`theme`, `accent`, `created_at`

### `household_members`
`household_id`, `user_id`, `role` (`owner|member`), `joined_at`
Más `dietary_flags` y `allergens` (array) — el agente los necesita para no
proponer nada que alguien no pueda comer.

### `household_invites`
`token`, `household_id`, `expires_at`, `created_by`

### `webauthn_credentials`
Lo que pida `@simplewebauthn/server`: `credential_id`, `public_key`, `counter`,
`transports`, `user_id`.

### `foods`
El catálogo de alimentos. Compartido entre hogares (semilla común) pero permite
entradas propias.
`id`, `household_id` (nullable → global), `name_es`, `name_en`, `default_unit`,
`kcal_100g`, `protein_100g`, `carbs_100g`, `fat_100g`, `fiber_100g`,
`source` (`off|usda|manual|ai`), `source_ref`, `barcode`, `allergens`,
`grams_per_cup`, `grams_per_tbsp`, `seasonal_months` (int[]), `is_estimated`

`is_estimated` es lo que pinta la etiqueta «estimado» en la interfaz. No lo omitas.

### `recipes`
`id`, `household_id`, `title`, `description`, `servings_base`, `prep_minutes`,
`cook_minutes`, `difficulty`, `source_url`, `image_urls` (text[]), `notes`,
`times_cooked`, `last_cooked_at`, `created_at`, `updated_at`

### `recipe_ingredients`
`id`, `recipe_id`, `food_id` (nullable si no se resolvió), `raw_text`,
`quantity` (numeric, unidad base), `unit`, `preparation`, `step_index` (nullable),
`scales_linearly` (bool, **default true**), `sort_order`

`raw_text` guarda siempre el original: es lo que permite reparsear más tarde sin
perder información.

### `recipe_steps`
`id`, `recipe_id`, `index`, `text`, `timer_seconds` (nullable, detectado del texto)

### `recipe_tags` / `tags`
Etiquetas jerárquicas: `tags.parent_id` nullable.

### `meal_plan_entries`
`id`, `household_id`, `date`, `slot` (`breakfast|lunch|dinner|snack`),
`recipe_id` (nullable), `custom_title` (nullable), `servings`,
`leftover_of_entry_id` (nullable), `time_budget_minutes` (nullable),
`cooked_at` (nullable), `sort_order`

`leftover_of_entry_id` es lo que hace que las sobras no generen compra.

### `pantry_items`
`id`, `household_id`, `food_id`, `quantity` (unidad base), `unit`, `location`,
`expires_at` (nullable), `opened_at` (nullable), `added_at`

### `cooking_log`
`id`, `household_id`, `recipe_id`, `entry_id` (nullable), `servings_cooked`,
`cooked_at`, `kcal_per_serving_snapshot`

Snapshot porque la receta puede cambiar después y el histórico no debe moverse.

### `api_tokens`
`id`, `household_id`, `user_id`, `name`, `token_hash`, `scopes` (text[]),
`last_used_at`, `created_at`, `revoked_at`

Guarda el hash, nunca el token. Los scopes por módulo: `recipes:read`,
`recipes:write`, `plan:write`, `pantry:write`, `shopping:push`.

### `ai_usage_log`
`id`, `household_id`, `provider`, `operation`, `tokens_in`, `tokens_out`,
`cost_cents`, `created_at` — lo que alimenta el tope de gasto mensual.

## Índices que harán falta

- `household_id` en todas.
- `meal_plan_entries (household_id, date)`
- `pantry_items (household_id, expires_at)` — la consulta de "qué caduca" es
  constante.
- Índice GIN de búsqueda full-text sobre `recipes` (título + descripción) y sobre
  `recipe_ingredients.raw_text`.
- `foods (barcode)` y trigram sobre `foods.name_es` para la coincidencia difusa.
