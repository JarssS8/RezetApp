'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { ServingsStepper } from '@/components/recipes/servings-stepper'
import { logCookedAction, type CookedResult } from '@/lib/actions/cooking'
import { actionErrorKey } from '@/lib/actions/result'
import { formatQuantity, MEAL_SLOTS, type MealSlot } from '@/lib/domain'
import type { Locale } from '@/lib/domain/types'
import { addDays, todayIso } from '@/lib/plan-dates'

export interface FinishCookingDialogProps {
  recipeId: string
  // null: se cocina desde una receta suelta; logCooked creará la entrada de hoy.
  entryId: string | null
  servings: number
  sourceSlot: MealSlot
}

// «¿Cuántas raciones has hecho?» y «¿Sobras?» (spec §8). Todo lo demás -descontar
// la despensa, registrar la nutrición, subir times_cooked- lo hace logCooked en
// una transacción: aquí solo se recogen los dos datos que el servidor no puede
// saber. Los avisos de faltantes se enseñan al volver, sin bloquear nada.
export function FinishCookingDialog({ recipeId, entryId, servings, sourceSlot }: FinishCookingDialogProps) {
  const t = useTranslations('cook')
  const c = useTranslations('common')
  const e = useTranslations('errors')
  const locale = useLocale() as Locale
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [cooked, setCooked] = useState(servings)
  const [withLeftovers, setWithLeftovers] = useState(false)
  const [leftoverServings, setLeftoverServings] = useState(1)
  const [leftoverDate, setLeftoverDate] = useState(() => addDays(todayIso(), 1))
  const [leftoverSlot, setLeftoverSlot] = useState<MealSlot>(sourceSlot)
  const [pending, setPending] = useState(false)
  const [warnings, setWarnings] = useState<CookedResult['warnings']>([])
  // Tras un envío correcto con avisos, «Guardar» pasa a «Cerrar»: si no, un
  // segundo click reenviaría el mismo cocinado (la ventana de repetición del
  // servidor lo evita, pero no hay motivo para dejarlo a mano).
  const [done, setDone] = useState(false)

  async function submit() {
    setPending(true)
    // exactOptionalPropertyTypes: la clave `leftovers` no se manda como
    // undefined, se omite. Igual con entryId/recipeId: exactamente uno viaja.
    const base = entryId ? { entryId } : { recipeId }
    const payload = withLeftovers
      ? { ...base, servingsCooked: cooked, leftovers: { servings: leftoverServings, date: leftoverDate, slot: leftoverSlot } }
      : { ...base, servingsCooked: cooked }
    const result = await logCookedAction(payload)
    setPending(false)
    if (!result.ok) {
      toast.error(e(actionErrorKey(result.code)))
      return
    }
    setWarnings(result.data.warnings)
    if (result.data.warnings.length === 0) {
      setOpen(false)
      router.push('/today')
      return
    }
    setDone(true)
    router.refresh()
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button type="button" size="lg" className="w-full" />}>{t('finish')}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('finishTitle')}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm">{t('servingsCooked')}</span>
            <ServingsStepper value={cooked} onChange={setCooked} />
          </div>
          <label className="flex min-h-11 items-center gap-3">
            <input type="checkbox" checked={withLeftovers} onChange={(ev) => setWithLeftovers(ev.target.checked)} className="size-5 accent-primary" />
            <span>{t('leftovers')}</span>
          </label>
          <div
            data-open={withLeftovers ? 'true' : undefined}
            // Animación #5: hasta W6 el bloque aparecía de golpe y el diálogo
            // pegaba un salto de tamaño. grid-rows de 0fr a 1fr es la forma de
            // animar "alto automático" sin medir nada en JavaScript.
            className="group grid grid-rows-[0fr] transition-[grid-template-rows] duration-(--dur-2) ease-in-out data-open:grid-rows-[1fr]"
          >
            <div className="overflow-hidden" inert={withLeftovers ? undefined : true}>
              <div className="flex flex-col gap-3 rounded-sm bg-surface-sunken p-3 opacity-0 transition-opacity duration-(--dur-2) delay-75 ease-(--ease-out) group-data-open:opacity-100">
                <div className="flex flex-col gap-1">
                  <Label htmlFor="cook-leftover-date">{t('leftoverDate')}</Label>
                  <Input id="cook-leftover-date" type="date" value={leftoverDate} onChange={(ev) => setLeftoverDate(ev.target.value)} />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="cook-leftover-slot">{t('leftoverSlot')}</Label>
                  <NativeSelect id="cook-leftover-slot" value={leftoverSlot} onChange={(ev) => setLeftoverSlot(ev.target.value as MealSlot)}>
                    {MEAL_SLOTS.map((s) => (
                      <option key={s} value={s}>
                        {t(`slots.${s}`)}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm">{t('leftoverServings')}</span>
                  <ServingsStepper value={leftoverServings} onChange={setLeftoverServings} />
                </div>
              </div>
            </div>
          </div>
          {warnings.length > 0 ? (
            <ul aria-label={t('warnings')} className="flex flex-col gap-1 rounded-sm bg-warn-soft p-2 text-sm text-warn-ink">
              {warnings.map((w) => (
                <li key={`${w.foodId}|${w.unit}`}>{t('warningLine', { name: w.name, missing: formatQuantity(w.requested - w.deducted, w.unit, locale) })}</li>
              ))}
            </ul>
          ) : null}
        </div>
        <DialogFooter>
          <Button type="button" disabled={pending} aria-busy={pending} onClick={() => (done ? setOpen(false) : void submit())}>
            {done ? c('actions.close') : c('actions.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
