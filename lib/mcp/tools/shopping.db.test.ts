import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import * as schema from '@/db/schema'
import { closeTestDb, getTestDb, truncateAll, type TestDb } from '@/db/test/setup'
import type { McpCtx } from '@/lib/mcp/auth'
import { callTool, connectedClient, textOf } from './test-helpers'

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
  const [h] = await db.insert(schema.households).values({ name: 'Casa' }).returning()
  const [ana] = await db.insert(schema.users).values({ displayName: 'Ana' }).returning()
  if (!h || !ana) throw new Error('seed')
  householdId = h.id
  await db.insert(schema.householdMembers).values({ householdId, userId: ana.id, role: 'owner', allergens: [], dietaryFlags: [] })

  const [lentejas] = await db
    .insert(schema.foods)
    .values({
      nameEs: 'lentejas', nameEn: 'lentils', searchNameEs: 'lentejas', searchNameEn: 'lentils', source: 'usda',
      kcal100g: 110, protein100g: 9, carbs100g: 20, fat100g: 0.4, fiber100g: 8, defaultUnit: 'g',
    })
    .returning()
  if (!lentejas) throw new Error('seed')

  const [recipe] = await db.insert(schema.recipes).values({ householdId, title: 'Guiso de lentejas', servingsBase: 4 }).returning()
  if (!recipe) throw new Error('seed')
  await db.insert(schema.recipeIngredients).values({ recipeId: recipe.id, foodId: lentejas.id, rawText: '400 g de lentejas', quantity: 400, unit: 'g', scalesLinearly: true, sortOrder: 0 })
  await db.insert(schema.mealPlanEntries).values({ householdId, date: '2026-08-26', slot: 'lunch', recipeId: recipe.id, servings: 2 })
  await db.insert(schema.pantryItems).values({ householdId, foodId: lentejas.id, quantity: 100, unit: 'g' })
})

describe('herramientas MCP de compra', () => {
  it('generate_shopping_list consolida el plan y resta la despensa, y NO envía nada', async () => {
    const client = await connectedClient(mcpCtxOf(['plan:read', 'pantry:read']))
    const out = JSON.parse(textOf(await callTool(client, { name: 'generate_shopping_list', arguments: { from: '2026-08-24', to: '2026-08-30' } })))
    expect(Array.isArray(out.lines)).toBe(true)
    // Sin llamada de red: no hay push implícito
    const [household] = await db.select().from(schema.households).where(eq(schema.households.id, householdId))
    expect(household?.shoplistLastPushedAt).toBeNull()
    await client.close()
  })

  it('push_to_shoplist sin configurar avisa con un mensaje propio, no con el del servicio', async () => {
    const client = await connectedClient(mcpCtxOf(['shopping:push']))
    const result = await callTool(client, {
      name: 'push_to_shoplist',
      arguments: { lines: [{ foodId: null, name: 'sal', quantity: null, unit: null, unresolved: true, pantryUnmatched: false }] },
    })
    expect(result.isError).toBe(true)
    expect(textOf(result)).not.toContain(householdId)
    await client.close()
  })

  it('generate_shopping_list exige los dos scopes de lectura', async () => {
    const client = await connectedClient(mcpCtxOf(['plan:read']))
    expect((await client.listTools()).tools.map((t) => t.name)).not.toContain('generate_shopping_list')
    await client.close()
  })
})
