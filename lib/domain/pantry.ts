import { convertBase } from './shopping'
import type { Allocation, EntryStatus, Need, PantryItem } from './types'

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

export function expiringSoon(items: PantryItem[], today: Date, days: number): PantryItem[] {
  const limit = today.getTime() + days * DAY_MS
  return items.filter((i) => i.expiresAt !== null && i.expiresAt.getTime() <= limit).sort(fifo)
}

export function entryStatus(e: { cookedAt: Date | null; skippedAt: Date | null }): EntryStatus {
  if (e.cookedAt) return 'cooked'
  if (e.skippedAt) return 'skipped'
  return 'planned'
}
