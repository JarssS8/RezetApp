import type { FoodNutrition, Ingredient, IngredientWithFood, RecipeForScaling } from '@/lib/domain/types'
import type { Recipe, RecipeIngredient, RecipeStep } from '@/db/schema'
import type { RecipeInput } from '@/lib/validation/recipes'

// Fila de recipe_ingredients -> Ingredient de dominio, sin el alimento resuelto.
export function toIngredient(r: RecipeIngredient): Ingredient {
  return {
    id: r.id,
    foodId: r.foodId,
    rawText: r.rawText,
    quantity: r.quantity,
    unit: r.unit,
    displayQuantity: r.displayQuantity,
    displayUnit: r.displayUnit,
    preparation: r.preparation,
    groupLabel: r.groupLabel,
    stepIndex: r.stepIndex,
    scalesLinearly: r.scalesLinearly,
    sortOrder: r.sortOrder,
  }
}

// Igual que toIngredient, con la nutrición/conversión del alimento ya resuelta (o null si no se resolvió).
export function toIngredientWithFood(r: RecipeIngredient, food: FoodNutrition | null): IngredientWithFood {
  return { ...toIngredient(r), food }
}

// Forma mínima que exige lib/domain/scaling::scaleRecipe.
export function toRecipeForScaling(servingsBase: number, ingredients: Ingredient[]): RecipeForScaling {
  return { servingsBase, ingredients }
}

// Subconjunto de RecipeDetail (lib/services/recipes.ts) que necesita
// detailToInput. No se importa el tipo RecipeDetail en sí para no crear un
// ciclo (recipes.ts ya importa este módulo): se tipa estructuralmente, así
// que un RecipeDetail real encaja aquí sin conversión.
export interface RecipeDetailForInput {
  recipe: Pick<Recipe, 'title' | 'description' | 'servingsBase' | 'prepMinutes' | 'cookMinutes' | 'difficulty' | 'sourceUrl' | 'imageUrls' | 'notes' | 'yieldGrams'>
  ingredients: Ingredient[]
  steps: Pick<RecipeStep, 'text' | 'timerSeconds' | 'imageUrl'>[]
  tags: { name: string }[]
}

// RecipeDetail (de getRecipe) -> RecipeInput, conservando foodId (a diferencia
// de exportAll, que lo pone a null porque exporta para reimportar en otro
// hogar). Lo usa la página de edición para precargar el editor con los
// mismos ids de alimento ya resueltos.
export function detailToInput(detail: RecipeDetailForInput): RecipeInput {
  return {
    title: detail.recipe.title,
    description: detail.recipe.description,
    servingsBase: detail.recipe.servingsBase,
    prepMinutes: detail.recipe.prepMinutes,
    cookMinutes: detail.recipe.cookMinutes,
    difficulty: detail.recipe.difficulty,
    sourceUrl: detail.recipe.sourceUrl,
    imageUrls: detail.recipe.imageUrls,
    notes: detail.recipe.notes,
    yieldGrams: detail.recipe.yieldGrams,
    tags: detail.tags.map((t) => t.name),
    ingredients: detail.ingredients.map((i) => ({
      rawText: i.rawText,
      foodId: i.foodId,
      quantity: i.quantity,
      unit: i.unit,
      displayQuantity: i.displayQuantity,
      displayUnit: i.displayUnit,
      preparation: i.preparation,
      groupLabel: i.groupLabel,
      stepIndex: i.stepIndex,
      scalesLinearly: i.scalesLinearly,
    })),
    steps: detail.steps.map((s) => ({ text: s.text, timerSeconds: s.timerSeconds, imageUrl: s.imageUrl })),
  }
}
