import { z } from 'zod'

// Tope de tamaño para un fichero de importación: mismo orden de magnitud que
// MAX_UPLOAD_BYTES (lib/uploads/store.ts), pero una constante aparte porque
// components no puede importar de lib/uploads (frontera de eslint-boundaries)
// y esta comprobación se hace tanto en el navegador (ImportButton) como en el
// servidor (importRecipesAction).
export const MAX_IMPORT_BYTES = 8 * 1024 * 1024

// Volcado que produce lib/services/recipes.ts::exportAll. Se valida al
// reimportar porque el fichero viene del disco del usuario: puede ser de otra
// versión, estar recortado o no ser nuestro en absoluto.
//
// El sobre (version/exportedAt) se valida aquí y con estrictez: si eso no
// cuadra, el fichero entero no es un volcado de RezetApp. Cada receta, en
// cambio, se deja como unknown y se valida una a una en importAll
// (lib/services/recipes.ts) contra RecipeInputSchema — así una receta rota
// del volcado no tira abajo la importación completa.
export const RecipeExportSchema = z.object({
  version: z.literal(1),
  exportedAt: z.string(),
  recipes: z.array(z.unknown()).max(2000),
})
export type RecipeExportInput = z.infer<typeof RecipeExportSchema>
