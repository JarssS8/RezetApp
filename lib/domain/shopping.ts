import { formatQuantity, normalizeSearchName, toDisplayUnit } from './quantities'
import { scaleRecipe } from './scaling'
import type { BaseUnit, FoodConversion, PantryItem, PlannedEntry, ShoppingLine } from './types'

type Bucket = { foodId: string | null; name: string; quantity: number | null; unit: BaseUnit | null; unresolved: boolean; conversion: FoodConversion | null }

// Conversión entre unidades base del MISMO alimento. Devuelve null cuando falta
// el dato para hacerla (densidad o gramos por pieza): entonces no se mezclan dos
// líneas ni se resta despensa, en vez de inventar una equivalencia.
export function convertBase(qty: number, from: BaseUnit, to: BaseUnit, food: FoodConversion | null): number | null {
  if (from === to) return qty
  const grams = from === 'g' ? qty : from === 'ml' ? mul(qty, food?.densityGPerMl) : mul(qty, food?.gramsPerUnit)
  if (grams === null) return null
  if (to === 'g') return grams
  if (to === 'ml') return div(grams, food?.densityGPerMl)
  return div(grams, food?.gramsPerUnit)
}

function mul(qty: number, factor: number | null | undefined): number | null {
  return factor ? qty * factor : null
}

function div(qty: number, factor: number | null | undefined): number | null {
  return factor ? qty / factor : null
}

// Recorre el plan, escala, agrupa por alimento (convirtiendo entre unidades base
// cuando hace falta, regla W1-R17), resta despensa y descarta ≤ 0 (docs/03 §7)
export function consolidateNeeds(entries: PlannedEntry[], pantry: PantryItem[]): ShoppingLine[] {
  const buckets = new Map<string, Bucket>()
  // Primer bucket con cantidad de cada alimento: es el que fija la unidad de la línea
  const primary = new Map<string, string>()
  for (const e of entries) {
    if (e.leftoverOfEntryId !== null || e.cookedAt !== null || e.skippedAt !== null) continue
    const scaled = scaleRecipe(e.recipe, e.servings)
    for (const i of scaled.ingredients) {
      const src = e.recipe.ingredients.find((x) => x.id === i.id)
      const name = src?.foodName ?? i.rawText
      const conversion = src?.conversion ?? null
      const food = i.foodId ?? `name:${normalizeSearchName(name)}`
      const base = { foodId: i.foodId, name, unresolved: i.foodId === null, conversion }
      if (i.quantity === null || i.unit === null) {
        const key = `${food}|-`
        if (!buckets.has(key)) buckets.set(key, { ...base, quantity: null, unit: null })
        continue
      }
      // Misma unidad o convertible → suma en la línea que ya existe del alimento
      const first = buckets.get(primary.get(food) ?? '')
      const converted = first?.unit ? convertBase(i.quantity, i.unit, first.unit, first.conversion ?? conversion) : null
      if (first && converted !== null) {
        first.quantity = (first.quantity ?? 0) + converted
        continue
      }
      const key = `${food}|${i.unit}`
      const b = buckets.get(key) ?? { ...base, quantity: 0, unit: i.unit }
      b.quantity = (b.quantity ?? 0) + i.quantity
      buckets.set(key, b)
      if (!primary.has(food)) primary.set(food, key)
    }
  }
  const out: ShoppingLine[] = []
  for (const b of buckets.values()) {
    if (b.quantity === null || b.unit === null) {
      out.push({ foodId: b.foodId, name: b.name, quantity: null, unit: null, unresolved: b.unresolved, pantryUnmatched: false })
      continue
    }
    let have = 0
    let pantryUnmatched = false
    for (const p of pantry) {
      if (p.foodId !== b.foodId) continue
      const q = convertBase(p.quantity, p.unit, b.unit, p.conversion ?? b.conversion)
      if (q === null) pantryUnmatched = true
      else have += q
    }
    const needed = b.quantity - have
    if (needed <= 0) continue
    out.push({ foodId: b.foodId, name: b.name, quantity: needed, unit: b.unit, unresolved: b.unresolved, pantryUnmatched })
  }
  return out.sort((a, z) => a.name.localeCompare(z.name, 'es'))
}

// Contrato de ShopList (docs/06): quantity solo cuenta piezas; masa y volumen van en el nombre
export function toShopListItem(line: ShoppingLine): { name: string; quantity: number | null } {
  if (line.quantity === null || line.unit === null) return { name: line.name, quantity: null }
  if (line.unit === 'ud') return { name: line.name, quantity: Math.ceil(line.quantity) }
  const d = toDisplayUnit(line.quantity, line.unit, null, 'metric')
  return { name: `${line.name} · ${formatQuantity(d.quantity, d.unit, 'es')}`, quantity: null }
}
