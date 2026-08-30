import { and, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm'
import * as schema from '@/db/schema'
import { normalizeSearchName } from '@/lib/domain/quantities'
import type { BaseUnit, FoodNutrition, Locale } from '@/lib/domain/types'
import { emitHouseholdEvent } from '@/lib/events/bus'
import { invalidateHousehold } from '@/lib/cache/tags'
import { fetchOffProduct, offToFoodInput, type OffProduct } from '@/lib/integrations/open-food-facts'
import { BarcodeSchema, type FoodCorrection, type FoodInput } from '@/lib/validation/foods'
import { ALLERGENS } from '@/lib/validation/household'
import { ServiceError, type Ctx } from './ctx'

export interface FoodSummary {
  id: string
  householdId: string | null // null = global (seed)
  name: string // nameEs o nameEn según ctx.locale
  nameEs: string
  nameEn: string
  defaultUnit: BaseUnit
  kcal100g: number | null
  isEstimated: boolean
  source: 'off' | 'usda' | 'manual' | 'ai'
  allergens: string[]
}
export type FoodWithNutrition = FoodSummary & FoodNutrition

export type ResolveMethod = 'exact' | 'alias' | 'trigram'
export interface ResolvedFood {
  foodId: string
  method: ResolveMethod
  score: number
  name: string
}

// Umbral de la cascada §9.4 (b): trigram ≥ 0.6 para resolver un nombre suelto
const TRIGRAM_RESOLVE = 0.6
// Umbral, más laxo, para sugerencias de búsqueda libre (no es una resolución automática).
// Coincide con el umbral por defecto del operador `%` de pg_trgm (0.3): así el
// prefiltro por índice GIN (`%`) no descarta candidatos que luego sí pasarían el corte.
const TRIGRAM_SEARCH = 0.3

// Visible para el hogar: global (household_id NULL) o propio, y no fusionado en otro.
// mergedIntoId apunta al alimento superviviente de una fusión; seguir el puntero
// para redirigir al llamador es responsabilidad de la función de fusión (W4), no de esta.
function visible(ctx: Ctx) {
  return and(or(isNull(schema.foods.householdId), eq(schema.foods.householdId, ctx.householdId)), isNull(schema.foods.mergedIntoId))
}

function nameColumn(locale: Locale) {
  return locale === 'en' ? schema.foods.nameEn : schema.foods.nameEs
}

function toSummary(f: schema.Food, locale: Locale): FoodWithNutrition {
  return {
    id: f.id,
    householdId: f.householdId,
    name: locale === 'en' ? f.nameEn : f.nameEs,
    nameEs: f.nameEs,
    nameEn: f.nameEn,
    defaultUnit: f.defaultUnit,
    kcal100g: f.kcal100g,
    isEstimated: f.isEstimated,
    source: f.source,
    allergens: f.allergens,
    protein100g: f.protein100g,
    carbs100g: f.carbs100g,
    fat100g: f.fat100g,
    fiber100g: f.fiber100g,
    gramsPerCup: f.gramsPerCup,
    gramsPerTbsp: f.gramsPerTbsp,
    gramsPerUnit: f.gramsPerUnit,
    densityGPerMl: f.densityGPerMl,
  }
}

// Búsqueda libre: coincide por trigram en cualquiera de los dos idiomas o en
// cualquier alias (los alias se guardan ya normalizados: ver el contrato de
// normalización de aliases en Task 3, createFood/correctFood).
export async function searchFoods(ctx: Ctx, input: { q: string; locale?: Locale; limit?: number; offset?: number }): Promise<FoodSummary[]> {
  const locale = input.locale ?? ctx.locale
  const q = normalizeSearchName(input.q)
  if (!q) return []
  const simEs = sql<number>`similarity(${schema.foods.searchNameEs}, ${q})`
  const simEn = sql<number>`similarity(${schema.foods.searchNameEn}, ${q})`
  const simAlias = sql<number>`coalesce((select max(similarity(a, ${q})) from unnest(${schema.foods.aliases}) a), 0)`
  const sim = sql<number>`greatest(${simEs}, ${simEn}, ${simAlias})`
  const rows = await ctx.db
    .select({ f: schema.foods, sim })
    .from(schema.foods)
    .where(
      and(
        visible(ctx),
        // `%` (umbral 0.3 de pg_trgm) usa el índice GIN como prefiltro barato;
        // el corte real lo da el `sim >= TRIGRAM_SEARCH` de abajo.
        or(sql`${schema.foods.searchNameEs} % ${q}`, sql`${schema.foods.searchNameEn} % ${q}`, sql`${simAlias} >= ${TRIGRAM_SEARCH}`),
        sql`${sim} >= ${TRIGRAM_SEARCH}`,
      ),
    )
    // el alimento del hogar antes que el global en empate; luego similitud; luego nombre
    .orderBy(sql`(${schema.foods.householdId} is null)`, desc(sim), nameColumn(locale))
    .limit(input.limit ?? 20)
    .offset(input.offset ?? 0)
  // W2-R6: un alimento del hogar oculta al global homónimo (mismo search_name_es
  // normalizado) — el hogar siempre "gana" cuando hay solapamiento de nombre.
  const householdSearchNames = new Set(rows.filter((r) => r.f.householdId === ctx.householdId).map((r) => r.f.searchNameEs))
  const deduped = rows.filter((r) => r.f.householdId === ctx.householdId || !householdSearchNames.has(r.f.searchNameEs))
  return deduped.map((r) => toSummary(r.f, locale))
}

// Cascada de resolución §9.4: (a) exacto por nombre normalizado o alias, en
// cualquiera de los dos idiomas (un ingrediente puede llegar en inglés aunque
// el hogar trabaje en español); (b) trigram ≥ 0.6, también en ambos idiomas.
// El resto de la cascada (código de barras OFF, IA) vive en Task 3 / pista (e);
// la corrección manual siempre gana.
export async function resolveFoodName(ctx: Ctx, foodName: string, locale: Locale): Promise<ResolvedFood | null> {
  const q = normalizeSearchName(foodName)
  if (!q) return null
  const nameCol = nameColumn(locale)

  const exact = await ctx.db
    .select({ id: schema.foods.id, name: nameCol })
    .from(schema.foods)
    .where(and(visible(ctx), or(eq(schema.foods.searchNameEs, q), eq(schema.foods.searchNameEn, q))))
    .orderBy(sql`(${schema.foods.householdId} is null)`)
    .limit(1)
  if (exact[0]) return { foodId: exact[0].id, method: 'exact', score: 1, name: exact[0].name }

  // Alias: un único array sin distinción de idioma; se guardan ya normalizados
  // (Task 3 normaliza con normalizeSearchName antes de insertar/actualizar),
  // así que aquí basta comparar en minúsculas sin volver a normalizar.
  const alias = await ctx.db
    .select({ id: schema.foods.id, name: nameCol })
    .from(schema.foods)
    .where(and(visible(ctx), sql`exists (select 1 from unnest(${schema.foods.aliases}) a where lower(a) = ${q})`))
    .orderBy(sql`(${schema.foods.householdId} is null)`)
    .limit(1)
  if (alias[0]) return { foodId: alias[0].id, method: 'alias', score: 0.95, name: alias[0].name }

  const simEs = sql<number>`similarity(${schema.foods.searchNameEs}, ${q})`
  const simEn = sql<number>`similarity(${schema.foods.searchNameEn}, ${q})`
  const sim = sql<number>`greatest(${simEs}, ${simEn})`
  const trigram = await ctx.db
    .select({ id: schema.foods.id, name: nameCol, sim })
    .from(schema.foods)
    .where(
      and(
        visible(ctx),
        // mismo patrón que searchFoods: `%` prefiltra por índice GIN, el corte real es el >= 0.6 explícito
        or(sql`${schema.foods.searchNameEs} % ${q}`, sql`${schema.foods.searchNameEn} % ${q}`),
        sql`${sim} >= ${TRIGRAM_RESOLVE}`,
      ),
    )
    .orderBy(desc(sim), sql`(${schema.foods.householdId} is null)`)
    .limit(1)
  if (trigram[0]) return { foodId: trigram[0].id, method: 'trigram', score: trigram[0].sim, name: trigram[0].name }

  return null
}

// Resuelve varios nombres a la vez conservando orden y nulls. Una consulta por nombre
// (la cascada de resolveFoodName no es trivial de batchear sin perder precisión),
// pero acotado al tamaño de la lista de ingredientes de una receta: nunca N+1 sin límite.
export async function resolveMany(ctx: Ctx, names: string[], locale: Locale): Promise<(ResolvedFood | null)[]> {
  const out: (ResolvedFood | null)[] = []
  for (const name of names) out.push(await resolveFoodName(ctx, name, locale))
  return out
}

// Nutrición/conversión por id, en un mapa para que recipeNutrition la consulte de una vez.
// Los ids que no existen o no son visibles para el hogar (privados de otro hogar,
// fusionados) simplemente no aparecen en el mapa: el llamador decide qué hacer
// con un id ausente, esta función nunca lanza por un id desconocido.
export async function getFoodsNutrition(ctx: Ctx, foodIds: string[]): Promise<Map<string, FoodWithNutrition>> {
  const map = new Map<string, FoodWithNutrition>()
  if (foodIds.length === 0) return map
  const rows = await ctx.db
    .select()
    .from(schema.foods)
    .where(and(visible(ctx), inArray(schema.foods.id, foodIds)))
  for (const f of rows) map.set(f.id, toSummary(f, ctx.locale))
  return map
}

export async function getFood(ctx: Ctx, foodId: string): Promise<FoodWithNutrition | null> {
  const [f] = await ctx.db
    .select()
    .from(schema.foods)
    .where(and(visible(ctx), eq(schema.foods.id, foodId)))
    .limit(1)
  return f ? toSummary(f, ctx.locale) : null
}

// La columna allergens de una fila (string[] sin acotar en el esquema) puede
// traer valores que ya no están en el vocabulario vigente (p. ej. tras quitar
// uno de ALLERGENS); filtrarlos así, en vez de un cast, evita colar un
// alérgeno inválido en un FoodInput sin que el tipo lo permita.
type Allergen = FoodInput['allergens'][number]
const ALLERGEN_SET: ReadonlySet<string> = new Set(ALLERGENS)
function toAllergens(values: readonly string[]): Allergen[] {
  return values.filter((v): v is Allergen => ALLERGEN_SET.has(v))
}

// Fila lista para insert/update a partir de un FoodInput ya validado. Los alias
// se normalizan igual que los nombres de búsqueda (stripAccents+lowercase):
// resolveFoodName los compara con `lower(a) = q` sin volver a normalizar.
function toInsert(input: FoodInput, householdId: string | null, source: schema.Food['source'], isEstimated: boolean): typeof schema.foods.$inferInsert {
  return {
    householdId,
    nameEs: input.nameEs,
    nameEn: input.nameEn,
    searchNameEs: normalizeSearchName(input.nameEs),
    searchNameEn: normalizeSearchName(input.nameEn),
    aliases: input.aliases.map(normalizeSearchName).filter(Boolean),
    defaultUnit: input.defaultUnit,
    kcal100g: input.kcal100g ?? null,
    protein100g: input.protein100g ?? null,
    carbs100g: input.carbs100g ?? null,
    fat100g: input.fat100g ?? null,
    fiber100g: input.fiber100g ?? null,
    barcode: input.barcode ?? null,
    allergens: input.allergens,
    gramsPerCup: input.gramsPerCup ?? null,
    gramsPerTbsp: input.gramsPerTbsp ?? null,
    gramsPerUnit: input.gramsPerUnit ?? null,
    densityGPerMl: input.densityGPerMl ?? null,
    seasonalMonths: input.seasonalMonths,
    source,
    isEstimated,
  }
}

// Alta manual (o desde IA, pista (e)): siempre del hogar que la crea, nunca global.
// `isEstimated` solo es true para altas de IA; una manual o de OFF es un dato declarado, no estimado.
export async function createFood(ctx: Ctx, input: FoodInput, source: schema.Food['source'] = 'manual'): Promise<FoodWithNutrition> {
  const [f] = await ctx.db
    .insert(schema.foods)
    .values(toInsert(input, ctx.householdId, source, source === 'ai'))
    .returning()
  if (!f) throw new ServiceError('conflict', 'No se pudo crear el alimento')
  invalidateHousehold(ctx.householdId, ['foods'])
  return toSummary(f, ctx.locale)
}

// Corrección manual (§9.4): gana a cualquier fuente y deja de ser una estimación.
// Un alimento global es compartido por todos los hogares, así que corregirlo
// no lo modifica in situ (afectaría a otros hogares sin que lo pidan): en su
// lugar se crea una copia del hogar con el parche aplicado, y quien llama
// sustituye el foodId por el de la copia. Un alimento ya del hogar sí se
// actualiza en su sitio. `visible(ctx)` ya excluye los alimentos privados de
// otro hogar, así que un id ajeno cae directamente en `not_found`.
export async function correctFood(ctx: Ctx, foodId: string, patch: FoodCorrection): Promise<FoodWithNutrition> {
  const [f] = await ctx.db
    .select()
    .from(schema.foods)
    .where(and(visible(ctx), eq(schema.foods.id, foodId)))
    .limit(1)
  if (!f) throw new ServiceError('not_found', 'Alimento no encontrado')

  const merged: FoodInput = {
    nameEs: patch.nameEs ?? f.nameEs,
    nameEn: patch.nameEn ?? f.nameEn,
    aliases: patch.aliases ?? f.aliases,
    defaultUnit: patch.defaultUnit ?? f.defaultUnit,
    kcal100g: patch.kcal100g !== undefined ? patch.kcal100g : f.kcal100g,
    protein100g: patch.protein100g !== undefined ? patch.protein100g : f.protein100g,
    carbs100g: patch.carbs100g !== undefined ? patch.carbs100g : f.carbs100g,
    fat100g: patch.fat100g !== undefined ? patch.fat100g : f.fat100g,
    fiber100g: patch.fiber100g !== undefined ? patch.fiber100g : f.fiber100g,
    barcode: patch.barcode !== undefined ? patch.barcode : f.barcode,
    allergens: patch.allergens ?? toAllergens(f.allergens),
    gramsPerCup: patch.gramsPerCup !== undefined ? patch.gramsPerCup : f.gramsPerCup,
    gramsPerTbsp: patch.gramsPerTbsp !== undefined ? patch.gramsPerTbsp : f.gramsPerTbsp,
    gramsPerUnit: patch.gramsPerUnit !== undefined ? patch.gramsPerUnit : f.gramsPerUnit,
    densityGPerMl: patch.densityGPerMl !== undefined ? patch.densityGPerMl : f.densityGPerMl,
    seasonalMonths: patch.seasonalMonths ?? f.seasonalMonths,
  }

  if (f.householdId === null) {
    // Antes de crear la copia, busca si el hogar ya tiene una con el mismo nombre
    // normalizado (p. ej. dos correcciones seguidas del mismo global, o un alimento
    // manual que casualmente coincide): si existe, se actualiza esa en vez de
    // duplicarla (I18/fix 18 de la revisión final). searchNameEs es el mismo que
    // calculará toInsert para la fila nueva, así que la comparación es consistente.
    const searchNameEs = normalizeSearchName(merged.nameEs)
    const [existingCopy] = await ctx.db
      .select()
      .from(schema.foods)
      .where(and(eq(schema.foods.householdId, ctx.householdId), eq(schema.foods.searchNameEs, searchNameEs), isNull(schema.foods.mergedIntoId)))
      .limit(1)
    if (existingCopy) {
      const [updated] = await ctx.db
        .update(schema.foods)
        .set({ ...toInsert(merged, ctx.householdId, 'manual', false), updatedAt: new Date() })
        .where(eq(schema.foods.id, existingCopy.id))
        .returning()
      if (!updated) throw new ServiceError('conflict', 'No se pudo actualizar la copia del alimento')
      invalidateHousehold(ctx.householdId, ['foods', 'recipes', 'pantry'])
      return toSummary(updated, ctx.locale)
    }
    const [copy] = await ctx.db
      .insert(schema.foods)
      .values(toInsert(merged, ctx.householdId, 'manual', false))
      .returning()
    if (!copy) throw new ServiceError('conflict', 'No se pudo copiar el alimento')
    invalidateHousehold(ctx.householdId, ['foods', 'recipes', 'pantry'])
    return toSummary(copy, ctx.locale)
  }

  const [updated] = await ctx.db
    .update(schema.foods)
    .set({ ...toInsert(merged, f.householdId, 'manual', false), updatedAt: new Date() })
    .where(and(eq(schema.foods.id, f.id), eq(schema.foods.householdId, ctx.householdId)))
    .returning()
  if (!updated) throw new ServiceError('not_found', 'Alimento no encontrado')
  invalidateHousehold(ctx.householdId, ['foods', 'recipes', 'pantry'])
  return toSummary(updated, ctx.locale)
}

// Inyectable en tests: una función que dado un código de barras intenta
// obtener el producto (normalmente contra Open Food Facts).
export type BarcodeFetcher = (barcode: string) => Promise<OffProduct | null>

// Cascada de código de barras (contrato de la pista (b)): primero local (del
// hogar, luego global); si no hay nada, se pregunta a OFF. `null` significa
// "ni local ni OFF lo conocen" — no es un error, así que no lanza `not_found`
// (ruling W2-R4/W2-R9: la forma la fija el contrato, no esta implementación).
// Un producto envasado escaneado por un hogar se guarda como alimento *del
// hogar* (source 'off'), no global: así el dato que trae un usuario (nombre,
// kcal de la etiqueta) no se cuela en el catálogo de otros hogares sin
// revisión. Esta función no distingue "ya existía" de "recién creado" (esa
// forma la fija el contrato de la pista (b): solo devuelve el alimento o
// `null`); si un llamador necesita saberlo, puede consultar antes con
// `getFood`/`searchFoods` por el código de barras.
// No hay índice único (household_id, barcode) en el esquema (W4: añadirlo si
// el escaneo repetido dentro de un mismo hogar demuestra ser una carrera real
// en producción); dos inserciones concurrentes del mismo código para el mismo
// hogar podrían crear dos filas. `sourceRef` se deja sin usar a propósito
// aquí: esa columna (junto con el índice único `foods_source_ref_uidx`) solo
// tiene sentido para deduplicar alimentos *globales*, y estas altas por
// código de barras son siempre del hogar.
export async function lookupBarcode(ctx: Ctx, barcode: string, fetcher: BarcodeFetcher = (b) => fetchOffProduct(b)): Promise<FoodWithNutrition | null> {
  const parsed = BarcodeSchema.safeParse(barcode)
  if (!parsed.success) throw new ServiceError('validation', 'Código de barras inválido')

  const [local] = await ctx.db
    .select()
    .from(schema.foods)
    .where(and(visible(ctx), eq(schema.foods.barcode, parsed.data)))
    .orderBy(sql`(${schema.foods.householdId} is null)`) // el del hogar antes que el global
    .limit(1)
  if (local) return toSummary(local, ctx.locale)

  const off = await fetcher(parsed.data)
  if (!off) return null

  const created = await createFood(ctx, offToFoodInput(off), 'off')
  invalidateHousehold(ctx.householdId, ['foods'])
  return created
}

export interface MergeFoodsResult {
  fromId: string
  intoId: string
  ingredientsRepointed: number
  pantryItemsRepointed: number
}

// Fusiona `from` en `into` (spec §9.4). No borra nada: el origen se queda con
// merged_into_id puesto y visible() lo saca de búsquedas y resolución, así que
// una fusión equivocada se deshace poniendo esa columna a null.
//
// El ORIGEN tiene que ser del hogar: fusionar un alimento global afectaría a
// todas las casas de la instancia. El DESTINO puede ser global (es justo el
// caso útil: mandar el duplicado local al alimento canónico del seed).
export async function mergeFoods(ctx: Ctx, fromId: string, intoId: string): Promise<MergeFoodsResult> {
  if (fromId === intoId) throw new ServiceError('validation', 'Un alimento no se fusiona consigo mismo')

  const rows = await ctx.db.select().from(schema.foods).where(inArray(schema.foods.id, [fromId, intoId]))
  const from = rows.find((f) => f.id === fromId)
  const into = rows.find((f) => f.id === intoId)
  // "No es tuyo" y "no existe" se responden igual: distinguirlos delataría
  // el catálogo de otro hogar.
  if (!from || (from.householdId !== null && from.householdId !== ctx.householdId)) throw new ServiceError('not_found', 'Alimento no encontrado')
  if (!into || (into.householdId !== null && into.householdId !== ctx.householdId)) throw new ServiceError('not_found', 'Alimento no encontrado')
  if (from.householdId === null) throw new ServiceError('forbidden', 'Un alimento global no se puede fusionar: lo comparten todos los hogares')
  if (into.mergedIntoId !== null) throw new ServiceError('validation', 'El alimento de destino ya está fusionado en otro')

  // El fusionado desaparece de las búsquedas, así que sus alérgenos también
  // desaparecerían de cualquier receta que lo use si no se trasladan al que
  // se queda (fix 1 de la revisión final: antes se perdían en silencio). Un
  // destino del hogar se actualiza en la misma transacción que reapunta
  // ingredientes y despensa. Un destino global es compartido por todos los
  // hogares: no se le pueden sumar alérgenos de un alimento de esta casa sin
  // revisión, así que si de verdad haría falta añadir alguno se rechaza con
  // 'conflict' en vez de fusionar a medias (decisión 14 del plan).
  const missingAllergens = from.allergens.filter((a) => !into.allergens.includes(a))
  if (missingAllergens.length > 0 && into.householdId === null) {
    throw new ServiceError('conflict', 'El alimento de destino es global: no se le pueden sumar los alérgenos del duplicado sin revisarlo a mano')
  }

  const result = await ctx.db.transaction(async (tx) => {
    if (missingAllergens.length > 0) {
      await tx.update(schema.foods).set({ allergens: [...into.allergens, ...missingAllergens], updatedAt: new Date() }).where(eq(schema.foods.id, intoId))
    }

    // Solo las recetas del hogar: un ingrediente de otra casa nunca apunta a
    // un alimento propio de esta, pero el filtro lo deja explícito.
    const ingredients = await tx
      .update(schema.recipeIngredients)
      .set({ foodId: intoId })
      .where(
        and(
          eq(schema.recipeIngredients.foodId, fromId),
          sql`EXISTS (SELECT 1 FROM ${schema.recipes} WHERE ${schema.recipes.id} = ${schema.recipeIngredients.recipeId} AND ${schema.recipes.householdId} = ${ctx.householdId})`,
        ),
      )
      .returning({ id: schema.recipeIngredients.id })

    const pantry = await tx
      .update(schema.pantryItems)
      .set({ foodId: intoId })
      .where(and(eq(schema.pantryItems.foodId, fromId), eq(schema.pantryItems.householdId, ctx.householdId)))
      .returning({ id: schema.pantryItems.id })

    await tx.update(schema.foods).set({ mergedIntoId: intoId, updatedAt: new Date() }).where(eq(schema.foods.id, fromId))
    // Aplana la cadena: si algo ya se había fusionado en `from`, pasa a apuntar
    // directamente a `into`. Sin esto, resolver un alimento exigiría seguir
    // saltos encadenados y una fusión circular sería posible.
    await tx.update(schema.foods).set({ mergedIntoId: intoId }).where(eq(schema.foods.mergedIntoId, fromId))

    return { fromId, intoId, ingredientsRepointed: ingredients.length, pantryItemsRepointed: pantry.length }
  })

  emitHouseholdEvent(ctx.householdId, { type: 'pantry.changed', payload: { foodIds: [fromId, intoId] } })
  invalidateHousehold(ctx.householdId, ['foods', 'recipes', 'pantry'])
  return result
}
