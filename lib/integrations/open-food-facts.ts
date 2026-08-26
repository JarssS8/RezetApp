// Cliente mínimo de Open Food Facts (ODbL). Solo lectura por código de barras.
// Sin caché ni escritura: lookupBarcode (lib/services/foods.ts) decide qué
// hacer con el resultado (crear alimento *del hogar* con source 'off';
// no global, ver el contrato de la pista (b)).
import type { FoodInput } from '@/lib/validation/foods'
import type { ALLERGENS } from '@/lib/validation/household'

export interface OffProduct {
  code: string
  name: string
  nameEs: string | null
  nameEn: string | null
  kcal100g: number | null
  protein100g: number | null
  carbs100g: number | null
  fat100g: number | null
  fiber100g: number | null
  allergens: Allergen[]
  aliases: string[]
  gramsPerUnit: number | null
}

type Allergen = (typeof ALLERGENS)[number]

export type OffErrorCode = 'network' | 'invalid'

// Error tipado: fallo de red o respuesta que no se puede interpretar. Un
// código de barras desconocido o un error HTTP normal NO lanzan: devuelven
// null (ver fetchOffProduct). Solo lo verdaderamente excepcional lanza.
export class OffError extends Error {
  readonly code: OffErrorCode
  constructor(code: OffErrorCode, message: string) {
    super(message)
    this.name = 'OffError'
    this.code = code
  }
}

const OFF_URL = 'https://world.openfoodfacts.org/api/v2/product'
const USER_AGENT = 'RezetApp/0.1 (self-hosted recipe manager)'
const TIMEOUT_MS = 8000
const FIELDS = [
  'code',
  'product_name',
  'product_name_es',
  'product_name_en',
  'nutriments',
  'allergens_tags',
  'brands',
  'serving_quantity',
  'serving_quantity_unit',
].join(',')

// Etiquetas OFF (con prefijo "en:") → vocabulario de alérgenos de
// lib/validation/household.ts::ALLERGENS. Lo que no está en el mapa se descarta:
// preferimos perder una etiqueta rara a inventar un alérgeno que no existe.
const ALLERGEN_MAP: Partial<Record<string, Allergen>> = {
  'en:gluten': 'gluten',
  'en:milk': 'lactose',
  'en:eggs': 'egg',
  'en:fish': 'fish',
  'en:crustaceans': 'shellfish',
  'en:nuts': 'nuts',
  'en:peanuts': 'peanut',
  'en:soybeans': 'soy',
  'en:sesame-seeds': 'sesame',
  'en:celery': 'celery',
  'en:mustard': 'mustard',
  'en:sulphur-dioxide-and-sulphites': 'sulphites',
  'en:lupin': 'lupin',
  'en:molluscs': 'mollusc',
}

interface OffNutriments {
  'energy-kcal_100g'?: number
  proteins_100g?: number
  carbohydrates_100g?: number
  fat_100g?: number
  fiber_100g?: number
}

interface OffJsonProduct {
  code?: string
  product_name?: string
  product_name_es?: string
  product_name_en?: string
  nutriments?: OffNutriments
  allergens_tags?: string[]
  brands?: string
  serving_quantity?: number
  serving_quantity_unit?: string
}

interface OffJson {
  status?: number
  product?: OffJsonProduct
}

function num(v: number | undefined): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

function trimmedOrNull(v: string | undefined): string | null {
  const t = v?.trim()
  return t ? t : null
}

// Descarga y normaliza un producto de OFF. `null` significa "OFF no tiene
// datos utilizables" (código desconocido, HTTP no-ok, o sin ningún nombre);
// una OffError significa "no se pudo ni preguntar" (red, JSON inválido).
export async function fetchOffProduct(barcode: string, fetchImpl: typeof fetch = fetch): Promise<OffProduct | null> {
  const url = `${OFF_URL}/${encodeURIComponent(barcode)}.json?fields=${FIELDS}`
  let res: Response
  try {
    res = await fetchImpl(url, {
      headers: { 'user-agent': USER_AGENT },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (err) {
    throw new OffError('network', `No se pudo contactar con Open Food Facts: ${String(err)}`)
  }
  if (!res.ok) return null

  let json: OffJson
  try {
    json = (await res.json()) as OffJson
  } catch (err) {
    throw new OffError('invalid', `Respuesta de Open Food Facts no es JSON válido: ${String(err)}`)
  }

  if (json.status !== 1 || !json.product) return null
  const p = json.product
  const nameEs = trimmedOrNull(p.product_name_es)
  const nameEn = trimmedOrNull(p.product_name_en)
  // Nombre genérico: se usa cuando falta el de un idioma concreto. Orden:
  // español, luego el genérico de OFF, luego el inglés.
  const name = nameEs ?? trimmedOrNull(p.product_name) ?? nameEn
  if (!name) return null

  const n = p.nutriments ?? {}
  // serving_quantity solo tiene sentido como gramos-por-unidad cuando la
  // unidad declarada es 'g' (si viniera en 'ml' u otra cosa, no es una
  // cantidad de la unidad por defecto 'g' de createFood).
  const gramsPerUnit = p.serving_quantity_unit === 'g' ? num(p.serving_quantity) : null
  // Volcamos la marca (lista separada por comas) como aliases: así "Danone"
  // o "Hacendado" son buscables aunque no aparezcan en el nombre del producto.
  const aliases = (p.brands ?? '')
    .split(',')
    .map((b) => b.trim())
    .filter((b) => b.length > 0)

  return {
    code: p.code ?? barcode,
    name,
    nameEs,
    nameEn,
    kcal100g: num(n['energy-kcal_100g']),
    protein100g: num(n.proteins_100g),
    carbs100g: num(n.carbohydrates_100g),
    fat100g: num(n.fat_100g),
    fiber100g: num(n.fiber_100g),
    allergens: (p.allergens_tags ?? []).map((t) => ALLERGEN_MAP[t]).filter((a): a is Allergen => a !== undefined),
    aliases,
    gramsPerUnit,
  }
}

// Convierte un OffProduct ya resuelto en el FoodInput que consume
// lib/services/foods.ts::createFood. No valida (eso lo hace FoodInputSchema
// en el servicio); solo traduce forma.
export function offToFoodInput(p: OffProduct): FoodInput {
  return {
    nameEs: p.nameEs ?? p.name,
    nameEn: p.nameEn ?? p.name,
    aliases: p.aliases,
    defaultUnit: 'g',
    kcal100g: p.kcal100g,
    protein100g: p.protein100g,
    carbs100g: p.carbs100g,
    fat100g: p.fat100g,
    fiber100g: p.fiber100g,
    barcode: p.code,
    allergens: p.allergens,
    gramsPerUnit: p.gramsPerUnit,
    seasonalMonths: [],
  }
}
