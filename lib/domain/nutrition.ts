import type { IngredientWithFood, Macros, Nutrition } from './types'

export const EMPTY_MACROS: Macros = { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 }

function add(a: Macros, b: Macros): Macros {
  return { kcal: a.kcal + b.kcal, protein: a.protein + b.protein, carbs: a.carbs + b.carbs, fat: a.fat + b.fat, fiber: a.fiber + b.fiber }
}
function scale(m: Macros, k: number): Macros {
  return { kcal: m.kcal * k, protein: m.protein * k, carbs: m.carbs * k, fat: m.fat * k, fiber: m.fiber * k }
}

// Gramos de un ingrediente para sumar masa. null si no hay forma de saberlo.
function gramsOf(i: IngredientWithFood): number | null {
  if (i.quantity === null || i.unit === null) return null
  if (i.unit === 'g') return i.quantity
  if (i.unit === 'ml') return i.quantity * (i.food?.densityGPerMl ?? 1)
  return i.food?.gramsPerUnit ? i.quantity * i.food.gramsPerUnit : null
}

// Nota para el futuro: si aceite o azúcar se marcan como no lineales, las kcal por ración dejarían de ser
// invariantes al escalar y habría que recalcular de verdad; hoy la desviación de sal/especias es despreciable.
export function recipeNutrition(ingredients: IngredientWithFood[], servings: number, yieldGrams?: number | null): Nutrition {
  if (!(servings > 0)) throw new Error('Las raciones deben ser positivas')
  let total = EMPTY_MACROS
  let massSum = 0
  let isEstimated = false
  let massComplete = true
  for (const i of ingredients) {
    if (i.quantity === null || i.unit === null) {
      // "al gusto", "una pizca": no cuenta y marca estimado si no es despreciable saberlo
      isEstimated = true
      continue
    }
    const grams = gramsOf(i)
    if (grams === null) {
      isEstimated = true
      massComplete = false
      continue
    }
    if (!i.food || i.food.kcal100g === null) {
      isEstimated = true
      massSum += grams
      continue
    }
    if (i.food.isEstimated) isEstimated = true
    const per100: Macros = {
      kcal: i.food.kcal100g, protein: i.food.protein100g ?? 0, carbs: i.food.carbs100g ?? 0, fat: i.food.fat100g ?? 0, fiber: i.food.fiber100g ?? 0,
    }
    total = add(total, scale(per100, grams / 100))
    massSum += grams
  }
  const divisor = yieldGrams && yieldGrams > 0 ? yieldGrams : massComplete && massSum > 0 ? massSum : null
  return {
    perServing: scale(total, 1 / servings),
    total,
    per100g: divisor === null ? null : scale(total, 100 / divisor),
    isEstimated,
  }
}

export function aggregateNutrition(entries: { nutrition: Nutrition; servings: number }[]): Nutrition {
  let total = EMPTY_MACROS
  let servings = 0
  let isEstimated = false
  for (const e of entries) {
    total = add(total, scale(e.nutrition.perServing, e.servings))
    servings += e.servings
    isEstimated = isEstimated || e.nutrition.isEstimated
  }
  return { total, perServing: servings > 0 ? scale(total, 1 / servings) : EMPTY_MACROS, per100g: null, isEstimated }
}
