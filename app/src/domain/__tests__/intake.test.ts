import { describe, expect, it } from 'vitest';
import { DEFAULT_SHARE, intakeOfDay, streakOf, weekTotals } from '../intake';
import type { PlanEntry, Recipe } from '../../types';

const receta = (id: string, kcal: number): Recipe =>
  ({ id, kcalPerServing: kcal, name: { es: id, en: id } } as unknown as Recipe);

const entrada = (id: string, recipeId: string, servings: number, cooked: boolean): PlanEntry =>
  ({ id, date: '2026-09-21', slot: 'lunch', recipeId, servings, cooked } as PlanEntry);

const recipes = new Map<string, Recipe>([
  ['r1', receta('r1', 500)],
  ['r2', receta('r2', 300)],
]);

describe('intake', () => {
  it('una comida cocinada cuenta UNA ración, no las del plato', () => {
    const d = intakeOfDay({
      entries: [entrada('p1', 'r1', 4, true)],
      recipeById: recipes,
      shares: new Map(),
      extras: [],
    });
    expect(d.done).toBe(500);
    expect(DEFAULT_SHARE).toBe(1);
  });

  it('lo planificado sin cocinar no cuenta para nadie', () => {
    const d = intakeOfDay({
      entries: [entrada('p1', 'r1', 2, false)],
      recipeById: recipes,
      shares: new Map(),
      extras: [],
    });
    expect(d.done).toBe(0);
    expect(d.planned).toBe(500);
  });

  it('la excepción manda sobre el valor por defecto', () => {
    const d = intakeOfDay({
      entries: [entrada('p1', 'r1', 2, true)],
      recipeById: recipes,
      shares: new Map([['p1', 1.5]]),
      extras: [],
    });
    expect(d.done).toBe(750);
  });

  it('cero raciones significa "no lo comí"', () => {
    const d = intakeOfDay({
      entries: [entrada('p1', 'r1', 2, true)],
      recipeById: recipes,
      shares: new Map([['p1', 0]]),
      extras: [],
    });
    expect(d.done).toBe(0);
    expect(d.meals[0]?.share).toBe(0);
  });

  it('los extras suman y son independientes del plan', () => {
    const d = intakeOfDay({
      entries: [],
      recipeById: recipes,
      shares: new Map(),
      extras: [{ id: 'e1', label: 'Café', kcal: 90 }, { id: 'e2', label: 'Cerveza', kcal: 150 }],
    });
    expect(d.extras).toBe(240);
    expect(d.done).toBe(240);
  });

  it('extraLines refleja lo que entró y suma lo mismo que extras', () => {
    const lineas = [
      { id: 'e1', label: 'Café', kcal: 90 },
      { id: 'e2', label: 'Cerveza', kcal: 150 },
    ];
    const d = intakeOfDay({
      entries: [],
      recipeById: recipes,
      shares: new Map(),
      extras: lineas,
    });
    expect(d.extraLines).toEqual(lineas);
    expect(d.extraLines.reduce((sum, x) => sum + x.kcal, 0)).toBe(d.extras);
  });

  it('una receta que ya no existe no rompe el día', () => {
    const d = intakeOfDay({
      entries: [entrada('p1', 'fantasma', 2, true)],
      recipeById: recipes,
      shares: new Map(),
      extras: [],
    });
    expect(d.done).toBe(0);
  });

  it('la semana devuelve un total por día, incluidos los vacíos', () => {
    const totals = weekTotals({
      dates: ['2026-09-21', '2026-09-22'],
      entriesByDate: new Map([['2026-09-21', [entrada('p1', 'r2', 1, true)]]]),
      recipeById: recipes,
      shares: new Map(),
      extrasByDate: new Map(),
    });
    expect(totals).toEqual([
      { date: '2026-09-21', kcal: 300 },
      { date: '2026-09-22', kcal: 0 },
    ]);
  });

  it('la racha solo cuenta días pasados y completos', () => {
    const dias: { date: string; kcal: number }[] = [
      { date: '2026-09-18', kcal: 1900 },
      { date: '2026-09-19', kcal: 1850 },
      { date: '2026-09-20', kcal: 2000 },
      { date: '2026-09-21', kcal: 200 }, // hoy, a medias: no debe cortar la racha
    ];
    expect(streakOf(dias, 1900, '2026-09-21')).toBe(3);
  });

  it('un día fuera de la banda corta la racha', () => {
    const dias = [
      { date: '2026-09-18', kcal: 1900 },
      { date: '2026-09-19', kcal: 3000 },
      { date: '2026-09-20', kcal: 1900 },
    ];
    expect(streakOf(dias, 1900, '2026-09-21')).toBe(1);
  });

  it('sin objetivo no hay racha que calcular', () => {
    expect(streakOf([{ date: '2026-09-20', kcal: 1900 }], 0, '2026-09-21')).toBe(0);
  });
});
