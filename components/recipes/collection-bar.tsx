'use client'

import Link from 'next/link'
import { type FormEvent, useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { BookmarkIcon, TrashIcon } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createCollectionAction, deleteCollectionAction } from '@/lib/actions/collections'
import type { CollectionQuery } from '@/lib/validation/collections'

export interface CollectionBarProps {
  collections: { id: string; name: string; query: CollectionQuery }[]
  currentQuery: CollectionQuery
}

// Construye la URL de /recipes que reproduce exactamente el filtro guardado.
// El orden de los parámetros importa para los tests (maxMinutes antes que tags).
function hrefOf(query: CollectionQuery): string {
  const params = new URLSearchParams()
  if (query.q) params.set('q', query.q)
  if (query.maxMinutes !== undefined) params.set('maxMinutes', String(query.maxMinutes))
  if (query.difficulty) params.set('difficulty', query.difficulty)
  if (query.onlyWithPantry) params.set('onlyWithPantry', '1')
  if (query.sort) params.set('sort', query.sort)
  if (query.tags?.length) params.set('tags', query.tags.join(','))
  const s = params.toString()
  return s ? `/recipes?${s}` : '/recipes'
}

// Fila de colecciones bajo el filtro de /recipes: cada una es un enlace a la
// búsqueda que guarda, y un botón permite guardar el filtro marcado ahora
// mismo con un nombre. Solo llama a lib/actions/collections (nunca a
// lib/services directamente: la frontera de eslint-boundaries lo prohíbe).
export function CollectionBar({ collections, currentQuery }: CollectionBarProps) {
  const t = useTranslations('recipes')
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const canSave = Object.keys(currentQuery).length > 0

  function onOpenChange(next: boolean) {
    setOpen(next)
    if (!next) {
      setName('')
      setError(null)
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      // No hace falta actualizar estado local: createCollectionAction hace
      // revalidatePath('/recipes') y el Server Component padre nos vuelve a
      // pasar `collections` con la fila nueva ya incluida.
      const res = await createCollectionAction({ name, query: currentQuery })
      if (res.ok) {
        setOpen(false)
        setName('')
      } else {
        setError(t('collections.error'))
      }
    })
  }

  function onDelete(id: string) {
    // Igual que onSubmit: deleteCollectionAction revalida y el padre nos trae
    // `collections` ya sin la fila borrada.
    startTransition(async () => {
      await deleteCollectionAction(id)
    })
  }

  return (
    <section aria-label={t('collections.title')} className="mt-3 flex flex-wrap items-center gap-2">
      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-text-2">
        <BookmarkIcon size={16} />
        {t('collections.title')}
      </span>
      {collections.map((item) => (
        <span key={item.id} className="inline-flex items-center gap-1 rounded-pill border border-line-2 bg-card py-0.5 pr-1 pl-3 text-sm shadow-card">
          <Link href={hrefOf(item.query)}>{item.name}</Link>
          <Button type="button" variant="ghost" size="icon-xs" aria-label={t('collections.delete')} onClick={() => onDelete(item.id)} disabled={pending}>
            <TrashIcon size={14} />
          </Button>
        </span>
      ))}
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogTrigger render={<Button type="button" size="sm" variant="outline" disabled={!canSave} />}>{t('collections.save')}</DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('collections.save')}</DialogTitle>
          </DialogHeader>
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="collection-name">{t('collections.name')}</Label>
              <Input id="collection-name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={60} />
            </div>
            {error && (
              <p role="alert" className="text-sm text-warn-ink">
                {error}
              </p>
            )}
            <DialogFooter>
              <DialogClose render={<Button type="button" variant="outline" />}>{t('collections.cancel')}</DialogClose>
              <Button type="submit" aria-busy={pending} disabled={pending || !name.trim()}>
                {t('collections.confirm')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  )
}
