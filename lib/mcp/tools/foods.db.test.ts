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
  if (!h) throw new Error('seed')
  householdId = h.id
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

  it('merge_foods no existe todavía en ningún perfil', async () => {
    const basic = await connectedClient(mcpCtxOf(['recipes:write']))
    expect((await basic.listTools()).tools.map((t) => t.name)).not.toContain('merge_foods')
    await basic.close()

    const full = await connectedClient({ ...mcpCtxOf(['recipes:write']), mcpProfile: 'full' })
    expect((await full.listTools()).tools.map((t) => t.name)).not.toContain('merge_foods')
    await full.close()
  })
})
