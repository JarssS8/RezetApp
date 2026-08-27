import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import * as schema from '@/db/schema'
import { closeTestDb, getTestDb, truncateAll, type TestDb } from '@/db/test/setup'
import type { McpCtx } from '@/lib/mcp/auth'
import type { Ctx } from '@/lib/services/ctx'
import { createRecipe } from '@/lib/services/recipes'
import { callTool, connectedClient, textOf } from './test-helpers'

let db: TestDb
let householdId: string
let anaId: string
let apiTokenId: string
let recipeCebollaId: string

// Un cliente MCP se autentica siempre con un token de API (nunca con sesión,
// ver lib/mcp/auth.ts): createProposal exige exactamente uno de
// createdByUserId/createdByTokenId no nulo (check plan_proposals_one_creator),
// así que la propuesta creada por MCP necesita un api_tokens real.
function mcpCtxOf(scopes: string[]): McpCtx {
  return { db, householdId, userId: null, apiTokenId, role: null, locale: 'es', scopes, mcpProfile: 'basic' }
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
  anaId = ana.id
  await db.insert(schema.householdMembers).values({ householdId, userId: ana.id, role: 'owner', allergens: [], dietaryFlags: [] })
  const [token] = await db
    .insert(schema.apiTokens)
    .values({ householdId, userId: ana.id, name: 'Cliente MCP de prueba', tokenHash: 'hash-de-prueba' })
    .returning()
  if (!token) throw new Error('seed')
  apiTokenId = token.id
  await db.insert(schema.foods).values({
    nameEs: 'cebolla', nameEn: 'onion', searchNameEs: 'cebolla', searchNameEn: 'onion', source: 'usda',
    kcal100g: 40, protein100g: 1.1, carbs100g: 9.3, fat100g: 0.1, fiber100g: 1.7, gramsPerUnit: 150,
  })

  const ctx: Ctx = { db, householdId, userId: anaId, apiTokenId: null, role: 'owner', locale: 'es', scopes: [] }
  const sopa = await createRecipe(ctx, {
    title: 'Sopa de cebolla',
    servingsBase: 4,
    prepMinutes: 10,
    cookMinutes: 15,
    ingredients: [
      { rawText: '2 cebollas grandes', scalesLinearly: true },
      { rawText: '1 cdta de sal', scalesLinearly: true },
    ],
    steps: [{ text: 'Pocha la cebolla 20 minutos a fuego suave' }],
    tags: ['sopa'],
    imageUrls: [],
  })
  recipeCebollaId = sopa.recipe.id

  await db.insert(schema.mealPlanEntries).values({ householdId, date: '2026-08-26', slot: 'dinner', recipeId: recipeCebollaId, servings: 2 })
})

describe('herramientas MCP del plan', () => {
  it('get_meal_plan devuelve entradas y nutrición del rango', async () => {
    const client = await connectedClient(mcpCtxOf(['plan:read']))
    const out = JSON.parse(textOf(await callTool(client, { name: 'get_meal_plan', arguments: { from: '2026-08-24', to: '2026-08-30' } })))
    expect(out.entries).toHaveLength(1)
    // rangeNutrition devuelve { byDate, total } donde "total" es a su vez un
    // Nutrition completo (perServing/total/per100g): el total agregado del
    // rango está en total.total, no en total directamente.
    expect(out.nutrition.total.total.kcal).toBeGreaterThan(0)
    await client.close()
  })

  it('set_meal_plan crea una propuesta y NO escribe el plan', async () => {
    const client = await connectedClient(mcpCtxOf(['plan:read', 'plan:write']))
    const before = await db.select().from(schema.mealPlanEntries).where(eq(schema.mealPlanEntries.householdId, householdId))
    const out = JSON.parse(
      textOf(
        await callTool(client, {
          name: 'set_meal_plan',
          arguments: { add: [{ date: '2026-09-01', slot: 'dinner', recipeId: recipeCebollaId, servings: 2 }], remove: [] },
        }),
      ),
    )
    expect(out.proposalId).toBeDefined()
    expect(out.diff.add).toHaveLength(1)
    const after = await db.select().from(schema.mealPlanEntries).where(eq(schema.mealPlanEntries.householdId, householdId))
    expect(after).toHaveLength(before.length) // la propuesta no toca el plan
    const [proposal] = await db.select().from(schema.planProposals).where(eq(schema.planProposals.householdId, householdId))
    expect(proposal?.source).toBe('mcp')
    expect(proposal?.status).toBe('pending')
    await client.close()
  })

  it('un argumento que la herramienta no declara falla ruidosamente (esquema estricto)', async () => {
    const client = await connectedClient(mcpCtxOf(['plan:read']))
    const result = await callTool(client, { name: 'get_meal_plan', arguments: { from: '2026-08-24', to: '2026-08-30', ordena: 'por hambre' } })
    expect(result.isError).toBe(true)
    await client.close()
  })

  it('update_meal_plan_entry solo existe en el perfil completo', async () => {
    const basic = await connectedClient(mcpCtxOf(['plan:read', 'plan:write']))
    expect((await basic.listTools()).tools.map((t) => t.name)).not.toContain('update_meal_plan_entry')
    await basic.close()
    const full = await connectedClient({ ...mcpCtxOf(['plan:read', 'plan:write']), mcpProfile: 'full' })
    expect((await full.listTools()).tools.map((t) => t.name)).toContain('update_meal_plan_entry')
    await full.close()
  })

  it('sin plan:write no se expone ninguna herramienta de escritura del plan', async () => {
    const client = await connectedClient(mcpCtxOf(['plan:read']))
    const names = (await client.listTools()).tools.map((t) => t.name)
    expect(names).toContain('get_meal_plan')
    expect(names).not.toContain('set_meal_plan')
    await client.close()
  })
})
