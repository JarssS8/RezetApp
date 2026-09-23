import { describe, expect, it } from 'vitest';
import { addDays, dateKey } from '../dates';
import { notCookedRecently, rankSuggestions, suggestionScore } from '../suggestions';
import type { PlanEntry, Recipe } from '../../types';

function recipe(id: string): Recipe {
  return {
    id,
    name: { es: id, en: id },
    description: { es: '', en: '' },
    baseServings: 2,
    minutes: 20,
    difficulty: 'easy',
    kcalPerServing: 400,
    tags: [],
    ingredients: [],
    steps: [],
    cookedCount: 0,
  };
}

function planEntry(recipeId: string, date: string, cooked = true): PlanEntry {
  return { id: `${recipeId}-${date}`, date, slot: 'dinner', recipeId, servings: 2, cooked, cookMemberId: null };
}

describe('suggestionScore', () => {
  it('suma cada término independiente', () => {
    expect(suggestionScore({ liked: false, disliked: false, pantryFull: false, notCookedRecently: false })).toBe(0);
    expect(suggestionScore({ liked: true, disliked: false, pantryFull: false, notCookedRecently: false })).toBe(3);
    expect(suggestionScore({ liked: false, disliked: true, pantryFull: false, notCookedRecently: false })).toBe(-10);
    expect(suggestionScore({ liked: false, disliked: false, pantryFull: true, notCookedRecently: false })).toBe(2);
    expect(suggestionScore({ liked: false, disliked: false, pantryFull: false, notCookedRecently: true })).toBe(1);
  });

  it('el -10 de "no te gusta" pesa más que ganar en todo lo demás junto', () => {
    // Lo máximo que suman despensa + no-cocinada-hace-poco es +3 (2+1);
    // "me gusta" y "no me gusta" son excluyentes (mismo voto, -1/1), así que
    // el techo real de una receta que no gusta es -10+2+1 = -7.
    const dislikedButOtherwiseIdeal = suggestionScore({
      liked: false,
      disliked: true,
      pantryFull: true,
      notCookedRecently: true,
    });
    const neutral = suggestionScore({ liked: false, disliked: false, pantryFull: false, notCookedRecently: false });
    expect(dislikedButOtherwiseIdeal).toBeLessThan(neutral);
    expect(dislikedButOtherwiseIdeal).toBe(-7);
  });
});

describe('notCookedRecently', () => {
  it('true si nunca se ha cocinado', () => {
    expect(notCookedRecently('r1', [])).toBe(true);
  });

  it('false si se cocinó hace pocos días', () => {
    const plan = [planEntry('r1', dateKey(addDays(new Date(), -3)))];
    expect(notCookedRecently('r1', plan)).toBe(false);
  });

  it('true justo en el borde de la ventana (14 días) y más allá', () => {
    const onEdge = [planEntry('r1', dateKey(addDays(new Date(), -14)))];
    const beyond = [planEntry('r1', dateKey(addDays(new Date(), -30)))];
    expect(notCookedRecently('r1', onEdge)).toBe(true);
    expect(notCookedRecently('r1', beyond)).toBe(true);
  });

  it('ignora entradas de plan todavía no cocinadas', () => {
    const plan = [planEntry('r1', dateKey(addDays(new Date(), -1)), false)];
    expect(notCookedRecently('r1', plan)).toBe(true);
  });
});

describe('rankSuggestions', () => {
  it('ordena de mayor a menor puntuación y recorta al límite', () => {
    const candidates = [
      { recipe: recipe('neutral'), myRating: null, pantryFull: false },
      { recipe: recipe('liked'), myRating: 1 as const, pantryFull: true },
      { recipe: recipe('covered'), myRating: null, pantryFull: true },
    ];
    const ranked = rankSuggestions(candidates, [], 2);
    expect(ranked.map((s) => s.recipe.id)).toEqual(['liked', 'covered']);
  });

  it('una receta marcada "no me gusta" no aparece en el top aunque gane en despensa y turno', () => {
    const candidates = [
      { recipe: recipe('a'), myRating: null, pantryFull: false },
      { recipe: recipe('b'), myRating: null, pantryFull: false },
      { recipe: recipe('c'), myRating: null, pantryFull: false },
      // Gana en despensa Y en "no cocinada hace poco", pero está marcada "no
      // me gusta": debe quedar fuera del top-3 aunque las otras tres no
      // tengan ningún bonus.
      { recipe: recipe('disliked-but-ideal'), myRating: -1 as const, pantryFull: true },
    ];
    const ranked = rankSuggestions(candidates, [], 3);
    expect(ranked.map((s) => s.recipe.id)).not.toContain('disliked-but-ideal');
  });

  it('una receta "no me gusta" tampoco sale cuando no hay candidatas de sobra', () => {
    // El caso que el test de arriba NO cubría: con cuatro candidatas, el
    // top-3 dejaba fuera a la rechazada por saturación, no por la regla. Un
    // hogar recién creado tiene dos o tres recetas, y ahí sí salía.
    const candidates = [
      { recipe: recipe('liked'), myRating: 1 as const, pantryFull: false },
      { recipe: recipe('disliked'), myRating: -1 as const, pantryFull: true },
    ];
    const ranked = rankSuggestions(candidates, [], 3);
    expect(ranked.map((s) => s.recipe.id)).toEqual(['liked']);
  });

  it('con una sola receta y marcada "no me gusta", "Para ti" se queda vacío', () => {
    const ranked = rankSuggestions(
      [{ recipe: recipe('solo'), myRating: -1 as const, pantryFull: true }],
      [],
      3,
    );
    expect(ranked).toEqual([]);
  });
});
