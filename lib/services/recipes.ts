import { and, desc, eq, inArray, isNotNull, isNull, or, sql } from 'drizzle-orm'
import * as schema from '@/db/schema'
import { detectTimers, isNonLinearByDefault, normalizeSearchName, parseIngredientLine, recipeNutrition, scaleRecipe, toBaseUnit } from '@/lib/domain'
import type { BaseUnit, IngredientWithFood, Locale, Nutrition, ScaledRecipe } from '@/lib/domain/types'
import { emitHouseholdEvent } from '@/lib/events/bus'
import type { RecipeExportInput } from '@/lib/validation/data'
import { RecipeInputSchema, type RecipeInput, type RecipeSearch } from '@/lib/validation/recipes'
import { isUniqueViolation, type Ctx, type Db, ServiceError } from './ctx'
import { getFoodsNutrition, resolveFoodName, resolveMany, type FoodWithNutrition, type ResolvedFood } from './foods'
import { toIngredient, toIngredientWithFood, toRecipeForScaling } from './recipe-mapper'
import { expandTagSlugs } from './tags'

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
  // Nombre real del alimento ya resuelto (food.name, en el locale de ctx), no
  // una conjetura del texto: el editor lo usa para mostrar qué reconoció sin
  // tener que volver a parsear rawText en el cliente. null si no se resolvió
  // ningún alimento para esta línea.
  foodName: string | null
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

// Segundo intento cuando la cascada normal (resolveFoodName vía resolveMany) no
// dio nada: reintenta con la primera palabra del nombre parseado ("cebollas
// grandes" -> "cebollas"), porque el trigram exige ≥ 0.6 y una frase larga rara
// vez llega a ese umbral aunque la primera palabra sí. Solo se llama cuando el
// primer intento ya falló, así que no repite esa misma consulta.
async function resolveWithFallback(ctx: Ctx, name: string, locale: Locale): Promise<ResolvedFood | null> {
  const firstWord = name.split(' ')[0]
  if (!firstWord || firstWord === name) return null
  return resolveFoodName(ctx, firstWord, locale)
}

interface PreparedWithFoods {
  prepared: PreparedIngredient[]
  foods: Map<string, FoodWithNutrition>
}

// Completa cada línea: parsea rawText si faltan quantity/unit, resuelve el
// alimento si falta foodId y calcula scalesLinearly por defecto para las
// líneas que se acaban de parsear (una línea ya resuelta a mano -editar una
// receta existente- conserva el valor que traiga, que el usuario pudo corregir).
// Devuelve también el mapa de alimentos ya resuelto para que createRecipe/
// updateRecipe no tengan que volver a pedirlo a computar la nutrición.
async function prepareIngredientsWithFoods(ctx: Ctx, inputs: IngredientInput[], locale: Locale): Promise<PreparedWithFoods> {
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
  const rawFoodIds = inputs.map((i, k) => i.foodId ?? resolved[k]?.foodId ?? null)
  const foods = await getFoodsNutrition(ctx, rawFoodIds.filter((x): x is string => x !== null))
  // Un foodId explícito puede señalar un alimento privado de otro hogar: getFoodsNutrition
  // ya filtra por visibilidad, así que si no aparece en el mapa se descarta aquí en vez
  // de arrastrarlo a la receta (la línea queda sin alimento, no apunta al ajeno).
  const foodIds = rawFoodIds.map((id) => (id !== null && foods.has(id) ? id : null))

  const prepared = inputs.map((i, k): PreparedIngredient => {
    const p = parsed[k]
    if (!p) throw new ServiceError('validation', 'Ingrediente inválido')
    const foodId = foodIds[k] ?? null
    const food = foodId ? (foods.get(foodId) ?? null) : null

    const displayQuantity = i.displayQuantity !== undefined ? i.displayQuantity : p.quantity
    let displayUnit = i.displayUnit !== undefined ? i.displayUnit : p.unit
    // Sin unidad (número de piezas suelto, "2 cebollas"): se asume unidad ('ud').
    if (displayUnit === null && displayQuantity !== null) displayUnit = 'ud'

    let quantity: number | null
    let unit: BaseUnit | null
    let scalesLinearly: boolean
    let needsReview: boolean

    // Tres casos, distinguidos por lo que trae el llamador (nunca por lo que
    // el navegador pudo calcular: el editor nunca convierte unidades, solo
    // este servicio conoce gramsPerCup/gramsPerUnit/densidad del alimento):
    if (i.quantity === undefined && i.displayQuantity === undefined) {
      // 1) No llega nada numérico: es una línea nueva de texto libre. Se
      // parsea rawText y se aplica la heurística de scalesLinearly (el
      // llamador no pudo haber corregido nada que no existía todavía).
      const base = displayQuantity !== null && displayUnit !== null ? toBaseUnit(displayQuantity, displayUnit, locale, food ?? undefined) : null
      quantity = base?.qty ?? null
      unit = base?.unit ?? null
      scalesLinearly = !isNonLinearByDefault(food?.name ?? p.foodName, locale)
      needsReview = foodId === null || p.needsReview
    } else if (i.quantity === undefined && i.displayQuantity !== undefined) {
      // 2) El editor mandó displayQuantity/displayUnit corregidos a mano pero
      // sin quantity/unit -no tiene datos de conversión del alimento en el
      // cliente-: se convierte aquí, con la conversión real del alimento
      // (food, si se resolvió), y se respeta scalesLinearly tal cual lo
      // mandó el llamador (es una corrección explícita, no un "no sé"); si no
      // lo mandó (undefined: p. ej. un cliente MCP sin ese campo), se aplica
      // la misma heurística que en el caso 1 en vez de asumir 'lineal'.
      const base = displayQuantity !== null && displayUnit !== null ? toBaseUnit(displayQuantity, displayUnit, locale, food ?? undefined) : null
      quantity = base?.qty ?? null
      unit = base?.unit ?? null
      scalesLinearly = i.scalesLinearly ?? !isNonLinearByDefault(food?.name ?? p.foodName, locale)
      needsReview = foodId === null || quantity === null
    } else {
      // 3) Línea ya resuelta del todo (quantity explícito, típicamente una
      // fila que el editor no tocó y reenvía tal cual): se conserva todo,
      // incluido scalesLinearly, que el usuario pudo corregir a mano; si no
      // llega (undefined), se aplica la heurística en vez de asumir 'lineal'
      // (mismo motivo que en el caso 2: un cliente MCP puede omitirlo).
      quantity = i.quantity ?? null
      unit = i.unit ?? null
      scalesLinearly = i.scalesLinearly ?? !isNonLinearByDefault(food?.name ?? p.foodName, locale)
      needsReview = foodId === null
    }

    return {
      rawText: i.rawText,
      foodId,
      foodName: food?.name ?? null,
      quantity,
      unit,
      displayQuantity,
      displayUnit,
      preparation: i.preparation !== undefined ? i.preparation : p.preparation,
      groupLabel: i.groupLabel ?? null,
      stepIndex: i.stepIndex ?? null,
      scalesLinearly,
      sortOrder: k,
      needsReview,
    }
  })

  return { prepared, foods }
}

export async function prepareIngredients(ctx: Ctx, inputs: IngredientInput[], locale: Locale): Promise<PreparedIngredient[]> {
  return (await prepareIngredientsWithFoods(ctx, inputs, locale)).prepared
}

// Etiqueta existente (del hogar o global) por slug, o la crea. onConflictDoNothing
// cubre la carrera entre el select y el insert (dos peticiones creando la misma
// etiqueta nueva a la vez): si el insert no devuelve fila, alguien se adelantó y
// se relee; un 23505 que aun así escape (otra causa) se traduce a ServiceError
// en vez de dejar pasar el error crudo de Postgres.
async function findTagBySlug(ctx: Ctx, slug: string) {
  const [tag] = await ctx.db
    .select()
    .from(schema.tags)
    .where(and(eq(schema.tags.slug, slug), or(eq(schema.tags.householdId, ctx.householdId), isNull(schema.tags.householdId))))
    .orderBy(sql`(${schema.tags.householdId} IS NULL)`)
    .limit(1)
  return tag ?? null
}

async function upsertTags(ctx: Ctx, names: string[]): Promise<string[]> {
  const ids: string[] = []
  for (const name of names) {
    const slug = slugify(name)
    if (!slug) continue
    const existing = await findTagBySlug(ctx, slug)
    if (existing) {
      ids.push(existing.id)
      continue
    }
    let created: schema.Tag | undefined
    try {
      ;[created] = await ctx.db.insert(schema.tags).values({ householdId: ctx.householdId, name, slug }).onConflictDoNothing().returning()
    } catch (e) {
      if (!isUniqueViolation(e)) throw e
    }
    if (created) {
      ids.push(created.id)
      continue
    }
    // onConflictDoNothing no devolvió fila (o saltó la excepción 23505 capturada arriba):
    // alguien creó la misma etiqueta justo antes; releerla es la única salida limpia.
    const raced = await findTagBySlug(ctx, slug)
    if (!raced) throw new ServiceError('conflict', 'No se pudo crear la etiqueta')
    ids.push(raced.id)
  }
  return ids
}

// Fila de inserción para recipe_ingredients: todo lo de PreparedIngredient salvo
// needsReview y foodName, que solo sirven para que el llamador informe a la interfaz.
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
    // Sin nutrición (ningún ingrediente resuelto) es el caso más estimado posible: no hay dato real que mostrar.
    nutritionIsEstimated: n?.isEstimated ?? true,
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
  // Dos nombres de etiqueta distintos pueden normalizar al mismo slug ('Vegano'/'vegano',
  // 'básico'/'basico'): upsertTags ya los resuelve al mismo id, pero sin deduplicar aquí
  // recipe_tags recibiría el mismo (recipeId, tagId) dos veces y violaría su clave primaria.
  const tagIds = [...new Set(await upsertTags({ ...ctx, db: tx }, input.tags))]
  if (tagIds.length) await tx.insert(schema.recipeTags).values(tagIds.map((tagId) => ({ recipeId, tagId })))
}

function nutritionFromPrepared(prepared: PreparedIngredient[], foods: Map<string, FoodWithNutrition>, servings: number, yieldGrams: number | null): Nutrition | null {
  const hasAnyFood = prepared.some((p) => p.foodId !== null)
  if (!hasAnyFood) return null
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
  const { prepared, foods } = await prepareIngredientsWithFoods(ctx, input.ingredients, ctx.locale)
  const nutrition = nutritionFromPrepared(prepared, foods, input.servingsBase, input.yieldGrams ?? null)
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
  const { prepared, foods } = await prepareIngredientsWithFoods(ctx, input.ingredients, ctx.locale)
  const nutrition = nutritionFromPrepared(prepared, foods, input.servingsBase, input.yieldGrams ?? null)
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
  if (opts.servings !== undefined && !(Number.isFinite(opts.servings) && opts.servings > 0)) {
    throw new ServiceError('validation', 'El número de raciones debe ser un entero positivo')
  }

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
  const scaled = opts.servings !== undefined && opts.servings !== recipe.servingsBase ? scaleRecipe(toRecipeForScaling(recipe.servingsBase, rows.map(toIngredient)), opts.servings) : null

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

export interface RecipeSummary {
  id: string
  title: string
  imageUrl: string | null
  totalMinutes: number | null
  difficulty: 'easy' | 'medium' | 'hard' | null
  kcalPerServing: number | null
  servingsBase: number
  timesCooked: number
  tags: string[]
  nutritionIsEstimated: boolean
}

// Búsqueda full-text (columna generada recipes.search_vector, índice GIN) + filtros.
// El orden 'relevance' sin texto de búsqueda cae a lo más reciente: no hay ts_rank que calcular.
export async function searchRecipes(ctx: Ctx, input: RecipeSearch): Promise<{ items: RecipeSummary[]; total: number }> {
  const r = schema.recipes
  const conds = [eq(r.householdId, ctx.householdId), isNull(r.deletedAt)]
  const q = input.q?.trim()
  if (q) conds.push(sql`${r.searchVector} @@ (websearch_to_tsquery('spanish', ${q}) || websearch_to_tsquery('english', ${q}))`)
  if (input.maxMinutes !== undefined) {
    // Receta sin ningún tiempo conocido (prep y cook ambos null) no entra en el filtro:
    // no se puede asumir 0 minutos. Con solo uno de los dos presente, el otro cuenta como 0.
    conds.push(
      sql`NOT (${r.prepMinutes} IS NULL AND ${r.cookMinutes} IS NULL) AND coalesce(${r.prepMinutes}, 0) + coalesce(${r.cookMinutes}, 0) <= ${input.maxMinutes}`,
    )
  }
  if (input.difficulty) conds.push(eq(r.difficulty, input.difficulty))
  if (input.tags?.length) {
    // Filtrar por una etiqueta padre incluye a sus hijas (W4(d)): "dieta"
    // encuentra las vegetarianas y las veganas.
    const slugs = await expandTagSlugs(ctx, input.tags)
    conds.push(
      sql`EXISTS (SELECT 1 FROM ${schema.recipeTags} JOIN ${schema.tags} ON ${schema.tags.id} = ${schema.recipeTags.tagId}
        WHERE ${schema.recipeTags.recipeId} = ${r.id} AND ${schema.tags.slug} IN (${sql.join(slugs.map((s) => sql`${s}`), sql`, `)}))`,
    )
  }
  for (const foodId of input.hasIngredients ?? []) {
    conds.push(sql`EXISTS (SELECT 1 FROM ${schema.recipeIngredients} WHERE ${schema.recipeIngredients.recipeId} = ${r.id} AND ${schema.recipeIngredients.foodId} = ${foodId})`)
  }
  if (input.onlyWithPantry) {
    conds.push(
      sql`NOT EXISTS (SELECT 1 FROM ${schema.recipeIngredients} WHERE ${schema.recipeIngredients.recipeId} = ${r.id} AND ${schema.recipeIngredients.foodId} IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM ${schema.pantryItems} WHERE ${schema.pantryItems.householdId} = ${ctx.householdId}
          AND ${schema.pantryItems.foodId} = ${schema.recipeIngredients.foodId} AND ${schema.pantryItems.quantity} > 0))`,
    )
  }
  const where = and(...conds)
  const order =
    input.sort === 'title'
      ? sql`${r.title} asc`
      : input.sort === 'recent'
        ? sql`${r.updatedAt} desc`
        : input.sort === 'most_cooked'
          ? sql`${r.timesCooked} desc, ${r.title} asc`
          : q
            ? sql`ts_rank(${r.searchVector}, websearch_to_tsquery('spanish', ${q})) desc, ${r.title} asc`
            : sql`${r.updatedAt} desc`
  const [totalRow] = await ctx.db.select({ total: sql<number>`count(*)::int` }).from(r).where(where)
  const rows = await ctx.db.select().from(r).where(where).orderBy(order).limit(input.limit).offset(input.offset)
  const ids = rows.map((x) => x.id)
  const tagRows = ids.length
    ? await ctx.db
        .select({ recipeId: schema.recipeTags.recipeId, name: schema.tags.name })
        .from(schema.recipeTags)
        .innerJoin(schema.tags, eq(schema.tags.id, schema.recipeTags.tagId))
        .where(inArray(schema.recipeTags.recipeId, ids))
    : []
  const items: RecipeSummary[] = rows.map((x) => ({
    id: x.id,
    title: x.title,
    imageUrl: x.imageUrls[0] ?? null,
    totalMinutes: x.prepMinutes === null && x.cookMinutes === null ? null : (x.prepMinutes ?? 0) + (x.cookMinutes ?? 0),
    difficulty: x.difficulty,
    kcalPerServing: x.kcalPerServing,
    servingsBase: x.servingsBase,
    timesCooked: x.timesCooked,
    tags: tagRows.filter((t) => t.recipeId === x.id).map((t) => t.name),
    nutritionIsEstimated: x.nutritionIsEstimated,
  }))
  return { items, total: totalRow?.total ?? 0 }
}

export interface RecipeExport {
  version: 1
  exportedAt: string
  recipes: (RecipeInput & { timesCooked: number; createdAt: string })[]
}

// Volcado completo del hogar para exportar/respaldar: sin ids internos (ni de receta ni de hogar),
// listo para reimportarse en otra instancia con importRecipeFromText/UI de importación manual.
export async function exportAll(ctx: Ctx): Promise<RecipeExport> {
  const rows = await ctx.db
    .select()
    .from(schema.recipes)
    .where(and(eq(schema.recipes.householdId, ctx.householdId), isNull(schema.recipes.deletedAt)))
    .orderBy(schema.recipes.createdAt)
  const out: RecipeExport['recipes'] = []
  // N+1 aceptado (Minor, revisión final): una consulta por receta vía getRecipe en
  // vez de traer ingredientes/pasos/tags de todo el hogar de una vez. Se acepta
  // porque exportAll es una operación manual y poco frecuente (backup/exportación
  // desde ajustes, no un listado que se repinte en cada carga de página) y porque
  // reutilizar getRecipe evita duplicar su lógica de ensamblado; si el hogar llega
  // a tener cientos de recetas y la exportación se nota lenta, se puede batchear.
  for (const r of rows) {
    const d = await getRecipe(ctx, r.id)
    if (!d) continue
    out.push({
      title: r.title,
      description: r.description,
      servingsBase: r.servingsBase,
      prepMinutes: r.prepMinutes,
      cookMinutes: r.cookMinutes,
      difficulty: r.difficulty,
      sourceUrl: r.sourceUrl,
      imageUrls: r.imageUrls,
      notes: r.notes,
      yieldGrams: r.yieldGrams,
      tags: d.tags.map((t) => t.name),
      ingredients: d.ingredients.map((i) => ({
        rawText: i.rawText,
        foodId: null,
        quantity: i.quantity,
        unit: i.unit,
        displayQuantity: i.displayQuantity,
        displayUnit: i.displayUnit,
        preparation: i.preparation,
        groupLabel: i.groupLabel,
        stepIndex: i.stepIndex,
        scalesLinearly: i.scalesLinearly,
      })),
      steps: d.steps.map((s) => ({ text: s.text, timerSeconds: s.timerSeconds, imageUrl: s.imageUrl })),
      timesCooked: r.timesCooked,
      createdAt: r.createdAt.toISOString(),
    })
  }
  return { version: 1, exportedAt: new Date().toISOString(), recipes: out }
}

// El volcado de exportAll trae dos campos que RecipeInputSchema no conoce
// (timesCooked, createdAt: la copia empieza su historia de cero en el hogar
// de destino). Se descartan aquí, antes de validar, para no tirar abajo una
// receta exportada de verdad solo por traer esos dos campos de más.
function stripExportExtras(raw: unknown): unknown {
  if (raw === null || typeof raw !== 'object') return raw
  const candidate = { ...(raw as Record<string, unknown>) }
  delete candidate.timesCooked
  delete candidate.createdAt
  return candidate
}

// Título de una receta del volcado, para señalarla en `failed` cuando ni
// siquiera pasa el esquema; si no es reconocible (ni siquiera es un objeto,
// o el título no es texto), se identifica por su posición en el array.
function importLabel(candidate: unknown, index: number): string {
  if (candidate !== null && typeof candidate === 'object' && typeof (candidate as { title?: unknown }).title === 'string') {
    return (candidate as { title: string }).title
  }
  return `recetas[${index}]`
}

// Reimporta un volcado de exportAll en el hogar del contexto. RecipeExportSchema
// solo valida el sobre (version/exportedAt): cada receta se valida aparte,
// aquí, contra RecipeInputSchema, así que una receta rota del volcado no
// aborta el resto — se apunta su título (o su posición si no tiene). La que sí
// pasa el esquema va por createRecipe: se reparsean los ingredientes, se
// resuelven los alimentos de ESTE hogar y se recalcula la nutrición (los ids
// del origen no valen aquí); un fallo ahí tampoco aborta el resto.
export async function importAll(ctx: Ctx, data: RecipeExportInput): Promise<{ created: number; failed: string[] }> {
  let created = 0
  const failed: string[] = []
  for (const [index, raw] of data.recipes.entries()) {
    const candidate = stripExportExtras(raw)
    const parsed = RecipeInputSchema.safeParse(candidate)
    if (!parsed.success) {
      failed.push(importLabel(candidate, index))
      continue
    }
    try {
      await createRecipe(ctx, parsed.data)
      created += 1
    } catch {
      failed.push(parsed.data.title)
    }
  }
  return { created, failed }
}

export interface RecentlyCookedRecipe {
  id: string
  title: string
  lastCookedAt: string
}

// Recetas con al menos un cocinado (recipes.last_cooked_at), más recientes
// primero: usada por la herramienta MCP get_household_context. `logCooked`
// (W3) es quien escribe esa columna; esta función solo la lee.
export async function recentlyCooked(ctx: Ctx, limit: number): Promise<RecentlyCookedRecipe[]> {
  const rows = await ctx.db
    .select({ id: schema.recipes.id, title: schema.recipes.title, lastCookedAt: schema.recipes.lastCookedAt })
    .from(schema.recipes)
    .where(and(eq(schema.recipes.householdId, ctx.householdId), isNull(schema.recipes.deletedAt), isNotNull(schema.recipes.lastCookedAt)))
    .orderBy(desc(schema.recipes.lastCookedAt))
    .limit(limit)
  return rows.map((r) => ({ id: r.id, title: r.title, lastCookedAt: (r.lastCookedAt as Date).toISOString() }))
}

export type { FoodWithNutrition }
