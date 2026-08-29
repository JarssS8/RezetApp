// Plan frente a realidad (docs/07-ROADMAP.md fase 5). Todo sale de lo que ya
// se registra: cooked_at, skipped_at y leftover_of_entry_id. PURO.
export interface PlanStatEntry {
  status: 'planned' | 'cooked' | 'skipped'
  isLeftover: boolean
  kcalPerServing: number | null
  servings: number
}

export interface PlanAdherence {
  planned: number
  cooked: number
  skipped: number
  pending: number
  // cooked / (cooked + skipped). null cuando todavía no se decidió ninguna:
  // un 0 % ahí sería mentira, no un dato.
  adherence: number | null
  plannedKcal: number
  cookedKcal: number
}

export function planAdherence(entries: PlanStatEntry[]): PlanAdherence {
  // Las sobras se excluyen igual que en rangeNutrition y dayProgress: ya
  // contaron el día que se cocinó su receta.
  const real = entries.filter((e) => !e.isLeftover)
  const cooked = real.filter((e) => e.status === 'cooked')
  const skipped = real.filter((e) => e.status === 'skipped')
  const decided = cooked.length + skipped.length
  const kcal = (list: PlanStatEntry[]) => Math.round(list.reduce((sum, e) => sum + (e.kcalPerServing ?? 0) * e.servings, 0))
  return {
    planned: real.length,
    cooked: cooked.length,
    skipped: skipped.length,
    pending: real.length - decided,
    adherence: decided === 0 ? null : cooked.length / decided,
    plannedKcal: kcal(real),
    cookedKcal: kcal(cooked),
  }
}

// Un día del rango, para el gráfico de barras de Estadísticas (W9b). PURO:
// reutiliza el mismo cálculo de kcal que planAdherence (misma exclusión de
// sobras), solo que agrupado por fecha en vez de para el rango entero.
export interface PlanDayStat {
  date: string
  plannedKcal: number
  cookedKcal: number
}

export function planStatsByDay(entries: (PlanStatEntry & { date: string })[], days: string[]): PlanDayStat[] {
  const byDate = new Map<string, PlanStatEntry[]>()
  for (const day of days) byDate.set(day, [])
  for (const entry of entries) {
    const list = byDate.get(entry.date)
    // Fecha fuera de `days` (no debería pasar: el servicio pide las filas del
    // mismo rango): se ignora en vez de crear un día suelto que el gráfico no
    // sabría dónde colocar.
    if (!list) continue
    list.push(entry)
  }
  return days.map((date) => {
    const { plannedKcal, cookedKcal } = planAdherence(byDate.get(date) ?? [])
    return { date, plannedKcal, cookedKcal }
  })
}
