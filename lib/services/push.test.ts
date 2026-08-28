import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import * as schema from '@/db/schema'
import { closeTestDb, getTestDb, truncateAll, type TestDb } from '@/db/test/setup'
import { decryptSecret, getKeys } from '@/lib/crypto'
import type { Ctx } from '@/lib/services/ctx'
import { PushSubscriptionSchema } from '@/lib/validation/push'
import {
  buildExpiringNotifications,
  getOrCreateVapidKeys,
  getVapidPublicKey,
  listPushSubscriptions,
  notifyExpiring,
  subscribePush,
  unsubscribePush,
  VAPID_SETTINGS_KEY,
} from './push'

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
    await subscribePush(anaId, sub, db)
    expect(await listPushSubscriptions(db, anaId)).toHaveLength(1)
    // El endpoint es único global (lo es en el esquema): si el dispositivo cambia
    // de dueño, la fila pasa al nuevo, no revienta con 23505.
    await subscribePush(boId, sub, db)
    expect(await listPushSubscriptions(db, anaId)).toEqual([])
    expect(await listPushSubscriptions(db, boId)).toHaveLength(1)
  })

  it('suscribirse dos veces con el mismo endpoint no duplica', async () => {
    await subscribePush(anaId, sub, db)
    await subscribePush(anaId, sub, db)
    expect(await listPushSubscriptions(db, anaId)).toHaveLength(1)
  })

  it('darse de baja solo borra la propia', async () => {
    await subscribePush(anaId, sub, db)
    await unsubscribePush(boId, sub.endpoint, db)
    expect(await listPushSubscriptions(db, anaId)).toHaveLength(1)
    await unsubscribePush(anaId, sub.endpoint, db)
    expect(await listPushSubscriptions(db, anaId)).toEqual([])
  })
})

describe('avisos de caducidad', () => {
  const sub = { endpoint: 'https://push.example/expira', keys: { p256dh: 'BPz2xy9zAB', auth: 'abcXYZ123' } }
  let ctxA: Ctx
  let cebollaId: string

  beforeEach(async () => {
    const [household] = await db.insert(schema.households).values({ name: 'Casa de Ana' }).returning()
    const [cebolla] = await db
      .insert(schema.foods)
      .values({ nameEs: 'cebolla', nameEn: 'onion', searchNameEs: 'cebolla', searchNameEn: 'onion', source: 'usda', kcal100g: 40 })
      .returning()
    if (!household || !cebolla) throw new Error('setup')
    await db.insert(schema.householdMembers).values({ householdId: household.id, userId: anaId, role: 'owner' })
    ctxA = { db, householdId: household.id, userId: anaId, apiTokenId: null, role: 'owner', locale: 'es', scopes: [] }
    cebollaId = cebolla.id
  })

  it('avisa una vez por dispositivo, con lo que caduca en su hogar', async () => {
    await subscribePush(anaId, sub, db)
    await db.insert(schema.pantryItems).values({ householdId: ctxA.householdId, foodId: cebollaId, quantity: 300, unit: 'g', expiresAt: '2026-08-28' })

    const notifications = await buildExpiringNotifications(db, new Date('2026-08-27T09:00:00Z'))
    expect(notifications).toHaveLength(1)
    expect(notifications[0]).toMatchObject({ endpoint: sub.endpoint, url: '/today' })
    expect(notifications[0]?.body).toContain('cebolla')
  })

  it('no repite el mismo alimento si caduca en dos hogares del usuario', async () => {
    const [household2] = await db.insert(schema.households).values({ name: 'Casa de Ana (compartida)' }).returning()
    if (!household2) throw new Error('setup')
    await db.insert(schema.householdMembers).values({ householdId: household2.id, userId: anaId, role: 'member' })

    await subscribePush(anaId, sub, db)
    await db.insert(schema.pantryItems).values({ householdId: ctxA.householdId, foodId: cebollaId, quantity: 300, unit: 'g', expiresAt: '2026-08-28' })
    await db.insert(schema.pantryItems).values({ householdId: household2.id, foodId: cebollaId, quantity: 200, unit: 'g', expiresAt: '2026-08-28' })

    const notifications = await buildExpiringNotifications(db, new Date('2026-08-27T09:00:00Z'))
    expect(notifications).toHaveLength(1)
    // "cebolla" caduca en los dos hogares de Ana: el aviso la nombra una sola vez.
    expect(notifications[0]?.body.match(/cebolla/g)).toHaveLength(1)
  })

  // Fix 14 de la revisión final: antes se recorrían las pertenencias y se
  // recalculaba expiringPantry() una vez por suscripción; con dos
  // dispositivos del mismo usuario eso era el doble de trabajo para el mismo
  // resultado. Se agrupa por userId, pero el aviso sigue siendo uno por
  // dispositivo (cada endpoint es una entrega push distinta).
  it('un usuario con dos dispositivos recibe un aviso por cada uno, con el mismo contenido', async () => {
    const otroDispositivo = { endpoint: 'https://push.example/expira-2', keys: { p256dh: 'BPz2xy9zCD', auth: 'defXYZ456' } }
    await subscribePush(anaId, sub, db)
    await subscribePush(anaId, otroDispositivo, db)
    await db.insert(schema.pantryItems).values({ householdId: ctxA.householdId, foodId: cebollaId, quantity: 300, unit: 'g', expiresAt: '2026-08-28' })

    const notifications = await buildExpiringNotifications(db, new Date('2026-08-27T09:00:00Z'))
    expect(notifications).toHaveLength(2)
    const endpoints = notifications.map((n) => n.endpoint).sort()
    expect(endpoints).toEqual([otroDispositivo.endpoint, sub.endpoint].sort())
    expect(notifications[0]?.body).toBe(notifications[1]?.body)
    expect(notifications[0]?.body).toContain('cebolla')
  })

  it('no avisa si no caduca nada dentro de expiry_alert_days', async () => {
    await subscribePush(anaId, sub, db)
    await db.insert(schema.pantryItems).values({ householdId: ctxA.householdId, foodId: cebollaId, quantity: 300, unit: 'g', expiresAt: '2026-12-31' })
    expect(await buildExpiringNotifications(db, new Date('2026-08-27T09:00:00Z'))).toEqual([])
  })

  it('borra la suscripción que el navegador ya ha revocado', async () => {
    await subscribePush(anaId, sub, db)
    await db.insert(schema.pantryItems).values({ householdId: ctxA.householdId, foodId: cebollaId, quantity: 300, unit: 'g', expiresAt: '2026-08-28' })
    const send = vi.fn(async () => ({ ok: false as const, gone: true }))
    const result = await notifyExpiring(db, { send }, new Date('2026-08-27T09:00:00Z'))
    expect(result).toEqual({ sent: 0, removed: 1 })
    expect(await listPushSubscriptions(db, anaId)).toEqual([])
  })

  it('un fallo pasajero no borra la suscripción', async () => {
    await subscribePush(anaId, sub, db)
    await db.insert(schema.pantryItems).values({ householdId: ctxA.householdId, foodId: cebollaId, quantity: 300, unit: 'g', expiresAt: '2026-08-28' })
    const send = vi.fn(async () => ({ ok: false as const, gone: false }))
    expect(await notifyExpiring(db, { send }, new Date('2026-08-27T09:00:00Z'))).toEqual({ sent: 0, removed: 0 })
    expect(await listPushSubscriptions(db, anaId)).toHaveLength(1)
  })
})

// El esquema rechaza esquemas no https (SSRF almacenado) y claves con
// caracteres fuera de base64url.
it('PushSubscriptionSchema rechaza endpoints http y claves no base64url', () => {
  const keys = { p256dh: 'BPx', auth: 'ok' }
  expect(PushSubscriptionSchema.safeParse({ endpoint: 'http://169.254.169.254/x', keys }).success).toBe(false)
  expect(PushSubscriptionSchema.safeParse({ endpoint: 'https://push.example.com/s/1', keys: { p256dh: 'a b', auth: 'ok' } }).success).toBe(false)
  expect(PushSubscriptionSchema.safeParse({ endpoint: 'https://push.example.com/s/1', keys }).success).toBe(true)
})

// https tampoco basta (fix 3 de la revisión final): un hostname https puede
// seguir apuntando al endpoint de metadatos de una nube o a la LAN del propio
// servidor.
it('PushSubscriptionSchema rechaza un endpoint https hacia un host privado o reservado', () => {
  const keys = { p256dh: 'BPx', auth: 'ok' }
  expect(PushSubscriptionSchema.safeParse({ endpoint: 'https://169.254.169.254/x', keys }).success).toBe(false)
  expect(PushSubscriptionSchema.safeParse({ endpoint: 'https://192.168.1.20/x', keys }).success).toBe(false)
})
