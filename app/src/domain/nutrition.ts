/**
 * Objetivo de calorías por persona — Mifflin-St Jeor.
 *
 * Vive aquí y solo aquí. La RPC que guarda los datos corporales RECIBE el
 * número ya calculado en vez de recalcularlo: dos copias de una fórmula
 * divergen, y las reglas de negocio de este repo son puras y testeadas.
 *
 * No es una app médica: esto es una estimación, el usuario siempre puede
 * escribir su propio número, y donde la fórmula no está validada (menores,
 * sexo no declarado) no se ofrece en vez de inventar una media.
 */

export type Sex = 'female' | 'male';
export type Activity = 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';
export type Goal = 'lose' | 'maintain' | 'gain';

export const ACTIVITY_FACTOR: Record<Activity, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

export const GOAL_FACTOR: Record<Goal, number> = {
  lose: 0.85,
  maintain: 1,
  gain: 1.1,
};

/** Lo que acepta la columna `member.kcal_target` (su `check` en la BD). */
export const KCAL_MIN = 1000;
export const KCAL_MAX = 5000;
/** Cotas de la ESTIMACIÓN, más estrechas: fuera de aquí no la ofrecemos. */
const ESTIMATE_MIN = 1200;
const ESTIMATE_MAX = 4500;
/** Edad mínima para usar la fórmula: está validada en adultos. */
const ADULT_AGE = 18;
/** Objetivo por defecto cuando no hay ni estimación ni número guardado — un solo sitio, no un literal repetido en cada formulario. */
export const FALLBACK = 2100;

export interface BodyInput {
  sex: Sex | null;
  birthYear: number | null;
  heightCm: number | null;
  weightKg: number | null;
  activity: Activity;
  goal: Goal;
}

/** Del año de nacimiento, no de la fecha completa: menos dato personal. */
export function ageFrom(birthYear: number, today: Date): number {
  return Math.max(0, today.getFullYear() - birthYear);
}

/** Metabolismo basal. Las dos constantes son lo único que cambia con el sexo. */
export function bmr(sex: Sex, weightKg: number, heightCm: number, age: number): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return sex === 'male' ? base + 5 : base - 161;
}

function round50(n: number): number {
  return Math.round(n / 50) * 50;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/**
 * `null` cuando la fórmula no aplica: sin sexo declarado, con algún dato
 * ausente, o con menos de 18 años. La interfaz pide entonces el número
 * directamente, que es más honesto que un cálculo con aire de exactitud.
 */
export function estimateTarget(input: BodyInput, today: Date): number | null {
  const { sex, birthYear, heightCm, weightKg, activity, goal } = input;
  if (!sex || birthYear === null || heightCm === null || weightKg === null) return null;
  const age = ageFrom(birthYear, today);
  if (age < ADULT_AGE) return null;
  const daily = bmr(sex, weightKg, heightCm, age) * ACTIVITY_FACTOR[activity] * GOAL_FACTOR[goal];
  return clamp(round50(daily), ESTIMATE_MIN, ESTIMATE_MAX);
}

/** Para el número escrito a mano: lo que la base de datos va a aceptar. */
export function clampTarget(n: number): number {
  if (!Number.isFinite(n)) return FALLBACK;
  return clamp(round50(n), KCAL_MIN, KCAL_MAX);
}
