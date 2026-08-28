import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import type { CSSProperties } from 'react'
import { PlusIcon, RecipesIcon, SettingsIcon, UploadIcon } from '@/components/icons'
import { CollectionBar } from '@/components/recipes/collection-bar'
import { RecipeCard } from '@/components/recipes/recipe-card'
import { RecipeFilters } from '@/components/recipes/recipe-filters'
import { RecipesLiveRefresh } from '@/components/recipes/recipes-live-refresh'
import { TagFilter } from '@/components/recipes/tag-filter'
import { EmptyState } from '@/components/ui/empty-state'
import { requireHousehold } from '@/lib/auth/guards'
import { listCollections } from '@/lib/services/collections'
import { searchRecipes } from '@/lib/services/recipes'
import { listTags } from '@/lib/services/tags'
import { CollectionQuerySchema } from '@/lib/validation/collections'
import { RecipeSearchSchema } from '@/lib/validation/recipes'

const PAGE_SIZE = 20

export default async function RecipesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireHousehold()
  const t = await getTranslations('recipes')
  const c = await getTranslations('common')
  const sp = await searchParams
  const page = Math.max(1, Number(sp.page ?? 1) || 1)
  const parsed = RecipeSearchSchema.safeParse({
    ...(typeof sp.q === 'string' && sp.q ? { q: sp.q } : {}),
    ...(typeof sp.tags === 'string' && sp.tags ? { tags: sp.tags.split(',') } : {}),
    ...(typeof sp.hasIngredients === 'string' && sp.hasIngredients ? { hasIngredients: sp.hasIngredients.split(',') } : {}),
    ...(typeof sp.maxMinutes === 'string' && sp.maxMinutes ? { maxMinutes: sp.maxMinutes } : {}),
    ...(typeof sp.difficulty === 'string' && sp.difficulty ? { difficulty: sp.difficulty } : {}),
    ...(sp.onlyWithPantry === '1' ? { onlyWithPantry: true } : {}),
    ...(typeof sp.sort === 'string' && sp.sort ? { sort: sp.sort } : {}),
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  })
  const query = parsed.success ? parsed.data : RecipeSearchSchema.parse({})
  const [{ items, total }, tags, collections] = await Promise.all([searchRecipes(ctx, query), listTags(ctx), listCollections(ctx)])

  const baseParams = Object.fromEntries(Object.entries(sp).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))

  // El filtro que se guardaría es exactamente lo que hay marcado ahora,
  // recortado al subconjunto que una colección admite (sin limit/offset).
  const currentQuery = CollectionQuerySchema.parse({
    ...(query.q ? { q: query.q } : {}),
    ...(query.tags?.length ? { tags: query.tags } : {}),
    ...(query.maxMinutes !== undefined ? { maxMinutes: query.maxMinutes } : {}),
    ...(query.difficulty ? { difficulty: query.difficulty } : {}),
    ...(query.onlyWithPantry ? { onlyWithPantry: true } : {}),
    ...(query.sort ? { sort: query.sort } : {}),
  })

  return (
    <main className="view-enter">
      <RecipesLiveRefresh />
      <div className="flex items-center justify-between gap-2">
        <h1 className="title-screen">{t('title')}</h1>
        <div className="flex items-center gap-1">
          <Link href="/recipes/import" aria-label={t('import.title')} className="inline-flex min-h-11 min-w-11 items-center justify-center text-text-2 transition-colors duration-(--dur-1) ease-(--ease-out) hover:text-text">
            <UploadIcon />
          </Link>
          <Link href="/settings" aria-label={c('settings')} className="inline-flex min-h-11 min-w-11 items-center justify-center text-text-2 transition-colors duration-(--dur-1) ease-(--ease-out) hover:text-text">
            <SettingsIcon />
          </Link>
          <Link href="/recipes/new" aria-label={t('new')} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-pill bg-primary text-primary-foreground">
            <PlusIcon />
          </Link>
        </div>
      </div>
      <RecipeFilters initial={query} />
      <TagFilter tags={tags.filter((tag) => tag.recipeCount > 0 || tag.parentId === null)} selected={query.tags ?? []} baseParams={baseParams} />
      <CollectionBar collections={collections} currentQuery={currentQuery} />
      {items.length === 0 ? (
        <div className="mt-6">
          <EmptyState icon={RecipesIcon} title={total === 0 && !query.q ? t('empty') : t('noResults')} />
        </div>
      ) : (
        <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {items.map((r, i) => (
            // Entrada escalonada del primer pintado (W6.5, §2): el índice se
            // recorta a 8 antes de llegar al CSS (informe: pasado eso, el
            // retraso se lee como espera). `stagger-in` es decorativa
            // (app/globals.css): nunca bloquea el clic mientras corre.
            <li key={r.id} className="stagger-in" style={{ '--stagger-i': Math.min(i, 8) } as CSSProperties}>
              <RecipeCard recipe={r} />
            </li>
          ))}
        </ul>
      )}
      {total > PAGE_SIZE ? (
        <nav className="mt-4 flex justify-between" aria-label={t('pagination')}>
          {page > 1 ? (
            <Link href={`/recipes?${new URLSearchParams({ ...baseParams, page: String(page - 1) })}`}>{c('actions.back')}</Link>
          ) : (
            <span />
          )}
          {page * PAGE_SIZE < total ? (
            <Link href={`/recipes?${new URLSearchParams({ ...baseParams, page: String(page + 1) })}`}>{t('more')}</Link>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </main>
  )
}
