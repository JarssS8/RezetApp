import { convertBase } from './shopping'
import type { Allocation, BaseUnit, EntryStatus, FoodConversion, Need, PantryItem } from './types'

const DAY_MS = 86_400_000
// Tolerancia de coma flotante: 250 g repartidos entre dos artículos pueden dejar
// un residuo de 1e-13 que, sin este umbral, saldría como aviso de faltante.
const EPSILON = 1e-6

function fifo(a: PantryItem, b: PantryItem): number {
  if (a.expiresAt && b.expiresAt) return a.expiresAt.getTime() - b.expiresAt.getTime()
  if (a.expiresAt) return -1
  if (b.expiresAt) return 1
  return a.addedAt.getTime() - b.addedAt.getTime()
}

// Reparte cada necesidad entre los artículos del mismo alimento, gastando primero
// lo que caduca antes (FIFO por expires_at, nulos al final, luego added_at).
//
// La unidad del artículo NO tiene por qué ser la de la necesidad: se convierte con
// FoodConversion del propio artículo (misma regla que consolidateNeeds, W1-R17).
// Si falta el dato para convertir (sin densidad ni gramos por pieza), ese artículo
// se salta entero en vez de inventar una equivalencia.
//
// Unidades del resultado: Allocation.quantity va en la unidad del ARTÍCULO (es lo
// que el servicio resta con UPDATE), y unmatched[n].quantity en la de la NECESIDAD.
// Puro: no escribe; los avisos reales salen del RETURNING del servicio (§9.5).
export function allocateDeductions(items: PantryItem[], needs: Need[]): { allocations: Allocation[]; unmatched: Need[] } {
  const remaining = new Map(items.map((i) => [i.id, i.quantity]))
  const allocations: Allocation[] = []
  const unmatched: Need[] = []
  for (const need of needs) {
    let left = need.quantity
    const candidates = items.filter((i) => i.foodId === need.foodId).sort(fifo)
    for (const c of candidates) {
      if (left <= EPSILON) break
      const avail = remaining.get(c.id) ?? 0
      if (avail <= 0) continue
      const availInNeedUnit = convertBase(avail, c.unit, need.unit, c.conversion)
      if (availInNeedUnit === null) continue
      const takeInNeedUnit = Math.min(availInNeedUnit, left)
      const takeInItemUnit = convertBase(takeInNeedUnit, need.unit, c.unit, c.conversion)
      if (takeInItemUnit === null) continue
      allocations.push({ pantryItemId: c.id, foodId: need.foodId, quantity: takeInItemUnit })
      remaining.set(c.id, avail - takeInItemUnit)
      left -= takeInNeedUnit
    }
    if (left > EPSILON) unmatched.push({ foodId: need.foodId, quantity: left, unit: need.unit })
  }
  return { allocations, unmatched }
}

// Una línea de ingrediente ya escalado, aún sin agregar por alimento (para logCooked, §9.5).
export interface NeedInput {
  foodId: string
  quantity: number
  unit: BaseUnit
  conversion: FoodConversion | null
}

// Agrega líneas de ingrediente ya escaladas en necesidades por alimento: dos
// líneas del mismo alimento en la misma unidad -o convertible entre sí, regla
// W1-R17- se funden en una sola Need, igual que hace consolidateNeeds con el
// plan semanal. A diferencia de consolidateNeeds, aquí no se resta despensa:
// solo se agrupa lo que la receta ya escalada pide.
export function aggregateNeeds(lines: NeedInput[]): Need[] {
  const buckets = new Map<string, { foodId: string; quantity: number; unit: BaseUnit; conversion: FoodConversion | null }>()
  // Primer bucket de cada alimento: fija la unidad en la que se acumula esa necesidad.
  const primary = new Map<string, string>()
  for (const line of lines) {
    const first = buckets.get(primary.get(line.foodId) ?? '')
    const converted = first ? convertBase(line.quantity, line.unit, first.unit, first.conversion ?? line.conversion) : null
    if (first && converted !== null) {
      first.quantity += converted
      continue
    }
    const key = `${line.foodId}|${line.unit}`
    const bucket = buckets.get(key) ?? { foodId: line.foodId, quantity: 0, unit: line.unit, conversion: line.conversion }
    bucket.quantity += line.quantity
    buckets.set(key, bucket)
    if (!primary.has(line.foodId)) primary.set(line.foodId, key)
  }
  return Array.from(buckets.values()).map(({ foodId, quantity, unit }) => ({ foodId, quantity, unit }))
}

export function expiringSoon(items: PantryItem[], today: Date, days: number): PantryItem[] {
  const limit = today.getTime() + days * DAY_MS
  return items.filter((i) => i.expiresAt !== null && i.expiresAt.getTime() <= limit).sort(fifo)
}

export function entryStatus(e: { cookedAt: Date | null; skippedAt: Date | null }): EntryStatus {
  if (e.cookedAt) return 'cooked'
  if (e.skippedAt) return 'skipped'
  return 'planned'
}
