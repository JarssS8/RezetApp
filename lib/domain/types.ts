// Arrays en tiempo de ejecución para que tests/contracts/enums.test.ts pueda
// comparar estas listas con las de lib/prefs.ts, lib/auth/ctx.ts y los pgEnum.
export const LOCALES = ['es', 'en'] as const
export const BASE_UNITS = ['g', 'ml', 'ud'] as const
export const UNIT_SYSTEMS = ['metric', 'imperial'] as const

export type Locale = (typeof LOCALES)[number]
export type BaseUnit = (typeof BASE_UNITS)[number]
export type UnitSystem = (typeof UNIT_SYSTEMS)[number]
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
  // Conversión del alimento, para restar despensa aunque la unidad no coincida
  // con la de la necesidad (regla W1-R17). null = no se sabe convertir.
  conversion: FoodConversion | null
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
  conversion: FoodConversion | null
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
  // true cuando había despensa de este alimento en otra unidad y no se pudo
  // convertir: no se ha restado nada, y la interfaz debe avisarlo.
  pantryUnmatched: boolean
}

export interface TimerSpan {
  start: number
  end: number
  seconds: number
}
