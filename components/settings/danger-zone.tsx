'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { LogoutIcon, TrashIcon } from '@/components/icons'
import type { ActionResult } from '@/lib/actions/result'

export type LeaveHouseholdFn = () => Promise<ActionResult<null>>
export type DeleteHouseholdFn = (confirmName: string) => Promise<ActionResult<null>>

// "Salir" se ve para cualquier miembro y, si eres propietario, solo cuando
// hay otro propietario en el hogar (canLeave lo calcula el servidor contando
// owners; el servicio vuelve a comprobarlo y aquí se cubre la carrera con el
// mensaje de error). "Borrar" es solo del propietario.
export function DangerZone({
  householdName,
  isOwner,
  canLeave,
  leaveAction,
  deleteAction,
}: {
  householdName: string
  isOwner: boolean
  canLeave: boolean
  leaveAction: LeaveHouseholdFn
  deleteAction: DeleteHouseholdFn
}) {
  const showLeave = !isOwner || canLeave
  return (
    <div className="flex flex-col gap-4">
      {showLeave && <LeaveSection leaveAction={leaveAction} />}
      {isOwner && <DeleteSection householdName={householdName} deleteAction={deleteAction} />}
    </div>
  )
}

function LeaveSection({ leaveAction }: { leaveAction: LeaveHouseholdFn }) {
  const t = useTranslations('settings')
  const c = useTranslations('common')
  const [open, setOpen] = useState(false)
  const [error, setError] = useState(false)
  const [pending, startTransition] = useTransition()

  function onConfirm() {
    setError(false)
    startTransition(async () => {
      const res = await leaveAction()
      if (!res.ok) setError(true)
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button type="button" variant="destructive" />}>
        <LogoutIcon size={16} />
        {t('household.leave')}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('household.leave')}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-text-2">{t('household.leaveConfirm')}</p>
        {error && (
          <p role="alert" className="text-sm text-danger-ink">
            {t('household.error')}
          </p>
        )}
        <DialogFooter>
          <DialogClose render={<Button type="button" variant="outline" />}>{c('actions.cancel')}</DialogClose>
          <Button type="button" variant="destructive" onClick={onConfirm} aria-busy={pending} disabled={pending}>
            {t('household.leave')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DeleteSection({ householdName, deleteAction }: { householdName: string; deleteAction: DeleteHouseholdFn }) {
  const t = useTranslations('settings')
  const c = useTranslations('common')
  const [open, setOpen] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  // Código de ActionResult, no solo un booleano (auditoría W7-ola1, matiz del
  // hallazgo 8.1): distingue el único error de verdad "de este campo"
  // (`validation`, del propio deleteHouseholdAction) de un fallo de la
  // llamada al servidor, que no vuelve inválido el texto que se tecleó.
  const [errorCode, setErrorCode] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const matches = confirmText === householdName
  const error = errorCode !== null

  function onOpenChange(next: boolean) {
    setOpen(next)
    if (!next) {
      setConfirmText('')
      setErrorCode(null)
    }
  }

  function onConfirm() {
    if (!matches) return
    setErrorCode(null)
    startTransition(async () => {
      const res = await deleteAction(confirmText)
      if (!res.ok) setErrorCode(res.code)
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger render={<Button type="button" variant="destructive" />}>
        <TrashIcon size={16} />
        {t('household.delete')}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('household.delete')}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-text-2">{t('household.deleteHint', { name: householdName })}</p>
        <div className="flex flex-col gap-2">
          <Label htmlFor="delete-confirm-name">{t('household.deleteConfirmField')}</Label>
          <Input
            id="delete-confirm-name"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            // aria-invalid solo con error de validación de verdad; un fallo
            // de servidor no vuelve inválido lo que se tecleó (aria-describedby
            // sí se mantiene siempre: el texto de abajo sigue siendo relevante).
            aria-invalid={errorCode === 'validation'}
            aria-describedby={error ? 'delete-confirm-error' : undefined}
          />
        </div>
        {error && (
          <p id="delete-confirm-error" role="alert" className="text-sm text-danger-ink">
            {t('household.error')}
          </p>
        )}
        <DialogFooter>
          <DialogClose render={<Button type="button" variant="outline" />}>{c('actions.cancel')}</DialogClose>
          <Button type="button" variant="destructive" onClick={onConfirm} aria-busy={pending} disabled={pending || !matches}>
            {t('household.delete')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
