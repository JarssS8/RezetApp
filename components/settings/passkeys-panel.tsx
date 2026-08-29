'use client'

import { useState, useTransition, type FormEvent } from 'react'
import { useFormatter, useTranslations } from 'next-intl'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { EditIcon, TrashIcon } from '@/components/icons'
import type { ActionResult } from '@/lib/actions/result'

export interface PasskeyRow {
  credentialId: string
  name: string | null
  deviceType: string
  backedUp: boolean
  createdAt: string
  lastUsedAt: string | null
}

export type RenamePasskeyFn = (credentialId: string, name: string) => Promise<ActionResult<null>>
export type RemovePasskeyFn = (credentialId: string) => Promise<ActionResult<null>>

export function PasskeysPanel({ passkeys, renameAction, removeAction }: { passkeys: PasskeyRow[]; renameAction: RenamePasskeyFn; removeAction: RemovePasskeyFn }) {
  const isLast = passkeys.length <= 1
  return (
    <ul className="flex flex-col gap-3">
      {passkeys.map((passkey) => (
        <li key={passkey.credentialId}>
          <PasskeyCard passkey={passkey} isLast={isLast} renameAction={renameAction} removeAction={removeAction} />
        </li>
      ))}
    </ul>
  )
}

function PasskeyCard({
  passkey,
  isLast,
  renameAction,
  removeAction,
}: {
  passkey: PasskeyRow
  isLast: boolean
  renameAction: RenamePasskeyFn
  removeAction: RemovePasskeyFn
}) {
  const t = useTranslations('settings')
  const c = useTranslations('common')
  const format = useFormatter()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(passkey.name ?? '')
  const [renameError, setRenameError] = useState(false)
  const [renamePending, startRenameTransition] = useTransition()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [removeError, setRemoveError] = useState(false)
  const [removePending, startRemoveTransition] = useTransition()

  function onCancelRename() {
    setName(passkey.name ?? '')
    setRenameError(false)
    setEditing(false)
  }

  function onSubmitRename(e: FormEvent) {
    e.preventDefault()
    setRenameError(false)
    startRenameTransition(async () => {
      const res = await renameAction(passkey.credentialId, name.trim())
      if (!res.ok) setRenameError(true)
      else setEditing(false)
    })
  }

  function onConfirmRemove() {
    setRemoveError(false)
    startRemoveTransition(async () => {
      const res = await removeAction(passkey.credentialId)
      if (!res.ok) setRemoveError(true)
      else setConfirmOpen(false)
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center justify-between gap-2">
          {editing ? (
            <form onSubmit={onSubmitRename} className="flex flex-1 flex-wrap items-end gap-2">
              <div className="flex flex-1 flex-col gap-1">
                <Label htmlFor={`passkey-name-${passkey.credentialId}`}>{t('passkeys.name')}</Label>
                <Input
                  id={`passkey-name-${passkey.credentialId}`}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={60}
                  required
                  autoFocus
                  aria-invalid={renameError}
                  aria-describedby={renameError ? `passkey-rename-error-${passkey.credentialId}` : undefined}
                />
              </div>
              <Button type="submit" size="sm" aria-busy={renamePending} disabled={renamePending || !name.trim()}>
                {c('actions.save')}
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={onCancelRename}>
                {c('actions.cancel')}
              </Button>
            </form>
          ) : (
            <>
              <span>{passkey.name ?? t('passkeys.unnamed')}</span>
              <Badge variant={passkey.backedUp ? 'secondary' : 'outline'}>{passkey.backedUp ? t('passkeys.synced') : t('passkeys.device')}</Badge>
            </>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <p className="text-sm text-text-2">{t('passkeys.createdAt', { date: format.dateTime(new Date(passkey.createdAt), { dateStyle: 'medium' }) })}</p>
        <p className="text-sm text-text-2">
          {passkey.lastUsedAt ? t('passkeys.lastUsed', { date: format.dateTime(new Date(passkey.lastUsedAt), { dateStyle: 'medium', timeStyle: 'short' }) }) : t('passkeys.never')}
        </p>
        {renameError && (
          <p id={`passkey-rename-error-${passkey.credentialId}`} role="alert" className="text-sm text-danger-ink">
            {t('passkeys.error')}
          </p>
        )}
        {!editing && (
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setEditing(true)}>
              <EditIcon size={16} />
              {t('passkeys.rename')}
            </Button>
            <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
              <DialogTrigger render={<Button type="button" variant="destructive" size="sm" disabled={isLast} />}>
                <TrashIcon size={16} />
                {t('passkeys.remove')}
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t('passkeys.remove')}</DialogTitle>
                </DialogHeader>
                <p className="text-sm text-text-2">{t('passkeys.removeConfirm')}</p>
                {removeError && (
                  <p role="alert" className="text-sm text-danger-ink">
                    {t('passkeys.error')}
                  </p>
                )}
                <DialogFooter>
                  <DialogClose render={<Button type="button" variant="outline" />}>{c('actions.cancel')}</DialogClose>
                  <Button type="button" variant="destructive" onClick={onConfirmRemove} aria-busy={removePending} disabled={removePending}>
                    {t('passkeys.remove')}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        )}
        {isLast && <p className="text-sm text-text-2">{t('passkeys.lastOne')}</p>}
      </CardContent>
    </Card>
  )
}
