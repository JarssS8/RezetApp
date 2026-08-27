'use client'
import { useLocale, useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import type { FormEvent, ReactElement } from 'react'
import { useState } from 'react'
import { toast } from 'sonner'
import { CupboardIcon, FreezerIcon, FridgeIcon, type IconProps } from '@/components/icons'
import { FoodCorrectionDialog } from '@/components/foods/food-correction-dialog'
import { FoodPicker } from '@/components/foods/food-picker'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { type FoodSummary, type FoodWithNutrition } from '@/lib/actions/foods'
import { upsertPantryItemAction, type PantryRow } from '@/lib/actions/pantry'
import type { ActionResult } from '@/lib/actions/result'
import { BASE_UNITS, type BaseUnit } from '@/lib/domain/types'
import { unitLabel } from '@/lib/domain/units-data'

type PantryLocation = PantryRow['location']

const LOCATIONS: readonly PantryLocation[] = ['fridge', 'freezer', 'pantry']
const LOCATION_ICONS: Record<PantryLocation, (p: IconProps) => ReactElement> = {
  fridge: FridgeIcon,
  freezer: FreezerIcon,
  pantry: CupboardIcon,
}

interface PantryItemPayload {
  foodId: string
  quantity: number
  unit: BaseUnit
  location: PantryLocation
  expiresAt?: string
}

export interface PantryItemFormProps {
  initialFood?: FoodWithNutrition | null
  // Nombre sugerido con el que precargar el buscador de alimentos cuando el
  // escáner de códigos de barras (Task 16) no resolvió `initialFood`.
  initialQuery?: string
  // Inyectable para tests; por defecto la server action real.
  upsert?: (input: unknown) => Promise<ActionResult<PantryRow>>
}

// Alta de un artículo de despensa: elige alimento (FoodPicker, con salida a
// "crear alimento nuevo" cuando no existe todavía), cantidad ya en unidad
// base, ubicación y caducidad opcional. Sin alimento no hay a qué asociar la
// fila, así que el guardado queda deshabilitado hasta elegir uno.
export function PantryItemForm({ initialFood = null, initialQuery, upsert = upsertPantryItemAction }: PantryItemFormProps) {
  const t = useTranslations('pantry')
  const te = useTranslations('errors')
  const locale = useLocale()
  const router = useRouter()

  const [food, setFood] = useState<FoodSummary | null>(initialFood)
  const [quantity, setQuantity] = useState('')
  const [unit, setUnit] = useState<BaseUnit>(initialFood?.defaultUnit ?? 'g')
  const [location, setLocation] = useState<PantryLocation>('pantry')
  const [expiresAt, setExpiresAt] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  function handleFoodChange(next: FoodSummary | null) {
    setFood(next)
    if (next) setUnit(next.defaultUnit)
  }

  function handleFoodCreated(created: FoodWithNutrition) {
    setFood(created)
    setUnit(created.defaultUnit)
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!food) return
    setSaving(true)
    try {
      const payload: PantryItemPayload = {
        foodId: food.id,
        quantity: Number(quantity),
        unit,
        location,
        ...(expiresAt ? { expiresAt } : {}),
      }
      const result = await upsert(payload)
      if (!result.ok) {
        toast.error(te('generic'))
        return
      }
      router.push('/pantry')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label>{t('form.food')}</Label>
        <FoodPicker value={food} onChange={handleFoodChange} locale={locale} {...(initialQuery ? { initialQuery } : {})} />
        {!food ? (
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-text-2">{t('form.pickFood')}</p>
            <Button type="button" variant="link" size="sm" onClick={() => setCreateOpen(true)}>
              {t('form.createFood')}
            </Button>
          </div>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="pantry-item-quantity">{t('form.quantity')}</Label>
        <Input
          id="pantry-item-quantity"
          type="number"
          inputMode="decimal"
          min={0}
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="pantry-item-unit">{t('form.unit')}</Label>
        <select
          id="pantry-item-unit"
          value={unit}
          onChange={(e) => setUnit(e.target.value as BaseUnit)}
          className="h-8 w-full rounded-sm border border-input bg-transparent px-2.5 text-sm"
        >
          {BASE_UNITS.map((u) => (
            <option key={u} value={u}>
              {unitLabel(u, 1, locale)}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-2">
        <Label>{t('form.location')}</Label>
        <div className="flex gap-2">
          {LOCATIONS.map((loc) => {
            const LocationIcon = LOCATION_ICONS[loc]
            const active = location === loc
            return (
              <Button
                key={loc}
                type="button"
                variant={active ? 'default' : 'outline'}
                aria-pressed={active}
                onClick={() => setLocation(loc)}
                className="flex h-auto flex-1 flex-col items-center gap-1 py-2"
              >
                <LocationIcon size={20} />
                <span className="text-xs">{t(`locations.${loc}`)}</span>
              </Button>
            )
          })}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="pantry-item-expires-at">{t('form.expiresAt')}</Label>
        <Input id="pantry-item-expires-at" type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
      </div>

      <Button type="submit" aria-busy={saving} disabled={!food || saving}>
        {t('form.save')}
      </Button>

      <FoodCorrectionDialog food={null} open={createOpen} onOpenChange={setCreateOpen} onSaved={handleFoodCreated} locale={locale} />
    </form>
  )
}
