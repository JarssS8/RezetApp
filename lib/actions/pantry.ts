'use server'
import { requireHousehold } from '@/lib/auth/guards'
import { adjustPantryItem, removePantryItem, upsertPantryItem, type PantryRow } from '@/lib/services/pantry'
import { IdSchema } from '@/lib/validation/common'
import { PantryAdjustSchema, PantryItemInputSchema } from '@/lib/validation/pantry'
import { type ActionResult, fail, fromError, ok } from './result'

// Tipo re-exportado para que components/* lo use sin importar lib/services
// directamente (la frontera de eslint-boundaries prohíbe components -> services).
export type { PantryRow }

const PantryUpsertSchema = PantryItemInputSchema.extend({ id: IdSchema.optional() })

export async function upsertPantryItemAction(input: unknown): Promise<ActionResult<PantryRow>> {
  try {
    const ctx = await requireHousehold()
    const parsed = PantryUpsertSchema.safeParse(input)
    if (!parsed.success) return fail('validation', parsed.error.issues[0]?.message ?? 'Datos inválidos')
    // exactOptionalPropertyTypes: no propagar `id: undefined` explícito, el
    // servicio distingue creación de actualización por la presencia de la clave.
    const { id, ...rest } = parsed.data
    const row = await upsertPantryItem(ctx, id ? { ...rest, id } : rest)
    return ok(row)
  } catch (e) {
    return fromError(e)
  }
}

export async function adjustPantryItemAction(itemId: string, delta: number): Promise<ActionResult<PantryRow>> {
  try {
    const ctx = await requireHousehold()
    const parsed = PantryAdjustSchema.safeParse({ itemId, delta })
    if (!parsed.success) return fail('validation', parsed.error.issues[0]?.message ?? 'Datos inválidos')
    const row = await adjustPantryItem(ctx, parsed.data)
    return ok(row)
  } catch (e) {
    return fromError(e)
  }
}

export async function removePantryItemAction(id: string): Promise<ActionResult<void>> {
  try {
    const ctx = await requireHousehold()
    const parsed = IdSchema.safeParse(id)
    if (!parsed.success) return fail('validation', 'Id inválido')
    await removePantryItem(ctx, parsed.data)
    return ok(undefined)
  } catch (e) {
    return fromError(e)
  }
}
