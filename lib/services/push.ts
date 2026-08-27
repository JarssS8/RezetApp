// Claves VAPID y suscripciones de push (spec §4, §15).
import { and, eq } from 'drizzle-orm'
import { db } from '@/db'
import * as schema from '@/db/schema'
import { decryptSecret, encryptSecret, getKeys } from '@/lib/crypto'
import { generateVapidKeys, sendWebPush, type VapidKeys } from '@/lib/integrations/web-push'
import { PushSubscriptionSchema, type PushSubscriptionInput } from '@/lib/validation/push'
import { expiringPantry } from './pantry'
import type { Ctx, Db } from './ctx'
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

export interface ExpiringNotification {
  endpoint: string
  title: string
  body: string
  url: string
}

// Cuántos alimentos se nombran en el cuerpo antes de resumir: una notificación
// del sistema se corta sola, y una lista de quince nombres no se lee.
const NAMES_IN_BODY = 3

// Un aviso por dispositivo suscrito. `push_subscriptions` es por usuario (spec
// §4 no le pone household_id) y un usuario puede estar en varios hogares: se
// recorren todos los suyos y se junta lo que caduca en cada uno.
//
// Las pertenencias y lo que caduca son las mismas para todos los
// dispositivos de una misma persona: se agrupa por userId y se calculan una
// sola vez (fix 14 de la revisión final; antes se repetían por cada endpoint
// suscrito), pero el resultado sigue siendo un `ExpiringNotification` por
// dispositivo, porque cada endpoint es una entrega push distinta.
export async function buildExpiringNotifications(db: Db, now: Date = new Date()): Promise<ExpiringNotification[]> {
  const subs = await db
    .select({
      endpoint: schema.pushSubscriptions.endpoint,
      userId: schema.pushSubscriptions.userId,
      locale: schema.users.locale,
    })
    .from(schema.pushSubscriptions)
    .innerJoin(schema.users, eq(schema.users.id, schema.pushSubscriptions.userId))

  const endpointsByUser = new Map<string, string[]>()
  const localeByUser = new Map<string, 'es' | 'en'>()
  for (const sub of subs) {
    const endpoints = endpointsByUser.get(sub.userId) ?? []
    endpoints.push(sub.endpoint)
    endpointsByUser.set(sub.userId, endpoints)
    localeByUser.set(sub.userId, sub.locale === 'en' ? 'en' : 'es')
  }

  const out: ExpiringNotification[] = []
  for (const [userId, endpoints] of endpointsByUser) {
    const locale = localeByUser.get(userId) ?? 'es'
    const memberships = await db
      .select({ householdId: schema.householdMembers.householdId, expiryAlertDays: schema.households.expiryAlertDays })
      .from(schema.householdMembers)
      .innerJoin(schema.households, eq(schema.households.id, schema.householdMembers.householdId))
      .where(eq(schema.householdMembers.userId, userId))

    // Set en vez de array: el mismo alimento puede caducar en dos hogares del
    // usuario ("cebolla" en casa A y en casa B) y no hace falta nombrarlo dos veces.
    const names = new Set<string>()
    for (const membership of memberships) {
      const ctx: Ctx = { db, householdId: membership.householdId, userId, apiTokenId: null, role: null, locale, scopes: [] }
      const expiring = await expiringPantry(ctx, membership.expiryAlertDays, now)
      for (const item of expiring) names.add(item.name)
    }
    if (names.size === 0) continue

    const nameList = [...names]
    const head = nameList.slice(0, NAMES_IN_BODY).join(', ')
    const rest = nameList.length - Math.min(NAMES_IN_BODY, nameList.length)
    // Los textos de una notificación no pasan por next-intl (no hay petición ni
    // contexto de React aquí): se escriben en los dos idiomas a mano, que son
    // dos frases.
    const title = locale === 'en' ? 'Something is about to expire' : 'Algo está a punto de caducar'
    const body =
      rest > 0
        ? locale === 'en'
          ? `${head} and ${rest} more`
          : `${head} y ${rest} más`
        : head
    for (const endpoint of endpoints) out.push({ endpoint, title, body, url: '/today' })
  }
  return out
}

export async function notifyExpiring(
  db: Db,
  deps: { send?: typeof sendWebPush } = {},
  now: Date = new Date(),
): Promise<{ sent: number; removed: number }> {
  const send = deps.send ?? sendWebPush
  const notifications = await buildExpiringNotifications(db, now)
  if (notifications.length === 0) return { sent: 0, removed: 0 }

  const vapid = await getOrCreateVapidKeys(db)
  const subject = process.env.PUSH_CONTACT ?? process.env.APP_URL ?? 'https://localhost'
  const rows = await db.select().from(schema.pushSubscriptions)
  const byEndpoint = new Map(rows.map((r) => [r.endpoint, r]))

  let sent = 0
  let removed = 0
  for (const notification of notifications) {
    const row = byEndpoint.get(notification.endpoint)
    if (!row) continue
    const keys = PushSubscriptionSchema.shape.keys.safeParse(row.keys)
    if (!keys.success) {
      // No se cuenta como envío ni como baja: el tipo de retorno de esta
      // función está congelado (§5), así que el aviso queda en el registro del
      // proceso en vez de en un tercer contador.
      console.warn(`push: claves inválidas para el endpoint ${row.endpoint}, se omite`)
      continue
    }
    const result = await send(
      { endpoint: row.endpoint, keys: keys.data },
      JSON.stringify({ title: notification.title, body: notification.body, url: notification.url }),
      { ...vapid, subject },
    )
    if (result.ok) sent += 1
    // Solo se borra ante 404/410: un corte de red no debe costarle al usuario
    // volver a dar permiso en el navegador.
    else if (result.gone) {
      await db.delete(schema.pushSubscriptions).where(eq(schema.pushSubscriptions.endpoint, row.endpoint))
      removed += 1
    }
  }
  return { sent, removed }
}
