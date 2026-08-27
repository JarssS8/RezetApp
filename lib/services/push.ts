// Claves VAPID y suscripciones de push (spec §4, §15).
import { and, eq } from 'drizzle-orm'
import { db } from '@/db'
import * as schema from '@/db/schema'
import { decryptSecret, encryptSecret, getKeys } from '@/lib/crypto'
import { generateVapidKeys, type VapidKeys } from '@/lib/integrations/web-push'
import type { PushSubscriptionInput } from '@/lib/validation/push'
import type { Db } from './ctx'
import { ServiceError } from './ctx'

// Reexportada para las rutas de app/api/push: las fronteras de eslint-boundaries
// no dejan a `app` importar `db` directamente, solo a través de `services`.
export { db }

export const VAPID_SETTINGS_KEY = 'vapid'

// Ruling W4-R4: la clave privada VAPID nunca se guarda en claro. Se cifra con
// el mismo cifrado que la clave de API de IA (`lib/crypto.ts`, AES-256-GCM
// derivado de APP_SECRET vía `getKeys().secrets`), consistente con el trato
// que ya reciben esa clave y el secreto de ShopList. `Buffer` no serializa en
// jsonb, así que se guarda en base64.
interface StoredVapidEncrypted {
  publicKey: string
  privateKeyEnc: string
}

// Forma en la que quedó una fila creada antes de esta corrección: clave
// privada en claro. Se tolera solo para migrarla, nunca se vuelve a escribir así.
interface StoredVapidLegacyPlain {
  publicKey: string
  privateKey: string
}

type StoredVapid = StoredVapidEncrypted | StoredVapidLegacyPlain

function isStoredVapid(v: unknown): v is StoredVapid {
  if (typeof v !== 'object' || v === null) return false
  const o = v as Record<string, unknown>
  if (typeof o.publicKey !== 'string') return false
  return typeof o.privateKeyEnc === 'string' || typeof o.privateKey === 'string'
}

function isLegacyPlain(v: StoredVapid): v is StoredVapidLegacyPlain {
  return 'privateKey' in v
}

function encryptPrivateKey(privateKey: string): string {
  return encryptSecret(privateKey, getKeys().secrets).toString('base64')
}

function decryptPrivateKey(privateKeyEnc: string): string {
  return decryptSecret(Buffer.from(privateKeyEnc, 'base64'), getKeys().secrets)
}

function toEncryptedRecord(keys: VapidKeys): StoredVapidEncrypted {
  return { publicKey: keys.publicKey, privateKeyEnc: encryptPrivateKey(keys.privateKey) }
}

// Descifra una fila guardada. Si viene de antes de esta corrección (clave
// privada en claro), la reescribe cifrada una sola vez: migración en código,
// sin tocar el esquema.
async function resolveStoredVapid(db: Db, stored: StoredVapid): Promise<VapidKeys> {
  if (isLegacyPlain(stored)) {
    const keys: VapidKeys = { publicKey: stored.publicKey, privateKey: stored.privateKey }
    await db.update(schema.appSettings).set({ value: toEncryptedRecord(keys) }).where(eq(schema.appSettings.key, VAPID_SETTINGS_KEY))
    return keys
  }
  return { publicKey: stored.publicKey, privateKey: decryptPrivateKey(stored.privateKeyEnc) }
}

// Se generan una vez y no cambian nunca: cambiar el par invalidaría todas las
// suscripciones ya registradas en los navegadores.
// onConflictDoNothing + relectura cubre dos arranques simultáneos.
export async function getOrCreateVapidKeys(db: Db): Promise<VapidKeys> {
  const existing = await db.select().from(schema.appSettings).where(eq(schema.appSettings.key, VAPID_SETTINGS_KEY)).limit(1)
  const stored = existing[0]?.value
  if (isStoredVapid(stored)) return resolveStoredVapid(db, stored)

  const keys = generateVapidKeys()
  await db.insert(schema.appSettings).values({ key: VAPID_SETTINGS_KEY, value: toEncryptedRecord(keys) }).onConflictDoNothing()
  const after = await db.select().from(schema.appSettings).where(eq(schema.appSettings.key, VAPID_SETTINGS_KEY)).limit(1)
  const value = after[0]?.value
  if (!isStoredVapid(value)) throw new ServiceError('conflict', 'No se pudieron generar las claves de notificaciones')
  return resolveStoredVapid(db, value)
}

export async function getVapidPublicKey(db: Db): Promise<string> {
  return (await getOrCreateVapidKeys(db)).publicKey
}

// El endpoint es único en toda la instalación (lo impone el esquema): si el
// mismo navegador se usa con otra cuenta, la suscripción cambia de dueño en
// vez de fallar con una violación de unicidad.
export async function subscribePush(db: Db, userId: string, sub: PushSubscriptionInput): Promise<void> {
  await db
    .insert(schema.pushSubscriptions)
    .values({ userId, endpoint: sub.endpoint, keys: sub.keys })
    .onConflictDoUpdate({ target: schema.pushSubscriptions.endpoint, set: { userId, keys: sub.keys } })
}

export async function unsubscribePush(db: Db, userId: string, endpoint: string): Promise<void> {
  await db.delete(schema.pushSubscriptions).where(and(eq(schema.pushSubscriptions.userId, userId), eq(schema.pushSubscriptions.endpoint, endpoint)))
}

export async function listPushSubscriptions(db: Db, userId: string): Promise<{ endpoint: string; createdAt: Date }[]> {
  return db
    .select({ endpoint: schema.pushSubscriptions.endpoint, createdAt: schema.pushSubscriptions.createdAt })
    .from(schema.pushSubscriptions)
    .where(eq(schema.pushSubscriptions.userId, userId))
    .orderBy(schema.pushSubscriptions.createdAt)
}
