// Fallback de IA para líneas de ingrediente que el parser de reglas marcó
// `needsReview`: se le pasan solo esas líneas (no la receta entera) y se
// mapea la salida a `ParsedIngredient`. El modelo no calcula ni convierte
// unidades: eso lo hace `findUnit` (lib/domain/units-data) sobre la cadena
// que devuelve.
import { z } from 'zod'
import type { LanguageModel } from 'ai'
import type { Locale, ParsedIngredient } from '@/lib/domain/types'
import { findUnit } from '@/lib/domain/units-data'
import type { AiConfig } from '../provider'
import { generateStructured } from '../structured'
import { parseIngredientsSystemPrompt } from './prompts'

export const ParsedLinesSchema = z.object({
  lines: z.array(
    z.object({
      quantity: z.number().nullable(),
      unit: z.string().nullable(),
      foodName: z.string(),
      preparation: z.string().nullable(),
    }),
  ),
})

// Confianza fija: estas líneas ya venían marcadas dudosas por el parser de
// reglas, así que el resultado del modelo nunca se trata como definitivo.
const FALLBACK_CONFIDENCE = 0.5

export interface ParseIngredientsFallbackResult {
  result: ParsedIngredient[]
  usage: { inputTokens: number; outputTokens: number }
}

export async function parseIngredientsFallback(cfg: AiConfig, model: LanguageModel, lines: string[], locale: Locale): Promise<ParseIngredientsFallbackResult> {
  if (lines.length === 0) return { result: [], usage: { inputTokens: 0, outputTokens: 0 } }

  const user = lines.map((line, i) => `${i + 1}. ${line}`).join('\n')
  const { result, usage } = await generateStructured(cfg, model, ParsedLinesSchema, { system: parseIngredientsSystemPrompt(locale), user })

  const mapped = result.lines.map((line) => {
    const unit = line.unit ? (findUnit(line.unit, locale)?.id ?? null) : null
    const needsReview = line.quantity === null || line.foodName.trim() === ''
    return {
      quantity: line.quantity,
      unit,
      foodName: line.foodName,
      preparation: line.preparation,
      confidence: FALLBACK_CONFIDENCE,
      needsReview,
    }
  })
  return { result: mapped, usage }
}
