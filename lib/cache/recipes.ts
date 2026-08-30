import 'server-only'
import { cacheLife, cacheTag } from 'next/cache'
import type { Locale } from '@/lib/auth/ctx'
import { listCollections, type CollectionView } from '@/lib/services/collections'
import { getRecipe, searchRecipes, type RecipeDetail, type RecipeSummary } from '@/lib/services/recipes'
import { listTags, type TagRow } from '@/lib/services/tags'
import type { RecipeSearch } from '@/lib/validation/recipes'
import { cacheCtx } from './ctx'
import { householdTag } from './tags'

// 'pantry' además de lo suyo: RecipeSearch.onlyWithPantry ("tengo los
// ingredientes") cruza el inventario, así que una compra cambia el resultado.
export async function searchRecipesCached(householdId: string, locale: Locale, query: RecipeSearch): Promise<{ items: RecipeSummary[]; total: number }> {
  'use cache'
  cacheLife('household')
  cacheTag(householdTag(householdId, 'recipes'), householdTag(householdId, 'foods'), householdTag(householdId, 'pantry'))
  return searchRecipes(cacheCtx(householdId, locale), query)
}

export async function getRecipeCached(householdId: string, locale: Locale, id: string): Promise<RecipeDetail | null> {
  'use cache'
  cacheLife('household')
  cacheTag(householdTag(householdId, 'recipes'), householdTag(householdId, 'foods'))
  // Sin `opts.servings`: la ficha y la sesión de cocina reescalan en cliente
  // con scaleRecipe(), así que el escalado nunca entra en la clave.
  return getRecipe(cacheCtx(householdId, locale), id)
}

export async function getTagsCached(householdId: string, locale: Locale): Promise<TagRow[]> {
  'use cache'
  cacheLife('household')
  cacheTag(householdTag(householdId, 'recipes'))
  return listTags(cacheCtx(householdId, locale))
}

export async function getCollectionsCached(householdId: string, locale: Locale): Promise<CollectionView[]> {
  'use cache'
  cacheLife('household')
  cacheTag(householdTag(householdId, 'recipes'))
  return listCollections(cacheCtx(householdId, locale))
}
