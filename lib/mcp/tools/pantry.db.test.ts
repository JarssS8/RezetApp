import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import * as schema from '@/db/schema'
import { closeTestDb, getTestDb, truncateAll, type TestDb } from '@/db/test/setup'
import type { McpCtx } from '@/lib/mcp/auth'
import { callTool, connectedClient, textOf } from './test-helpers'

let db: TestDb
let householdId: string
let foodId: string
let itemId: string
let expiringItemId: string

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

  const [food] = await db
    .insert(schema.foods)
    .values({
      nameEs: 'cebolla', nameEn: 'onion', searchNameEs: 'cebolla', searchNameEn: 'onion', source: 'usda',
      kcal100g: 40, protein100g: 1.1, carbs100g: 9.3, fat100g: 0.1, fiber100g: 1.7, gramsPerUnit: 150,
    })
    .returning()
  if (!food) throw new Error('seed')
  foodId = food.id

  const [item] = await db
    .insert(schema.pantryItems)
    .values({ householdId, foodId, quantity: 500, unit: 'g', location: 'pantry', expiresAt: '2026-12-31' })
    .returning()
  const [expiringItem] = await db
    .insert(schema.pantryItems)
    .values({ householdId, foodId, quantity: 200, unit: 'g', location: 'fridge', expiresAt: '2026-08-01' })
    .returning()
  if (!item || !expiringItem) throw new Error('seed')
  itemId = item.id
  expiringItemId = expiringItem.id
})

describe('herramientas MCP de despensa', () => {
  it('get_pantry sin filtros devuelve todos los artículos del hogar', async () => {
    const client = await connectedClient(mcpCtxOf(['pantry:read']))
    const out = JSON.parse(textOf(await callTool(client, { name: 'get_pantry', arguments: {} }))) as unknown[]
    expect(out).toHaveLength(2)
    await client.close()
  })

  it('get_pantry con expiresBefore filtra solo lo que caduca antes de esa fecha', async () => {
    const client = await connectedClient(mcpCtxOf(['pantry:read']))
    const out = JSON.parse(
      textOf(await callTool(client, { name: 'get_pantry', arguments: { expiresBefore: '2026-09-01' } })),
    ) as { id: string }[]
    expect(out).toHaveLength(1)
    expect(out[0]?.id).toBe(expiringItemId)
    await client.close()
  })

  it('update_pantry con delta negativo no baja de cero', async () => {
    const client = await connectedClient(mcpCtxOf(['pantry:read', 'pantry:write']))
    const out = JSON.parse(textOf(await callTool(client, { name: 'update_pantry', arguments: { itemId, delta: -5000 } }))) as { quantity: number }
    expect(out.quantity).toBe(0)
    const [row] = await db.select().from(schema.pantryItems).where(eq(schema.pantryItems.id, itemId))
    expect(row?.quantity).toBe(0)
    await client.close()
  })

  it('update_pantry con foodId crea un artículo nuevo', async () => {
    const client = await connectedClient(mcpCtxOf(['pantry:read', 'pantry:write']))
    const before = await db.select().from(schema.pantryItems).where(eq(schema.pantryItems.householdId, householdId))
    const out = JSON.parse(
      textOf(await callTool(client, { name: 'update_pantry', arguments: { foodId, quantity: 300, unit: 'g', location: 'freezer' } })),
    ) as { id: string; quantity: number; location: string }
    expect(out.quantity).toBe(300)
    expect(out.location).toBe('freezer')
    const after = await db.select().from(schema.pantryItems).where(eq(schema.pantryItems.householdId, householdId))
    expect(after).toHaveLength(before.length + 1)
    await client.close()
  })

  it('update_pantry con un itemId ajeno falla sin filtrar si existe', async () => {
    const client = await connectedClient(mcpCtxOf(['pantry:read', 'pantry:write']))
    const result = await callTool(client, { name: 'update_pantry', arguments: { itemId: randomUUID(), delta: -10 } })
    expect(result.isError).toBe(true)
    expect(textOf(result)).not.toMatch(/no encontrado|not found/i)
    await client.close()
  })

  it('update_pantry sin itemId+delta ni foodId+quantity+unit falla en el esquema', async () => {
    const client = await connectedClient(mcpCtxOf(['pantry:read', 'pantry:write']))
    const result = await callTool(client, { name: 'update_pantry', arguments: { itemId } })
    expect(result.isError).toBe(true)
    await client.close()
  })

  it('update_pantry con foodId pero sin unit falla en el esquema', async () => {
    const client = await connectedClient(mcpCtxOf(['pantry:read', 'pantry:write']))
    const result = await callTool(client, { name: 'update_pantry', arguments: { foodId, quantity: 100 } })
    expect(result.isError).toBe(true)
    await client.close()
  })

  it('update_pantry con quantity negativa falla en el esquema', async () => {
    const client = await connectedClient(mcpCtxOf(['pantry:read', 'pantry:write']))
    const result = await callTool(client, { name: 'update_pantry', arguments: { foodId, quantity: -1, unit: 'g' } })
    expect(result.isError).toBe(true)
    await client.close()
  })

  it('update_pantry con una unidad no declarada falla en el esquema', async () => {
    const client = await connectedClient(mcpCtxOf(['pantry:read', 'pantry:write']))
    const result = await callTool(client, { name: 'update_pantry', arguments: { foodId, quantity: 100, unit: 'kg' } })
    expect(result.isError).toBe(true)
    await client.close()
  })

  it('delete_pantry_item solo en el perfil completo', async () => {
    const basic = await connectedClient(mcpCtxOf(['pantry:read', 'pantry:write']))
    expect((await basic.listTools()).tools.map((t) => t.name)).not.toContain('delete_pantry_item')
    await basic.close()
    const full = await connectedClient({ ...mcpCtxOf(['pantry:read', 'pantry:write']), mcpProfile: 'full' })
    expect((await full.listTools()).tools.map((t) => t.name)).toContain('delete_pantry_item')
    await full.close()
  })

  it('delete_pantry_item borra el artículo de verdad', async () => {
    const client = await connectedClient({ ...mcpCtxOf(['pantry:read', 'pantry:write']), mcpProfile: 'full' })
    const out = JSON.parse(textOf(await callTool(client, { name: 'delete_pantry_item', arguments: { itemId } }))) as { deleted: string }
    expect(out.deleted).toBe(itemId)
    const [row] = await db.select().from(schema.pantryItems).where(eq(schema.pantryItems.id, itemId))
    expect(row).toBeUndefined()
    await client.close()
  })

  it('delete_pantry_item con un itemId ajeno falla sin filtrar si existe', async () => {
    const client = await connectedClient({ ...mcpCtxOf(['pantry:read', 'pantry:write']), mcpProfile: 'full' })
    const result = await callTool(client, { name: 'delete_pantry_item', arguments: { itemId: randomUUID() } })
    expect(result.isError).toBe(true)
    expect(textOf(result)).not.toMatch(/no encontrado|not found/i)
    await client.close()
  })

  it('sin pantry:write no se expone ninguna herramienta de escritura de despensa', async () => {
    const client = await connectedClient(mcpCtxOf(['pantry:read']))
    const names = (await client.listTools()).tools.map((t) => t.name)
    expect(names).toContain('get_pantry')
    expect(names).not.toContain('update_pantry')
    expect(names).not.toContain('delete_pantry_item')
    await client.close()
  })

  it('sin ningún scope de despensa, tools/list no incluye ninguna herramienta de despensa', async () => {
    const client = await connectedClient(mcpCtxOf([]))
    const names = (await client.listTools()).tools.map((t) => t.name)
    expect(names).not.toContain('get_pantry')
    expect(names).not.toContain('update_pantry')
    await client.close()
  })

  it('un argumento que la herramienta no declara falla ruidosamente (esquema estricto)', async () => {
    const client = await connectedClient(mcpCtxOf(['pantry:read']))
    const result = await callTool(client, { name: 'get_pantry', arguments: { location: 'pantry', ordena: 'por hambre' } })
    expect(result.isError).toBe(true)
    expect(textOf(result)).toMatch(/ordena/i)
    await client.close()
  })
})
