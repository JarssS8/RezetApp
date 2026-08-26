import { sql } from 'drizzle-orm'
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { runMigrations } from '@/db/migrate'
import * as schema from '@/db/schema'

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
  // El proyecto "db" de vitest es el único que trunca tablas entre casos y corre
  // sin paralelismo de ficheros. Un test que llegue aquí desde "unit" o "ui"
  // borraría datos por debajo de otro que esté corriendo en paralelo.
  if (process.env.VITEST_PROJECT !== 'db') {
    throw new Error('getTestDb() solo desde el proyecto vitest "db": añade el fichero a DB_TEST_GLOBS en vitest.config.ts')
  }
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
