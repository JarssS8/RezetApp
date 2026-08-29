'use client'
import { useLocale, useTranslations } from 'next-intl'
import { type CSSProperties, useState } from 'react'
import { toast } from 'sonner'
import { MinusIcon, PlusIcon, TrashIcon, WarningIcon } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { adjustPantryItemAction, removePantryItemAction, type PantryRow as PantryItemRow } from '@/lib/actions/pantry'
import type { ActionResult } from '@/lib/actions/result'
import { formatQuantity, toDisplayUnit } from '@/lib/domain/quantities'
import type { UnitSystem } from '@/lib/domain/types'
import { cn } from '@/lib/utils'

const EXPIRY_WARN_DAYS = 7

// Paso del stepper (§brief tarea 14): 1 para piezas; 10 g/ml por debajo de 1 kg/l; 100 a partir de ahí.
// Se calcula sobre la cantidad en unidad base (siempre g/ml/ud), no sobre la de presentación.
function stepFor(quantity: number, unit: PantryItemRow['unit']): number {
  if (unit === 'ud') return 1
  return quantity >= 1000 ? 100 : 10
}

export interface PantryRowProps {
  item: PantryItemRow
  unitSystem: UnitSystem
  onRemoved?: (id: string) => void
  // Inyectables para tests; por defecto las server actions reales.
  adjust?: (itemId: string, delta: number) => Promise<ActionResult<PantryItemRow>>
  remove?: (id: string) => Promise<ActionResult<void>>
  // Entrada escalonada del primer pintado (W6.5, §2): índice YA recortado a 8
  // por quien la llama (pantry-list.tsx). Sin ella, la fila no anima entrada
  // (los tests de este componente no la pasan, y no la necesitan).
  staggerIndex?: number
}

// Fila de despensa: nombre, cantidad en unidad de presentación, stepper de
// ajuste rápido (optimista) y aviso de caducidad. Ver docs/03-DOMINIO.md.
export function PantryRow({ item, unitSystem, onRemoved, adjust = adjustPantryItemAction, remove = removePantryItemAction, staggerIndex }: PantryRowProps) {
  const t = useTranslations('pantry')
  const te = useTranslations('errors')
  const locale = useLocale()
  const [quantity, setQuantity] = useState(item.quantity)
  const [busy, setBusy] = useState(false)
  const [removing, setRemoving] = useState(false)

  // Ajuste de estado durante el renderizado (patrón recomendado por React en
  // vez de un efecto): si llega una fila más reciente del servidor (tras un
  // router.refresh() por SSE, por ejemplo) se resincroniza la cantidad local.
  const [syncedQuantity, setSyncedQuantity] = useState(item.quantity)
  if (item.quantity !== syncedQuantity) {
    setSyncedQuantity(item.quantity)
    setQuantity(item.quantity)
  }

  const step = stepFor(quantity, item.unit)
  const display = toDisplayUnit(quantity, item.unit, item.food, unitSystem)
  const days = item.daysToExpiry
  const expiry =
    days === null
      ? { label: t('noExpiry'), warn: false }
      : days < 0
        ? { label: t('expired'), warn: true }
        : days === 0
          ? { label: t('expiresToday'), warn: true }
          : { label: t('expiresIn', { days }), warn: days < EXPIRY_WARN_DAYS }

  async function handleAdjust(delta: number) {
    const previous = quantity
    setQuantity(Math.max(0, previous + delta))
    setBusy(true)
    try {
      const result = await adjust(item.id, delta)
      if (!result.ok) {
        setQuantity(previous)
        toast.error(te('generic'))
        return
      }
      setQuantity(result.data.quantity)
    } finally {
      setBusy(false)
    }
  }

  async function handleRemove() {
    setBusy(true)
    try {
      const result = await remove(item.id)
      if (!result.ok) {
        toast.error(te('generic'))
        return
      }
      // Se marca la fila y se avisa al padre cuando termina la transición. El
      // temporizador de reserva cubre el caso en que el navegador no dispare
      // `transitionend` (pestaña en segundo plano, reduced-motion con .01ms).
      setRemoving(true)
      window.setTimeout(() => onRemoved?.(item.id), 240)
    } finally {
      setBusy(false)
    }
  }

  return (
    <li
      data-removing={removing ? 'true' : undefined}
      // staggerIndex solo llega del primer pintado (pantry-list.tsx): un
      // ajuste optimista no vuelve a montar la fila, así que `stagger-in`
      // (una animación de un solo disparo) no se repite en cada ajuste. El
      // custom property se fija aquí (no en el contenido) porque desciende
      // por herencia hasta donde `.stagger-in` la lee.
      style={staggerIndex !== undefined ? ({ '--stagger-i': staggerIndex } as CSSProperties) : undefined}
      // Auditoría W7, hallazgo 7.1: antes se animaba `max-height`, la única
      // propiedad de layout que reflowaba por frame en toda la app (se nota
      // con listas largas). Mismo patrón que finish-dialog.tsx: una pista de
      // grid que pasa de 1fr a 0fr, sin medir nada en JavaScript y sin tocar
      // el árbol de layout en cada fotograma como max-height. El timeout de
      // reserva de handleRemove (240ms) sigue siendo quien avisa al padre;
      // esto solo cambia cómo se ve mientras tanto.
      className={cn('grid transition-[grid-template-rows] duration-(--dur-2) ease-(--ease-in)', removing ? 'grid-rows-[0fr]' : 'grid-rows-[1fr]')}
    >
      <div className="overflow-hidden">
        <div
          className={cn(
            'flex items-center gap-3 rounded-md border border-line-2 bg-card px-3 py-2.5 shadow-card',
            'transition-[opacity,transform] duration-(--dur-2) ease-(--ease-in)',
            staggerIndex !== undefined && 'stagger-in',
            removing && 'scale-[.97] opacity-0',
          )}
        >
          <span aria-hidden="true" className="size-2 shrink-0 rounded-pill bg-acc-line" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{item.name}</p>
            <p className={cn('inline-flex items-center gap-1 text-xs', expiry.warn ? 'rounded-pill bg-warn-soft px-1.5 py-0.5 text-warn-ink' : 'text-text-2')}>
              {expiry.warn ? <WarningIcon size={12} /> : null}
              {expiry.label}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <Button type="button" variant="outline" size="icon-sm" aria-label={t('decrease')} disabled={busy} onClick={() => void handleAdjust(-step)}>
              <MinusIcon size={16} />
            </Button>
            <span className="w-14 text-center text-sm tabular">{formatQuantity(display.quantity, display.unit, locale)}</span>
            <Button type="button" variant="outline" size="icon-sm" aria-label={t('increase')} disabled={busy} onClick={() => void handleAdjust(step)}>
              <PlusIcon size={16} />
            </Button>
          </div>
          <Button type="button" variant="ghost" size="icon-sm" aria-label={t('remove')} disabled={busy} onClick={() => void handleRemove()}>
            <TrashIcon size={16} />
          </Button>
        </div>
      </div>
    </li>
  )
}
