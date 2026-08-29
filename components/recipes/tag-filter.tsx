'use client'

import { parseAsInteger, useQueryStates } from 'nuqs'
import { useLocale, useTranslations } from 'next-intl'
import { TagIcon } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { buildTagTree, displayTagName, type Locale, type TagNodeInput } from '@/lib/domain'
import { recipeSearchParsers } from '@/lib/recipe-search-params'
import { cn } from '@/lib/utils'

export interface TagFilterProps {
  tags: TagNodeInput[]
  selected: string[]
}

// Solo los dos parámetros que este componente toca; todo lo demás que haya en
// la URL (q, sort, hasIngredients de expiring-panel…) lo deja intacto nuqs
// solo: a diferencia de la versión anterior (URLSearchParams a mano sobre un
// `baseParams` que la página server tenía que pasar), useQueryStates parte de
// la URL real del navegador, así que no hace falta reconstruirla entera.
const tagQueryKeys = { tags: recipeSearchParsers.tags, page: parseAsInteger }

// Filtro de etiquetas de /recipes: se pintan agrupadas por su raíz (jerarquía
// de lib/domain/tags), un botón por raíz y otro por cada hija. El árbol lo
// arma este componente (buildTagTree), la página solo pasa las filas planas.
// W9: URL como estado (nuqs) en vez de router.push con una query armada a mano.
export function TagFilter({ tags, selected }: TagFilterProps) {
  const t = useTranslations('recipes')
  const locale = useLocale() as Locale
  const [, setQuery] = useQueryStates(tagQueryKeys, { shallow: false })

  if (tags.length === 0) return null

  function navigate(next: string[]) {
    // Cambiar de etiquetas vuelve a la primera página, igual que antes.
    void setQuery({ tags: next.length > 0 ? next : null, page: null })
  }

  function toggle(slug: string) {
    const next = selected.includes(slug) ? selected.filter((s) => s !== slug) : [...selected, slug]
    navigate(next)
  }

  const roots = buildTagTree(tags)

  return (
    <section aria-label={t('filters.tags')} className="mt-3 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-sm font-medium text-text-2">
          <TagIcon size={16} />
          {t('filters.tags')}
        </span>
        {selected.length > 0 ? (
          <Button type="button" size="sm" variant="ghost" onClick={() => navigate([])}>
            {t('filters.clearTags')}
          </Button>
        ) : null}
      </div>
      {roots.map((root) => (
        <div key={root.id}>
          <h3>
            {/* variant cambia a ghost cuando está seleccionado: outline trae
                bg-background (capa utilities), que compite con el fondo de
                pill-selected por la misma propiedad; ghost no lo fija en
                reposo, así que la píldora lo tiene para ella sola. El borde
                va aparte: `border` (con o sin color) es una clase BASE del
                propio Button (cva), fuera de este fichero, así que ghost no
                la quita — border-acc-line se añade a mano para que `cn`
                (twMerge) descarte el `border-transparent` de esa base antes
                de que el navegador tenga que arbitrar entre dos reglas de la
                misma capa. */}
            <Button
              type="button"
              size="sm"
              variant={selected.includes(root.slug) ? 'ghost' : 'outline'}
              aria-pressed={selected.includes(root.slug)}
              className={cn('rounded-pill', selected.includes(root.slug) && 'pill-selected border-acc-line')}
              onClick={() => toggle(root.slug)}
            >
              {displayTagName(root, locale)}
            </Button>
          </h3>
          {root.children.length > 0 ? (
            <ul className="mt-1 flex flex-wrap gap-1.5">
              {root.children.map((child) => (
                <li key={child.id}>
                  <Button
                    type="button"
                    size="sm"
                    variant={selected.includes(child.slug) ? 'ghost' : 'outline'}
                    aria-pressed={selected.includes(child.slug)}
                    className={cn('rounded-pill', selected.includes(child.slug) && 'pill-selected border-acc-line')}
                    onClick={() => toggle(child.slug)}
                  >
                    {displayTagName(child, locale)}
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ))}
    </section>
  )
}
