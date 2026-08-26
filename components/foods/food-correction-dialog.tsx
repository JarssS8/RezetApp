'use client'
import { useLocale, useTranslations } from 'next-intl'
import { useId, useState } from 'react'
import { EstimatedIcon } from '@/components/icons'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { correctFoodAction, createFoodAction, type FoodWithNutrition } from '@/lib/actions/foods'
import type { ActionResult } from '@/lib/actions/result'
import { BASE_UNITS, type BaseUnit } from '@/lib/domain/types'
import { unitLabel } from '@/lib/domain/units-data'
import type { Locale } from '@/lib/prefs'
import { FoodCorrectionSchema, FoodInputSchema, type FoodCorrection, type FoodInput } from '@/lib/validation/foods'
import { ALLERGENS } from '@/lib/validation/household'

// Claves de campo numéricas: se guardan como texto en el formulario (para
// aceptar coma decimal mientras se escribe) y se parsean solo al comparar/guardar.
const NUMBER_FIELDS = [
  'kcal100g',
  'protein100g',
  'carbs100g',
  'fat100g',
  'fiber100g',
  'gramsPerCup',
  'gramsPerTbsp',
  'gramsPerUnit',
  'densityGPerMl',
] as const
type NumberField = (typeof NUMBER_FIELDS)[number]
type NameField = 'nameEs' | 'nameEn'
type Allergen = (typeof ALLERGENS)[number]

// FoodSummary.allergens llega tipado como string[] (contrato congelado); se
// filtra sin cast para acotarlo a los 14 alérgenos válidos del esquema.
function isAllergen(v: string): v is Allergen {
  return (ALLERGENS as readonly string[]).includes(v)
}
function toAllergenList(values: readonly string[]): Allergen[] {
  return values.filter(isAllergen)
}

interface FormState {
  nameEs: string
  nameEn: string
  defaultUnit: BaseUnit
  kcal100g: string
  protein100g: string
  carbs100g: string
  fat100g: string
  fiber100g: string
  gramsPerCup: string
  gramsPerTbsp: string
  gramsPerUnit: string
  densityGPerMl: string
  allergens: Allergen[]
}

interface EditableFields {
  nameEs: string
  nameEn: string
  defaultUnit: BaseUnit
  kcal100g: number | null
  protein100g: number | null
  carbs100g: number | null
  fat100g: number | null
  fiber100g: number | null
  gramsPerCup: number | null
  gramsPerTbsp: number | null
  gramsPerUnit: number | null
  densityGPerMl: number | null
  allergens: Allergen[]
}

function numberToField(n: number | null): string {
  return n === null ? '' : String(n)
}

function emptyFormState(): FormState {
  return {
    nameEs: '',
    nameEn: '',
    defaultUnit: 'g',
    kcal100g: '',
    protein100g: '',
    carbs100g: '',
    fat100g: '',
    fiber100g: '',
    gramsPerCup: '',
    gramsPerTbsp: '',
    gramsPerUnit: '',
    densityGPerMl: '',
    allergens: [],
  }
}

function toFormState(food: FoodWithNutrition | null): FormState {
  if (!food) return emptyFormState()
  return {
    nameEs: food.nameEs,
    nameEn: food.nameEn,
    defaultUnit: food.defaultUnit,
    kcal100g: numberToField(food.kcal100g),
    protein100g: numberToField(food.protein100g),
    carbs100g: numberToField(food.carbs100g),
    fat100g: numberToField(food.fat100g),
    fiber100g: numberToField(food.fiber100g),
    gramsPerCup: numberToField(food.gramsPerCup),
    gramsPerTbsp: numberToField(food.gramsPerTbsp),
    gramsPerUnit: numberToField(food.gramsPerUnit),
    densityGPerMl: numberToField(food.densityGPerMl),
    allergens: toAllergenList(food.allergens),
  }
}

// Acepta coma decimal (locale es); vacío -> null; inválido -> NaN (lo rechaza el esquema zod).
function parseNumberField(raw: string): number | null {
  const trimmed = raw.trim()
  if (trimmed === '') return null
  return Number(trimmed.replace(',', '.'))
}

function toEditable(form: FormState): EditableFields {
  return {
    nameEs: form.nameEs.trim(),
    nameEn: form.nameEn.trim(),
    defaultUnit: form.defaultUnit,
    kcal100g: parseNumberField(form.kcal100g),
    protein100g: parseNumberField(form.protein100g),
    carbs100g: parseNumberField(form.carbs100g),
    fat100g: parseNumberField(form.fat100g),
    fiber100g: parseNumberField(form.fiber100g),
    gramsPerCup: parseNumberField(form.gramsPerCup),
    gramsPerTbsp: parseNumberField(form.gramsPerTbsp),
    gramsPerUnit: parseNumberField(form.gramsPerUnit),
    densityGPerMl: parseNumberField(form.densityGPerMl),
    allergens: form.allergens,
  }
}

function sameAllergens(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false
  const setB = new Set(b)
  return a.every((v) => setB.has(v))
}

// Solo las claves que cambian respecto al alimento original (§9.4: la corrección
// manual gana siempre, pero no reescribimos lo que el usuario no ha tocado).
function buildPatch(original: FoodWithNutrition, current: EditableFields): FoodCorrection {
  return {
    ...(current.nameEs !== original.nameEs ? { nameEs: current.nameEs } : {}),
    ...(current.nameEn !== original.nameEn ? { nameEn: current.nameEn } : {}),
    ...(current.defaultUnit !== original.defaultUnit ? { defaultUnit: current.defaultUnit } : {}),
    ...(current.kcal100g !== original.kcal100g ? { kcal100g: current.kcal100g } : {}),
    ...(current.protein100g !== original.protein100g ? { protein100g: current.protein100g } : {}),
    ...(current.carbs100g !== original.carbs100g ? { carbs100g: current.carbs100g } : {}),
    ...(current.fat100g !== original.fat100g ? { fat100g: current.fat100g } : {}),
    ...(current.fiber100g !== original.fiber100g ? { fiber100g: current.fiber100g } : {}),
    ...(current.gramsPerCup !== original.gramsPerCup ? { gramsPerCup: current.gramsPerCup } : {}),
    ...(current.gramsPerTbsp !== original.gramsPerTbsp ? { gramsPerTbsp: current.gramsPerTbsp } : {}),
    ...(current.gramsPerUnit !== original.gramsPerUnit ? { gramsPerUnit: current.gramsPerUnit } : {}),
    ...(current.densityGPerMl !== original.densityGPerMl ? { densityGPerMl: current.densityGPerMl } : {}),
    ...(sameAllergens(current.allergens, original.allergens) ? {} : { allergens: current.allergens }),
  }
}

export interface FoodCorrectionDialogProps {
  food: FoodWithNutrition | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: (food: FoodWithNutrition) => void
  locale?: Locale
  // Inyectables para tests; por defecto las server actions reales.
  correct?: (foodId: string, patch: FoodCorrection) => Promise<ActionResult<FoodWithNutrition>>
  create?: (input: FoodInput) => Promise<ActionResult<FoodWithNutrition>>
}

// Diálogo de creación (food = null) y corrección manual (§9.4) de un alimento.
// Reutilizado por recetas, despensa y el escáner (decisión 12 del plan).
export function FoodCorrectionDialog({ food, open, onOpenChange, onSaved, locale, correct = correctFoodAction, create = createFoodAction }: FoodCorrectionDialogProps) {
  const t = useTranslations('recipes')
  const tc = useTranslations('common')
  const fallbackLocale = useLocale()
  const activeLocale = locale ?? fallbackLocale
  const uid = useId()
  const [form, setForm] = useState<FormState>(() => toFormState(food))
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  // Ajuste de estado durante el renderizado (patrón recomendado por React en
  // vez de un efecto): cada vez que el diálogo pasa a abierto -con este
  // alimento- se descartan ediciones sin guardar de una apertura anterior.
  const [openKey, setOpenKey] = useState('closed')
  const nextOpenKey = open ? `open:${food?.id ?? '__new__'}` : 'closed'
  if (nextOpenKey !== openKey) {
    setOpenKey(nextOpenKey)
    if (open) {
      setForm(toFormState(food))
      setError(null)
    }
  }

  function setField(key: NameField | NumberField, value: string) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  function toggleAllergen(key: Allergen) {
    setForm((f) => ({
      ...f,
      allergens: f.allergens.includes(key) ? f.allergens.filter((a) => a !== key) : [...f.allergens, key],
    }))
  }

  async function handleSave() {
    setError(null)
    const current = toEditable(form)
    setSaving(true)
    try {
      if (food) {
        const patch = buildPatch(food, current)
        if (!FoodCorrectionSchema.safeParse(patch).success) {
          setError(t('food.correction.error'))
          return
        }
        const result = await correct(food.id, patch)
        if (!result.ok) {
          setError(t('food.correction.error'))
          return
        }
        onSaved(result.data)
        onOpenChange(false)
      } else {
        const parsed = FoodInputSchema.safeParse(current)
        if (!parsed.success) {
          setError(t('food.correction.error'))
          return
        }
        const result = await create(parsed.data)
        if (!result.ok) {
          setError(t('food.correction.error'))
          return
        }
        onSaved(result.data)
        onOpenChange(false)
      }
    } finally {
      setSaving(false)
    }
  }

  const nameFieldOrder: readonly NameField[] = activeLocale === 'en' ? ['nameEn', 'nameEs'] : ['nameEs', 'nameEn']

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogTitle>{food ? t('food.correct') : t('food.create')}</DialogTitle>
        {food?.isEstimated ? (
          <div className="flex items-center gap-2">
            <Badge variant="outline">
              <EstimatedIcon size={12} />
              {t('food.estimated')}
            </Badge>
            <p className="text-xs text-text-2">{t('food.correction.estimatedHint')}</p>
          </div>
        ) : null}
        {food && food.householdId === null ? <p className="text-xs text-text-2">{t('food.copyNote')}</p> : null}
        <div className="grid grid-cols-2 gap-3">
          {nameFieldOrder.map((key) => (
            <div key={key}>
              <Label htmlFor={`${uid}-${key}`}>{t(`food.fields.${key}`)}</Label>
              <Input id={`${uid}-${key}`} value={form[key]} onChange={(e) => setField(key, e.target.value)} />
            </div>
          ))}
          <div>
            <Label htmlFor={`${uid}-defaultUnit`}>{t('food.fields.defaultUnit')}</Label>
            <select
              id={`${uid}-defaultUnit`}
              value={form.defaultUnit}
              onChange={(e) => setForm((f) => ({ ...f, defaultUnit: e.target.value as BaseUnit }))}
              className="h-8 w-full rounded-sm border border-input bg-transparent px-2.5 text-sm"
            >
              {BASE_UNITS.map((u) => (
                <option key={u} value={u}>
                  {unitLabel(u, 1, activeLocale)}
                </option>
              ))}
            </select>
          </div>
          {NUMBER_FIELDS.map((key) => (
            <div key={key}>
              <Label htmlFor={`${uid}-${key}`}>{t(`food.fields.${key}`)}</Label>
              <Input id={`${uid}-${key}`} inputMode="decimal" value={form[key]} onChange={(e) => setField(key, e.target.value)} />
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {ALLERGENS.map((key) => {
            const id = `${uid}-allergen-${key}`
            return (
              <Label key={key} htmlFor={id} className="min-h-11 items-center gap-1.5 rounded-pill border border-border px-3 text-xs">
                <input type="checkbox" id={id} checked={form.allergens.includes(key)} onChange={() => toggleAllergen(key)} />
                {t(`food.allergens.${key}`)}
              </Label>
            )
          })}
        </div>
        {error ? (
          <p role="alert" className="text-xs text-warn">
            {error}
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {tc('actions.cancel')}
          </Button>
          <Button type="button" aria-busy={saving} disabled={saving} onClick={() => void handleSave()}>
            {tc('actions.save')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
