// Alérgenos por hogar y por receta. La decisión de "esta receta no vale" es
// SIEMPRE del servidor: el modelo recibe los alérgenos en el prompt para
// acertar antes, pero lo que garantiza que no aparezcan es este filtro
// (regla 2 de AGENTS.md).
import { and, eq, inArray, isNull } from 'drizzle-orm'
import * as schema from '@/db/schema'
import { allergenConflicts, recipeAllergens, type RecipeAllergenInfo } from '@/lib/domain/allergens'
import type { Ctx } from './ctx'

export async function householdAllergens(ctx: Ctx): Promise<string[]> {
  const rows = await ctx.db
    .select({ allergens: schema.householdMembers.allergens })
    .from(schema.householdMembers)
    .where(eq(schema.householdMembers.householdId, ctx.householdId))
  return Array.from(new Set(rows.flatMap((m) => m.allergens)))
}

export async function recipeAllergenMap(ctx: Ctx, recipeIds: string[]): Promise<Map<string, RecipeAllergenInfo>> {
  if (recipeIds.length === 0) return new Map()
  const rows = await ctx.db
    .select({
      recipeId: schema.recipeIngredients.recipeId,
      foodId: schema.recipeIngredients.foodId,
      allergens: schema.foods.allergens,
    })
    .from(schema.recipeIngredients)
    .innerJoin(
      schema.recipes,
      and(eq(schema.recipes.id, schema.recipeIngredients.recipeId), eq(schema.recipes.householdId, ctx.householdId), isNull(schema.recipes.deletedAt)),
    )
    .leftJoin(schema.foods, eq(schema.foods.id, schema.recipeIngredients.foodId))
    .where(inArray(schema.recipeIngredients.recipeId, recipeIds))

  const byRecipe = new Map<string, { foodId: string | null; allergens: string[] }[]>()
  for (const row of rows) {
    const list = byRecipe.get(row.recipeId) ?? []
    list.push({ foodId: row.foodId, allergens: row.allergens ?? [] })
    byRecipe.set(row.recipeId, list)
  }
  const out = new Map<string, RecipeAllergenInfo>()
  for (const [recipeId, ingredients] of byRecipe) out.set(recipeId, recipeAllergens(ingredients))
  return out
}

// Solo las recetas que chocan, con el alérgeno concreto: sirve tanto para
// descartar como para explicarlo en la interfaz.
export async function conflictingRecipeIds(ctx: Ctx, recipeIds: string[]): Promise<Map<string, string[]>> {
  const members = await householdAllergens(ctx)
  if (members.length === 0) return new Map()
  const map = await recipeAllergenMap(ctx, recipeIds)
  const out = new Map<string, string[]>()
  for (const [recipeId, info] of map) {
    const conflicts = allergenConflicts(info.allergens, members)
    if (conflicts.length > 0) out.set(recipeId, conflicts)
  }
  return out
}
