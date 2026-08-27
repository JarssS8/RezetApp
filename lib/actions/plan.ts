'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { requireHousehold } from '@/lib/auth/guards'
import { IdSchema } from '@/lib/validation/common'
import { CreateLeftoverInputSchema, PlanBatchSchema, PlanEntryMoveSchema, PlanEntryPatchSchema, ProposalDecisionSchema } from '@/lib/validation/plan'
import type { PlanBatch, PlanEntryMove, PlanEntryPatch } from '@/lib/validation/plan'
import { applyBatch, createLeftover, decideProposal, moveEntry, patchEntry, type PlanEntryView, type ProposalView } from '@/lib/services/plan'
import { searchRecipes } from '@/lib/services/recipes'
import { type ActionResult, fail, fromError, ok } from './result'

const PLAN_PATH = '/plan'

export async function applyPlanBatchAction(batch: PlanBatch): Promise<ActionResult<{ added: PlanEntryView[]; removed: string[] }>> {
  try {
    const ctx = await requireHousehold()
    const parsed = PlanBatchSchema.safeParse(batch)
    if (!parsed.success) return fail('validation', parsed.error.issues[0]?.message ?? 'Datos inválidos')
    const result = await applyBatch(ctx, parsed.data)
    revalidatePath(PLAN_PATH)
    return ok(result)
  } catch (e) {
    return fromError(e)
  }
}

export async function movePlanEntryAction(input: PlanEntryMove): Promise<ActionResult<PlanEntryView>> {
  try {
    const ctx = await requireHousehold()
    const parsed = PlanEntryMoveSchema.safeParse(input)
    if (!parsed.success) return fail('validation', parsed.error.issues[0]?.message ?? 'Datos inválidos')
    const view = await moveEntry(ctx, parsed.data)
    revalidatePath(PLAN_PATH)
    return ok(view)
  } catch (e) {
    return fromError(e)
  }
}

export async function patchPlanEntryAction(id: string, patch: PlanEntryPatch): Promise<ActionResult<PlanEntryView>> {
  try {
    const ctx = await requireHousehold()
    const idParsed = IdSchema.safeParse(id)
    if (!idParsed.success) return fail('validation', 'Identificador inválido')
    const patchParsed = PlanEntryPatchSchema.safeParse(patch)
    if (!patchParsed.success) return fail('validation', patchParsed.error.issues[0]?.message ?? 'Datos inválidos')
    const view = await patchEntry(ctx, idParsed.data, patchParsed.data)
    revalidatePath(PLAN_PATH)
    return ok(view)
  } catch (e) {
    return fromError(e)
  }
}

export async function createLeftoverAction(input: unknown): Promise<ActionResult<PlanEntryView>> {
  try {
    const ctx = await requireHousehold()
    const parsed = CreateLeftoverInputSchema.safeParse(input)
    if (!parsed.success) return fail('validation', parsed.error.issues[0]?.message ?? 'Datos inválidos')
    const view = await createLeftover(ctx, parsed.data)
    revalidatePath(PLAN_PATH)
    return ok(view)
  } catch (e) {
    return fromError(e)
  }
}

export async function decideProposalAction(id: string, decision: 'approve' | 'reject'): Promise<ActionResult<ProposalView>> {
  try {
    const ctx = await requireHousehold()
    const idParsed = IdSchema.safeParse(id)
    if (!idParsed.success) return fail('validation', 'Identificador inválido')
    const decisionParsed = ProposalDecisionSchema.safeParse({ decision })
    if (!decisionParsed.success) return fail('validation', 'Decisión inválida')
    const view = await decideProposal(ctx, idParsed.data, decisionParsed.data.decision)
    revalidatePath(PLAN_PATH)
    return ok(view)
  } catch (e) {
    return fromError(e)
  }
}

const PlanRecipeSearchQuerySchema = z.string().trim().min(1).max(120)

// Búsqueda de recetas para la hoja de "añadir al plan": delega en el servicio de
// recetas (lib/services/recipes.ts::searchRecipes) y se queda solo con id/título,
// que es lo único que necesita components/plan/add-entry-sheet.tsx.
export async function searchRecipesForPlanAction(q: string): Promise<ActionResult<{ id: string; title: string }[]>> {
  try {
    const parsed = PlanRecipeSearchQuerySchema.safeParse(q)
    if (!parsed.success) return fail('validation', 'Búsqueda inválida')
    const ctx = await requireHousehold()
    const { items } = await searchRecipes(ctx, { q: parsed.data, limit: 10, offset: 0, sort: 'recent' })
    return ok(items.map((r) => ({ id: r.id, title: r.title })))
  } catch (e) {
    return fromError(e)
  }
}
