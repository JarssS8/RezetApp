import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import * as schema from '@/db/schema'
import { closeTestDb, getTestDb, truncateAll, type TestDb } from '@/db/test/setup'
import { decryptSecret, getKeys } from '@/lib/crypto'
import { getOrCreateVapidKeys, getVapidPublicKey, listPushSubscriptions, subscribePush, unsubscribePush, VAPID_SETTINGS_KEY } from './push'

process.env.APP_SECRET = 'secreto-de-prueba-con-suficiente-longitud-1234'

let db: TestDb
let anaId: string, boId: string

beforeAll(async () => { db = await getTestDb() })
afterAll(closeTestDb)
beforeEach(async () => {
  await truncateAll(db)
  const [ana] = await db.insert(schema.users).values({ displayName: 'Ana' }).returning()
  const [bo] = await db.insert(schema.users).values({ displayName: 'Bo' }).returning()
  if (!ana || !bo) throw new Error('setup')
  anaId = ana.id
  boId = bo.id
})

async function readRawRow(testDb: TestDb): Promise<Record<string, unknown>> {
  const rows = await testDb.select().from(schema.appSettings).where(eq(schema.appSettings.key, VAPID_SETTINGS_KEY))
  const row = rows[0]
  if (!row) throw new Error('fila vapid no encontrada')
  return row.value as Record<string, unknown>
}

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

  it('la clave privada queda cifrada en reposo y descifra igual a la generada', async () => {
    const keys = await getOrCreateVapidKeys(db)
    const raw = await readRawRow(db)
    expect(typeof raw.privateKeyEnc).toBe('string')
    expect(raw.privateKey).toBeUndefined()
    // El blob crudo no contiene la clave privada en ningún formato reconocible
    expect(JSON.stringify(raw)).not.toContain(keys.privateKey)
    expect(decryptSecret(Buffer.from(raw.privateKeyEnc as string, 'base64'), getKeys().secrets)).toBe(keys.privateKey)
  })

  it('migra en caliente una fila antigua con la clave privada en claro', async () => {
    const legacy = { publicKey: 'clave-publica-legado', privateKey: 'clave-privada-legado-en-claro' }
    await db.insert(schema.appSettings).values({ key: VAPID_SETTINGS_KEY, value: legacy })

    const keys = await getOrCreateVapidKeys(db)
    expect(keys).toEqual(legacy)

    const raw = await readRawRow(db)
    expect(raw.privateKey).toBeUndefined()
    expect(typeof raw.privateKeyEnc).toBe('string')
    expect(decryptSecret(Buffer.from(raw.privateKeyEnc as string, 'base64'), getKeys().secrets)).toBe(legacy.privateKey)

    // Una segunda lectura ya no vuelve a reescribir: sigue devolviendo lo mismo
    const again = await getOrCreateVapidKeys(db)
    expect(again).toEqual(legacy)
  })
})

describe('suscripciones de push', () => {
  const sub = { endpoint: 'https://push.example/abc', keys: { p256dh: 'BPk…', auth: 'xyz' } }

  it('guarda la suscripción y la reemplaza si el mismo endpoint vuelve con otro usuario', async () => {
    await subscribePush(db, anaId, sub)
    expect(await listPushSubscriptions(db, anaId)).toHaveLength(1)
    // El endpoint es único global (lo es en el esquema): si el dispositivo cambia
    // de dueño, la fila pasa al nuevo, no revienta con 23505.
    await subscribePush(db, boId, sub)
    expect(await listPushSubscriptions(db, anaId)).toEqual([])
    expect(await listPushSubscriptions(db, boId)).toHaveLength(1)
  })

  it('suscribirse dos veces con el mismo endpoint no duplica', async () => {
    await subscribePush(db, anaId, sub)
    await subscribePush(db, anaId, sub)
    expect(await listPushSubscriptions(db, anaId)).toHaveLength(1)
  })

  it('darse de baja solo borra la propia', async () => {
    await subscribePush(db, anaId, sub)
    await unsubscribePush(db, boId, sub.endpoint)
    expect(await listPushSubscriptions(db, anaId)).toHaveLength(1)
    await unsubscribePush(db, anaId, sub.endpoint)
    expect(await listPushSubscriptions(db, anaId)).toEqual([])
  })
})
