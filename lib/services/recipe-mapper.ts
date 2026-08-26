import type { FoodNutrition, Ingredient, IngredientWithFood, RecipeForScaling } from '@/lib/domain/types'
import type { RecipeIngredient } from '@/db/schema'

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
