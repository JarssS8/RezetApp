import { useTranslations } from 'next-intl'
import { WarningIcon } from '@/components/icons'
import type { FoodWithNutrition } from '@/lib/actions/foods'
import { formatQuantity, toDisplayUnit } from '@/lib/domain'
import type { IngredientWithFood, Locale, ScaledRecipe, UnitSystem } from '@/lib/domain/types'
import { cn } from '@/lib/utils'

// IngredientWithFood tipa `food` como FoodNutrition (el mínimo que exige el
// dominio); en el servidor siempre llega resuelto a FoodWithNutrition (trae
// nameEs/nameEn) — cast estructural válido porque FoodWithNutrition extiende
// FoodNutrition (ver lib/services/foods.ts).
export type DetailIngredient = Omit<IngredientWithFood, 'food'> & { food: FoodWithNutrition | null }

export interface IngredientRow {
  id: string
  name: string
  text: string
  preparation: string | null
  nonLinear: boolean
  unresolved: boolean
}

// Construye las filas ya formateadas a partir de una receta escalada
// (dominio) y las líneas originales con el alimento resuelto. Toda la
// aritmética pasa por toDisplayUnit + formatQuantity — nunca a mano
// (docs/03-DOMINIO §3, regla 1 de AGENTS.md).
export function buildIngredientRows(scaled: ScaledRecipe, ingredients: DetailIngredient[], locale: Locale, units: UnitSystem): IngredientRow[] {
  const byId = new Map(ingredients.map((i) => [i.id, i]))
  const rows: IngredientRow[] = []
  for (const i of scaled.ingredients) {
    const src = byId.get(i.id)
    if (!src) continue
    const display =
      i.quantity !== null && i.unit !== null
        ? toDisplayUnit(i.quantity, i.unit, src.food, units, i.displayUnit ?? undefined)
        : i.displayQuantity !== null
          ? { quantity: i.displayQuantity, unit: i.displayUnit ?? '' }
          : null
    rows.push({
      id: i.id,
      name: src.food ? (locale === 'en' ? src.food.nameEn : src.food.nameEs) : src.rawText,
      text: display ? formatQuantity(display.quantity, display.unit || null, locale) : '',
      preparation: i.preparation,
      nonLinear: scaled.nonLinearIds.includes(i.id),
      unresolved: !src.food,
    })
  }
  return rows
}

export interface IngredientListProps {
  rows: IngredientRow[]
}

// Pinta las filas ya calculadas: ámbar (text-warn + bg-warn-soft + WarningIcon)
// para los ingredientes que no escalan linealmente, con una única nota al
// final (nunca una por fila) explicando por qué.
export function IngredientList({ rows }: IngredientListProps) {
  const t = useTranslations('recipes')
  const hasNonLinear = rows.some((row) => row.nonLinear)

  return (
    <div>
      <ul className="flex flex-col divide-y divide-border">
        {rows.map((row) => (
          <li
            key={row.id}
            className={cn('flex items-start justify-between gap-3 py-2', row.nonLinear && 'rounded-sm bg-warn-soft px-2 text-warn')}
          >
            <span className="flex flex-col gap-0.5">
              <span className="flex items-center gap-1">
                {row.nonLinear ? <WarningIcon size={16} title={t('detail.nonLinear')} /> : null}
                <span>{row.name}</span>
                {row.preparation ? (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="text-text-2">{row.preparation}</span>
                  </>
                ) : null}
              </span>
              {row.unresolved ? <span className="text-xs text-text-2">{t('detail.unresolved')}</span> : null}
            </span>
            <span className="tabular shrink-0 whitespace-nowrap">{row.text}</span>
          </li>
        ))}
      </ul>
      {hasNonLinear ? <p className="mt-2 text-xs text-warn">{t('detail.nonLinearNote')}</p> : null}
    </div>
  )
}
