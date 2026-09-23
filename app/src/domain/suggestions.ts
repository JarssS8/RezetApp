import type { PlanEntry, Recipe, RecipeRating } from '../types';
import { daysUntil } from './dates';

/**
 * Puntuación de "Para ti" (Today): una suma de cuatro términos, y nada más
 * — sin aprendizaje automático ni servicios externos, para poder explicarla
 * a quien usa la app y fijarla con tests.
 *
 * El -10 de "no te gusta" es deliberadamente grande: el máximo que suman los
 * otros tres términos juntos es +2 (despensa) +1 (no cocinada hace poco) = +3
 * (nunca +3 de "me gusta" A LA VEZ que -10, son excluyentes), así que una
 * receta marcada como "no me gusta" siempre queda muy por debajo de una
 * receta neutra (0 puntos, ver el test dedicado en `__tests__/suggestions.test.ts`).
 */
export const SUGGESTION_POINTS = {
  liked: 3,
  disliked: -10,
  pantryFull: 2,
  notCookedRecently: 1,
} as const;

/** Ventana de "no la has cocinado hace poco", en días. */
const RECENT_WINDOW_DAYS = 14;

export interface SuggestionFactors {
  /** El miembro actual marcó "me gusta" en esta receta. */
  liked: boolean;
  /** El miembro actual marcó "no me gusta". Excluyente con `liked` (mismo voto, valores -1/1). */
  disliked: boolean;
  /** La despensa alcanza para cocinarla entera, a sus raciones base. */
  pantryFull: boolean;
  /** No se ha cocinado (plan con `cooked = true`) en las últimas dos semanas. */
  notCookedRecently: boolean;
}

/** La suma de los cuatro términos. Ninguna lógica más vive aquí ni en la pantalla. */
export function suggestionScore(factors: SuggestionFactors): number {
  let score = 0;
  if (factors.liked) score += SUGGESTION_POINTS.liked;
  if (factors.disliked) score += SUGGESTION_POINTS.disliked;
  if (factors.pantryFull) score += SUGGESTION_POINTS.pantryFull;
  if (factors.notCookedRecently) score += SUGGESTION_POINTS.notCookedRecently;
  return score;
}

/** Última fecha (`YYYY-MM-DD`) en la que el plan marca esta receta como cocinada, o `null` si nunca. */
function lastCookedDate(recipeId: string, plan: PlanEntry[]): string | null {
  let last: string | null = null;
  for (const entry of plan) {
    if (entry.recipeId !== recipeId || !entry.cooked) continue;
    // Las fechas son `YYYY-MM-DD`: la comparación de cadenas ya ordena bien.
    if (last === null || entry.date > last) last = entry.date;
  }
  return last;
}

/** `true` si nunca se cocinó, o si la última vez fue hace `windowDays` días o más. */
export function notCookedRecently(
  recipeId: string,
  plan: PlanEntry[],
  windowDays: number = RECENT_WINDOW_DAYS,
): boolean {
  const last = lastCookedDate(recipeId, plan);
  if (last === null) return true;
  // `daysUntil` da negativo para fechas pasadas: -3 significa "hace 3 días".
  return -daysUntil(last) >= windowDays;
}

export interface SuggestionCandidate {
  recipe: Recipe;
  /** `null` = el miembro actual no ha votado esta receta todavía. */
  myRating: RecipeRating | null;
  /** Ya calculado por quien llama (`coverageOf(recipe, recipe.baseServings).full`): eso vive en `Store`, no aquí. */
  pantryFull: boolean;
}

export interface Suggestion {
  recipe: Recipe;
  score: number;
}

/**
 * Las `limit` recetas con mejor puntuación, **sin las que el miembro marcó
 * "no me gusta"**. El plan solo se usa para "no cocinada hace poco" — el
 * resto de factores ya llega calculado, así que esta función sigue siendo
 * pura: nada de red, nada de React.
 *
 * El descarte es explícito y no se deja al -10 de la puntuación: con pocas
 * recetas en el hogar, ordenar y cortar a `limit` deja pasar una receta
 * rechazada por no haber suficientes candidatas por encima. Un hogar recién
 * creado con dos recetas veía en "Para ti" justo la que había dicho que no
 * le gustaba. El -10 se queda como lo que siempre fue —el peso del voto
 * dentro del orden— y la regla de "no me gusta no aparece" pasa a ser un
 * filtro, que es lo que de verdad es.
 */
export function rankSuggestions(
  candidates: SuggestionCandidate[],
  plan: PlanEntry[],
  limit = 3,
): Suggestion[] {
  return candidates
    .filter(({ myRating }) => myRating !== -1)
    .map(({ recipe, myRating, pantryFull }) => ({
      recipe,
      score: suggestionScore({
        liked: myRating === 1,
        disliked: myRating === -1,
        pantryFull,
        notCookedRecently: notCookedRecently(recipe.id, plan),
      }),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
