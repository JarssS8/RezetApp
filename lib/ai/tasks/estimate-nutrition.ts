// Estimación de nutrición vía IA para alimentos sin datos verificados. El
// resultado se marca `is_estimated=true` por quien llama a esta tarea
// (lib/services/foods.ts): aquí solo se pide y valida la estimación, nunca se
// escribe en la base de datos.
import { z } from 'zod'
import type { LanguageModel } from 'ai'
import type { Locale } from '@/lib/domain/types'
import type { AiConfig } from '../provider'
import { generateStructured } from '../structured'
import { estimateNutritionSystemPrompt } from './prompts'

export const NutritionEstimateSchema = z.object({
  kcal100g: z.number().min(0),
  protein100g: z.number().min(0),
  carbs100g: z.number().min(0),
  fat100g: z.number().min(0),
  fiber100g: z.number().min(0),
  defaultUnit: z.enum(['g', 'ml', 'ud']),
  gramsPerUnit: z.number().positive().nullable(),
})

export async function estimateNutrition(
  cfg: AiConfig,
  model: LanguageModel,
  foodName: string,
  locale: Locale,
): Promise<z.infer<typeof NutritionEstimateSchema>> {
  const { result } = await generateStructured(cfg, model, NutritionEstimateSchema, { system: estimateNutritionSystemPrompt(locale), user: foodName })
  return result
}
