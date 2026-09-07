import { describe, expect, it } from 'vitest';
import { buildSaveRecipePayload, type RecipeInput } from '../tools/recipes.js';

describe('buildSaveRecipePayload', () => {
  it('matches the payload app/src/data/supabaseStore.tsx sends to rpc/save_recipe', () => {
    const input: RecipeInput = {
      title: 'Lentejas con chorizo',
      description: 'Guiso de lentejas con chorizo.',
      baseServings: 4,
      minutes: 45,
      kcalPerServing: 520,
      difficulty: 'medium',
      tags: ['legumbre', 'invierno'],
      ingredients: [
        { name: 'Lentejas', quantity: 300, unit: 'g' },
        { name: 'Chorizo', quantity: 150, unit: 'g' },
        { name: 'Sal', quantity: 5, unit: 'g' },
      ],
      steps: [
        { text: 'Sofreír el chorizo.', timerMinutes: 5 },
        { text: 'Añadir las lentejas y cubrir de agua.' },
      ],
    };

    expect(buildSaveRecipePayload(input, null)).toEqual({
      id: null,
      name: 'Lentejas con chorizo',
      description: 'Guiso de lentejas con chorizo.',
      base_servings: 4,
      minutes: 45,
      difficulty: 'medium',
      kcal_per_serving: 520,
      tags: ['legumbre', 'invierno'],
      ingredients: [
        { name: 'Lentejas', quantity: 300, unit: 'g', sensitive: false },
        { name: 'Chorizo', quantity: 150, unit: 'g', sensitive: false },
        { name: 'Sal', quantity: 5, unit: 'g', sensitive: true },
      ],
      steps: [
        { text: 'Sofreír el chorizo.', timer_minutes: 5 },
        { text: 'Añadir las lentejas y cubrir de agua.', timer_minutes: null },
      ],
      photo_path: null,
    });
  });

  it('reuses an existing id when updating', () => {
    const input: RecipeInput = {
      title: 'Tortilla',
      description: '',
      baseServings: 2,
      minutes: 15,
      kcalPerServing: 300,
      difficulty: 'easy',
      tags: [],
      ingredients: [{ name: 'Huevo', quantity: 4, unit: 'ud' }],
      steps: [{ text: 'Batir los huevos.' }],
    };

    expect(buildSaveRecipePayload(input, 'recipe-uuid').id).toBe('recipe-uuid');
  });
});
