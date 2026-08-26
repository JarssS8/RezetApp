import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { closeTestDb, getTestDb, truncateAll, type TestDb } from '@/db/test/setup'
import { seedFoods, seedTags, seedUnitAliases } from './seed'

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
  it('foods se siembra y re-siembra sin duplicar', async () => {
    const n = await seedFoods(db)
    await seedFoods(db)
    const r = await db.execute(sql`SELECT count(*)::int AS c FROM foods WHERE source = 'usda' AND household_id IS NULL`)
    expect((r.rows[0] as { c: number }).c).toBe(n)
    const cebolla = await db.execute(sql`SELECT name_es FROM foods WHERE search_name_es % 'cebolla' LIMIT 1`)
    expect(cebolla.rows.length).toBe(1)
  })
})
