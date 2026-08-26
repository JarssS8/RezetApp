import { and, eq, isNull, or, sql } from 'drizzle-orm'
import * as schema from '@/db/schema'
import { detectTimers, isNonLinearByDefault, normalizeSearchName, parseIngredientLine, recipeNutrition, scaleRecipe, toBaseUnit } from '@/lib/domain'
import type { BaseUnit, IngredientWithFood, Locale, Nutrition, ScaledRecipe } from '@/lib/domain/types'
import { emitHouseholdEvent } from '@/lib/events/bus'
import type { RecipeInput } from '@/lib/validation/recipes'
import { type Ctx, type Db, ServiceError } from './ctx'
import { getFoodsNutrition, resolveFoodName, resolveMany, type FoodWithNutrition, type ResolvedFood } from './foods'
import { toIngredient, toIngredientWithFood, toRecipeForScaling } from './recipe-mapper'

export interface RecipeDetail {
  recipe: schema.Recipe
  ingredients: IngredientWithFood[]
  steps: schema.RecipeStep[]
  tags: { id: string; name: string; slug: string }[]
  nutrition: Nutrition | null
  scaled: ScaledRecipe | null
}

type IngredientInput = RecipeInput['ingredients'][number]

export interface PreparedIngredient {
  rawText: string
  foodId: string | null
  quantity: number | null
  unit: BaseUnit | null
  displayQuantity: number | null
  displayUnit: string | null
  preparation: string | null
  groupLabel: string | null
  stepIndex: number | null
  scalesLinearly: boolean
  sortOrder: number
  needsReview: boolean
}

export function slugify(s: string): string {
  return normalizeSearchName(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

// Resuelve el nombre de un ingrediente cuya cascada normal (resolveFoodName vía
// resolveMany) no dio nada: reintenta con la primera palabra del nombre
// parseado ("cebollas grandes" -> "cebollas"), porque el trigram exige ≥ 0.6 y
// una frase larga rara vez llega a ese umbral aunque la primera palabra sí.
async function resolveWithFallback(ctx: Ctx, name: string, locale: Locale): Promise<ResolvedFood | null> {
  const direct = await resolveFoodName(ctx, name, locale)
  if (direct) return direct
  const firstWord = name.split(' ')[0]
  if (!firstWord || firstWord === name) return null
  return resolveFoodName(ctx, firstWord, locale)
}

// Completa cada línea: parsea rawText si faltan quantity/unit, resuelve el
// alimento si falta foodId y calcula scalesLinearly por defecto para las
// líneas que se acaban de parsear (una línea ya resuelta a mano -editar una
// receta existente- conserva el valor que traiga, que el usuario pudo corregir).
export async function prepareIngredients(ctx: Ctx, inputs: IngredientInput[], locale: Locale): Promise<PreparedIngredient[]> {
  const parsed = inputs.map((i) => parseIngredientLine(i.rawText, locale))
  const namesToResolve = inputs.map((i, k) => (i.foodId ? null : (parsed[k]?.foodName ?? null)))
  const firstPass = await resolveMany(ctx, namesToResolve.map((n) => n ?? ''), locale)
  const resolved: (ResolvedFood | null)[] = []
  for (let k = 0; k < inputs.length; k++) {
    const name = namesToResolve[k] ?? null
    if (!name) {
      resolved.push(null)
      continue
    }
    resolved.push(firstPass[k] ?? (await resolveWithFallback(ctx, name, locale)))
  }
  const foodIds = inputs.map((i, k) => i.foodId ?? resolved[k]?.foodId ?? null)
  const foods = await getFoodsNutrition(ctx, foodIds.filter((x): x is string => x !== null))

  return inputs.map((i, k): PreparedIngredient => {
    const p = parsed[k]
    if (!p) throw new ServiceError('validation', 'Ingrediente inválido')
    const foodId = foodIds[k] ?? null
    const food = foodId ? (foods.get(foodId) ?? null) : null

    const displayQuantity = i.displayQuantity !== undefined ? i.displayQuantity : p.quantity
    let displayUnit = i.displayUnit !== undefined ? i.displayUnit : p.unit
    // Sin unidad (número de piezas suelto, "2 cebollas"): se asume unidad ('ud').
    if (displayUnit === null && displayQuantity !== null) displayUnit = 'ud'

    let quantity = i.quantity ?? null
    let unit: BaseUnit | null = i.unit ?? null
    // Solo se recalcula quantity/unit cuando el llamador no los dio ya explícitos.
    if (i.quantity === undefined && displayQuantity !== null && displayUnit !== null) {
      const base = toBaseUnit(displayQuantity, displayUnit, locale, food ?? undefined)
      quantity = base?.qty ?? null
      unit = base?.unit ?? null
    }

    // Una línea que llega ya resuelta (quantity y unit explícitos) conserva el
    // scalesLinearly que traiga -el usuario pudo corregirlo a mano-; una línea
    // recién parseada desde texto libre lo recalcula siempre con la heurística.
    const needsParsing = i.quantity === undefined || i.unit === undefined
    const scalesLinearly = needsParsing ? !isNonLinearByDefault(food?.name ?? p.foodName, locale) : i.scalesLinearly

    return {
      rawText: i.rawText,
      foodId,
      quantity,
      unit,
      displayQuantity,
      displayUnit,
      preparation: i.preparation !== undefined ? i.preparation : p.preparation,
      groupLabel: i.groupLabel ?? null,
      stepIndex: i.stepIndex ?? null,
      scalesLinearly,
      sortOrder: k,
      needsReview: foodId === null || p.needsReview,
    }
  })
}

async function upsertTags(ctx: Ctx, names: string[]): Promise<string[]> {
  const ids: string[] = []
  for (const name of names) {
    const slug = slugify(name)
    if (!slug) continue
    const [existing] = await ctx.db
      .select()
      .from(schema.tags)
      .where(and(eq(schema.tags.slug, slug), or(eq(schema.tags.householdId, ctx.householdId), isNull(schema.tags.householdId))))
      .orderBy(sql`(${schema.tags.householdId} IS NULL)`)
      .limit(1)
    if (existing) {
      ids.push(existing.id)
      continue
    }
    const [created] = await ctx.db.insert(schema.tags).values({ householdId: ctx.householdId, name, slug }).returning()
    if (created) ids.push(created.id)
  }
  return ids
}

// Fila de inserción para recipe_ingredients: todo lo de PreparedIngredient salvo
// needsReview, que solo sirve para que el llamador avise en la interfaz.
function toIngredientRow(p: PreparedIngredient, recipeId: string) {
  return {
    recipeId,
    rawText: p.rawText,
    foodId: p.foodId,
    quantity: p.quantity,
    unit: p.unit,
    displayQuantity: p.displayQuantity,
    displayUnit: p.displayUnit,
    preparation: p.preparation,
    groupLabel: p.groupLabel,
    stepIndex: p.stepIndex,
    scalesLinearly: p.scalesLinearly,
    sortOrder: p.sortOrder,
  }
}

function nutritionColumns(n: Nutrition | null) {
  return {
    kcalPerServing: n?.perServing.kcal ?? null,
    proteinPerServing: n?.perServing.protein ?? null,
    carbsPerServing: n?.perServing.carbs ?? null,
    fatPerServing: n?.perServing.fat ?? null,
    fiberPerServing: n?.perServing.fiber ?? null,
    kcal100g: n?.per100g?.kcal ?? null,
    nutritionIsEstimated: n?.isEstimated ?? false,
  }
}

async function writeChildren(ctx: Ctx, tx: Db, recipeId: string, input: RecipeInput, prepared: PreparedIngredient[]): Promise<void> {
  await tx.delete(schema.recipeIngredients).where(eq(schema.recipeIngredients.recipeId, recipeId))
  await tx.delete(schema.recipeSteps).where(eq(schema.recipeSteps.recipeId, recipeId))
  await tx.delete(schema.recipeTags).where(eq(schema.recipeTags.recipeId, recipeId))
  if (prepared.length) {
    await tx.insert(schema.recipeIngredients).values(prepared.map((p) => toIngredientRow(p, recipeId)))
  }
  if (input.steps.length) {
    await tx.insert(schema.recipeSteps).values(
      input.steps.map((s, index) => ({
        recipeId,
        index,
        text: s.text,
        imageUrl: s.imageUrl ?? null,
        timerSeconds: s.timerSeconds ?? detectTimers(s.text, ctx.locale)[0]?.seconds ?? null,
      })),
    )
  }
  const tagIds = await upsertTags({ ...ctx, db: tx }, input.tags)
  if (tagIds.length) await tx.insert(schema.recipeTags).values(tagIds.map((tagId) => ({ recipeId, tagId })))
}

async function computeNutrition(ctx: Ctx, prepared: PreparedIngredient[], servings: number, yieldGrams: number | null): Promise<Nutrition | null> {
  const ids = prepared.map((p) => p.foodId).filter((x): x is string => x !== null)
  if (ids.length === 0) return null
  const foods = await getFoodsNutrition(ctx, ids)
  const withFood: IngredientWithFood[] = prepared.map((p, k) => ({
    id: String(k),
    foodId: p.foodId,
    rawText: p.rawText,
    quantity: p.quantity,
    unit: p.unit,
    displayQuantity: p.displayQuantity,
    displayUnit: p.displayUnit,
    preparation: p.preparation,
    groupLabel: p.groupLabel,
    stepIndex: p.stepIndex,
    scalesLinearly: p.scalesLinearly,
    sortOrder: p.sortOrder,
    food: p.foodId ? (foods.get(p.foodId) ?? null) : null,
  }))
  return recipeNutrition(withFood, servings, yieldGrams)
}

function baseColumns(input: RecipeInput) {
  return {
    title: input.title,
    description: input.description ?? null,
    servingsBase: input.servingsBase,
    prepMinutes: input.prepMinutes ?? null,
    cookMinutes: input.cookMinutes ?? null,
    difficulty: input.difficulty ?? null,
    sourceUrl: input.sourceUrl ?? null,
    imageUrls: input.imageUrls,
    notes: input.notes ?? null,
    yieldGrams: input.yieldGrams ?? null,
  }
}

export async function createRecipe(ctx: Ctx, input: RecipeInput): Promise<RecipeDetail> {
  const prepared = await prepareIngredients(ctx, input.ingredients, ctx.locale)
  const nutrition = await computeNutrition(ctx, prepared, input.servingsBase, input.yieldGrams ?? null)
  const id = await ctx.db.transaction(async (tx) => {
    const [r] = await tx.insert(schema.recipes).values({ householdId: ctx.householdId, ...baseColumns(input), ...nutritionColumns(nutrition) }).returning({ id: schema.recipes.id })
    if (!r) throw new ServiceError('conflict', 'No se pudo crear la receta')
    await writeChildren(ctx, tx, r.id, input, prepared)
    return r.id
  })
  emitHouseholdEvent(ctx.householdId, { type: 'recipe.changed', payload: { recipeId: id } })
  const d = await getRecipe(ctx, id)
  if (!d) throw new ServiceError('not_found', 'Receta no encontrada')
  return d
}

export async function updateRecipe(ctx: Ctx, id: string, input: RecipeInput): Promise<RecipeDetail> {
  const prepared = await prepareIngredients(ctx, input.ingredients, ctx.locale)
  const nutrition = await computeNutrition(ctx, prepared, input.servingsBase, input.yieldGrams ?? null)
  await ctx.db.transaction(async (tx) => {
    const [r] = await tx
      .update(schema.recipes)
      .set({ ...baseColumns(input), ...nutritionColumns(nutrition), updatedAt: new Date() })
      .where(and(eq(schema.recipes.id, id), eq(schema.recipes.householdId, ctx.householdId), isNull(schema.recipes.deletedAt)))
      .returning({ id: schema.recipes.id })
    if (!r) throw new ServiceError('not_found', 'Receta no encontrada')
    await writeChildren(ctx, tx, id, input, prepared)
  })
  emitHouseholdEvent(ctx.householdId, { type: 'recipe.changed', payload: { recipeId: id } })
  const d = await getRecipe(ctx, id)
  if (!d) throw new ServiceError('not_found', 'Receta no encontrada')
  return d
}

export async function getRecipe(ctx: Ctx, id: string, opts: { servings?: number } = {}): Promise<RecipeDetail | null> {
  const [recipe] = await ctx.db
    .select()
    .from(schema.recipes)
    .where(and(eq(schema.recipes.id, id), eq(schema.recipes.householdId, ctx.householdId), isNull(schema.recipes.deletedAt)))
    .limit(1)
  if (!recipe) return null

  const rows = await ctx.db.select().from(schema.recipeIngredients).where(eq(schema.recipeIngredients.recipeId, id)).orderBy(schema.recipeIngredients.sortOrder)
  const foods = await getFoodsNutrition(ctx, rows.map((r) => r.foodId).filter((x): x is string => x !== null))
  const ingredients = rows.map((r) => toIngredientWithFood(r, r.foodId ? (foods.get(r.foodId) ?? null) : null))

  const steps = await ctx.db.select().from(schema.recipeSteps).where(eq(schema.recipeSteps.recipeId, id)).orderBy(schema.recipeSteps.index)
  const tags = await ctx.db
    .select({ id: schema.tags.id, name: schema.tags.name, slug: schema.tags.slug })
    .from(schema.recipeTags)
    .innerJoin(schema.tags, eq(schema.tags.id, schema.recipeTags.tagId))
    .where(eq(schema.recipeTags.recipeId, id))

  const nutrition = ingredients.some((i) => i.food) ? recipeNutrition(ingredients, recipe.servingsBase, recipe.yieldGrams) : null
  const scaled = opts.servings && opts.servings !== recipe.servingsBase ? scaleRecipe(toRecipeForScaling(recipe.servingsBase, rows.map(toIngredient)), opts.servings) : null

  return { recipe, ingredients, steps, tags, nutrition, scaled }
}

export async function softDeleteRecipe(ctx: Ctx, id: string): Promise<void> {
  const [r] = await ctx.db
    .update(schema.recipes)
    .set({ deletedAt: new Date() })
    .where(and(eq(schema.recipes.id, id), eq(schema.recipes.householdId, ctx.householdId), isNull(schema.recipes.deletedAt)))
    .returning({ id: schema.recipes.id })
  if (!r) throw new ServiceError('not_found', 'Receta no encontrada')
  emitHouseholdEvent(ctx.householdId, { type: 'recipe.changed', payload: { recipeId: id } })
}

export type { FoodWithNutrition }
