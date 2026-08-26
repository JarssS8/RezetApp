import type { Allocation, EntryStatus, Need, PantryItem } from './types'

const DAY_MS = 86_400_000

function fifo(a: PantryItem, b: PantryItem): number {
  if (a.expiresAt && b.expiresAt) return a.expiresAt.getTime() - b.expiresAt.getTime()
  if (a.expiresAt) return -1
  if (b.expiresAt) return 1
  return a.addedAt.getTime() - b.addedAt.getTime()
}

// Reparte cada necesidad entre los ítems del mismo alimento y unidad, gastando primero lo que caduca antes.
// Puro: el servicio aplica las allocations con UPDATE atómico y decide los avisos reales a partir del RETURNING.
export function allocateDeductions(items: PantryItem[], needs: Need[]): { allocations: Allocation[]; unmatched: Need[] } {
  const remaining = new Map(items.map((i) => [i.id, i.quantity]))
  const allocations: Allocation[] = []
  const unmatched: Need[] = []
  for (const need of needs) {
    let left = need.quantity
    const candidates = items.filter((i) => i.foodId === need.foodId && i.unit === need.unit).sort(fifo)
    for (const c of candidates) {
      if (left <= 0) break
      const avail = remaining.get(c.id) ?? 0
      if (avail <= 0) continue
      const take = Math.min(avail, left)
      allocations.push({ pantryItemId: c.id, foodId: need.foodId, quantity: take })
      remaining.set(c.id, avail - take)
      left -= take
    }
    if (left > 0) unmatched.push({ foodId: need.foodId, quantity: left, unit: need.unit })
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
