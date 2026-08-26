import fs from 'node:fs'
import path from 'node:path'

// Construye db/seed/foods.json a partir de las descargas de USDA FoodData Central (Foundation + SR Legacy)
// y de db/seed/foods-translations.json (mantenido a mano). Uso: pnpm tsx scripts/build-foods-seed.ts --input ./data/usda

type UsdaNutrient = { nutrient: { id: number }; amount?: number }
type UsdaFood = { fdcId: number; description: string; foodNutrients: UsdaNutrient[]; dataType: string }
type Keywords = { exclude: string[]; keywords: string[] }
export type Translation = {
  nameEs: string; aliases: string[]; gramsPerCup: number | null; gramsPerTbsp: number | null; gramsPerUnit: number | null
  densityGPerMl: number | null; allergens: string[]; seasonalMonths: number[]
}
export type FoodSeed = Translation & {
  sourceRef: string; nameEn: string; defaultUnit: 'g' | 'ml' | 'ud'
  kcal100g: number | null; protein100g: number | null; carbs100g: number | null; fat100g: number | null; fiber100g: number | null
}

const NUTRIENT = { kcal: 1008, protein: 1003, carbs: 1005, fat: 1004, fiber: 1079 } as const
const LIQUID_HINTS = ['milk', 'juice', 'oil', 'broth', 'stock', 'vinegar', 'wine', 'beer', 'coffee', 'tea', 'water', 'cream, fluid', 'beverages', 'soy sauce', 'syrup']

function nutrient(f: UsdaFood, id: number): number | null {
  const n = f.foodNutrients.find((x) => x.nutrient.id === id)
  return n?.amount ?? null
}

export function selectFoods(all: UsdaFood[], kw: Keywords, maxPerKeyword = 3): { keyword: string; food: UsdaFood }[] {
  const out: { keyword: string; food: UsdaFood }[] = []
  const taken = new Set<number>()
  for (const keyword of kw.keywords) {
    const candidates = all
      .filter((f) => {
        const d = f.description.toLowerCase()
        return d.startsWith(keyword) && !kw.exclude.some((e) => d.includes(e)) && !taken.has(f.fdcId)
      })
      // Preferir crudo, luego Foundation sobre SR Legacy; a igualdad, se respeta
      // el orden de aparición en las descargas de USDA (Array.sort es estable).
      .sort((a, b) => {
        const rawA = a.description.toLowerCase().includes('raw') ? 0 : 1
        const rawB = b.description.toLowerCase().includes('raw') ? 0 : 1
        if (rawA !== rawB) return rawA - rawB
        if (a.dataType !== b.dataType) return a.dataType === 'Foundation' ? -1 : 1
        return 0
      })
      .slice(0, maxPerKeyword)
    for (const food of candidates) {
      taken.add(food.fdcId)
      out.push({ keyword, food })
    }
  }
  return out
}

export function toSeed(food: UsdaFood, keyword: string, tr: Translation | undefined): FoodSeed {
  const liquid = LIQUID_HINTS.some((h) => keyword.startsWith(h))
  return {
    sourceRef: String(food.fdcId),
    nameEn: food.description,
    nameEs: tr?.nameEs ?? food.description, // sin traducción aún: se ve el inglés y se marca en README
    aliases: tr?.aliases ?? [],
    defaultUnit: liquid ? 'ml' : 'g',
    kcal100g: nutrient(food, NUTRIENT.kcal),
    protein100g: nutrient(food, NUTRIENT.protein),
    carbs100g: nutrient(food, NUTRIENT.carbs),
    fat100g: nutrient(food, NUTRIENT.fat),
    fiber100g: nutrient(food, NUTRIENT.fiber),
    gramsPerCup: tr?.gramsPerCup ?? null,
    gramsPerTbsp: tr?.gramsPerTbsp ?? null,
    gramsPerUnit: tr?.gramsPerUnit ?? null,
    densityGPerMl: tr?.densityGPerMl ?? (liquid ? 1 : null),
    allergens: tr?.allergens ?? [],
    seasonalMonths: tr?.seasonalMonths ?? [],
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
  const seed = selected.map(({ keyword, food }) => toSeed(food, keyword, translations[String(food.fdcId)]))
  fs.writeFileSync(path.join(seedDir, 'foods.json'), JSON.stringify(seed, null, 2) + '\n')
  const untranslated = seed.filter((s) => !translations[s.sourceRef]).length
  console.log(`foods.json: ${seed.length} alimentos, ${untranslated} sin traducción`)
}
