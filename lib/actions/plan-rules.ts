'use server'

import { revalidatePath } from 'next/cache'
import { requireHousehold } from '@/lib/auth/guards'
import type { PlanRule } from '@/lib/domain/plan-rules'
import { proposeWeekFromRules, updatePlanRules } from '@/lib/services/plan-rules'
import { DateRangeSchema } from '@/lib/validation/common'
import { PlanRulesSchema } from '@/lib/validation/plan-rules'
import { type ActionResult, fail, fromError, ok } from './result'

// La comprobación de propietario vive en el servicio (updatePlanRules): así
// redirect() de requireRole no acaba tragado por fromError como 'internal'.
export async function updatePlanRulesAction(input: unknown): Promise<ActionResult<PlanRule[]>> {
  try {
    const ctx = await requireHousehold()
    const parsed = PlanRulesSchema.safeParse(input)
    if (!parsed.success) return fail('validation', parsed.error.issues[0]?.message ?? 'Datos inválidos')
    const saved = await updatePlanRules(ctx, parsed.data)
    revalidatePath('/settings/household')
    return ok(saved)
  } catch (e) {
    return fromError(e)
  }
}

export async function proposeWeekFromRulesAction(input: unknown): Promise<ActionResult<{ proposalId: string }>> {
  try {
    const ctx = await requireHousehold()
    const parsed = DateRangeSchema.safeParse(input)
    if (!parsed.success) return fail('validation', parsed.error.issues[0]?.message ?? 'Rango de fechas inválido')
    const view = await proposeWeekFromRules(ctx, parsed.data)
    revalidatePath('/plan')
    revalidatePath('/plan/proposals')
    return ok({ proposalId: view.id })
  } catch (e) {
    return fromError(e)
  }
}
