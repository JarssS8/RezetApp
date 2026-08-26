import fs from 'node:fs'
import path from 'node:path'

// Construye db/seed/foods.json a partir de las descargas de USDA FoodData Central (Foundation + SR Legacy)
// y de db/seed/foods-translations.json (mantenido a mano). Uso: pnpm tsx scripts/build-foods-seed.ts --input ./data/usda

type UsdaNutrient = { nutrient: { id: number }; amount?: number }
type UsdaFood = { fdcId: number; description: string; foodNutrients: UsdaNutrient[]; dataType: string }
// excludeIds: ids de USDA que no entran en el seed porque comparten nombre en
// español con otra fila (los imprime este mismo script al deduplicar).
type Keywords = { exclude: string[]; keywords: string[]; excludeIds?: string[] }
export type Translation = {
  nameEs: string; aliases: string[]; gramsPerCup: number | null; gramsPerTbsp: number | null; gramsPerUnit: number | null
  densityGPerMl: number | null; allergens: string[]; seasonalMonths: number[]
}
export type FoodSeed = Translation & {
  sourceRef: string; nameEn: string; defaultUnit: 'g' | 'ml' | 'ud'
  kcal100g: number | null; protein100g: number | null; carbs100g: number | null; fat100g: number | null; fiber100g: number | null
  isEstimated: boolean
}

// 1008 = Energy (Atwater general factors), como en casi todos los SR Legacy.
// 2047/2048 = Energy (Atwater general/specific), usadas por algunas entradas
// de Foundation Foods en vez de 1008. 1004 = Total lipid (fat); 1085 = Total
// fat (NLEA), usada por algunas entradas de Foundation en vez de 1004.
// 1005 = Carbohydrate, by difference. NUNCA se usa 1063 (Sugars, total) como
// sustituto de 1005 para estimar kcal: azúcares totales no es lo mismo que
// carbohidratos totales (falta el almidón/fibra), y usarlo como proxy
// infraestima mucho verduras y frutas con fibra/almidón (p. ej. puerro,
// chalota, mora).
const NUTRIENT = {
  kcal: [1008, 2047, 2048],
  protein: [1003],
  carbs: [1005],
  fat: [1004, 1085],
  fiber: [1079],
} as const

// Coincidencia por palabra completa: evita falsos positivos tipo "beerwurst"
// (contiene "beer"), "watermelon"/"watercress" (contienen "water"). "milk" y
// "oil" van aparte (MILK_HINTS/OIL_HINT): en mitad de una descripción suelen
// ser solo un ingrediente ("Cheese, ricotta, whole milk", "Seeds, ..., oil
// roasted"), no el propio alimento.
const LIQUID_HINTS: RegExp[] = [
  /\bjuice\b/, /\bnectar\b/, /\bbroth\b/, /\bstock\b/, /\bvinegar\b/, /\bwine\b/,
  /^beer\b/, /\bcoffee\b/, /\btea\b/, /\bwater\b/, /\bcream, fluid\b/, /\bbeverages\b/, /\bsoy sauce\b/,
  /\bsyrups?\b/, /\balcoholic beverage\b/,
]

// "leche"/"nata de coco" solo cuando son el propio alimento (empieza por
// "milk"/"soymilk"/"oat milk", o es la leche/crema de coco expresada), nunca
// cuando aparecen como ingrediente de otra cosa ("Yogurt, ..., whole milk",
// "Cheese, feta, whole milk").
const MILK_HINTS: RegExp[] = [/^milk\b/, /^soymilk\b/, /^oat milk\b/, /\bcoconut milk\b/, /\bcoconut cream\b/, /^beverages, [a-z]+ milk\b/]

// El aceite como alimento en sí siempre empieza la descripción ("Oil, olive,
// ..."); en mitad de la frase es un ingrediente o método de preparación
// ("Margarine-like, vegetable oil spread", "Seeds, ..., oil roasted").
const OIL_HINT = /^oil\b/

// Densidad por palabra clave de la descripción (g/ml); 1.0 por defecto para
// líquidos no reconocidos en la tabla.
// Miel no está en esta tabla a propósito: se pesa (defaultUnit 'g'), no
// entra nunca por LIQUID_HINTS, así que una fila aquí sería inalcanzable.
const DENSITY_TABLE: [RegExp, number][] = [
  [OIL_HINT, 0.91],
  [/\bsyrups?\b/, 1.33],
  [/\bsoy sauce\b/, 1.18],
  [/\bvinegar\b/, 1.01],
  [/\b(milk|soymilk|coconut cream)\b/, 1.03],
  [/\bcream\b/, 1.0],
  [/\b(juice|nectar)\b/, 1.04],
  // "wine" antes que "alcoholic beverage": una entrada como "Alcoholic
  // Beverage, wine, table, red" no es un destilado (0.94) sino un vino (0.99).
  [/\bwine\b/, 0.99],
  [/\balcoholic beverage\b/, 0.94],
  [/\b(water|broth|stock)\b/, 1.0],
]

// Formas secas de un alimento que en líquido se mediría en mililitros: un caldo
// en polvo, una pastilla o un café instantáneo se pesan (o se cuentan), no se
// vierten. Sin esto, "Soup, chicken broth or bouillon, dry" entraba por
// \bbroth\b como si fuera caldo líquido.
const DRY_FORM = /\b(dry|dried|powder|powdered|granules?|bouillon|instant|mix)\b/
// Dentro de las formas secas, las que vienen en piezas contables (pastillas)
const PIECE_FORM = /\bcubes?\b/

// Frases que indican que el líquido nombrado es solo el medio de conservación
// de un alimento sólido (fruta o pescado en conserva), no el alimento en sí:
// "Peaches, canned, heavy syrup, drained" no es un líquido, es fruta.
const PACKING_MEDIUM = /\b(canned in|syrup pack|juice pack|water pack|heavy syrup|light syrup)\b/

// Boilerplate de USDA que no aporta nada a un nombre de alimento en español ni
// falta en inglés: notas de programas de distribución, poblaciones de estudio, etc.
const BOILERPLATE_PARENS = [
  /\s*\(includes foods for usda'?s food distribution program\)/i,
  /\s*\(alaska native\)/i,
  /\s*\(northern plains indians\)/i,
]

function cleanNameEn(description: string): string {
  let s = description
  for (const re of BOILERPLATE_PARENS) s = s.replace(re, '')
  return s.trim()
}

function nutrient(f: UsdaFood, ids: readonly number[]): number | null {
  for (const id of ids) {
    const n = f.foodNutrients.find((x) => x.nutrient.id === id)
    if (n?.amount !== undefined) return n.amount
  }
  return null
}

function kcalOf(f: UsdaFood): number | null {
  return nutrient(f, NUTRIENT.kcal)
}

// Solo se puede derivar kcal por Atwater con confianza cuando los tres
// macronutrientes principales están publicados (nunca se rellena con 0 lo
// que falta: para un aceite sin proteína/carbohidratos reportados, asumir 0
// no es más honesto que no calcular nada).
function hasFullMacros(f: UsdaFood): boolean {
  return nutrient(f, NUTRIENT.protein) !== null && nutrient(f, NUTRIENT.carbs) !== null && nutrient(f, NUTRIENT.fat) !== null
}

function hasReliableEnergy(f: UsdaFood): boolean {
  return kcalOf(f) !== null || hasFullMacros(f)
}

function isLiquid(description: string): boolean {
  const d = description.toLowerCase()
  if (PACKING_MEDIUM.test(d)) return false
  // "prepared with water" sí es líquido aunque parta de un preparado seco
  if (DRY_FORM.test(d) && !/\bprepared\b/.test(d)) return false
  // "Gelatin desserts, dry mix, prepared with water" es un postre gelificado,
  // no agua: el agua es solo un paso de preparación.
  if (/\bgelatin\b/.test(d)) return false
  return OIL_HINT.test(d) || MILK_HINTS.some((r) => r.test(d)) || LIQUID_HINTS.some((r) => r.test(d))
}

// g por defecto; ml para líquidos; ud para lo que viene en piezas contables
function defaultUnitFor(description: string): 'g' | 'ml' | 'ud' {
  const d = description.toLowerCase()
  if (DRY_FORM.test(d) && PIECE_FORM.test(d)) return 'ud'
  return isLiquid(description) ? 'ml' : 'g'
}

function densityFor(description: string): number {
  const d = description.toLowerCase()
  for (const [re, val] of DENSITY_TABLE) if (re.test(d)) return val
  return 1.0
}

// Coincidencia de exclusión por palabra completa (evita que "restaurant" excluya
// de paso algo que solo contiene esa palabra como parte de otra, aunque en la
// práctica coincide con `includes` para frases; se deja explícito para revisión).
function excludeMatches(description: string, exclude: string[]): boolean {
  const d = description.toLowerCase()
  return exclude.some((e) => new RegExp(`\\b${e}\\b`).test(d))
}

// Alimentos concretos que se quieren conservar aunque coincidan con una
// exclusión (p. ej. el único "ketchup" de USDA es "Ketchup, restaurant").
const FORCE_INCLUDE: RegExp[] = [/^ketchup,\s*restaurant\b/]

export function selectFoods(all: UsdaFood[], kw: Keywords, maxPerKeyword = 3): { keyword: string; food: UsdaFood }[] {
  const out: { keyword: string; food: UsdaFood }[] = []
  const taken = new Set<number>()
  const seenDescriptions = new Set<string>()
  for (const keyword of kw.keywords) {
    const candidates = all
      .filter((f) => {
        const d = f.description.toLowerCase()
        // Coincidencia de prefijo con límite de palabra: "butter" no debe
        // enganchar "Butterbur"/"Buttermilk", ni "beer" enganchar "Beerwurst".
        const matchesKeyword = d.startsWith(keyword) && (d.length === keyword.length || !/[a-z]/.test(d[keyword.length] ?? ''))
        const forced = FORCE_INCLUDE.some((r) => r.test(d))
        return matchesKeyword && (forced || !excludeMatches(d, kw.exclude)) && !taken.has(f.fdcId)
      })
      // Preferir crudo, luego energía fiable (directa o macros completos),
      // luego Foundation sobre SR Legacy; a igualdad, se respeta el orden de
      // aparición en las descargas de USDA (Array.sort es estable).
      .sort((a, b) => {
        const rawA = /\braw\b/.test(a.description.toLowerCase()) ? 0 : 1
        const rawB = /\braw\b/.test(b.description.toLowerCase()) ? 0 : 1
        if (rawA !== rawB) return rawA - rawB
        const energyA = hasReliableEnergy(a) ? 0 : 1
        const energyB = hasReliableEnergy(b) ? 0 : 1
        if (energyA !== energyB) return energyA - energyB
        if (a.dataType !== b.dataType) return a.dataType === 'Foundation' ? -1 : 1
        return 0
      })
      // Descarta duplicados exactos de descripción dentro del mismo grupo
      // (USDA a veces publica el mismo alimento dos veces con fdcId distinto,
      // p. ej. "Pears, raw, bartlett" con y sin boilerplate). Va DESPUÉS del
      // sort a propósito: si dos fdcId comparten nombre pero uno tiene datos
      // mejores (energía real vs. ninguna, como pasa con dos "Oil, canola"
      // — uno de Foundation sin macros y otro de SR Legacy completo), gana
      // el que el sort ya puso primero, no el que aparece antes en el fichero.
      .filter((f) => {
        const key = `${keyword}::${cleanNameEn(f.description).toLowerCase()}`
        if (seenDescriptions.has(key)) return false
        seenDescriptions.add(key)
        return true
      })
      .slice(0, maxPerKeyword)
    for (const food of candidates) {
      taken.add(food.fdcId)
      out.push({ keyword, food })
    }
  }
  // Si, dentro de la misma palabra clave, algún seleccionado no tiene energía
  // fiable pero otro sí, el primero se descarta: es mejor tener menos
  // alimentos con datos reales que rellenar el hueco con un duplicado que no
  // se puede calcular sin inventar el dato que falta.
  const byKeyword = new Map<string, { keyword: string; food: UsdaFood }[]>()
  for (const item of out) {
    const list = byKeyword.get(item.keyword) ?? []
    list.push(item)
    byKeyword.set(item.keyword, list)
  }
  const result: { keyword: string; food: UsdaFood }[] = []
  for (const item of out) {
    const siblings = byKeyword.get(item.keyword) ?? []
    const hasReliableSibling = siblings.some((s) => hasReliableEnergy(s.food))
    if (!hasReliableEnergy(item.food) && hasReliableSibling) continue
    result.push(item)
  }
  return result
}

export function toSeed(food: UsdaFood, keyword: string, tr: Translation | undefined): FoodSeed {
  const defaultUnit = defaultUnitFor(food.description)
  const liquid = defaultUnit === 'ml'
  const protein = nutrient(food, NUTRIENT.protein)
  const carbs = nutrient(food, NUTRIENT.carbs)
  const fat = nutrient(food, NUTRIENT.fat)
  const fiber = nutrient(food, NUTRIENT.fiber)
  let kcal = kcalOf(food)
  let isEstimated = false
  // Sin energía directa (1008/2047/2048): solo se deriva por Atwater cuando
  // los tres macronutrientes principales están publicados (nunca con 1063
  // como sustituto de los carbohidratos, ver NUTRIENT). Si faltan y esta fila
  // no tiene ya un hermano fiable (selectFoods la habría descartado si lo
  // tuviera), se guarda con kcal null: un "no lo sé" honesto es mejor que un
  // número inventado.
  if (kcal === null) {
    if (protein !== null && carbs !== null && fat !== null) kcal = 4 * protein + 4 * carbs + 9 * fat
    isEstimated = true
  }
  return {
    sourceRef: String(food.fdcId),
    nameEn: cleanNameEn(food.description),
    nameEs: tr?.nameEs ?? food.description, // sin traducción aún: se ve el inglés y se marca en README
    aliases: tr?.aliases ?? [],
    defaultUnit,
    kcal100g: kcal,
    protein100g: protein,
    carbs100g: carbs,
    fat100g: fat,
    fiber100g: fiber,
    isEstimated,
    gramsPerCup: tr?.gramsPerCup ?? null,
    gramsPerTbsp: tr?.gramsPerTbsp ?? null,
    gramsPerUnit: tr?.gramsPerUnit ?? null,
    densityGPerMl: tr?.densityGPerMl ?? (liquid ? densityFor(food.description) : null),
    allergens: tr?.allergens ?? [],
    seasonalMonths: tr?.seasonalMonths ?? [],
  }
}

// Un nombre en español = un alimento. USDA publica variantes que en una cocina
// son el mismo ingrediente (cultivares de manzana, "with/without salt",
// enriquecido o no, grados de la carne): se queda UNA por nombre, la más
// genérica, y se descartan las demás. Criterio, en orden:
//   1. la que USDA marca como "all commercial varieties";
//   2. la que no lleva sal añadida ("with salt" describe una variante, no el alimento);
//   3. la que tiene los tres macronutrientes publicados;
//   4. la descripción más corta (menos calificativos = más genérica);
//   5. a igualdad, la primera (el orden de selectFoods ya es determinista).
export function dedupeByNameEs(seed: FoodSeed[]): FoodSeed[] {
  const rank = (f: FoodSeed): [number, number, number, number] => {
    const d = f.nameEn.toLowerCase()
    return [
      /all commercial varieties/.test(d) ? 0 : 1,
      /\bwith salt\b/.test(d) ? 1 : 0,
      f.protein100g !== null && f.carbs100g !== null && f.fat100g !== null ? 0 : 1,
      d.length,
    ]
  }
  const best = new Map<string, FoodSeed>()
  for (const f of seed) {
    const current = best.get(f.nameEs)
    if (!current) {
      best.set(f.nameEs, f)
      continue
    }
    if (isBetter(rank(f), rank(current))) best.set(f.nameEs, f)
  }
  // Se conserva el orden original del seed, no el de inserción en el Map
  const kept = new Set([...best.values()].map((f) => f.sourceRef))
  return seed.filter((f) => kept.has(f.sourceRef))
}

function isBetter(a: [number, number, number, number], b: [number, number, number, number]): boolean {
  for (let i = 0; i < a.length; i += 1) {
    const [x, y] = [a[i] ?? 0, b[i] ?? 0]
    if (x !== y) return x < y
  }
  return false
}

// Contrato del seed: dos alimentos no pueden compartir nameEs (la interfaz y el
// resolutor de ingredientes los distinguen por ese nombre).
export function assertUniqueNames(seed: FoodSeed[]): void {
  const seen = new Map<string, string>()
  for (const f of seed) {
    const previous = seen.get(f.nameEs)
    if (previous) throw new Error(`nameEs duplicado: "${f.nameEs}" (${previous} y ${f.sourceRef})`)
    seen.set(f.nameEs, f.sourceRef)
  }
}

function readUsda(dir: string): UsdaFood[] {
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'))
  const all: UsdaFood[] = []
  for (const file of files) {
    const json = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')) as Record<string, UsdaFood[]>
    // Algunas descargas de USDA traen huecos `null` en el array (registros retirados): se descartan.
    for (const list of Object.values(json)) if (Array.isArray(list)) all.push(...list.filter((f): f is UsdaFood => f != null))
  }
  return all
}

if (process.argv[1]?.endsWith('build-foods-seed.ts')) {
  const idx = process.argv.indexOf('--input')
  const input = idx >= 0 ? process.argv[idx + 1] : './data/usda'
  if (!input) throw new Error('Falta --input')
  const seedDir = path.join(process.cwd(), 'db', 'seed')
  const kw = JSON.parse(fs.readFileSync(path.join(seedDir, 'foods-keywords.json'), 'utf8')) as Keywords
  const translations = JSON.parse(fs.readFileSync(path.join(seedDir, 'foods-translations.json'), 'utf8')) as Record<string, Translation>
  const selected = selectFoods(readUsda(input), kw)
  // excludeIds se aplica DESPUÉS de la selección a propósito: quitar un id antes
  // liberaría un hueco del tope de 3 por palabra clave y metería un alimento
  // nuevo, cambiando el seed por un motivo que nada tiene que ver.
  const excluded = new Set(kw.excludeIds ?? [])
  const all = selected.filter(({ food }) => !excluded.has(String(food.fdcId))).map(({ keyword, food }) => toSeed(food, keyword, translations[String(food.fdcId)]))
  const seed = dedupeByNameEs(all)
  assertUniqueNames(seed)
  fs.writeFileSync(path.join(seedDir, 'foods.json'), JSON.stringify(seed, null, 2) + '\n')
  // El fichero de traducciones solo guarda entradas de filas que existen
  const kept = new Set(seed.map((f) => f.sourceRef))
  const pruned = Object.fromEntries(Object.entries(translations).filter(([id]) => kept.has(id)))
  fs.writeFileSync(path.join(seedDir, 'foods-translations.json'), JSON.stringify(pruned, null, 2) + '\n')
  const untranslated = seed.filter((s) => !translations[s.sourceRef]).length
  const dropped = all.filter((f) => !kept.has(f.sourceRef))
  console.log(`foods.json: ${seed.length} alimentos, ${untranslated} sin traducción, ${Object.keys(translations).length - Object.keys(pruned).length} traducciones podadas`)
  if (dropped.length) {
    // Sin apuntarlos en excludeIds, la próxima ejecución los volvería a meter
    // con el nombre en inglés (su traducción se acaba de podar) y el seed
    // dejaría de ser reproducible.
    console.log(`Añade estos ${dropped.length} ids a "excludeIds" de foods-keywords.json (mismo nombre en español que otra fila):`)
    console.log(JSON.stringify(dropped.map((f) => f.sourceRef)))
    for (const f of dropped) console.log(`  ${f.sourceRef}  ${f.nameEs}  ←  ${f.nameEn}`)
  }
}
