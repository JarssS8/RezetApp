import 'server-only'
import { cacheLife, cacheTag } from 'next/cache'
import type { Locale } from '@/lib/auth/ctx'
import { getFood, type FoodWithNutrition } from '@/lib/services/foods'
import { cacheCtx } from './ctx'
import { householdTag } from './tags'

export async function getFoodCached(householdId: string, locale: Locale, foodId: string): Promise<FoodWithNutrition | null> {
  'use cache'
  cacheLife('household')
  cacheTag(householdTag(householdId, 'foods'))
  return getFood(cacheCtx(householdId, locale), foodId)
}
