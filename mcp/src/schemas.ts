import { z } from 'zod';

// Must match the live Postgres enum `unit` (verified 2026-09-07: g, ml, ud, tbsp).
export const UNITS = ['g', 'ml', 'ud', 'tbsp'] as const;
export const SLOTS = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
export const LOCATIONS = ['cupboard', 'fridge', 'freezer'] as const;
export const DIFFICULTIES = ['easy', 'medium', 'hard'] as const;

export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD');
export const uuid = z.string().uuid();
export const weekOffset = z
  .number()
  .int()
  .min(-52)
  .max(52)
  .default(0)
  .describe('0 = current week (Mon-Sun), 1 = next week, -1 = last week');

export const recipeIngredientInput = z
  .object({
    name: z
      .string()
      .trim()
      .min(1)
      .describe(
        'Ingredient name in Spanish as the household uses it (matched case-insensitively against existing ingredients; created if missing)',
      ),
    quantity: z.number().positive().optional(),
    unit: z.enum(UNITS).optional(),
    toTaste: z
      .boolean()
      .optional()
      .describe(
        '"To taste" ingredient with no fixed amount (salt, pepper...). When true, omit quantity and unit.',
      ),
  })
  .refine((v) => v.toTaste === true || (v.quantity != null && v.unit != null), {
    message: 'quantity and unit are required unless toTaste is true',
  });
export const recipeStepInput = z.object({
  text: z.string().trim().min(1),
  timerMinutes: z.number().int().positive().optional(),
});
export const recipeFields = {
  title: z.string().trim().min(1),
  description: z.string().default(''),
  baseServings: z.number().int().min(1).max(24).default(2), // recipe.base_servings check (1..24)
  minutes: z.number().int().positive().default(20),
  kcalPerServing: z.number().int().positive().default(450),
  difficulty: z.enum(DIFFICULTIES).default('easy'),
  tags: z.array(z.string().trim().min(1)).default([]),
  ingredients: z.array(recipeIngredientInput).min(1),
  steps: z.array(recipeStepInput).min(1),
};
