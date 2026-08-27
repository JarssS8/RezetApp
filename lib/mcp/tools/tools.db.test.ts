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
let recipeCebollaId: string

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
  const [bo] = await db.insert(schema.users).values({ displayName: 'Bo' }).returning()
  if (!h || !ana || !bo) throw new Error('seed')
  householdId = h.id
  anaId = ana.id
  await db.insert(schema.householdMembers).values([
    { householdId, userId: ana.id, role: 'owner', allergens: ['gluten'], dietaryFlags: [] },
    { householdId, userId: bo.id, role: 'member', allergens: ['lactosa'], dietaryFlags: ['vegetariano'] },
  ])
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
  await createRecipe(ctx, {
    title: 'Tostada con aguacate',
    servingsBase: 2,
    prepMinutes: 5,
    cookMinutes: 60,
    ingredients: [{ rawText: '2 rebanadas de pan', scalesLinearly: true }],
    steps: [{ text: 'Tuesta el pan' }],
    tags: ['desayuno'],
    imageUrls: [],
  })
  recipeCebollaId = sopa.recipe.id
})

describe('herramientas MCP', () => {
  it('tools/list expone las 3 herramientas, cada una con la barandilla "no la uses" en la descripción', async () => {
    const client = await connectedClient(mcpCtxOf(['household:read', 'recipes:read']))
    const { tools } = await client.listTools()
    expect(tools.map((t) => t.name).sort()).toEqual(['get_household_context', 'get_recipe', 'search_recipes'])
    // Barandilla de descripción (docs/05-MCP.md): cada herramienta dice cuándo
    // NO usarla, en vez de solo qué hace.
    for (const tool of tools) expect(tool.description ?? '').toMatch(/no la uses|no inventes/i)
    await client.close()
  })

  it('sin recipes:read, search_recipes y get_recipe no aparecen en tools/list', async () => {
    const client = await connectedClient(mcpCtxOf(['household:read']))
    const { tools } = await client.listTools()
    expect(tools.map((t) => t.name)).toEqual(['get_household_context'])
    await client.close()
  })

  it('sin ningún scope, tools/list está vacía', async () => {
    const client = await connectedClient(mcpCtxOf([]))
    const { tools } = await client.listTools()
    expect(tools).toEqual([])
    await client.close()
  })

  it('get_household_context devuelve miembros con alérgenos, raciones por defecto y nada cocinado', async () => {
    const client = await connectedClient(mcpCtxOf(['household:read']))
    const res = await callTool(client, { name: 'get_household_context', arguments: {} })
    const body = JSON.parse(textOf(res)) as {
      members: { allergens: string[] }[]
      defaultServings: number
      expiryAlertDays: number
      recentlyCooked: unknown[]
    }
    expect(body.members).toHaveLength(2)
    expect(body.members.flatMap((m) => m.allergens).sort()).toEqual(['gluten', 'lactosa'])
    expect(body.defaultServings).toBe(2)
    expect(body.expiryAlertDays).toBe(3)
    expect(body.recentlyCooked).toEqual([])
    await client.close()
  })

  it('search_recipes filtra por texto y tiempo máximo, devolviendo resúmenes con id', async () => {
    const client = await connectedClient(mcpCtxOf(['recipes:read']))
    const res = await callTool(client, { name: 'search_recipes', arguments: { q: 'cebolla', maxMinutes: 30 } })
    const body = JSON.parse(textOf(res)) as { items: { id: string; title: string; totalMinutes: number; kcalPerServing: number | null; tags: string[] }[] }
    expect(body.items).toHaveLength(1)
    expect(body.items[0]).toMatchObject({ id: recipeCebollaId, title: 'Sopa de cebolla', totalMinutes: 25 })
    expect(body.items[0]?.tags).toEqual(['sopa'])
    expect(typeof body.items[0]?.kcalPerServing).toBe('number')
    await client.close()
  })

  it('get_recipe escala los ingredientes a N raciones y marca los no lineales', async () => {
    const client = await connectedClient(mcpCtxOf(['recipes:read']))
    const res = await callTool(client, { name: 'get_recipe', arguments: { id: recipeCebollaId, servings: 8 } })
    const body = JSON.parse(textOf(res)) as { scaled: { ratio: number; nonLinearIds: string[] } | null }
    expect(body.scaled?.ratio).toBe(2)
    expect(body.scaled?.nonLinearIds).toHaveLength(1)
    await client.close()
  })

  it('get_recipe con un id de otro hogar devuelve isError', async () => {
    const [otherHousehold] = await db.insert(schema.households).values({ name: 'Otra casa' }).returning()
    const [otherUser] = await db.insert(schema.users).values({ displayName: 'Foráneo' }).returning()
    if (!otherHousehold || !otherUser) throw new Error('seed')
    await db.insert(schema.householdMembers).values({ householdId: otherHousehold.id, userId: otherUser.id, role: 'owner' })
    const foreignCtx: Ctx = { db, householdId: otherHousehold.id, userId: otherUser.id, apiTokenId: null, role: 'owner', locale: 'es', scopes: [] }
    const foreign = await createRecipe(foreignCtx, { title: 'Receta ajena', servingsBase: 2, ingredients: [], steps: [], tags: [], imageUrls: [] })

    const client = await connectedClient(mcpCtxOf(['recipes:read']))
    const res = await callTool(client, { name: 'get_recipe', arguments: { id: foreign.recipe.id } })
    expect(res.isError).toBe(true)
    await client.close()
  })

  it('argumentos extra en search_recipes fallan la validación estricta', async () => {
    const client = await connectedClient(mcpCtxOf(['recipes:read']))
    // El SDK atrapa el error de validación de entrada y lo devuelve como
    // resultado con isError, no como una promesa rechazada (ver mcp.js:
    // CallToolRequestSchema envuelve todo en try/catch salvo elicitación).
    const res = await callTool(client, { name: 'search_recipes', arguments: { q: 'cebolla', bogus: true } })
    expect(res.isError).toBe(true)
    expect(textOf(res)).toMatch(/bogus/i)
    await client.close()
  })

  it('argumentos extra en get_household_context fallan la validación estricta', async () => {
    const client = await connectedClient(mcpCtxOf(['household:read']))
    const res = await callTool(client, { name: 'get_household_context', arguments: { bogus: true } })
    expect(res.isError).toBe(true)
    expect(textOf(res)).toMatch(/bogus/i)
    await client.close()
  })

  it('create_recipe crea una receta con los ingredientes ya resueltos por el servidor', async () => {
    const client = await connectedClient(mcpCtxOf(['recipes:read', 'recipes:write']))
    const out = JSON.parse(
      textOf(
        await callTool(client, {
          name: 'create_recipe',
          arguments: { title: 'Tortilla', servingsBase: 2, ingredients: [{ rawText: '3 huevos' }], steps: [{ text: 'Bate y cuaja' }] },
        }),
      ),
    ) as { id: string }
    expect(out.id).toBeDefined()
    const [row] = await db.select().from(schema.recipes).where(eq(schema.recipes.id, out.id))
    expect(row?.title).toBe('Tortilla')
    await client.close()
  })

  it('import_recipe desde texto devuelve un borrador, sin guardarlo', async () => {
    const client = await connectedClient(mcpCtxOf(['recipes:write']))
    const before = await db.select().from(schema.recipes).where(eq(schema.recipes.householdId, householdId))
    const out = JSON.parse(
      textOf(await callTool(client, { name: 'import_recipe', arguments: { kind: 'text', text: 'Gazpacho\n\n1 kg de tomate\n\nTritura todo' } })),
    ) as { title: string }
    expect(out.title).toContain('Gazpacho')
    const after = await db.select().from(schema.recipes).where(eq(schema.recipes.householdId, householdId))
    expect(after).toHaveLength(before.length)
    await client.close()
  })

  it('editar y borrar recetas solo existe en el perfil completo', async () => {
    const basic = await connectedClient(mcpCtxOf(['recipes:read', 'recipes:write']))
    const names = (await basic.listTools()).tools.map((t) => t.name)
    expect(names).toContain('create_recipe')
    expect(names).not.toContain('update_recipe')
    expect(names).not.toContain('delete_recipe')
    await basic.close()

    const full = await connectedClient({ ...mcpCtxOf(['recipes:read', 'recipes:write']), mcpProfile: 'full' })
    const fullNames = (await full.listTools()).tools.map((t) => t.name)
    expect(fullNames).toContain('update_recipe')
    expect(fullNames).toContain('delete_recipe')
    await full.close()
  })
})
