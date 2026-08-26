// Tarea "Planificar la semana" (spec §5, §10, §12): a partir del contexto del
// hogar (recetas, despensa que caduca, alérgenos, plan ya existente), el
// modelo elige QUÉ receta va en cada (fecha, hueco). El código decide CUÁNTO
// (raciones = default_servings del hogar) después de recibir la respuesta:
// aquí no se piden ni se aceptan cantidades ni calorías.
import { z } from 'zod'
import type { LanguageModel } from 'ai'
import type { Locale } from '@/lib/domain/types'
import type { AiConfig } from '../provider'
import { generateStructured } from '../structured'
import { proposePlanSystemPrompt } from './prompts'

export type ProposePlanSlot = 'breakfast' | 'lunch' | 'dinner' | 'snack'

export interface ProposePlanRecipe {
  id: string
  title: string
  totalMinutes: number | null
  tags: string[]
  timesCooked: number
  lastCookedAt: string | null // fecha ISO, null si nunca se cocinó
}

export interface ProposePlanPlannedEntry {
  date: string
  slot: ProposePlanSlot
  title: string
}

export interface ProposePlanContext {
  from: string
  to: string
  recipes: ProposePlanRecipe[]
  expiringFoods: string[]
  allergens: string[]
  dietaryFlags: string[]
  alreadyPlanned: ProposePlanPlannedEntry[]
  notes: string | null
}

const ProposedPickSchema = z.object({
  date: z.string(),
  slot: z.enum(['breakfast', 'lunch', 'dinner', 'snack']),
  recipeId: z.string(),
})
export const ProposePlanOutputSchema = z.object({ picks: z.array(ProposedPickSchema).max(60) })

export interface ProposePlanPick {
  date: string
  slot: ProposePlanSlot
  recipeId: string
}

export interface ProposePlanResult {
  picks: ProposePlanPick[]
  usage: { inputTokens: number; outputTokens: number }
}

// Compacta el contexto a un JSON corto (modelos ≤ 8B: prompt breve, spec §10).
function buildUserPrompt(context: ProposePlanContext): string {
  return JSON.stringify({
    from: context.from,
    to: context.to,
    recipes: context.recipes,
    expiringFoods: context.expiringFoods,
    allergens: context.allergens,
    dietaryFlags: context.dietaryFlags,
    alreadyPlanned: context.alreadyPlanned,
    notes: context.notes,
  })
}

export async function proposePlan(cfg: AiConfig, model: LanguageModel, context: ProposePlanContext, locale: Locale): Promise<ProposePlanResult> {
  const { result, usage } = await generateStructured(cfg, model, ProposePlanOutputSchema, {
    system: proposePlanSystemPrompt(locale),
    user: buildUserPrompt(context),
  })
  return { picks: result.picks, usage }
}
