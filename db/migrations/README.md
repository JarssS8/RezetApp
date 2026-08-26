# db/migrations

Generadas con `pnpm db:generate`. `0000_inicial.sql` lleva además bloques
añadidos a mano tras generarla (separados con `--> statement-breakpoint`):

- `CREATE EXTENSION IF NOT EXISTS pg_trgm;` como primera sentencia.
- `tags_household_slug_uidx` reescrito con `NULLS NOT DISTINCT`. Esto sí es
  expresable en Drizzle 0.45 con `unique(...).nullsNotDistinct()` sobre un
  unique constraint de tabla, pero no sobre `uniqueIndex()` (el builder que
  usa `tags.ts`); mantenemos el índice (no el constraint) y el SQL manual a
  propósito, para no cambiar la forma del esquema en TypeScript.
- Cuatro FKs autorreferentes o cruzadas que Drizzle no puede generar sin
  imports circulares en TypeScript: `plan_proposals.created_by_token_id →
  api_tokens.id`, `meal_plan_entries.leftover_of_entry_id →
  meal_plan_entries.id`, `foods.merged_into_id → foods.id`,
  `tags.parent_id → tags.id`.

Las FKs de este bloque se mantienen a mano; al regenerar, conservarlas.
