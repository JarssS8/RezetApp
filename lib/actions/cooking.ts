'use server'
import { requireHousehold } from '@/lib/auth/guards'
import { logCooked, type CookedResult } from '@/lib/services/cooking'
import { LogCookedSchema } from '@/lib/validation/cooking'
import { type ActionResult, fail, fromError, ok } from './result'

// Tipo re-exportado para que components/* lo use sin importar lib/services
// directamente (la frontera de eslint-boundaries prohíbe components -> services).
export type { CookedResult }

export async function logCookedAction(input: unknown): Promise<ActionResult<CookedResult>> {
  const parsed = LogCookedSchema.safeParse(input)
  if (!parsed.success) return fail('validation', parsed.error.issues[0]?.message ?? 'Datos inválidos')
  try {
    const ctx = await requireHousehold()
    const result = await logCooked(ctx, parsed.data)
    return ok(result)
  } catch (e) {
    return fromError(e)
  }
}
