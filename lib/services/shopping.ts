// Servicio de compra (tarea 30): consolida lo que hace falta comprar y lo
// empuja a ShopList. Regla 2 de AGENTS.md: toda la aritmética vive en
// lib/domain/shopping.ts::consolidateNeeds; este servicio solo carga datos y
// llama al cliente HTTP de la integración.
import { eq } from 'drizzle-orm'
import * as schema from '@/db/schema'
import { consolidateNeeds } from '@/lib/domain'
import type { ShoppingLine } from '@/lib/domain'
import { pushToShopList, shopListDeepLink, ShopListError } from '@/lib/integrations/shoplist'
import { pantryAsDomain } from './pantry'
import { plannedEntriesForShopping } from './plan'
import { resolveShopListConfig } from './shoplist-settings'
import { type Ctx, ServiceError } from './ctx'

export { ShopListError }

// Rango de fechas del plan a consolidar (mismo contrato que lib/validation/common.ts::DateRangeSchema).
export interface DateRange {
  from: string
  to: string
}

// Consolida las entradas planificadas del rango (sin cocinar, sin saltar, sin
// sobras) contra la despensa actual. No toca ShopList: solo calcula.
export async function generateShopping(ctx: Ctx, range: DateRange): Promise<{ lines: ShoppingLine[]; from: string; to: string }> {
  const [entries, pantry] = await Promise.all([plannedEntriesForShopping(ctx, range), pantryAsDomain(ctx)])
  const lines = consolidateNeeds(entries, pantry)
  return { lines, from: range.from, to: range.to }
}

// Envía las líneas ya consolidadas (generateShopping, o editadas a mano en la
// interfaz) a ShopList. Sin config de hogar ni de entorno: error de
// validación, no un intento de red que falle más tarde.
export async function pushShopping(ctx: Ctx, lines: ShoppingLine[]): Promise<{ inserted: number; deepLink: string }> {
  const cfg = await resolveShopListConfig(ctx)
  if (!cfg) throw new ServiceError('validation', 'ShopList no está configurado')
  const { inserted } = await pushToShopList(cfg, lines)
  await ctx.db.update(schema.households).set({ shoplistLastPushedAt: new Date() }).where(eq(schema.households.id, ctx.householdId))
  return { inserted, deepLink: shopListDeepLink(cfg.listToken) }
}
