'use server'

import { revalidatePath } from 'next/cache'
import { requireHousehold } from '@/lib/auth/guards'
import type { ShoppingLine } from '@/lib/domain'
import { generateShopping, pushShopping, ShopListError } from '@/lib/services/shopping'
import { getShoplistSettings, resolveShopListConfig, updateShoplistSettings, type ShoplistSettingsView } from '@/lib/services/shoplist-settings'
import { ShoplistSettingsSchema } from '@/lib/validation/household'
import { ShoppingGenerateSchema, ShoppingPushSchema } from '@/lib/validation/shopping'
import { type ActionResult, fail, fromError, ok } from './result'

const SHOPPING_PATH = '/plan/shopping'

// Mismo formato que lib/integrations/shoplist.ts::shopListDeepLink, duplicado
// aquí (sin exportar) porque lib/actions/** no puede depender de
// lib/integrations/** (eslint boundaries/dependencies): las páginas de
// interfaz solo necesitan el enlace, no el cliente HTTP completo.
function shopListDeepLink(listToken: string): string {
  return `https://shop.jarsss8.es/#/s/${listToken}`
}

export async function generateShoppingAction(range: unknown): Promise<ActionResult<{ lines: ShoppingLine[]; from: string; to: string }>> {
  try {
    const ctx = await requireHousehold()
    const parsed = ShoppingGenerateSchema.safeParse(range)
    if (!parsed.success) return fail('validation', parsed.error.issues[0]?.message ?? 'Rango de fechas inválido')
    return ok(await generateShopping(ctx, parsed.data))
  } catch (e) {
    return fromError(e)
  }
}

export async function pushShoppingAction(lines: unknown): Promise<ActionResult<{ inserted: number; deepLink: string }>> {
  try {
    const ctx = await requireHousehold()
    const parsed = ShoppingPushSchema.safeParse({ lines })
    if (!parsed.success) return fail('validation', parsed.error.issues[0]?.message ?? 'Líneas de compra inválidas')
    const result = await pushShopping(ctx, parsed.data.lines)
    revalidatePath(SHOPPING_PATH)
    return ok(result)
  } catch (e) {
    // El status HTTP va dentro del mensaje de ShopListError; nunca se expone el secreto.
    if (e instanceof ShopListError) return fail('shoplist', e.message)
    return fromError(e)
  }
}

// Enlace "Abrir en ShopList" para las páginas de interfaz (resumen de compra
// y ajustes): ninguna puede importar lib/integrations directamente (regla de
// boundaries), así que esta acción es la única puerta hacia shopListDeepLink.
export async function getShopListLinkAction(): Promise<ActionResult<{ deepLink: string | null }>> {
  try {
    const ctx = await requireHousehold()
    const cfg = await resolveShopListConfig(ctx)
    return ok({ deepLink: cfg ? shopListDeepLink(cfg.listToken) : null })
  } catch (e) {
    return fromError(e)
  }
}

export async function updateShoplistSettingsAction(input: unknown): Promise<ActionResult<ShoplistSettingsView>> {
  try {
    const ctx = await requireHousehold()
    const parsed = ShoplistSettingsSchema.safeParse(input)
    if (!parsed.success) return fail('validation', parsed.error.issues[0]?.message ?? 'Datos inválidos')
    await updateShoplistSettings(ctx, parsed.data)
    return ok(await getShoplistSettings(ctx))
  } catch (e) {
    return fromError(e)
  }
}
