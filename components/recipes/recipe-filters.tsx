'use client'

import { parseAsInteger, useQueryStates } from 'nuqs'
import { type FormEvent, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { RECIPE_DIFFICULTIES, RECIPE_SORTS, recipeSearchParsers } from '@/lib/recipe-search-params'
import { cn } from '@/lib/utils'

type Difficulty = (typeof RECIPE_DIFFICULTIES)[number]
type Sort = (typeof RECIPE_SORTS)[number]

// Además de los campos que pinta este formulario, se incluye `page` en el
// mapa solo para poder borrarlo al enviar: cambiar el filtro siempre vuelve
// a la primera página, igual que hacía el URLSearchParams construido a mano.
const filterQueryKeys = { ...recipeSearchParsers, page: parseAsInteger }

// Formulario de filtros de /recipes. W9: la URL es el estado (nuqs) — antes
// se construía la query a mano con URLSearchParams y se navegaba con
// router.push para no perder el historial de cliente; useQueryStates hace
// exactamente eso por debajo, y con `shallow: false` fuerza a que la página
// server (que lee searchParams y valida con RecipeSearchSchema) vuelva a
// pedir los resultados. `tags` no se pinta aquí (lo gestiona TagFilter) pero
// se limpia al enviar, igual que antes.
export function RecipeFilters() {
  const t = useTranslations('recipes')
  const [urlState, setUrlState] = useQueryStates(filterQueryKeys, { shallow: false })
  const [q, setQ] = useState(urlState.q ?? '')
  const [difficulty, setDifficulty] = useState<Difficulty | undefined>(urlState.difficulty ?? undefined)
  const [maxMinutes, setMaxMinutes] = useState<number | undefined>(urlState.maxMinutes ?? undefined)
  const [onlyWithPantry, setOnlyWithPantry] = useState(urlState.onlyWithPantry ?? false)
  const [sort, setSort] = useState<Sort>(urlState.sort ?? 'relevance')

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const trimmed = q.trim()
    void setUrlState({
      q: trimmed || null,
      maxMinutes: maxMinutes !== undefined && maxMinutes > 0 ? maxMinutes : null,
      difficulty: difficulty ?? null,
      onlyWithPantry: onlyWithPantry || null,
      sort,
      tags: null,
      page: null,
    })
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
        {RECIPE_DIFFICULTIES.map((d) => (
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
        <NativeSelect value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
          {RECIPE_SORTS.map((s) => (
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
