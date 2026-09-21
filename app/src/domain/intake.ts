import type { MealSlot, PlanEntry, Recipe } from '../types';

/**
 * Lo que ha comido una persona en un día.
 *
 * La regla, en una línea: las comidas del plan COCINADAS cuentan una ración
 * por persona, ajustable, más los extras que haya registrado.
 *
 * `plan_entry.servings` NO entra aquí: son las raciones del plato, y sirven
 * para descontar de la despensa y para la compra, no para saber cuánto ha
 * comido alguien. Contar 4 raciones a una persona porque se cocinaron 4 es
 * el fallo que este módulo existe para arreglar.
 *
 * El valor por defecto es implícito: cocinar suma a todos sin escribir nada.
 * Solo la excepción ("comí media", "no lo comí") ocupa una fila.
 */

export const DEFAULT_SHARE = 1;
/** Margen para dar un día por "dentro del objetivo". */
const STREAK_BAND = 0.1;

/**
 * Lo que acepta la columna `intake_extra.kcal` (su `check` en la BD, ver
 * `supabase/migrations/20260921090100_rezet_intake.sql`). Vive aquí para que
 * el cliente pare ANTES de mandar la petición, en las dos capas: sin esto,
 * la real devuelve una violación de `check` en crudo (hallazgo de revisión)
 * y la demo, sin ningún `check` detrás, se lo traga tan tranquila.
 */
export const EXTRA_KCAL_MIN = 0;
export const EXTRA_KCAL_MAX = 10000;

export interface IntakeExtraLine {
  id: string;
  label: string;
  kcal: number;
}

export interface MealLine {
  planEntryId: string;
  recipeId: string;
  slot: MealSlot;
  cooked: boolean;
  /** Raciones de ESTA persona. 0 = no lo comió. */
  share: number;
  /** Lo que aporta a su día: 0 si aún no se ha cocinado. */
  kcal: number;
}

export interface DayIntake {
  /** Lo que lleva comido. */
  done: number;
  /** Lo que llevaría si se cocinara todo lo planificado de hoy. */
  planned: number;
  /** Solo los extras, para poder enseñarlos aparte. */
  extras: number;
  /** Las líneas que suman `extras`, para poder enseñarlas una a una. */
  extraLines: IntakeExtraLine[];
  meals: MealLine[];
}

export interface DayTotal {
  date: string;
  kcal: number;
}

function kcalOf(recipeById: Map<string, Recipe>, recipeId: string): number {
  return recipeById.get(recipeId)?.kcalPerServing ?? 0;
}

export function shareFor(shares: Map<string, number>, planEntryId: string): number {
  const v = shares.get(planEntryId);
  return v === undefined ? DEFAULT_SHARE : v;
}

export function intakeOfDay(input: {
  entries: PlanEntry[];
  recipeById: Map<string, Recipe>;
  shares: Map<string, number>;
  extras: IntakeExtraLine[];
}): DayIntake {
  const { entries, recipeById, shares, extras } = input;

  const meals: MealLine[] = entries.map((e) => {
    const share = shareFor(shares, e.id);
    const porRacion = kcalOf(recipeById, e.recipeId);
    return {
      planEntryId: e.id,
      recipeId: e.recipeId,
      slot: e.slot,
      cooked: e.cooked,
      share,
      kcal: e.cooked ? porRacion * share : 0,
    };
  });

  const extrasKcal = extras.reduce((sum, x) => sum + x.kcal, 0);
  const done = meals.reduce((sum, m) => sum + m.kcal, 0) + extrasKcal;
  const planned =
    meals.reduce((sum, m) => sum + kcalOf(recipeById, m.recipeId) * m.share, 0) + extrasKcal;

  return { done, planned, extras: extrasKcal, extraLines: extras, meals };
}

export function weekTotals(input: {
  dates: string[];
  entriesByDate: Map<string, PlanEntry[]>;
  recipeById: Map<string, Recipe>;
  shares: Map<string, number>;
  extrasByDate: Map<string, IntakeExtraLine[]>;
}): DayTotal[] {
  const { dates, entriesByDate, recipeById, shares, extrasByDate } = input;
  return dates.map((date) => ({
    date,
    kcal: intakeOfDay({
      entries: entriesByDate.get(date) ?? [],
      recipeById,
      shares,
      extras: extrasByDate.get(date) ?? [],
    }).done,
  }));
}

/**
 * Días seguidos dentro del objetivo, contando hacia atrás.
 *
 * El día en curso NO entra: darlo por bueno a las nueve de la mañana, cuando
 * aún no has comido nada, sería mentir. Tampoco lo corta.
 */
export function streakOf(days: DayTotal[], target: number, todayKey: string): number {
  if (target <= 0) return 0;
  const pasados = days
    .filter((d) => d.date < todayKey)
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  let n = 0;
  for (const d of pasados) {
    if (Math.abs(d.kcal - target) <= target * STREAK_BAND) n += 1;
    else break;
  }
  return n;
}

export type DayBand = 'within' | 'over' | 'under';

/**
 * Cómo le fue a un día frente al objetivo, con la MISMA banda de tolerancia
 * que usa `streakOf` — para que un día que cuenta para la racha se vea
 * también "dentro" en cualquier sitio que lo pinte (p. ej. "Tu semana",
 * Tarea 13). Repetir el 10% a mano en una pantalla habría sido la segunda
 * fuente de verdad que este módulo entero existe para evitar.
 */
export function dayBand(kcal: number, target: number): DayBand {
  if (target <= 0) return 'under';
  if (Math.abs(kcal - target) <= target * STREAK_BAND) return 'within';
  return kcal > target ? 'over' : 'under';
}

/**
 * Media de los días YA TERMINADOS de una semana (mismo criterio que
 * `streakOf`: el día en curso pesaría con datos a medio llenar, y los días
 * aún no vividos no son "poco", son inexistentes). `0` si no hay ninguno
 * todavía — por ejemplo, un lunes por la mañana.
 */
export function weekAverage(days: DayTotal[], todayKey: string): number {
  const pasados = days.filter((d) => d.date < todayKey);
  if (pasados.length === 0) return 0;
  return pasados.reduce((sum, d) => sum + d.kcal, 0) / pasados.length;
}
