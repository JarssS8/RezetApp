'use server'

import { revalidatePath } from 'next/cache'
import { requireHousehold } from '@/lib/auth/guards'
import { createCollection, deleteCollection, type CollectionView } from '@/lib/services/collections'
import { IdSchema } from '@/lib/validation/common'
import { CollectionInputSchema } from '@/lib/validation/collections'
import { type ActionResult, fail, fromError, ok } from './result'

export async function createCollectionAction(input: unknown): Promise<ActionResult<CollectionView>> {
  try {
    const ctx = await requireHousehold()
    const parsed = CollectionInputSchema.safeParse(input)
    if (!parsed.success) return fail('validation', parsed.error.issues[0]?.message ?? 'Datos inválidos')
    const created = await createCollection(ctx, parsed.data)
    revalidatePath('/recipes')
    return ok(created)
  } catch (e) {
    return fromError(e)
  }
}

export async function deleteCollectionAction(id: string): Promise<ActionResult<void>> {
  try {
    const ctx = await requireHousehold()
    const parsed = IdSchema.safeParse(id)
    if (!parsed.success) return fail('validation', 'Identificador inválido')
    await deleteCollection(ctx, parsed.data)
    revalidatePath('/recipes')
    return ok(undefined)
  } catch (e) {
    return fromError(e)
  }
}
