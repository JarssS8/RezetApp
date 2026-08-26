import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { closeTestDb, getTestDb, type TestDb } from '@/db/test/setup'

// Tablas de contenido: TODAS llevan household_id (foods y tags nullable = global)
const CONTENT = ['recipes', 'recipe_ingredients', 'recipe_steps', 'meal_plan_entries', 'pantry_items', 'cooking_log', 'plan_proposals', 'api_tokens', 'ai_usage_log', 'collections', 'foods', 'tags']
const VIA_PARENT = new Set(['recipe_ingredients', 'recipe_steps']) // household_id a través de recipe_id

let db: TestDb
beforeAll(async () => { db = await getTestDb() })
afterAll(closeTestDb)

describe.skipIf(!process.env.DATABASE_URL_TEST)('invariantes del esquema', () => {
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
  it('índice sobre household_id en toda tabla de contenido', async () => {
    for (const table of CONTENT) {
      if (VIA_PARENT.has(table)) continue
      const r = await db.execute(sql`SELECT indexname FROM pg_indexes WHERE tablename = ${table} AND indexdef LIKE '%household_id%'`)
      expect(r.rows.length, `${table} sin índice por household_id`).toBeGreaterThan(0)
    }
  })
  it('tags_household_slug_uidx es NULLS NOT DISTINCT', async () => {
    const r = await db.execute(sql`SELECT indexdef FROM pg_indexes WHERE indexname = 'tags_household_slug_uidx'`)
    expect(r.rows.length).toBe(1)
    expect((r.rows[0] as { indexdef: string }).indexdef).toMatch(/NULLS NOT DISTINCT/)
  })
  it('pantry_items rechaza cantidades negativas', async () => {
    await expect(db.execute(sql`INSERT INTO pantry_items (household_id, food_id, quantity, unit) VALUES (gen_random_uuid(), gen_random_uuid(), -1, 'g')`)).rejects.toThrow()
  })
  it('search_vector generado permite buscar en español', async () => {
    const householdRows = await db.execute(sql`INSERT INTO households (name) VALUES ('Prueba invariantes') RETURNING id`)
    const householdId = (householdRows.rows[0] as { id: string }).id
    try {
      const recipeRows = await db.execute(
        sql`INSERT INTO recipes (household_id, title, servings_base) VALUES (${householdId}, 'Patatas con cebolla', 2) RETURNING id`,
      )
      const recipeId = (recipeRows.rows[0] as { id: string }).id
      const found = await db.execute(sql`SELECT id FROM recipes WHERE search_vector @@ to_tsquery('spanish', 'patata')`)
      expect((found.rows as { id: string }[]).map((r) => r.id)).toContain(recipeId)
    } finally {
      await db.execute(sql`DELETE FROM recipes WHERE household_id = ${householdId}`)
      await db.execute(sql`DELETE FROM households WHERE id = ${householdId}`)
    }
  })
})
