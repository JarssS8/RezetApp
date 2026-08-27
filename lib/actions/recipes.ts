'use server'
import { revalidatePath } from 'next/cache'
import { requireHousehold } from '@/lib/auth/guards'
import { importRecipe, type RecipeDraft } from '@/lib/services/recipe-import'
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
import { MAX_UPLOAD_BYTES, saveImage, savePdf } from '@/lib/uploads/store'
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
    return ok(await importRecipe(ctx, parsed.data))
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

// Mismos formatos que admite saveImage (sharp los decodifica sin problema);
// un allowlist explícito en vez de solo comprobar el prefijo "image/" evita
// colar tipos MIME válidos pero no soportados (image/svg+xml, image/gif...).
const ALLOWED_IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif'])

// El editor sube imágenes desde el navegador con una acción de servidor
// (sesión de cookie + requireHousehold). La ruta REST POST /api/v1/uploads
// también admite la sesión, pero existe para clientes con token de API
// (REST/MCP); ambos caminos comparten saveImage (decisión W2-R17).
export async function uploadImageAction(formData: FormData): Promise<ActionResult<{ url: string; uploadId: string }>> {
  try {
    const ctx = await requireHousehold()
    const file = formData.get('file')
    if (!(file instanceof File)) return fail('validation', 'Falta el fichero')
    if (file.size > MAX_UPLOAD_BYTES) return fail('too_large', 'Máximo 8 MB')
    if (!ALLOWED_IMAGE_MIME_TYPES.has(file.type)) return fail('validation', 'No es una imagen válida')
    try {
      const saved = await saveImage(ctx.householdId, new Uint8Array(await file.arrayBuffer()))
      return ok({ url: saved.url, uploadId: saved.name })
    } catch {
      return fail('validation', 'No es una imagen válida')
    }
  } catch (e) {
    return fromError(e)
  }
}

// Un PDF no pasa por sharp, así que va por su propia acción en vez de colar
// otro tipo en el allowlist de uploadImageAction.
export async function uploadPdfAction(formData: FormData): Promise<ActionResult<{ url: string; uploadId: string }>> {
  try {
    const ctx = await requireHousehold()
    const file = formData.get('file')
    if (!(file instanceof File)) return fail('validation', 'Falta el fichero')
    if (file.size > MAX_UPLOAD_BYTES) return fail('too_large', 'Máximo 8 MB')
    if (file.type !== 'application/pdf') return fail('validation', 'No es un PDF')
    try {
      const saved = await savePdf(ctx.householdId, new Uint8Array(await file.arrayBuffer()))
      return ok({ url: saved.url, uploadId: saved.name })
    } catch {
      return fail('validation', 'No es un PDF')
    }
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
