'use client'

import { useTransition, useState, type FormEvent } from 'react'
import { useFormatter, useTranslations } from 'next-intl'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { CheckIcon, CopyIcon, PlusIcon, TrashIcon } from '@/components/icons'
import type { ActionResult } from '@/lib/actions/result'
import { API_SCOPES } from '@/lib/validation/tokens'

export interface ApiTokenRow {
  id: string
  name: string
  scopes: string[]
  mcpProfile: 'basic' | 'full'
  createdAt: string
  lastUsedAt: string | null
  revokedAt: string | null
}

export type ApiScope = (typeof API_SCOPES)[number]
export type CreateTokenInput = { name: string; scopes: ApiScope[]; mcpProfile: 'basic' | 'full' }
export type CreateApiTokenFn = (input: CreateTokenInput) => Promise<ActionResult<{ id: string; token: string }>>
export type RevokeApiTokenFn = (id: string) => Promise<ActionResult<null>>

export function ApiTokensPanel({
  tokens,
  isOwner,
  createAction,
  revokeAction,
}: {
  tokens: ApiTokenRow[]
  isOwner: boolean
  createAction: CreateApiTokenFn
  revokeAction: RevokeApiTokenFn
}) {
  const t = useTranslations('settings')

  return (
    <div className="flex flex-col gap-4">
      {isOwner && <CreateTokenDialog createAction={createAction} />}
      {tokens.length === 0 ? (
        <p className="text-text-2">{t('tokens.empty')}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {tokens.map((token) => (
            <li key={token.id}>
              <TokenCard token={token} isOwner={isOwner} revokeAction={revokeAction} />
            </li>
          ))}
        </ul>
      )}
      <p className="text-sm text-text-2">{t('tokens.mcpHint')}</p>
    </div>
  )
}

function TokenCard({ token, isOwner, revokeAction }: { token: ApiTokenRow; isOwner: boolean; revokeAction: RevokeApiTokenFn }) {
  const t = useTranslations('settings')
  const c = useTranslations('common')
  const format = useFormatter()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function onConfirmRevoke() {
    setError(null)
    startTransition(async () => {
      const res = await revokeAction(token.id)
      if (!res.ok) setError(t('tokens.error'))
      else setConfirmOpen(false)
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2">
          <span>{token.name}</span>
          {token.revokedAt && <Badge variant="destructive">{t('tokens.revoked')}</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-1">
          {token.scopes.map((scope) => (
            <Badge key={scope} variant="secondary">
              {t(`tokens.scope.${scope as ApiScope}`)}
            </Badge>
          ))}
        </div>
        <p className="text-sm text-text-2">{t(`tokens.profiles.${token.mcpProfile}`)}</p>
        <p className="text-sm text-text-2">
          {token.lastUsedAt ? t('tokens.lastUsed', { date: format.dateTime(new Date(token.lastUsedAt), { dateStyle: 'medium', timeStyle: 'short' }) }) : t('tokens.never')}
        </p>
        {error && (
          <p role="alert" className="text-sm text-warn-ink">
            {error}
          </p>
        )}
        {isOwner && !token.revokedAt && (
          <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
            <DialogTrigger render={<Button type="button" variant="destructive" size="sm" />}>
              <TrashIcon size={16} />
              {t('tokens.revoke')}
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t('tokens.revoke')}</DialogTitle>
              </DialogHeader>
              <p className="text-sm text-text-2">{t('tokens.revokeConfirm')}</p>
              <DialogFooter>
                <DialogClose render={<Button type="button" variant="outline" />}>{c('actions.cancel')}</DialogClose>
                <Button type="button" variant="destructive" onClick={onConfirmRevoke} aria-busy={pending} disabled={pending}>
                  {t('tokens.revoke')}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </CardContent>
    </Card>
  )
}

function CreateTokenDialog({ createAction }: { createAction: CreateApiTokenFn }) {
  const t = useTranslations('settings')
  const c = useTranslations('common')
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [scopes, setScopes] = useState<ApiScope[]>([])
  const [mcpProfile, setMcpProfile] = useState<'basic' | 'full'>('basic')
  const [result, setResult] = useState<{ id: string; token: string } | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function toggleScope(scope: ApiScope) {
    setScopes((prev) => (prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]))
  }

  function onOpenChange(next: boolean) {
    setOpen(next)
    if (!next) {
      setName('')
      setScopes([])
      setMcpProfile('basic')
      setResult(null)
      setCopied(false)
      setError(null)
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const res = await createAction({ name, scopes, mcpProfile })
      if (res.ok) setResult(res.data)
      else setError(t('tokens.error'))
    })
  }

  async function onCopy() {
    if (!result) return
    await navigator.clipboard.writeText(result.token)
    setCopied(true)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger render={<Button type="button" />}>
        <PlusIcon size={16} />
        {t('tokens.create')}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('tokens.create')}</DialogTitle>
        </DialogHeader>
        {result ? (
          <div className="flex flex-col gap-3">
            <p role="alert" className="text-sm text-warn-ink">
              {t('tokens.created')}
            </p>
            <div className="flex items-center gap-2 rounded-sm border border-border bg-surface-2 p-2">
              <code data-testid="new-token" className="tabular flex-1 overflow-x-auto text-sm">
                {result.token}
              </code>
              <Button type="button" variant="ghost" size="icon-sm" onClick={onCopy} aria-label={t('tokens.copy')}>
                {copied ? <CheckIcon size={16} /> : <CopyIcon size={16} />}
              </Button>
            </div>
            {copied && <p className="text-sm text-text-2">{t('tokens.copied')}</p>}
            <DialogFooter showCloseButton closeLabel={c('actions.close')} />
          </div>
        ) : (
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="token-name">{t('tokens.name')}</Label>
              <Input id="token-name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={60} />
            </div>
            <fieldset className="flex flex-col gap-2">
              <legend className="text-sm font-medium">{t('tokens.scopes')}</legend>
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {API_SCOPES.map((scope) => (
                  <label key={scope} className="flex min-h-11 items-center gap-2 text-sm">
                    <input type="checkbox" className="size-4" checked={scopes.includes(scope)} onChange={() => toggleScope(scope)} />
                    {t(`tokens.scope.${scope}`)}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="flex flex-col gap-2">
              <Label htmlFor="token-profile">{t('tokens.profile')}</Label>
              <NativeSelect id="token-profile" value={mcpProfile} onChange={(e) => setMcpProfile(e.target.value === 'full' ? 'full' : 'basic')}>
                <option value="basic">{t('tokens.profiles.basic')}</option>
                <option value="full">{t('tokens.profiles.full')}</option>
              </NativeSelect>
            </div>
            {error && (
              <p role="alert" className="text-sm text-warn-ink">
                {error}
              </p>
            )}
            <DialogFooter>
              <DialogClose render={<Button type="button" variant="outline" />}>{c('actions.cancel')}</DialogClose>
              <Button type="submit" aria-busy={pending} disabled={pending || !name.trim()}>
                {t('tokens.create')}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
