import { describe, expect, it } from 'vitest';
import { scaleQuantity } from '../scaling';
import { isCovered } from '../coverage';
import { formatQuantity, roundNice } from '../units';
import { parseIngredientLines, textMentions } from '../recipeText';
import { shoppingNeeds } from '../shopping';
import type { Ingredient, PantryItem, PlanEntry, Recipe } from '../../types';

describe('escalado', () => {
  it('escala lineal', () => {
    expect(scaleQuantity(300, 2, 4, false)).toBe(600);
  });
  it('escala sensible por debajo de lo lineal', () => {
    expect(scaleQuantity(2, 2, 4, true)).toBeCloseTo(2.93, 2);
  });
  it('escala a la baja', () => {
    expect(scaleQuantity(400, 4, 1, false)).toBe(100);
  });
  it('sensible a la baja', () => {
    // BUILD_FROM_ZERO.md §4 anota 2.29 en la tabla, pero 5 * (1/4)^0.55 = 2.33
    // con la misma fórmula que la fila de arriba (2 * 2^0.55 = 2.93) sí cuadra.
    // Es un redondeo manual equivocado en la tabla, no la fórmula.
    expect(scaleQuantity(5, 4, 1, true)).toBeCloseTo(2.33, 2);
  });
  it('mismas raciones no cambia nada', () => {
    expect(scaleQuantity(250, 3, 3, true)).toBe(250);
  });
});

describe('cobertura', () => {
  it('cobertura justa', () => expect(isCovered(300, 300)).toBe(true));
  it('tolera el error de coma flotante', () => expect(isCovered(300.0000001, 300)).toBe(true));
  it('insuficiente', () => expect(isCovered(301, 300)).toBe(false));
});

describe('unidades', () => {
  it('gramos a onzas', () => expect(formatQuantity(300, 'g', 'imperial', 'en')).toBe('10.6 oz'));
  it('mililitros a onzas líquidas', () =>
    expect(formatQuantity(200, 'ml', 'imperial', 'en')).toBe('6.8 fl oz'));
  it('las unidades sueltas no se convierten', () =>
    expect(formatQuantity(4, 'ud', 'imperial', 'es')).toBe('4 uds'));
  it('quita el decimal si el resto es mínimo', () => expect(roundNice(600.02)).toBe(600));
});

describe('texto de receta', () => {
  it('casa el plural', () => expect(textMentions('Añade las lentejas', 'Lentejas')).toBe(true));
  it('no confunde sal con salmón', () =>
    expect(textMentions('Hornea el salmón 18 minutos', 'Sal')).toBe(false));
  it('casa una palabra de un nombre compuesto', () =>
    expect(textMentions('Dora el pollo', 'Pechuga de pollo')).toBe(true));
  it('parsea cantidad, unidad y nombre', () => {
    const [first] = parseIngredientLines('300 g lentejas\n1 cebolla\n2 g sal');
    expect(first).toEqual({ name: 'lentejas', quantity: 300, unit: 'g', sensitive: false });
  });
  it('normaliza kg a g y marca la sal como sensible', () => {
    const rows = parseIngredientLines('1,5 kg patata\n2 g sal');
    expect(rows[0]).toMatchObject({ quantity: 1500, unit: 'g' });
    expect(rows[1]?.sensitive).toBe(true);
  });
});

describe('lista de la compra', () => {
  const ingredients = new Map<string, Ingredient>([
    ['i1', { id: 'i1', name: { es: 'Lentejas', en: 'Lentils' }, group: 'seco', sensitive: false, defaultUnit: 'g' }],
    ['i2', { id: 'i2', name: { es: 'Cebolla', en: 'Onion' }, group: 'fresco', sensitive: false, defaultUnit: 'ud' }],
  ]);
  const recipe: Recipe = {
    id: 'r1',
    name: { es: 'Lentejas', en: 'Lentils' },
    description: { es: '', en: '' },
    baseServings: 2,
    minutes: 35,
    difficulty: 'easy',
    kcalPerServing: 552,
    tags: [],
    ingredients: [
      { ingredientId: 'i1', quantity: 300, unit: 'g' },
      { ingredientId: 'i2', quantity: 1, unit: 'ud' },
    ],
    steps: [{ text: { es: 'Cuece', en: 'Simmer' } }],
    cookedCount: 0,
  };
  const recipes = new Map([['r1', recipe]]);
  const base = { recipes, ingredients, locale: 'es' as const, dates: ['2026-01-05'] };

  it('resta la despensa', () => {
    const plan: PlanEntry[] = [
      { id: 'p1', date: '2026-01-05', slot: 'lunch', recipeId: 'r1', servings: 4, cooked: false },
    ];
    const pantry: PantryItem[] = [
      { id: 'x', ingredientId: 'i1', quantity: 200, unit: 'g', location: 'cupboard', expiresInDays: null },
    ];
    const needs = shoppingNeeds({ ...base, plan, pantry });
    expect(needs.find((n) => n.ingredientId === 'i1')?.quantity).toBe(400);
    expect(needs.find((n) => n.ingredientId === 'i2')?.quantity).toBe(2);
  });

  it('ignora lo ya cocinado', () => {
    const plan: PlanEntry[] = [
      { id: 'p1', date: '2026-01-05', slot: 'lunch', recipeId: 'r1', servings: 4, cooked: true },
    ];
    expect(shoppingNeeds({ ...base, plan, pantry: [] })).toHaveLength(0);
  });

  it('descarta migajas', () => {
    const plan: PlanEntry[] = [
      { id: 'p1', date: '2026-01-05', slot: 'lunch', recipeId: 'r1', servings: 2, cooked: false },
    ];
    const pantry: PantryItem[] = [
      { id: 'x', ingredientId: 'i1', quantity: 299.7, unit: 'g', location: 'cupboard', expiresInDays: null },
      { id: 'y', ingredientId: 'i2', quantity: 5, unit: 'ud', location: 'fridge', expiresInDays: 4 },
    ];
    expect(shoppingNeeds({ ...base, plan, pantry })).toHaveLength(0);
  });

  it('ignora los días fuera de la semana pedida', () => {
    const plan: PlanEntry[] = [
      { id: 'p1', date: '2026-02-01', slot: 'lunch', recipeId: 'r1', servings: 2, cooked: false },
    ];
    expect(shoppingNeeds({ ...base, plan, pantry: [] })).toHaveLength(0);
  });
});
