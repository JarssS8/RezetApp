import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { closeTestDb, getTestDb, truncateAll, type TestDb } from '@/db/test/setup'
import * as schema from '@/db/schema'
import type { Ctx } from '@/lib/services/ctx'
import { CollectionInputSchema } from '@/lib/validation/collections'
import { createCollection, deleteCollection, listCollections } from './collections'

let db: TestDb
let ctxA: Ctx
let ctxB: Ctx

async function makeHousehold(name: string): Promise<Ctx> {
  const [h] = await db.insert(schema.households).values({ name }).returning()
  const [u] = await db.insert(schema.users).values({ displayName: name }).returning()
  if (!h || !u) throw new Error('setup')
  await db.insert(schema.householdMembers).values({ householdId: h.id, userId: u.id, role: 'owner' })
  return { db, householdId: h.id, userId: u.id, apiTokenId: null, role: 'owner', locale: 'es', scopes: [] }
}

beforeAll(async () => {
  db = await getTestDb()
})
afterAll(closeTestDb)
beforeEach(async () => {
  await truncateAll(db)
  ctxA = await makeHousehold('A')
  ctxB = await makeHousehold('B')
})

describe('collections', () => {
  it('crea, lista y borra colecciones, aisladas por hogar', async () => {
    const created = await createCollection(ctxA, { name: 'Cenas rápidas', query: { maxMinutes: 20, tags: ['dieta'] } })
    expect(created).toMatchObject({ name: 'Cenas rápidas', query: { maxMinutes: 20, tags: ['dieta'] } })
    expect(await listCollections(ctxA)).toHaveLength(1)
    expect(await listCollections(ctxB)).toEqual([])

    // Borrar una del vecino no encuentra nada, en vez de decir "prohibido"
    await expect(deleteCollection(ctxB, created.id)).rejects.toMatchObject({ code: 'not_found' })
    await deleteCollection(ctxA, created.id)
    expect(await listCollections(ctxA)).toEqual([])
  })

  it('un query jsonb corrupto no rompe la lista: esa colección sale con filtro vacío', async () => {
    await db.insert(schema.collections).values({ householdId: ctxA.householdId, name: 'Rara', query: { maxMinutes: 'muchos' } })
    expect(await listCollections(ctxA)).toEqual([{ id: expect.any(String), name: 'Rara', query: {} }])
  })

  it('rechaza un nombre vacío y un filtro con campos desconocidos', async () => {
    await expect(createCollection(ctxA, CollectionInputSchema.parse({ name: 'x', query: {} }))).resolves.toBeTruthy()
    expect(CollectionInputSchema.safeParse({ name: '', query: {} }).success).toBe(false)
    expect(CollectionInputSchema.safeParse({ name: 'x', query: { inventado: 1 } }).success).toBe(false)
  })
})
