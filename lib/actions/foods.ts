'use server'
import { revalidatePath } from 'next/cache'
import { requireHousehold } from '@/lib/auth/guards'
import {
  correctFood,
  createFood,
  lookupBarcode,
  resolveFoodName,
  searchFoods,
  type FoodSummary,
  type FoodWithNutrition,
  type ResolvedFood,
} from '@/lib/services/foods'
import { BarcodeSchema, FoodCorrectionSchema, FoodInputSchema, FoodSearchSchema } from '@/lib/validation/foods'
import { type ActionResult, fail, fromError, ok } from './result'

// Tipos re-exportados para que components/* los use sin importar lib/services
// directamente (la frontera de eslint-boundaries prohíbe components -> services).
export type { FoodSummary, FoodWithNutrition, ResolvedFood }

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
    return ok(await resolveFoodName(ctx, name, ctx.locale))
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
