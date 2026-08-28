'use client'

import { useState, useTransition, type FormEvent } from 'react'
import { useTranslations } from 'next-intl'
import type { z } from 'zod'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { ActionResult } from '@/lib/actions/result'
import type { HouseholdUpdateSchema } from '@/lib/validation/household'

// components no puede importar lib/services (frontera boundaries/dependencies):
// se replica aquí la forma de HouseholdSummary en vez de importarla del servicio.
export interface HouseholdSummary {
  id: string
  name: string
  defaultServings: number
  expiryAlertDays: number
}

export type HouseholdUpdate = z.infer<typeof HouseholdUpdateSchema>
export type UpdateHouseholdFn = (input: HouseholdUpdate) => Promise<ActionResult<HouseholdSummary>>

// Solo el propietario guarda; un miembro ve los campos deshabilitados (misma
// idea que MembersPanel: cada uno edita lo que le corresponde, el resto solo
// lo consulta).
export function HouseholdForm({ initial, isOwner, updateAction }: { initial: HouseholdSummary; isOwner: boolean; updateAction: UpdateHouseholdFn }) {
  const t = useTranslations('settings')
  const [values, setValues] = useState(initial)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState(false)
  const [pending, startTransition] = useTransition()

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    setSaved(false)
    setError(false)
    startTransition(async () => {
      const res = await updateAction({ name: values.name, defaultServings: values.defaultServings, expiryAlertDays: values.expiryAlertDays })
      if (res.ok) {
        setValues(res.data)
        setSaved(true)
      } else {
        setError(true)
      }
    })
  }

  return (
    <Card className="p-4">
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="household-name">{t('household.name')}</Label>
          <Input
            id="household-name"
            value={values.name}
            onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
            disabled={!isOwner}
            maxLength={80}
            required
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="household-servings">{t('household.defaultServings')}</Label>
          <Input
            id="household-servings"
            type="number"
            min={1}
            max={50}
            value={values.defaultServings}
            onChange={(e) => setValues((v) => ({ ...v, defaultServings: Number(e.target.value) }))}
            disabled={!isOwner}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="household-alert">{t('household.expiryAlertDays')}</Label>
          <Input
            id="household-alert"
            type="number"
            min={0}
            max={60}
            value={values.expiryAlertDays}
            onChange={(e) => setValues((v) => ({ ...v, expiryAlertDays: Number(e.target.value) }))}
            disabled={!isOwner}
          />
        </div>
        {isOwner && (
          <Button type="submit" aria-busy={pending} disabled={pending}>
            {t('household.save')}
          </Button>
        )}
        {saved && !pending && (
          <p role="status" className="text-sm text-text-2">
            {t('household.saved')}
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-warn-ink">
            {t('household.error')}
          </p>
        )}
      </form>
    </Card>
  )
}

export interface HouseholdOption {
  id: string
  name: string
  role: 'owner' | 'member'
}

export type SwitchHouseholdFn = (householdId: string) => Promise<ActionResult<null>>

// Lista los hogares del usuario y deja cambiar de activo. Si solo pertenece a
// uno, no hay nada que elegir: no se pinta la sección.
export function HouseholdSwitcher({ households, currentId, switchAction }: { households: HouseholdOption[]; currentId: string; switchAction: SwitchHouseholdFn }) {
  const t = useTranslations('settings')
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [error, setError] = useState(false)
  const [, startTransition] = useTransition()

  if (households.length <= 1) return null

  function onSwitch(id: string) {
    setError(false)
    setPendingId(id)
    startTransition(async () => {
      const res = await switchAction(id)
      setPendingId(null)
      if (!res.ok) setError(true)
    })
  }

  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-medium">{t('household.households')}</h3>
      <ul className="flex flex-col gap-2">
        {households.map((h) => (
          <li key={h.id} className="flex min-h-11 items-center justify-between gap-2 rounded-sm border border-border bg-card p-2">
            <span>{h.name}</span>
            {h.id === currentId ? (
              <Badge variant="secondary">{t('household.current')}</Badge>
            ) : (
              <Button type="button" variant="outline" size="sm" onClick={() => onSwitch(h.id)} aria-busy={pendingId === h.id} disabled={pendingId === h.id}>
                {t('household.switch')}
              </Button>
            )}
          </li>
        ))}
      </ul>
      {error && (
        <p role="alert" className="text-sm text-warn-ink">
          {t('household.error')}
        </p>
      )}
    </div>
  )
}
