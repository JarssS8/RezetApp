'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { LeftoversIcon, MinusIcon, PlusIcon } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createLeftoverAction } from '@/lib/actions/plan'
import { addDays, todayIso } from '@/lib/plan-dates'
import type { MealSlot } from '@/lib/validation/plan'
import { MEAL_SLOTS } from './types'

export interface LeftoverDialogProps {
  fromEntryId: string
  sourceSlot: MealSlot
  onCreated?: () => void
}

// Diálogo, incrustado en el chip de origen, para planificar una sobra: una
// comida planificable que no genera compra (spec §8) y que referencia la
// entrada original (docs/03-DOMINIO §8, campo `ofEntryId` en
// CreateLeftoverInputSchema de lib/validation/plan.ts). Por defecto, mañana
// y el mismo hueco que la entrada de origen, 1 ración.
export function LeftoverDialog({ fromEntryId, sourceSlot, onCreated }: LeftoverDialogProps) {
  const t = useTranslations('plan')
  const c = useTranslations('common')
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [date, setDate] = useState(() => addDays(todayIso(), 1))
  const [slot, setSlot] = useState<MealSlot>(sourceSlot)
  const [servings, setServings] = useState(1)
  const [pending, setPending] = useState(false)

  // Reinicia el formulario a sus valores por defecto cada vez que se abre
  // (si el usuario cerró el diálogo con cambios sin enviar y lo vuelve a
  // abrir, no debe arrastrar el estado anterior). Ajuste durante el render,
  // no en un efecto (mismo patrón que week-view.tsx::syncedEntries): evita
  // el repintado en cascada de un setState síncrono dentro de useEffect.
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setDate(addDays(todayIso(), 1))
      setSlot(sourceSlot)
      setServings(1)
    }
  }

  async function submit() {
    setPending(true)
    const result = await createLeftoverAction({ ofEntryId: fromEntryId, date, slot, servings })
    setPending(false)
    if (!result.ok) {
      toast.error(t('errors.leftover'))
      return
    }
    setOpen(false)
    router.refresh()
    onCreated?.()
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger aria-label={t('createLeftover')} render={<Button type="button" variant="ghost" size="icon-xs" />}>
        <LeftoversIcon size={14} />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('leftover')}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor="leftover-date">{t('leftoverDate')}</Label>
            <Input id="leftover-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-11" />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="leftover-slot">{t('leftoverSlot')}</Label>
            <select
              id="leftover-slot"
              value={slot}
              onChange={(e) => setSlot(e.target.value as MealSlot)}
              className="h-11 rounded-sm border border-border bg-transparent px-2 text-sm"
            >
              {MEAL_SLOTS.map((s) => (
                <option key={s} value={s}>
                  {t(`slots.${s}`)}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm">{t('servings')}</span>
            <Button type="button" variant="ghost" size="icon-sm" aria-label={t('servingsDec')} onClick={() => setServings((s) => Math.max(1, s - 1))}>
              <MinusIcon size={14} />
            </Button>
            <span className="w-6 text-center text-sm tabular-nums">{servings}</span>
            <Button type="button" variant="ghost" size="icon-sm" aria-label={t('servingsInc')} onClick={() => setServings((s) => s + 1)}>
              <PlusIcon size={14} />
            </Button>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" disabled={pending} onClick={() => void submit()}>
            {c('actions.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
