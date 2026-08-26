// Importación de recetas vía IA a partir de texto libre o de una foto. La
// salida solo copia el texto de cada ingrediente (`rawText`); no resuelve
// `foodId`/`quantity`/`unit` aquí — eso lo hace el parser de reglas (y, si
// hace falta, `parseIngredientsFallback`) después, sobre `rawText`.
import { z } from 'zod'
import type { LanguageModel, ModelMessage } from 'ai'
import type { Locale } from '@/lib/domain/types'
import { RecipeInputSchema, type RecipeInput } from '@/lib/validation/recipes'
import { modelInfo } from '../models'
import type { AiConfig } from '../provider'
import { generateStructured } from '../structured'
import { importRecipeImageUserText, importRecipeSystemPrompt } from './prompts'

export class AiUnsupportedError extends Error {
  readonly code = 'ai_unsupported'
  constructor(message = 'El modelo configurado no admite imágenes') {
    super(message)
    this.name = 'AiUnsupportedError'
  }
}

// Esquema recortado que se le pide al modelo: sin foodId/quantity/unit (los
// resuelve el parser de reglas después) ni campos que el modelo no puede ver
// en el texto/imagen de origen (sourceUrl, imageUrls, notes, yieldGrams).
const AiRecipeSchema = z.object({
  title: z.string().min(1).max(160),
  description: z.string().max(2000).nullable(),
  servingsBase: z.number().int().min(1).max(100),
  prepMinutes: z.number().int().min(0).nullable(),
  cookMinutes: z.number().int().min(0).nullable(),
  difficulty: z.enum(['easy', 'medium', 'hard']).nullable(),
  tags: z.array(z.string().max(60)).max(20),
  ingredients: z.array(z.object({ rawText: z.string().min(1).max(200) })).max(100),
  steps: z.array(z.object({ text: z.string().min(1).max(2000), timerSeconds: z.number().int().positive().nullable() })).max(100),
})

function toRecipeInput(ai: z.infer<typeof AiRecipeSchema>): RecipeInput {
  return RecipeInputSchema.parse({
    title: ai.title,
    description: ai.description,
    servingsBase: ai.servingsBase,
    prepMinutes: ai.prepMinutes,
    cookMinutes: ai.cookMinutes,
    difficulty: ai.difficulty,
    tags: ai.tags,
    ingredients: ai.ingredients.map((i) => ({ rawText: i.rawText })),
    steps: ai.steps.map((s) => ({ text: s.text, timerSeconds: s.timerSeconds })),
  })
}

export async function importRecipeFromTextAi(cfg: AiConfig, model: LanguageModel, text: string, locale: Locale): Promise<RecipeInput> {
  const { result } = await generateStructured(cfg, model, AiRecipeSchema, { system: importRecipeSystemPrompt(locale), user: text })
  return toRecipeInput(result)
}

export async function importRecipeFromImageAi(
  cfg: AiConfig,
  model: LanguageModel,
  image: { bytes: Uint8Array; mime: string },
  locale: Locale,
): Promise<RecipeInput> {
  const info = modelInfo(cfg.provider, cfg.model)
  if (!info?.vision) throw new AiUnsupportedError()

  const userMessage: ModelMessage[] = [
    {
      role: 'user',
      content: [
        { type: 'text', text: importRecipeImageUserText(locale) },
        { type: 'file', data: image.bytes, mediaType: image.mime },
      ],
    },
  ]
  const { result } = await generateStructured(cfg, model, AiRecipeSchema, { system: importRecipeSystemPrompt(locale), user: userMessage })
  return toRecipeInput(result)
}
