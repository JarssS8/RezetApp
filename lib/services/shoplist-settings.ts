// Ajustes de ShopList del hogar: lectura, actualización (solo propietario) y
// resolución de la configuración efectiva (hogar → variables de entorno →
// ninguna). Regla 5 de AGENTS.md: RezetApp no modela la compra, solo la
// conexión hacia ShopList; mismo patrón de cifrado que lib/services/ai-settings.ts.
import { eq } from 'drizzle-orm'
import * as schema from '@/db/schema'
import { invalidateHousehold } from '@/lib/cache/tags'
import { decryptSecret, encryptSecret, getKeys } from '@/lib/crypto'
import { shopListDeepLink, type ShopListConfig } from '@/lib/integrations/shoplist'
import type { z } from 'zod'
import type { ShoplistSettingsSchema } from '@/lib/validation/household'
import { type Ctx, ServiceError } from './ctx'

export type ShoplistSettings = z.infer<typeof ShoplistSettingsSchema>

export interface ShoplistSettingsView {
  fnUrl: string | null
  listToken: string | null
  hasSecret: boolean
  source: 'household' | 'env' | 'none'
  lastPushedAt: string | null
}

type Resolved = { source: 'household' | 'env'; fnUrl: string; secret: string; listToken: string } | { source: 'none' }

async function getHousehold(ctx: Ctx): Promise<typeof schema.households.$inferSelect> {
  const [h] = await ctx.db.select().from(schema.households).where(eq(schema.households.id, ctx.householdId)).limit(1)
  if (!h) throw new ServiceError('not_found', 'Hogar no encontrado')
  return h
}

// El hogar solo se usa como fuente cuando está completo (fnUrl + secreto +
// token): no se mezclan campos del hogar con los de entorno, para que la
// procedencia de la config enviada a ShopList sea siempre inequívoca.
function resolve(h: typeof schema.households.$inferSelect): Resolved {
  if (h.shoplistFnUrl && h.shoplistListToken && h.shoplistSecretEnc) {
    return { source: 'household', fnUrl: h.shoplistFnUrl, listToken: h.shoplistListToken, secret: decryptSecret(h.shoplistSecretEnc, getKeys().secrets) }
  }
  const fnUrl = process.env.SHOPLIST_FN_URL
  const secret = process.env.SHOPLIST_IMPORT_SECRET
  const listToken = process.env.SHOPLIST_LIST_TOKEN
  if (fnUrl && secret && listToken) return { source: 'env', fnUrl, listToken, secret }
  return { source: 'none' }
}

export async function getShoplistSettings(ctx: Ctx): Promise<ShoplistSettingsView> {
  const h = await getHousehold(ctx)
  const resolved = resolve(h)
  return {
    fnUrl: resolved.source === 'none' ? null : resolved.fnUrl,
    listToken: resolved.source === 'none' ? null : resolved.listToken,
    hasSecret: resolved.source !== 'none',
    source: resolved.source,
    lastPushedAt: h.shoplistLastPushedAt ? h.shoplistLastPushedAt.toISOString() : null,
  }
}

export async function updateShoplistSettings(ctx: Ctx, input: ShoplistSettings): Promise<void> {
  if (ctx.role !== 'owner') throw new ServiceError('forbidden', 'Solo el propietario puede cambiar los ajustes de ShopList')
  const patch: Partial<typeof schema.households.$inferInsert> = {
    shoplistFnUrl: input.fnUrl,
    shoplistListToken: input.listToken,
  }
  // secret: undefined o '' mantiene el guardado; null lo borra; cualquier otro
  // valor lo sustituye cifrado (mismo patrón que apiKey en ai-settings.ts).
  if (input.secret === null) {
    patch.shoplistSecretEnc = null
  } else if (input.secret) {
    patch.shoplistSecretEnc = encryptSecret(input.secret, getKeys().secrets)
  }
  await ctx.db.update(schema.households).set(patch).where(eq(schema.households.id, ctx.householdId))
  invalidateHousehold(ctx.householdId, ['settings'])
}

// Config lista para lib/integrations/shoplist.ts::pushToShopList: hogar
// (completo) → entorno (completo) → null. null cuando ninguno lo está, para
// que pushShopping pueda dar un error de validación claro en vez de fallar
// en la llamada HTTP.
export async function resolveShopListConfig(ctx: Ctx): Promise<ShopListConfig | null> {
  const h = await getHousehold(ctx)
  const resolved = resolve(h)
  if (resolved.source === 'none') return null
  return { fnUrl: resolved.fnUrl, secret: resolved.secret, listToken: resolved.listToken }
}

// Enlace "Abrir en ShopList" para las páginas de interfaz (resumen de compra
// y ajustes de ShopList): único punto donde se construye la URL a partir de
// resolveShopListConfig, de donde sale el listToken.
export async function getShopListDeepLink(ctx: Ctx): Promise<string | null> {
  const cfg = await resolveShopListConfig(ctx)
  return cfg ? shopListDeepLink(cfg.listToken) : null
}
