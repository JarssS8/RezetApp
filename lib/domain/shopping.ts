import { formatQuantity, normalizeSearchName, toDisplayUnit } from './quantities'
import { scaleRecipe } from './scaling'
import type { BaseUnit, PantryItem, PlannedEntry, ShoppingLine } from './types'

type Bucket = { foodId: string | null; name: string; quantity: number | null; unit: BaseUnit | null; unresolved: boolean }

function keyOf(foodId: string | null, name: string, unit: BaseUnit | null): string {
  return `${foodId ?? `name:${normalizeSearchName(name)}`}|${unit ?? '-'}`
}

// Recorre el plan, escala, agrupa por alimento y unidad base, resta despensa, descarta ≤ 0 (docs/03 §7)
export function consolidateNeeds(entries: PlannedEntry[], pantry: PantryItem[]): ShoppingLine[] {
  const buckets = new Map<string, Bucket>()
  for (const e of entries) {
    if (e.leftoverOfEntryId !== null || e.cookedAt !== null || e.skippedAt !== null) continue
    const scaled = scaleRecipe(e.recipe, e.servings)
    for (const i of scaled.ingredients) {
      const src = e.recipe.ingredients.find((x) => x.id === i.id)
      const name = src?.foodName ?? i.rawText
      const hasBase = i.quantity !== null && i.unit !== null
      const key = keyOf(i.foodId, name, hasBase ? i.unit : null)
      const b = buckets.get(key) ?? { foodId: i.foodId, name, quantity: hasBase ? 0 : null, unit: hasBase ? i.unit : null, unresolved: i.foodId === null }
      if (hasBase && b.quantity !== null && i.quantity !== null) b.quantity += i.quantity
      buckets.set(key, b)
    }
  }
  const pantryByFood = new Map<string, number>()
  for (const p of pantry) pantryByFood.set(`${p.foodId}|${p.unit}`, (pantryByFood.get(`${p.foodId}|${p.unit}`) ?? 0) + p.quantity)
  const out: ShoppingLine[] = []
  for (const b of buckets.values()) {
    if (b.quantity !== null && b.unit !== null) {
      const have = b.foodId ? (pantryByFood.get(`${b.foodId}|${b.unit}`) ?? 0) : 0
      const needed = b.quantity - have
      if (needed <= 0) continue
      out.push({ foodId: b.foodId, name: b.name, quantity: needed, unit: b.unit, unresolved: b.unresolved })
    } else {
      out.push({ foodId: b.foodId, name: b.name, quantity: null, unit: null, unresolved: b.unresolved })
    }
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
