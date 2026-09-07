import { afterEach, describe, expect, it } from 'vitest';
import { scaleQuantity } from '../scaling';
import { isCovered } from '../coverage';
import { formatFractionalQuantity, formatQuantity, roundNice } from '../units';
import { defaultLocationFor, findIngredientByName, inferFoodGroup, textMentions } from '../recipeText';
import { shoppingNeeds } from '../shopping';
import { dateKey, mondayOf, setClock, slotForNow, todayKey } from '../dates';
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
  it('media unidad se muestra como fracción, no decimal', () =>
    expect(formatQuantity(0.5, 'ud', 'metric', 'es')).toBe('½ uds'));
  it('unidad y cuarto se muestra con la parte entera', () =>
    expect(formatQuantity(1.25, 'ud', 'metric', 'es')).toBe('1¼ uds'));
  it('tres cuartos de unidad', () => expect(formatFractionalQuantity(0.75, 'es')).toBe('¾'));
  it('un decimal que no es una fracción reconocida cae al número', () =>
    expect(formatFractionalQuantity(1.3, 'es')).toBe('1,3'));
  it('cucharada sopera no se convierte ni en imperial', () =>
    expect(formatQuantity(2, 'tbsp', 'imperial', 'es')).toBe('2 cda'));
  it('cucharada en inglés', () => expect(formatQuantity(1, 'tbsp', 'metric', 'en')).toBe('1 tbsp'));
  it('media cucharada se muestra como fracción, igual que las unidades sueltas', () =>
    expect(formatQuantity(0.5, 'tbsp', 'metric', 'es')).toBe('½ cda'));
});

describe('texto de receta', () => {
  it('casa el plural', () => expect(textMentions('Añade las lentejas', 'Lentejas')).toBe(true));
  it('no confunde sal con salmón', () =>
    expect(textMentions('Hornea el salmón 18 minutos', 'Sal')).toBe(false));
  it('casa una palabra de un nombre compuesto', () =>
    expect(textMentions('Dora el pollo', 'Pechuga de pollo')).toBe(true));
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

describe('findIngredientByName', () => {
  const list: Ingredient[] = [
    { id: 'i1', name: { es: 'Leche', en: 'Milk' }, group: 'fresco', sensitive: false, defaultUnit: 'ml' },
    { id: 'i2', name: { es: 'Lentejas', en: 'Lentils' }, group: 'seco', sensitive: false, defaultUnit: 'g' },
  ];
  it('encuentra por nombre en español, sin distinguir mayúsculas', () => {
    expect(findIngredientByName(list, 'leche')?.id).toBe('i1');
  });
  it('encuentra por nombre en inglés', () => {
    expect(findIngredientByName(list, 'Milk')?.id).toBe('i1');
  });
  it('no hace coincidencia parcial ("le" no debe encontrar "Leche")', () => {
    expect(findIngredientByName(list, 'le')).toBeUndefined();
  });
  it('undefined si no hay coincidencia exacta', () => {
    expect(findIngredientByName(list, 'Arroz')).toBeUndefined();
  });
});

describe('inferFoodGroup', () => {
  it('reconoce fresco en español', () => {
    expect(inferFoodGroup('Leche')).toBe('fresco');
    expect(inferFoodGroup('Yogur natural')).toBe('fresco');
  });
  it('reconoce fresco en inglés (bilingüe, igual que SENSITIVE_RE)', () => {
    expect(inferFoodGroup('Milk')).toBe('fresco');
    expect(inferFoodGroup('Chicken breast')).toBe('fresco');
  });
  it('reconoce conserva en español e inglés', () => {
    expect(inferFoodGroup('Lata de tomate')).toBe('conserva');
    expect(inferFoodGroup('Canned beans')).toBe('conserva');
  });
  it('no confunde "botella" con "bote" (límite de palabra)', () => {
    expect(inferFoodGroup('Botella de agua')).toBe('seco');
  });
  it('cae a seco por defecto', () => {
    expect(inferFoodGroup('Arroz')).toBe('seco');
    expect(inferFoodGroup('Pasta')).toBe('seco');
  });
});

describe('defaultLocationFor', () => {
  it('fresco va a nevera', () => {
    expect(defaultLocationFor('fresco')).toBe('fridge');
  });
  it('seco y conserva van a armario', () => {
    expect(defaultLocationFor('seco')).toBe('cupboard');
    expect(defaultLocationFor('conserva')).toBe('cupboard');
  });
});

describe('setClock', () => {
  afterEach(() => {
    setClock(() => new Date());
  });

  it('desplaza todayKey, mondayOf y slotForNow al reloj inyectado', () => {
    setClock(() => new Date(2026, 8, 9, 23, 30));
    expect(todayKey()).toBe('2026-09-09');
    expect(dateKey(mondayOf(0))).toBe('2026-09-07');
    expect(slotForNow()).toBe('dinner');
  });
});
