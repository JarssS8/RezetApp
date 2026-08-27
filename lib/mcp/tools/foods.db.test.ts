import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import * as schema from '@/db/schema'
import { closeTestDb, getTestDb, truncateAll, type TestDb } from '@/db/test/setup'
import type { McpCtx } from '@/lib/mcp/auth'
import type { Ctx } from '@/lib/services/ctx'
import { createFood } from '@/lib/services/foods'
import { callTool, connectedClient, textOf } from './test-helpers'

let db: TestDb
let householdId: string
let anaId: string

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
  anaId = ana.id
  await db.insert(schema.householdMembers).values({ householdId, userId: ana.id, role: 'owner', allergens: [], dietaryFlags: [] })
})

describe('herramientas MCP de alimentos', () => {
  it('create_food solo en el perfil completo, y crea el alimento en el hogar', async () => {
    const basic = await connectedClient(mcpCtxOf(['recipes:write']))
    expect((await basic.listTools()).tools.map((t) => t.name)).not.toContain('create_food')
    await basic.close()

    const full = await connectedClient({ ...mcpCtxOf(['recipes:write']), mcpProfile: 'full' })
    const out = JSON.parse(
      textOf(await callTool(full, { name: 'create_food', arguments: { nameEs: 'algarroba', nameEn: 'carob', kcal100g: 222 } })),
    )
    expect(out.householdId).toBe(householdId) // nunca global: el catálogo del seed no se toca
    await full.close()
  })

  it('create_food exige recipes:write incluso en perfil completo', async () => {
    const client = await connectedClient({ ...mcpCtxOf([]), mcpProfile: 'full' })
    expect((await client.listTools()).tools.map((t) => t.name)).not.toContain('create_food')
    await client.close()
  })

  it('create_food con un argumento no declarado falla ruidosamente (esquema estricto)', async () => {
    const client = await connectedClient({ ...mcpCtxOf(['recipes:write']), mcpProfile: 'full' })
    const result = await callTool(client, {
      name: 'create_food',
      arguments: { nameEs: 'algarroba', nameEn: 'carob', densityGPerMl: 1.05 },
    })
    expect(result.isError).toBe(true)
    await client.close()
  })

  it('merge_foods solo existe en el perfil completo y con recipes:write', async () => {
    const basic = await connectedClient(mcpCtxOf(['recipes:write']))
    expect((await basic.listTools()).tools.map((t) => t.name)).not.toContain('merge_foods')
    await basic.close()

    const sinScope = await connectedClient({ ...mcpCtxOf(['recipes:read']), mcpProfile: 'full' })
    expect((await sinScope.listTools()).tools.map((t) => t.name)).not.toContain('merge_foods')
    await sinScope.close()

    const full = await connectedClient({ ...mcpCtxOf(['recipes:write']), mcpProfile: 'full' })
    const tool = (await full.listTools()).tools.find((t) => t.name === 'merge_foods')
    expect(tool).toBeDefined()
    expect(tool?.description ?? '').toMatch(/no la uses/i)
    await full.close()
  })

  it('merge_foods fusiona y devuelve el recuento', async () => {
    const ctx: Ctx = { db, householdId, userId: anaId, apiTokenId: null, role: 'owner', locale: 'es', scopes: [] }
    const dup = await createFood(ctx, { nameEs: 'cebolla blanca', nameEn: 'white onion', aliases: [], defaultUnit: 'g', allergens: [], seasonalMonths: [] })
    const canon = await createFood(ctx, { nameEs: 'cebolla', nameEn: 'onion', aliases: [], defaultUnit: 'g', allergens: [], seasonalMonths: [] })

    const full = await connectedClient({ ...mcpCtxOf(['recipes:write']), mcpProfile: 'full' })
    const out = JSON.parse(textOf(await callTool(full, { name: 'merge_foods', arguments: { fromId: dup.id, intoId: canon.id } }))) as { intoId: string }
    expect(out.intoId).toBe(canon.id)
    await full.close()
  })

  it('un id inventado devuelve error de herramienta, no una excepción', async () => {
    const full = await connectedClient({ ...mcpCtxOf(['recipes:write']), mcpProfile: 'full' })
    const result = await callTool(full, { name: 'merge_foods', arguments: { fromId: '11111111-1111-4111-8111-111111111111', intoId: '22222222-2222-4222-8222-222222222222' } })
    expect(result.isError).toBe(true)
    await full.close()
  })
})
