import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import * as schema from '@/db/schema'
import { closeTestDb, getTestDb, truncateAll, type TestDb } from '@/db/test/setup'
import type { McpCtx } from '@/lib/mcp/auth'
import { connectedClient } from './tools/test-helpers'

let db: TestDb
let householdId: string

function mcpCtxOf(scopes: string[]): McpCtx {
  return { db, householdId, userId: null, apiTokenId: null, role: null, locale: 'es', scopes, mcpProfile: 'basic' }
}

beforeAll(async () => {
  db = await getTestDb()
})
afterAll(closeTestDb)

beforeEach(async () => {
  await truncateAll(db)
  const [household] = await db.insert(schema.households).values({ name: 'Casa' }).returning()
  const [ana] = await db.insert(schema.users).values({ displayName: 'Ana' }).returning()
  if (!household || !ana) throw new Error('seed')
  householdId = household.id
  await db.insert(schema.householdMembers).values({ householdId, userId: ana.id, role: 'owner', allergens: ['gluten'], dietaryFlags: [] })

  const [food] = await db
    .insert(schema.foods)
    .values({
      nameEs: 'harina', nameEn: 'flour', searchNameEs: 'harina', searchNameEn: 'flour', source: 'usda',
      kcal100g: 364, protein100g: 10, carbs100g: 76, fat100g: 1, fiber100g: 2.7,
    })
    .returning()
  if (!food) throw new Error('seed')
  const soon = new Date(Date.now() + 24 * 3_600_000).toISOString().slice(0, 10)
  await db.insert(schema.pantryItems).values({ householdId, foodId: food.id, quantity: 500, unit: 'g', location: 'pantry', expiresAt: soon })

  const [bread] = await db.insert(schema.recipes).values({ householdId, title: 'Pan', servingsBase: 2, lastCookedAt: new Date() }).returning()
  if (!bread) throw new Error('seed')
  await db.insert(schema.cookingLog).values({ householdId, recipeId: bread.id, servingsCooked: 2, kcalPerServingSnapshot: 210, warnings: [{ foodId: food.id, name: 'harina', requested: 100, deducted: 0, unit: 'g' }] })
})

describe('recurso household://context', () => {
  it('devuelve hogar, alérgenos, caducidades y lo cocinado hace poco', async () => {
    const client = await connectedClient(mcpCtxOf(['household:read']))
    const { resources } = await client.listResources()
    expect(resources.map((r) => r.uri)).toContain('household://context')
    const { contents } = await client.readResource({ uri: 'household://context' })
    const first = contents[0]
    if (!first || !('text' in first) || typeof first.text !== 'string') throw new Error('sin contenido')
    const data = JSON.parse(first.text) as {
      household: { name: string }
      members: { allergens: string[] }[]
      expiringSoon: { name: string }[]
      recentlyCooked: { title: string; servings: number; cookedAt: string; warningCount: number }[]
    }
    expect(data.household.name).toBe('Casa')
    expect(data.members.some((m) => m.allergens.includes('gluten'))).toBe(true)
    expect(Array.isArray(data.expiringSoon)).toBe(true)
    expect(data.expiringSoon.some((i) => i.name === 'harina')).toBe(true)
    expect(Array.isArray(data.recentlyCooked)).toBe(true)
    const cooked = data.recentlyCooked.find((r) => r.title === 'Pan')
    expect(cooked).toMatchObject({ title: 'Pan', servings: 2, warningCount: 1 })
    expect(typeof cooked?.cookedAt).toBe('string')
    await client.close()
  })

  it('sin household:read el recurso no se expone', async () => {
    const client = await connectedClient(mcpCtxOf(['recipes:read']))
    expect((await client.listResources()).resources).toEqual([])
    await client.close()
  })
})
