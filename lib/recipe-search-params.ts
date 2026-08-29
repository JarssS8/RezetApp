import { createParser, createSerializer, parseAsArrayOf, parseAsInteger, parseAsString, parseAsStringEnum } from 'nuqs/server'

// Definición única de los parámetros de búsqueda de /recipes (W9, nuqs):
// mismos nombres que RecipeSearchSchema (lib/validation/recipes) y mismo
// orden que ya construían a mano RecipeFilters y CollectionBar, para que ni
// las colecciones ya guardadas en la base de datos ni los e2e existentes
// (tags.spec.ts, pantry.spec.ts) dependan de nada nuevo. `nuqs/server` no
// arrastra los hooks de cliente: sirve también a CollectionBar, que solo
// construye hrefs, sin leer el estado reactivo de la URL.
// Calcado a mano de DifficultySchema (lib/validation/common): la frontera de
// eslint-boundaries no deja que un elemento 'lib' importe de 'validation'.
export const RECIPE_DIFFICULTIES = ['easy', 'medium', 'hard'] as const
export const RECIPE_SORTS = ['relevance', 'recent', 'most_cooked', 'title'] as const

// app/(app)/recipes/page.tsx (servidor) distingue "tengo los ingredientes"
// con la cadena literal '1' (`sp.onlyWithPantry === '1'`), no con
// 'true'/'false': el parseAsBoolean de nuqs serializaría eso último y
// rompería tanto esa lectura como las colecciones ya guardadas con '1'.
const parseAsPantryFlag = createParser<boolean>({
  parse: (value) => (value === '1' ? true : null),
  serialize: (value) => (value ? '1' : ''),
})

// Sin `.withDefault()` en `sort`: RecipeFilters manda su valor (por defecto
// 'relevance' en el propio formulario) en cada envío, y el envío de hoy
// siempre deja "sort=relevance" explícito en la URL — con withDefault, nuqs
// lo omitiría por igualar al valor por defecto.
export const recipeSearchParsers = {
  q: parseAsString,
  maxMinutes: parseAsInteger,
  difficulty: parseAsStringEnum([...RECIPE_DIFFICULTIES]),
  onlyWithPantry: parseAsPantryFlag,
  sort: parseAsStringEnum([...RECIPE_SORTS]),
  tags: parseAsArrayOf(parseAsString),
}

// Construye la URL de /recipes que reproduce un filtro guardado (CollectionBar)
// sin pasar por un hook: pura función de un objeto CollectionQuery a cadena.
export const serializeRecipeSearch = createSerializer(recipeSearchParsers)
