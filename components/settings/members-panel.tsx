'use client'

import { useState, useTransition, type KeyboardEvent } from 'react'
import { useTranslations } from 'next-intl'
import type { z } from 'zod'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { CheckIcon, CloseIcon, CopyIcon, UserMinusIcon, UserPlusIcon } from '@/components/icons'
import type { ActionResult } from '@/lib/actions/result'
import { ALLERGENS, type MemberUpdateSchema } from '@/lib/validation/household'

type AllergenId = (typeof ALLERGENS)[number]

export interface MemberRow {
  userId: string
  displayName: string
  role: 'owner' | 'member'
  allergens: string[]
  dietaryFlags: string[]
}

export type UpdateMemberInput = z.infer<typeof MemberUpdateSchema>
export type UpdateMemberFn = (input: UpdateMemberInput) => Promise<ActionResult<null>>
export type RemoveMemberFn = (userId: string) => Promise<ActionResult<null>>
export type CreateInviteFn = () => Promise<ActionResult<{ token: string; url: string; expiresAt: string }>>

export function MembersPanel({
  members,
  currentUserId,
  isOwner,
  updateAction,
  removeAction,
  createInviteAction,
}: {
  members: MemberRow[]
  currentUserId: string
  isOwner: boolean
  updateAction: UpdateMemberFn
  removeAction: RemoveMemberFn
  createInviteAction: CreateInviteFn
}) {
  return (
    <div className="flex flex-col gap-4">
      {isOwner && <InviteDialog createInviteAction={createInviteAction} />}
      <ul className="flex flex-col gap-3">
        {members.map((member) => (
          <li key={member.userId}>
            <MemberCard member={member} isSelf={member.userId === currentUserId} isOwner={isOwner} updateAction={updateAction} removeAction={removeAction} />
          </li>
        ))}
      </ul>
    </div>
  )
}

// Genera el enlace al pulsar "Invitar" (no antes: cada apertura del diálogo
// crea una invitación nueva de 24 h, igual que un token de un solo uso).
function InviteDialog({ createInviteAction }: { createInviteAction: CreateInviteFn }) {
  const t = useTranslations('settings')
  const c = useTranslations('common')
  const [open, setOpen] = useState(false)
  const [url, setUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState(false)
  const [, startTransition] = useTransition()

  function onOpenChange(next: boolean) {
    setOpen(next)
    setUrl(null)
    setCopied(false)
    setError(false)
    if (next) {
      startTransition(async () => {
        const res = await createInviteAction()
        if (res.ok) setUrl(res.data.url)
        else setError(true)
      })
    }
  }

  async function onCopy() {
    if (!url) return
    await navigator.clipboard.writeText(url)
    setCopied(true)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger render={<Button type="button" />}>
        <UserPlusIcon size={16} />
        {t('members.invite')}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('members.invite')}</DialogTitle>
        </DialogHeader>
        {error && (
          <p role="alert" className="text-sm text-warn">
            {t('members.error')}
          </p>
        )}
        {url && (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-text-2">{t('members.inviteUrl')}</p>
            <div className="flex items-center gap-2 rounded-sm border border-border bg-surface-2 p-2">
              <code className="tabular flex-1 overflow-x-auto text-sm">{url}</code>
              <Button type="button" variant="ghost" size="icon-sm" onClick={onCopy} aria-label={t('members.copy')}>
                {copied ? <CheckIcon size={16} /> : <CopyIcon size={16} />}
              </Button>
            </div>
            {copied && <p className="text-sm text-text-2">{t('members.copied')}</p>}
          </div>
        )}
        <DialogFooter showCloseButton closeLabel={c('actions.close')} />
      </DialogContent>
    </Dialog>
  )
}

function MemberCard({
  member,
  isSelf,
  isOwner,
  updateAction,
  removeAction,
}: {
  member: MemberRow
  isSelf: boolean
  isOwner: boolean
  updateAction: UpdateMemberFn
  removeAction: RemoveMemberFn
}) {
  const t = useTranslations('settings')
  const c = useTranslations('common')
  // El propietario edita a cualquiera; un miembro solo se edita a sí mismo (ruling del servicio).
  const editable = isOwner || isSelf
  // Los valores llegan ya validados desde el servicio (updateMember solo
  // acepta ids de ALLERGENS): el cast es seguro, no una entrada de usuario sin validar.
  const [allergens, setAllergens] = useState<AllergenId[]>(member.allergens as AllergenId[])
  const [dietaryFlags, setDietaryFlags] = useState(member.dietaryFlags)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState(false)
  const [, startTransition] = useTransition()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [removeError, setRemoveError] = useState(false)
  const [removePending, startRemoveTransition] = useTransition()

  function saveAllergens(next: AllergenId[]) {
    const previous = allergens
    setAllergens(next)
    setError(false)
    startTransition(async () => {
      const res = await updateAction({ userId: member.userId, allergens: next })
      if (!res.ok) {
        setError(true)
        setAllergens(previous)
      }
    })
  }

  function toggleAllergen(id: AllergenId) {
    saveAllergens(allergens.includes(id) ? allergens.filter((a) => a !== id) : [...allergens, id])
  }

  function saveDietaryFlags(next: string[]) {
    const previous = dietaryFlags
    setDietaryFlags(next)
    setError(false)
    startTransition(async () => {
      const res = await updateAction({ userId: member.userId, dietaryFlags: next })
      if (!res.ok) {
        setError(true)
        setDietaryFlags(previous)
      }
    })
  }

  function onDraftKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return
    e.preventDefault()
    const value = draft.trim()
    if (!value || dietaryFlags.includes(value)) return
    setDraft('')
    saveDietaryFlags([...dietaryFlags, value])
  }

  function removeDietaryFlag(flag: string) {
    saveDietaryFlags(dietaryFlags.filter((f) => f !== flag))
  }

  function onConfirmRemove() {
    setRemoveError(false)
    startRemoveTransition(async () => {
      const res = await removeAction(member.userId)
      if (!res.ok) setRemoveError(true)
      else setConfirmOpen(false)
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            {member.displayName}
            {isSelf && <Badge variant="secondary">{t('members.you')}</Badge>}
          </span>
          <Badge variant={member.role === 'owner' ? 'default' : 'outline'}>{t(`members.role.${member.role}`)}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium">{t('members.allergens')}</legend>
          <div className="flex flex-wrap gap-1.5">
            {ALLERGENS.map((id) => (
              <button
                key={id}
                type="button"
                aria-pressed={allergens.includes(id)}
                disabled={!editable}
                onClick={() => toggleAllergen(id)}
                className={`min-h-11 rounded-pill border px-3 text-sm transition-colors disabled:opacity-50 ${
                  allergens.includes(id) ? 'border-acc-ink bg-acc-ink/10 text-acc-ink' : 'border-border text-text-2'
                }`}
              >
                {t(`members.allergen.${id}`)}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium">{t('members.dietaryFlags')}</legend>
          {dietaryFlags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {dietaryFlags.map((flag) => (
                <Badge key={flag} variant="secondary" className="gap-1">
                  {flag}
                  {editable && (
                    <button type="button" onClick={() => removeDietaryFlag(flag)} aria-label={c('actions.delete')} className="min-h-4">
                      <CloseIcon size={12} />
                    </button>
                  )}
                </Badge>
              ))}
            </div>
          )}
          {editable && (
            <Input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={onDraftKeyDown} placeholder={t('members.dietaryPlaceholder')} maxLength={30} />
          )}
        </fieldset>

        {error && (
          <p role="alert" className="text-sm text-warn">
            {t('members.error')}
          </p>
        )}

        {isOwner && !isSelf && (
          <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
            <DialogTrigger render={<Button type="button" variant="destructive" size="sm" />}>
              <UserMinusIcon size={16} />
              {t('members.remove')}
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t('members.remove')}</DialogTitle>
              </DialogHeader>
              <p className="text-sm text-text-2">{t('members.removeConfirm', { name: member.displayName })}</p>
              {removeError && (
                <p role="alert" className="text-sm text-warn">
                  {t('members.error')}
                </p>
              )}
              <DialogFooter>
                <DialogClose render={<Button type="button" variant="outline" />}>{c('actions.cancel')}</DialogClose>
                <Button type="button" variant="destructive" onClick={onConfirmRemove} aria-busy={removePending} disabled={removePending}>
                  {t('members.remove')}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </CardContent>
    </Card>
  )
}
