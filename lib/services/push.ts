// Claves VAPID y suscripciones de push (spec §4, §15).
import { eq } from 'drizzle-orm'
import * as schema from '@/db/schema'
import { generateVapidKeys, type VapidKeys } from '@/lib/integrations/web-push'
import type { Db } from './ctx'
import { ServiceError } from './ctx'

export const VAPID_SETTINGS_KEY = 'vapid'

function isVapidKeys(v: unknown): v is VapidKeys {
  return typeof v === 'object' && v !== null && typeof (v as VapidKeys).publicKey === 'string' && typeof (v as VapidKeys).privateKey === 'string'
}

// Se generan una vez y no cambian nunca: cambiar el par invalidaría todas las
// suscripciones ya registradas en los navegadores.
// onConflictDoNothing + relectura cubre dos arranques simultáneos.
export async function getOrCreateVapidKeys(db: Db): Promise<VapidKeys> {
  const existing = await db.select().from(schema.appSettings).where(eq(schema.appSettings.key, VAPID_SETTINGS_KEY)).limit(1)
  const stored = existing[0]?.value
  if (isVapidKeys(stored)) return stored

  const keys = generateVapidKeys()
  await db.insert(schema.appSettings).values({ key: VAPID_SETTINGS_KEY, value: keys }).onConflictDoNothing()
  const after = await db.select().from(schema.appSettings).where(eq(schema.appSettings.key, VAPID_SETTINGS_KEY)).limit(1)
  const value = after[0]?.value
  if (!isVapidKeys(value)) throw new ServiceError('conflict', 'No se pudieron generar las claves de notificaciones')
  return value
}

export async function getVapidPublicKey(db: Db): Promise<string> {
  return (await getOrCreateVapidKeys(db)).publicKey
}
