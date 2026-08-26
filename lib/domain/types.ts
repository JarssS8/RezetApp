export type Locale = 'es' | 'en'
export type BaseUnit = 'g' | 'ml' | 'ud'
export type UnitSystem = 'metric' | 'imperial'
export type EntryStatus = 'planned' | 'cooked' | 'skipped'

// Conversión por alimento (tazas, piezas, densidad). Todo nullable: si falta, no se inventa.
export interface FoodConversion {
  defaultUnit: BaseUnit | null
  gramsPerCup: number | null
  gramsPerTbsp: number | null
  gramsPerUnit: number | null
  densityGPerMl: number | null
}

export interface FoodNutrition extends FoodConversion {
  kcal100g: number | null
  protein100g: number | null
  carbs100g: number | null
  fat100g: number | null
  fiber100g: number | null
  isEstimated: boolean
}

export interface Ingredient {
  id: string
  foodId: string | null
  rawText: string
  quantity: number | null // unidad base
  unit: BaseUnit | null
  displayQuantity: number | null
  displayUnit: string | null // id canónico de units-data o null
  preparation: string | null
  groupLabel: string | null
  stepIndex: number | null
  scalesLinearly: boolean
  sortOrder: number
}

export interface IngredientWithFood extends Ingredient {
  food: FoodNutrition | null
}

export interface RecipeForScaling {
  servingsBase: number
  ingredients: Ingredient[]
}

export interface ScaledRecipe {
  servings: number
  ratio: number
  ingredients: Ingredient[]
  nonLinearIds: string[]
}

export interface Macros {
  kcal: number
  protein: number
  carbs: number
  fat: number
  fiber: number
}

export interface Nutrition {
  perServing: Macros
  total: Macros
  per100g: Macros | null
  isEstimated: boolean
}

export interface ParsedIngredient {
  quantity: number | null
  unit: string | null // id canónico
  foodName: string
  preparation: string | null
  confidence: number // 0..1
  needsReview: boolean
}

export interface DisplayQuantity {
  quantity: number
  unit: string // id canónico
}

export interface PantryItem {
  id: string
  foodId: string
  quantity: number
  unit: BaseUnit
  expiresAt: Date | null
  addedAt: Date
}

export interface Need {
  foodId: string
  quantity: number
  unit: BaseUnit
}

export interface Allocation {
  pantryItemId: string
  foodId: string
  quantity: number
}

export interface ShoppingIngredient extends Ingredient {
  foodName: string
}

export interface PlannedEntry {
  id: string
  servings: number
  leftoverOfEntryId: string | null
  cookedAt: Date | null
  skippedAt: Date | null
  recipe: { servingsBase: number; ingredients: ShoppingIngredient[] }
}

export interface ShoppingLine {
  foodId: string | null
  name: string
  quantity: number | null
  unit: BaseUnit | null
  unresolved: boolean
}

export interface TimerSpan {
  start: number
  end: number
  seconds: number
}
