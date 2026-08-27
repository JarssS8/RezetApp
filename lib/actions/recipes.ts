'use server'
import { revalidatePath } from 'next/cache'
import { requireHousehold } from '@/lib/auth/guards'
import { importRecipeFromText, importRecipeFromUrl, type RecipeDraft } from '@/lib/services/recipe-import'
import {
  createRecipe,
  exportAll,
  prepareIngredients,
  softDeleteRecipe,
  updateRecipe,
  type PreparedIngredient,
  type RecipeDetail,
  type RecipeExport,
  type RecipeSummary,
} from '@/lib/services/recipes'
import { IdSchema } from '@/lib/validation/common'
import { RecipeImportSchema, RecipeInputSchema, RecipeIngredientInputSchema } from '@/lib/validation/recipes'
import { z } from 'zod'
import { type ActionResult, fail, fromError, ok } from './result'

// Tipos re-exportados para que components/* los use sin importar lib/services
// directamente (la frontera de eslint-boundaries prohíbe components -> services).
export type { PreparedIngredient, RecipeDetail, RecipeDraft, RecipeExport, RecipeSummary }

export async function createRecipeAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await requireHousehold()
    const parsed = RecipeInputSchema.safeParse(input)
    if (!parsed.success) return fail('validation', parsed.error.issues[0]?.message ?? 'Datos inválidos')
    const d = await createRecipe(ctx, parsed.data)
    revalidatePath('/recipes')
    return ok({ id: d.recipe.id })
  } catch (e) {
    return fromError(e)
  }
}

export async function updateRecipeAction(id: string, input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    if (!IdSchema.safeParse(id).success) return fail('validation', 'Id inválido')
    const ctx = await requireHousehold()
    const parsed = RecipeInputSchema.safeParse(input)
    if (!parsed.success) return fail('validation', parsed.error.issues[0]?.message ?? 'Datos inválidos')
    const d: RecipeDetail = await updateRecipe(ctx, id, parsed.data)
    revalidatePath('/recipes')
    revalidatePath(`/recipes/${id}`)
    return ok({ id: d.recipe.id })
  } catch (e) {
    return fromError(e)
  }
}

export async function deleteRecipeAction(id: string): Promise<ActionResult<null>> {
  try {
    if (!IdSchema.safeParse(id).success) return fail('validation', 'Id inválido')
    const ctx = await requireHousehold()
    await softDeleteRecipe(ctx, id)
    revalidatePath('/recipes')
    return ok(null)
  } catch (e) {
    return fromError(e)
  }
}

export async function importRecipeAction(input: unknown): Promise<ActionResult<RecipeDraft>> {
  try {
    const ctx = await requireHousehold()
    const parsed = RecipeImportSchema.safeParse(input)
    if (!parsed.success) return fail('validation', 'Entrada inválida')
    if (parsed.data.kind === 'url') return ok(await importRecipeFromUrl(parsed.data.url))
    if (parsed.data.kind === 'text') return ok(importRecipeFromText(parsed.data.text, ctx.locale))
    return fail('unsupported', 'Importar desde imagen llega con la IA (W4)')
  } catch (e) {
    return fromError(e)
  }
}

export async function prepareIngredientsAction(inputs: unknown): Promise<ActionResult<PreparedIngredient[]>> {
  try {
    const ctx = await requireHousehold()
    const parsed = z.array(RecipeIngredientInputSchema).max(100).safeParse(inputs)
    if (!parsed.success) return fail('validation', 'Ingredientes inválidos')
    return ok(await prepareIngredients(ctx, parsed.data, ctx.locale))
  } catch (e) {
    return fromError(e)
  }
}

export async function exportRecipesAction(): Promise<ActionResult<RecipeExport>> {
  try {
    const ctx = await requireHousehold()
    return ok(await exportAll(ctx))
  } catch (e) {
    return fromError(e)
  }
}
