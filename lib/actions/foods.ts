'use server'
import { revalidatePath } from 'next/cache'
import { requireHousehold } from '@/lib/auth/guards'
import {
  correctFood,
  createFood,
  lookupBarcode,
  mergeFoods,
  resolveFoodName,
  searchFoods,
  type FoodSummary,
  type FoodWithNutrition,
  type MergeFoodsResult,
  type ResolvedFood,
} from '@/lib/services/foods'
import { IdSchema } from '@/lib/validation/common'
import { BarcodeSchema, FoodCorrectionSchema, FoodInputSchema, FoodNameSchema, FoodSearchSchema } from '@/lib/validation/foods'
import { type ActionResult, fail, fromError, ok } from './result'

// Tipos re-exportados para que components/* los use sin importar lib/services
// directamente (la frontera de eslint-boundaries prohíbe components -> services).
export type { FoodSummary, FoodWithNutrition, MergeFoodsResult, ResolvedFood }

export async function searchFoodsAction(q: string): Promise<ActionResult<FoodSummary[]>> {
  try {
    const ctx = await requireHousehold()
    const parsed = FoodSearchSchema.safeParse({ q, locale: ctx.locale })
    if (!parsed.success) return ok([])
    return ok(await searchFoods(ctx, parsed.data))
  } catch (e) {
    return fromError(e)
  }
}

export async function resolveFoodAction(name: string): Promise<ActionResult<ResolvedFood | null>> {
  try {
    const ctx = await requireHousehold()
    const parsed = FoodNameSchema.safeParse(name)
    if (!parsed.success) return fail('validation', 'Nombre de alimento inválido')
    return ok(await resolveFoodName(ctx, parsed.data, ctx.locale))
  } catch (e) {
    return fromError(e)
  }
}

export async function lookupBarcodeAction(code: string): Promise<ActionResult<FoodWithNutrition | null>> {
  try {
    const ctx = await requireHousehold()
    const parsed = BarcodeSchema.safeParse(code)
    if (!parsed.success) return fail('validation', 'Código de barras inválido')
    return ok(await lookupBarcode(ctx, parsed.data))
  } catch (e) {
    return fromError(e)
  }
}

export async function createFoodAction(input: unknown): Promise<ActionResult<FoodWithNutrition>> {
  try {
    const ctx = await requireHousehold()
    const parsed = FoodInputSchema.safeParse(input)
    if (!parsed.success) return fail('validation', parsed.error.issues[0]?.message ?? 'Datos inválidos')
    const f = await createFood(ctx, parsed.data)
    revalidatePath('/recipes')
    revalidatePath('/pantry')
    return ok(f)
  } catch (e) {
    return fromError(e)
  }
}

export async function correctFoodAction(foodId: string, patch: unknown): Promise<ActionResult<FoodWithNutrition>> {
  try {
    const ctx = await requireHousehold()
    const parsed = FoodCorrectionSchema.safeParse(patch)
    if (!parsed.success) return fail('validation', parsed.error.issues[0]?.message ?? 'Datos inválidos')
    const f = await correctFood(ctx, foodId, parsed.data)
    revalidatePath('/recipes')
    revalidatePath('/pantry')
    return ok(f)
  } catch (e) {
    return fromError(e)
  }
}

export async function mergeFoodsAction(fromId: string, intoId: string): Promise<ActionResult<MergeFoodsResult>> {
  try {
    const ctx = await requireHousehold()
    const from = IdSchema.safeParse(fromId)
    const into = IdSchema.safeParse(intoId)
    if (!from.success || !into.success) return fail('validation', 'Identificador inválido')
    const result = await mergeFoods(ctx, from.data, into.data)
    revalidatePath('/pantry')
    revalidatePath('/recipes')
    // Una fusión puede sumar un alérgeno al alimento que se queda (fix 1 de
    // la revisión final): una propuesta pendiente que lo usara pasaría a
    // chocar con un alérgeno del hogar, así que la lista de propuestas
    // también tiene que refrescarse.
    revalidatePath('/plan/proposals')
    return ok(result)
  } catch (e) {
    return fromError(e)
  }
}
