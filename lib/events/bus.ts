// Bus en proceso: una sola instancia de la app (spec §14). Sin Redis.
export type HouseholdEvent =
  | { type: 'plan.changed'; payload: { dates: string[] } }
  | { type: 'pantry.changed'; payload: { foodIds: string[] } }
  | { type: 'recipe.changed'; payload: { recipeId: string } }
  | { type: 'proposal.created'; payload: { proposalId: string } }

type Listener = (e: HouseholdEvent) => void

const listeners = new Map<string, Set<Listener>>()

export function subscribeHousehold(householdId: string, listener: Listener): () => void {
  const set = listeners.get(householdId) ?? new Set<Listener>()
  set.add(listener)
  listeners.set(householdId, set)
  return () => {
    set.delete(listener)
    if (set.size === 0) listeners.delete(householdId)
  }
}

export function emitHouseholdEvent(householdId: string, event: HouseholdEvent): void {
  const set = listeners.get(householdId)
  if (!set) return
  for (const l of Array.from(set)) {
    try {
      l(event)
    } catch (err) {
      console.error('[events] listener falló', err)
    }
  }
}
