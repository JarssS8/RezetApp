import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import * as schema from '@/db/schema'
import { closeTestDb, getTestDb, truncateAll, type TestDb } from '@/db/test/setup'
import { getOrCreateVapidKeys, getVapidPublicKey, VAPID_SETTINGS_KEY } from './push'

let db: TestDb

beforeAll(async () => { db = await getTestDb() })
afterAll(closeTestDb)
beforeEach(async () => { await truncateAll(db) })

describe('push', () => {
  it('genera las claves VAPID una sola vez y las reutiliza', async () => {
    const first = await getOrCreateVapidKeys(db)
    const second = await getOrCreateVapidKeys(db)
    expect(second).toEqual(first)
    const rows = await db.select().from(schema.appSettings).where(eq(schema.appSettings.key, VAPID_SETTINGS_KEY))
    expect(rows).toHaveLength(1)
  })

  it('dos arranques a la vez no dejan dos pares distintos', async () => {
    const [a, b] = await Promise.all([getOrCreateVapidKeys(db), getOrCreateVapidKeys(db)])
    expect(a).toEqual(b)
  })

  it('getVapidPublicKey devuelve solo la pública', async () => {
    const keys = await getOrCreateVapidKeys(db)
    expect(await getVapidPublicKey(db)).toBe(keys.publicKey)
  })
})
