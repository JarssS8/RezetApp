'use client'

import { useRouter } from 'next/navigation'
import { type FormEvent, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { cn } from '@/lib/utils'
import type { RecipeSearch } from '@/lib/validation/recipes'

type FilterFields = Pick<RecipeSearch, 'q' | 'maxMinutes' | 'difficulty' | 'onlyWithPantry' | 'sort'>

export interface RecipeFiltersProps {
  initial: Partial<FilterFields>
}

const DIFFICULTIES = ['easy', 'medium', 'hard'] as const
const SORTS = ['relevance', 'recent', 'most_cooked', 'title'] as const

// Formulario de filtros de /recipes: en vez de un submit normal (que
// recargaría con GET nativo, perdiendo el historial de cliente), construye
// la query a mano y navega con el router — así la página server sigue
// siendo la única fuente de verdad (lee searchParams, valida con
// RecipeSearchSchema) y este formulario solo decide qué URL pedir.
export function RecipeFilters({ initial }: RecipeFiltersProps) {
  const t = useTranslations('recipes')
  const router = useRouter()
  const [q, setQ] = useState(initial.q ?? '')
  const [difficulty, setDifficulty] = useState<FilterFields['difficulty']>(initial.difficulty)
  const [maxMinutes, setMaxMinutes] = useState<number | undefined>(initial.maxMinutes)
  const [onlyWithPantry, setOnlyWithPantry] = useState(initial.onlyWithPantry ?? false)
  const [sort, setSort] = useState<NonNullable<FilterFields['sort']>>(initial.sort ?? 'relevance')

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const params = new URLSearchParams()
    const trimmed = q.trim()
    if (trimmed) params.set('q', trimmed)
    if (maxMinutes !== undefined && maxMinutes > 0) params.set('maxMinutes', String(maxMinutes))
    if (difficulty) params.set('difficulty', difficulty)
    if (onlyWithPantry) params.set('onlyWithPantry', '1')
    params.set('sort', sort)
    router.push(`/recipes?${params.toString()}`)
  }

  return (
    <form method="get" onSubmit={handleSubmit} className="mt-3 flex flex-wrap items-end gap-2">
      <Input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={t('filters.search')}
        aria-label={t('filters.search')}
        className="w-full sm:w-48"
      />
      {/* variant cambia a ghost cuando está seleccionado: outline trae
          bg-background (capa utilities), que compite con el fondo de
          pill-selected por la misma propiedad; ghost no fija ninguno en
          reposo, así que la píldora lo tiene para ella sola. El borde va
          aparte: `border` (con o sin color) es una clase BASE del propio
          Button (cva), fuera de este fichero, así que ghost no la quita —
          border-acc-line se añade a mano para que `cn` (twMerge) descarte el
          `border-transparent` de esa base antes de que el navegador tenga que
          arbitrar entre dos reglas de la misma capa. */}
      <div role="group" aria-label={t('filters.difficulty')} className="flex flex-wrap gap-1">
        <Button
          type="button"
          size="sm"
          variant={difficulty === undefined ? 'ghost' : 'outline'}
          aria-pressed={difficulty === undefined}
          className={cn('rounded-pill', difficulty === undefined && 'pill-selected border-acc-line')}
          onClick={() => setDifficulty(undefined)}
        >
          {t('filters.any')}
        </Button>
        {DIFFICULTIES.map((d) => (
          <Button
            key={d}
            type="button"
            size="sm"
            variant={difficulty === d ? 'ghost' : 'outline'}
            aria-pressed={difficulty === d}
            className={cn('rounded-pill', difficulty === d && 'pill-selected border-acc-line')}
            onClick={() => setDifficulty(d)}
          >
            {t(`filters.${d}`)}
          </Button>
        ))}
      </div>
      <label className="flex min-h-11 flex-col gap-0.5 text-xs text-text-2">
        {t('filters.maxMinutes')}
        <Input
          type="number"
          min={0}
          value={maxMinutes ?? ''}
          onChange={(e) => setMaxMinutes(e.target.value === '' ? undefined : Number(e.target.value))}
          className="w-24"
        />
      </label>
      <label className="flex min-h-11 items-center gap-2 text-sm">
        <input type="checkbox" className="size-4" checked={onlyWithPantry} onChange={(e) => setOnlyWithPantry(e.target.checked)} />
        {t('filters.onlyWithPantry')}
      </label>
      <label className="flex min-h-11 flex-col gap-0.5 text-xs text-text-2">
        {t('filters.sort')}
        <NativeSelect value={sort} onChange={(e) => setSort(e.target.value as NonNullable<FilterFields['sort']>)}>
          {SORTS.map((s) => (
            <option key={s} value={s}>
              {t(`filters.${s}`)}
            </option>
          ))}
        </NativeSelect>
      </label>
      <Button type="submit" size="sm" variant="secondary">
        {t('filters.apply')}
      </Button>
    </form>
  )
}
