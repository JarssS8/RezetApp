import { z } from 'zod'
import { DifficultySchema } from './common'

// Una colección es un filtro de /recipes guardado con nombre. El subconjunto
// de RecipeSearch que se guarda deja fuera limit/offset (paginación, no filtro)
// y hasIngredients (ids de alimentos que pueden fusionarse o desaparecer).
export const CollectionQuerySchema = z.strictObject({
  q: z.string().trim().max(120).optional(),
  tags: z.array(z.string().max(60)).max(20).optional(),
  maxMinutes: z.number().int().min(0).max(1440).optional(),
  difficulty: DifficultySchema.optional(),
  onlyWithPantry: z.boolean().optional(),
  sort: z.enum(['relevance', 'recent', 'most_cooked', 'title']).optional(),
})
export type CollectionQuery = z.infer<typeof CollectionQuerySchema>

export const CollectionInputSchema = z.strictObject({
  name: z.string().trim().min(1).max(60),
  query: CollectionQuerySchema,
})
export type CollectionInput = z.infer<typeof CollectionInputSchema>
