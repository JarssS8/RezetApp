'use server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireHousehold } from '@/lib/auth/guards'
import type { ParsedIngredient } from '@/lib/domain/types'
import { getAiSettings, testAiConnection, updateAiSettings, type AiConnectionResult, type AiSettingsView } from '@/lib/services/ai-settings'
import { aiEstimateFood, aiImportRecipe, aiParseIngredients, aiProposeWeek, type AiImportRecipeInput, type AiResult, type FoodWithNutrition } from '@/lib/services/ai-tasks'
import { DateSchema } from '@/lib/validation/common'
import { AiSettingsSchema } from '@/lib/validation/household'
import type { RecipeInput } from '@/lib/validation/recipes'
import { type ActionResult, fail, fromError, ok } from './result'

function fromAiResult<T>(r: AiResult<T>): ActionResult<T> {
  return r.ok ? ok(r.data) : fail(r.code, r.message)
}

const ParseIngredientsInputSchema = z.strictObject({ lines: z.array(z.string().max(200)).min(1).max(100) })

export async function aiParseIngredientsAction(lines: string[]): Promise<ActionResult<ParsedIngredient[]>> {
  try {
    const ctx = await requireHousehold()
    const parsed = ParseIngredientsInputSchema.safeParse({ lines })
    if (!parsed.success) return fail('validation', parsed.error.issues[0]?.message ?? 'Datos inválidos')
    return fromAiResult(await aiParseIngredients(ctx, parsed.data.lines))
  } catch (e) {
    return fromError(e)
  }
}

const ImportRecipeInputSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('text'), text: z.string().trim().min(10).max(20_000) }),
  // Desviación documentada (ver lib/services/ai-tasks.ts::AiImportRecipeInput):
  // sin `lib/uploads` en este worktree, se pasan los bytes ya leídos.
  z.strictObject({ kind: z.literal('image'), bytes: z.instanceof(Uint8Array), mime: z.string().max(100) }),
])

export async function aiImportRecipeAction(input: AiImportRecipeInput): Promise<ActionResult<RecipeInput>> {
  try {
    const ctx = await requireHousehold()
    const parsed = ImportRecipeInputSchema.safeParse(input)
    if (!parsed.success) return fail('validation', parsed.error.issues[0]?.message ?? 'Datos inválidos')
    return fromAiResult(await aiImportRecipe(ctx, parsed.data))
  } catch (e) {
    return fromError(e)
  }
}

const EstimateFoodInputSchema = z.string().trim().min(1).max(120)

export async function aiEstimateFoodAction(foodName: string): Promise<ActionResult<FoodWithNutrition>> {
  try {
    const ctx = await requireHousehold()
    const parsed = EstimateFoodInputSchema.safeParse(foodName)
    if (!parsed.success) return fail('validation', 'Nombre de alimento inválido')
    const result = await aiEstimateFood(ctx, parsed.data)
    if (result.ok) {
      revalidatePath('/recipes')
      revalidatePath('/pantry')
    }
    return fromAiResult(result)
  } catch (e) {
    return fromError(e)
  }
}

const ProposeWeekInputSchema = z
  .strictObject({ from: DateSchema, to: DateSchema, notes: z.string().trim().max(500).optional() })
  .refine((v) => v.from <= v.to, { message: 'from debe ser ≤ to' })

export async function aiProposeWeekAction(input: { from: string; to: string; notes?: string }): Promise<ActionResult<{ proposalId: string }>> {
  try {
    const ctx = await requireHousehold()
    const parsed = ProposeWeekInputSchema.safeParse(input)
    if (!parsed.success) return fail('validation', parsed.error.issues[0]?.message ?? 'Rango de fechas inválido')
    const { from, to, notes } = parsed.data
    const result = await aiProposeWeek(ctx, notes !== undefined ? { from, to, notes } : { from, to })
    if (result.ok) {
      revalidatePath('/plan')
      revalidatePath('/plan/proposals')
    }
    return fromAiResult(result)
  } catch (e) {
    return fromError(e)
  }
}

export async function testAiConnectionAction(): Promise<ActionResult<AiConnectionResult>> {
  try {
    const ctx = await requireHousehold()
    return ok(await testAiConnection(ctx))
  } catch (e) {
    return fromError(e)
  }
}

export async function updateAiSettingsAction(input: unknown): Promise<ActionResult<AiSettingsView>> {
  try {
    const ctx = await requireHousehold()
    const parsed = AiSettingsSchema.safeParse(input)
    if (!parsed.success) return fail('validation', parsed.error.issues[0]?.message ?? 'Datos inválidos')
    await updateAiSettings(ctx, parsed.data)
    revalidatePath('/settings/ai')
    return ok(await getAiSettings(ctx))
  } catch (e) {
    return fromError(e)
  }
}
