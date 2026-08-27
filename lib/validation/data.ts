import { z } from 'zod'
import { RecipeInputSchema } from './recipes'

// Volcado que produce lib/services/recipes.ts::exportAll. Se valida al
// reimportar porque el fichero viene del disco del usuario: puede ser de otra
// versión, estar recortado o no ser nuestro en absoluto.
export const RecipeExportSchema = z.object({
  version: z.literal(1),
  exportedAt: z.string(),
  // Los dos campos extra del volcado (timesCooked, createdAt) se aceptan y se
  // descartan: la copia empieza su historia de cero en el hogar de destino.
  recipes: z.array(RecipeInputSchema.and(z.object({ timesCooked: z.number().optional(), createdAt: z.string().optional() }))).max(2000),
})
export type RecipeExportInput = z.infer<typeof RecipeExportSchema>
