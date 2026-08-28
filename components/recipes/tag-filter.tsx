'use client'

import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { TagIcon } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { buildTagTree, displayTagName, type Locale, type TagNodeInput } from '@/lib/domain'
import { cn } from '@/lib/utils'

export interface TagFilterProps {
  tags: TagNodeInput[]
  selected: string[]
  baseParams: Record<string, string>
}

// Filtro de etiquetas de /recipes: se pintan agrupadas por su raíz (jerarquía
// de lib/domain/tags), un botón por raíz y otro por cada hija. El árbol lo
// arma este componente (buildTagTree), la página solo pasa las filas planas.
// Mismo patrón que RecipeFilters: navega con router.push construyendo la
// query a mano, la página server sigue siendo la única fuente de verdad.
export function TagFilter({ tags, selected, baseParams }: TagFilterProps) {
  const t = useTranslations('recipes')
  const locale = useLocale() as Locale
  const router = useRouter()

  if (tags.length === 0) return null

  function navigate(next: string[]) {
    const params = new URLSearchParams(baseParams)
    params.delete('page')
    if (next.length > 0) params.set('tags', next.join(','))
    else params.delete('tags')
    const query = params.toString()
    router.push(query ? `/recipes?${query}` : '/recipes')
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
