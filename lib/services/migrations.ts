// Migración desde Mealie y Tandoor (docs/07-ROADMAP.md fase 5, spec §17 W4(c)).
// Los dos formatos se traducen a RecipeInput dejando CADA INGREDIENTE COMO
// TEXTO CRUDO en rawText: el parser del repositorio (lib/domain) resuelve
// cantidad, unidad y alimento, igual que en la importación por texto.
// Reinterpretar aquí las cantidades de otra app sería duplicar el parser y
// heredar los errores del origen.
import { RecipeInputSchema, type RecipeInput } from '@/lib/validation/recipes'

type Json = Record<string, unknown>

function isObject(v: unknown): v is Json {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}
function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}
function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}
function names(v: unknown): string[] {
  return Array.isArray(v) ? v.map((t) => (isObject(t) ? str(t.name) : str(t))).filter((s) => s.length > 0) : []
}

// "PT1H30M" -> 90; "4 servings" -> 4. Duplicados a propósito (mínimos) en vez
// de importarlos de recipe-import.ts: ese fichero es del mismo elemento, pero
// mantener aquí las dos conversiones deja este mapeador legible de un vistazo.
function isoMinutes(v: unknown): number | null {
  const m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?$/i.exec(str(v))
  if (!m) return null
  const [, d, h, min] = m
  const total = Number(d ?? 0) * 1440 + Number(h ?? 0) * 60 + Number(min ?? 0)
  return total > 0 ? total : null
}
function firstNumber(v: unknown): number | null {
  const m = /\d+/.exec(str(v))
  return m ? Number(m[0]) : null
}

// Reconstruye la línea que un humano habría escrito: "1 cdta sal al gusto".
function ingredientLine(parts: { amount?: unknown; unit?: unknown; food?: unknown; note?: unknown; display?: unknown }): string {
  const display = str(parts.display)
  if (display) return display
  const amount = num(parts.amount)
  const unit = isObject(parts.unit) ? str(parts.unit.name) : str(parts.unit)
  const food = isObject(parts.food) ? str(parts.food.name) : str(parts.food)
  const note = str(parts.note)
  return [amount && amount > 0 ? String(amount) : '', unit, food, note].filter((s) => s.length > 0).join(' ')
}

export function mealieToRecipeInput(raw: unknown): RecipeInput | null {
  if (!isObject(raw)) return null
  const title = str(raw.name)
  const rawIngredients = Array.isArray(raw.recipeIngredient) ? raw.recipeIngredient : []
  const ingredients = rawIngredients
    .map((i) => (isObject(i) ? ingredientLine({ amount: i.quantity, unit: i.unit, food: i.food, note: i.note, display: i.display }) : str(i)))
    .filter((line) => line.length > 0)
    .map((rawText) => ({ rawText: rawText.slice(0, 200) }))
  const rawSteps = Array.isArray(raw.recipeInstructions) ? raw.recipeInstructions : []
  const steps = rawSteps
    .map((s) => (isObject(s) ? str(s.text) : str(s)))
    .filter((text) => text.length > 0)
    .map((text) => ({ text: text.slice(0, 2000) }))
  if (!title || ingredients.length === 0 || steps.length === 0) return null

  const sourceUrl = str(raw.orgURL)
  return RecipeInputSchema.parse({
    title: title.slice(0, 160),
    description: str(raw.description).slice(0, 2000) || null,
    servingsBase: firstNumber(raw.recipeYield) ?? 2,
    prepMinutes: isoMinutes(raw.prepTime),
    cookMinutes: isoMinutes(raw.performTime) ?? isoMinutes(raw.cookTime),
    ...(sourceUrl.startsWith('http') ? { sourceUrl } : {}),
    tags: names(raw.tags).slice(0, 20),
    imageUrls: [],
    ingredients,
    steps,
  })
}

export function tandoorToRecipeInput(raw: unknown): RecipeInput | null {
  if (!isObject(raw)) return null
  const title = str(raw.name)
  const rawSteps = Array.isArray(raw.steps) ? raw.steps : []
  const steps: { text: string }[] = []
  const ingredients: { rawText: string; stepIndex: number }[] = []
  for (const step of rawSteps) {
    if (!isObject(step)) continue
    const text = str(step.instruction)
    if (!text) continue
    const index = steps.length
    steps.push({ text: text.slice(0, 2000) })
    const list = Array.isArray(step.ingredients) ? step.ingredients : []
    for (const item of list) {
      if (!isObject(item)) continue
      const line = ingredientLine({ amount: item.amount, unit: item.unit, food: item.food, note: item.note })
      if (line) ingredients.push({ rawText: line.slice(0, 200), stepIndex: index })
    }
  }
  if (!title || steps.length === 0 || ingredients.length === 0) return null

  const sourceUrl = str(raw.source_url)
  const working = num(raw.working_time)
  const waiting = num(raw.waiting_time)
  return RecipeInputSchema.parse({
    title: title.slice(0, 160),
    description: str(raw.description).slice(0, 2000) || null,
    servingsBase: num(raw.servings) ?? 2,
    prepMinutes: working && working > 0 ? working : null,
    cookMinutes: waiting && waiting > 0 ? waiting : null,
    ...(sourceUrl.startsWith('http') ? { sourceUrl } : {}),
    tags: names(raw.keywords).slice(0, 20),
    imageUrls: [],
    ingredients,
    steps,
  })
}

export interface MigrationResult {
  recipes: RecipeInput[]
  skipped: { title: string; reason: string }[]
}

// Lo que no se puede migrar no se inventa: se apunta con su título para que el
// usuario sepa qué revisar a mano.
export function mapMigration(source: 'mealie' | 'tandoor', items: unknown[]): MigrationResult {
  const map = source === 'mealie' ? mealieToRecipeInput : tandoorToRecipeInput
  const recipes: RecipeInput[] = []
  const skipped: MigrationResult['skipped'] = []
  for (const item of items) {
    const mapped = map(item)
    if (mapped) recipes.push(mapped)
    else skipped.push({ title: (isObject(item) ? str(item.name) : '') || '(sin título)', reason: 'incomplete' })
  }
  return { recipes, skipped }
}
