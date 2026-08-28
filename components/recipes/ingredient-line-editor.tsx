'use client'

import { useId, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { CheckIcon, TrashIcon, WarningIcon } from '@/components/icons'
import { FoodPicker } from '@/components/foods/food-picker'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import type { FoodSummary } from '@/lib/actions/foods'
import type { PreparedIngredient } from '@/lib/actions/recipes'
import { parseIngredientLine } from '@/lib/domain'
import type { Locale } from '@/lib/domain/types'
import { cn } from '@/lib/utils'

// Línea del editor: lo que devuelve prepareIngredientsAction (o lo ya
// guardado, al editar) más `touched`, que marca que el usuario la corrigió a
// mano -así una reanálisis del textarea no la pisa (ver recipe-editor.tsx).
export interface EditableIngredientLine extends PreparedIngredient {
  touched: boolean
}

export type ConfidenceLevel = 'high' | 'mid' | 'low'

// high: alimento resuelto y sin marca de revisión. mid: se resolvió un
// alimento pero el parser no está seguro (needsReview). low: no se resolvió
// ningún alimento. Es la única combinación posible con los datos que trae
// PreparedIngredient (needsReview es un booleano, no tres niveles).
export function confidenceLevel(line: Pick<PreparedIngredient, 'foodId' | 'needsReview'>): ConfidenceLevel {
  if (line.foodId === null) return 'low'
  return line.needsReview ? 'mid' : 'high'
}

const LEVEL_STYLES: Record<ConfidenceLevel, string> = {
  high: 'text-acc-ink',
  mid: 'text-warn-ink',
  low: 'text-destructive',
}

function displayFoodName(f: Pick<FoodSummary, 'nameEs' | 'nameEn'>, locale: Locale): string {
  return locale === 'en' ? f.nameEn : f.nameEs
}

export interface IngredientLineEditorProps {
  line: EditableIngredientLine
  onChange: (line: EditableIngredientLine) => void
  onRemove?: () => void
  locale: Locale
}

// Una línea del editor de ingredientes: muestra el texto tal cual lo escribió
// el usuario, el alimento reconocido (o la marca de "sin asignar") con un
// badge de confianza, y los controles para corregirlo a mano.
export function IngredientLineEditor({ line, onChange, onRemove, locale }: IngredientLineEditorProps) {
  const t = useTranslations('recipes')
  const uid = useId()
  // El alimento elegido a mano esta sesión (FoodPicker solo entrega FoodSummary,
  // con nombre); antes de que el usuario corrija nada se muestra la mejor
  // estimación del propio texto -misma función pura que usa el servidor al
  // parsear, así que el nombre que se ve aquí es consistente con lo que
  // prepareIngredientsAction ya resolvió como foodId.
  const [pickedFood, setPickedFood] = useState<FoodSummary | null>(null)

  // El texto adivinado de rawText es solo un último recurso -por ejemplo una
  // fila en blanco sin foodName-: en cuanto hay un alimento resuelto (por el
  // servicio o elegido a mano) se muestra su nombre real, nunca la conjetura.
  const guessedName = useMemo(() => parseIngredientLine(line.rawText, locale).foodName, [line.rawText, locale])
  const foodLabel = pickedFood ? displayFoodName(pickedFood, locale) : (line.foodName ?? guessedName)

  const level = confidenceLevel(line)

  function patch(next: Partial<EditableIngredientLine>) {
    onChange({ ...line, ...next, touched: true })
  }

  // Regla W2-R18: el navegador nunca convierte unidades (esa cuenta es del
  // servidor, que sí conoce gramsPerCup/gramsPerUnit/densidad del alimento).
  // Al corregir cantidad o unidad a mano se guarda solo displayQuantity/
  // displayUnit; quantity/unit quedan a null (nunca un valor previo, que
  // quedaría desactualizado) hasta que el servidor los recalcule -al guardar,
  // buildIngredientInput (recipe-editor.tsx) los omite para una línea touched,
  // así que prepareIngredientsWithFoods los repone con datos reales-.
  function handleQuantityChange(raw: string) {
    const value = raw.trim() === '' ? null : Number(raw)
    const displayQuantity = value !== null && Number.isFinite(value) ? value : null
    patch({ displayQuantity, quantity: null, unit: null })
  }

  function handleUnitChange(raw: string) {
    const displayUnit = raw.trim() ? raw : null
    patch({ displayUnit, quantity: null, unit: null })
  }

  return (
    <li className="flex flex-col gap-2 rounded-md border border-border p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <p className="text-xs text-text-2">{line.rawText}</p>
          <p className={cn('flex items-center gap-1 text-sm font-medium', LEVEL_STYLES[level])}>
            {level === 'high' ? <CheckIcon size={16} /> : <WarningIcon size={16} />}
            <span>{line.foodId !== null && foodLabel ? foodLabel : t('food.unresolved')}</span>
          </p>
          <span className={cn('text-xs', LEVEL_STYLES[level])}>{t(`editor.confidence.${level}`)}</span>
        </div>
        {onRemove ? (
          <Button type="button" variant="ghost" size="icon-sm" aria-label={t('editor.removeIngredient')} onClick={onRemove}>
            <TrashIcon size={16} />
          </Button>
        ) : null}
      </div>

      <FoodPicker
        value={pickedFood}
        onChange={(food) => {
          setPickedFood(food)
          patch({ foodId: food?.id ?? null, needsReview: food === null })
        }}
        locale={locale}
      />

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col items-start gap-0.5">
          <Label htmlFor={`${uid}-qty`} className="text-xs text-text-2">
            {t('editor.quantity')}
          </Label>
          <Input
            id={`${uid}-qty`}
            type="number"
            min={0}
            inputMode="decimal"
            value={line.displayQuantity ?? ''}
            onChange={(e) => handleQuantityChange(e.target.value)}
            className="w-24"
          />
        </div>
        <div className="flex flex-col items-start gap-0.5">
          <Label htmlFor={`${uid}-unit`} className="text-xs text-text-2">
            {t('editor.unit')}
          </Label>
          <Input id={`${uid}-unit`} value={line.displayUnit ?? ''} onChange={(e) => handleUnitChange(e.target.value)} className="w-20" />
        </div>
        <div className="flex flex-col items-start gap-0.5">
          <Label htmlFor={`${uid}-group`} className="text-xs text-text-2">
            {t('editor.group')}
          </Label>
          <Input
            id={`${uid}-group`}
            value={line.groupLabel ?? ''}
            onChange={(e) => patch({ groupLabel: e.target.value.trim() ? e.target.value : null })}
            className="w-32"
          />
        </div>
        <Label htmlFor={`${uid}-scales`} className="ml-auto flex items-center gap-2 text-xs text-text-2">
          {t('editor.scalesLinearly')}
          <Switch id={`${uid}-scales`} checked={line.scalesLinearly} onCheckedChange={(checked) => patch({ scalesLinearly: checked })} />
        </Label>
      </div>
    </li>
  )
}
