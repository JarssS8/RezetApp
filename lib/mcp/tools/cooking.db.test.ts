import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import * as schema from '@/db/schema'
import { closeTestDb, getTestDb, truncateAll, type TestDb } from '@/db/test/setup'
import type { McpCtx } from '@/lib/mcp/auth'
import type { Ctx } from '@/lib/services/ctx'
import { upsertPantryItem } from '@/lib/services/pantry'
import { createRecipe } from '@/lib/services/recipes'
import { callTool, connectedClient, textOf } from './test-helpers'

let db: TestDb
let householdId: string
let onionId: string
let recipeId: string
let entryId: string
let pantryItemId: string

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

  const [onion] = await db
    .insert(schema.foods)
    .values({
      nameEs: 'cebolla', nameEn: 'onion', searchNameEs: 'cebolla', searchNameEn: 'onion', source: 'usda',
      kcal100g: 40, protein100g: 1.1, carbs100g: 9.3, fat100g: 0.1, fiber100g: 1.7, gramsPerUnit: 150,
    })
    .returning()
  if (!onion) throw new Error('seed')
  onionId = onion.id

  // 2 raciones base, 300 g de cebolla: cocinar 2 raciones pide 300 g, así que
  // con 1000 g en despensa sobra de sobra y con menos falta.
  const ctx: Ctx = { db, householdId, userId: ana.id, apiTokenId: null, role: 'owner', locale: 'es', scopes: [] }
  const detail = await createRecipe(ctx, {
    title: 'Sopa de cebolla',
    servingsBase: 2,
    ingredients: [{ rawText: '300 g de cebolla', foodId: onionId, quantity: 300, unit: 'g', scalesLinearly: true }],
    steps: [{ text: 'Pocha la cebolla 20 minutos' }],
    tags: [],
    imageUrls: [],
  })
  recipeId = detail.recipe.id

  const item = await upsertPantryItem(ctx, { foodId: onionId, quantity: 1000, unit: 'g', location: 'pantry' })
  pantryItemId = item.id

  const [entry] = await db
    .insert(schema.mealPlanEntries)
    .values({ householdId, date: '2026-08-27', slot: 'dinner', recipeId, servings: 2 })
    .returning({ id: schema.mealPlanEntries.id })
  if (!entry) throw new Error('seed')
  entryId = entry.id
})

describe('log_cooked', () => {
  it('descuenta la despensa y devuelve avisos si faltó algo', async () => {
    const client = await connectedClient(mcpCtxOf(['cooking:write']))
    const out = JSON.parse(textOf(await callTool(client, { name: 'log_cooked', arguments: { entryId, servingsCooked: 2 } }))) as {
      entryId: string
      cookingLogId: string
      deductions: { pantryItemId: string; foodId: string; requested: number; deducted: number; unit: string }[]
      warnings: unknown[]
      leftoverEntryId: string | null
    }
    expect(out.entryId).toBe(entryId)
    expect(out.deductions).toHaveLength(1)
    expect(out.deductions[0]).toMatchObject({ pantryItemId, foodId: onionId, requested: 300, deducted: 300, unit: 'g' })
    expect(out.warnings).toEqual([])
    expect(out.leftoverEntryId).toBeNull()
    const [pantry] = await db.select().from(schema.pantryItems).where(eq(schema.pantryItems.id, pantryItemId))
    expect(pantry?.quantity).toBe(700)
    await client.close()
  })

  it('repetir la misma entrada devuelve error de herramienta, no un segundo descuento', async () => {
    const client = await connectedClient(mcpCtxOf(['cooking:write']))
    await callTool(client, { name: 'log_cooked', arguments: { entryId, servingsCooked: 2 } })
    const second = await callTool(client, { name: 'log_cooked', arguments: { entryId, servingsCooked: 2 } })
    expect(second.isError).toBe(true)
    expect(textOf(second)).toContain('cocinada')
    const [pantry] = await db.select().from(schema.pantryItems).where(eq(schema.pantryItems.id, pantryItemId))
    expect(pantry?.quantity).toBe(700) // sigue en 700: ningún segundo descuento
    await client.close()
  })

  it('cocinar desde recipeId sin entrada crea la entrada de hoy', async () => {
    const client = await connectedClient(mcpCtxOf(['cooking:write']))
    const out = JSON.parse(textOf(await callTool(client, { name: 'log_cooked', arguments: { recipeId, servingsCooked: 2, slot: 'lunch' } }))) as {
      entryId: string
      deductions: unknown[]
    }
    expect(out.entryId).toBeTruthy()
    const [entry] = await db.select().from(schema.mealPlanEntries).where(eq(schema.mealPlanEntries.id, out.entryId))
    expect(entry?.recipeId).toBe(recipeId)
    expect(entry?.slot).toBe('lunch')
    expect(entry?.cookedAt).not.toBeNull()
    await client.close()
  })

  it('con leftovers planifica la sobra y la devuelve en leftoverEntryId', async () => {
    const client = await connectedClient(mcpCtxOf(['cooking:write']))
    const out = JSON.parse(
      textOf(
        await callTool(client, {
          name: 'log_cooked',
          arguments: { entryId, servingsCooked: 2, leftovers: { servings: 1, date: '2026-08-28', slot: 'lunch' } },
        }),
      ),
    ) as { leftoverEntryId: string | null }
    expect(out.leftoverEntryId).not.toBeNull()
    const [leftover] = await db.select().from(schema.mealPlanEntries).where(eq(schema.mealPlanEntries.id, out.leftoverEntryId as string))
    expect(leftover?.leftoverOfEntryId).toBe(entryId)
    expect(leftover?.date).toBe('2026-08-28')
    expect(leftover?.slot).toBe('lunch')
    expect(leftover?.servings).toBe(1)
    await client.close()
  })

  it('slot solo se admite al cocinar desde receta: con entryId lo rechaza la revalidación', async () => {
    const client = await connectedClient(mcpCtxOf(['cooking:write']))
    const out = await callTool(client, { name: 'log_cooked', arguments: { entryId, servingsCooked: 2, slot: 'lunch' } })
    expect(out.isError).toBe(true)
    const [pantry] = await db.select().from(schema.pantryItems).where(eq(schema.pantryItems.id, pantryItemId))
    expect(pantry?.quantity).toBe(1000) // nada se tocó: la validación falló antes de llamar a logCooked
    await client.close()
  })

  it('entryId y recipeId a la vez se rechaza sin tocar la despensa', async () => {
    const client = await connectedClient(mcpCtxOf(['cooking:write']))
    const out = await callTool(client, { name: 'log_cooked', arguments: { entryId, recipeId, servingsCooked: 2 } })
    expect(out.isError).toBe(true)
    expect(textOf(out)).toContain('entryId o recipeId, no los dos')
    const [pantry] = await db.select().from(schema.pantryItems).where(eq(schema.pantryItems.id, pantryItemId))
    expect(pantry?.quantity).toBe(1000) // nada se tocó: se rechazó antes de llamar a logCooked
    await client.close()
  })

  it('un entryId de otro hogar devuelve isError y no muta nada', async () => {
    const [otherHousehold] = await db.insert(schema.households).values({ name: 'Otra casa' }).returning()
    const [otherUser] = await db.insert(schema.users).values({ displayName: 'Foráneo' }).returning()
    if (!otherHousehold || !otherUser) throw new Error('seed')
    await db.insert(schema.householdMembers).values({ householdId: otherHousehold.id, userId: otherUser.id, role: 'owner' })
    const [foreignEntry] = await db
      .insert(schema.mealPlanEntries)
      .values({ householdId: otherHousehold.id, date: '2026-08-27', slot: 'dinner', customTitle: 'Cena ajena', servings: 2 })
      .returning({ id: schema.mealPlanEntries.id })
    if (!foreignEntry) throw new Error('seed')

    const client = await connectedClient(mcpCtxOf(['cooking:write']))
    const out = await callTool(client, { name: 'log_cooked', arguments: { entryId: foreignEntry.id, servingsCooked: 2 } })
    expect(out.isError).toBe(true)
    const [pantry] = await db.select().from(schema.pantryItems).where(eq(schema.pantryItems.id, pantryItemId))
    expect(pantry?.quantity).toBe(1000) // el hogar propio no se ha tocado
    const [entry] = await db.select().from(schema.mealPlanEntries).where(eq(schema.mealPlanEntries.id, foreignEntry.id))
    expect(entry?.cookedAt).toBeNull() // tampoco la entrada ajena
    await client.close()
  })

  it('cooking:write basta: no hace falta plan:write ni pantry:write', async () => {
    const client = await connectedClient(mcpCtxOf(['cooking:write']))
    expect((await client.listTools()).tools.map((t) => t.name)).toContain('log_cooked')
    await client.close()
  })

  it('sin cooking:write no existe', async () => {
    const client = await connectedClient(mcpCtxOf(['plan:write', 'pantry:write']))
    expect((await client.listTools()).tools.map((t) => t.name)).not.toContain('log_cooked')
    await client.close()
  })
})
