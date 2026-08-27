'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { decideProposalAction } from '@/lib/actions/plan'
import { useHouseholdEvents } from '@/lib/events/use-household-events'
import { ALLERGENS } from '@/lib/validation/household'
import type { PlanEntryClient, ProposalAddClient, ProposalClient } from './types'

export interface ProposalCardProps {
  proposal: ProposalClient
}

type AllergenId = (typeof ALLERGENS)[number]

interface DiffGroup {
  date: string
  add: ProposalAddClient[]
  remove: PlanEntryClient[]
}

// Agrupa altas y bajas por fecha (regla de controlador), preservando el
// orden cronológico; dentro de cada fecha se listan primero las altas.
function groupDiffByDate(add: ProposalAddClient[], remove: PlanEntryClient[]): DiffGroup[] {
  const byDate = new Map<string, DiffGroup>()
  function groupFor(date: string): DiffGroup {
    const existing = byDate.get(date)
    if (existing) return existing
    const created: DiffGroup = { date, add: [], remove: [] }
    byDate.set(date, created)
    return created
  }
  for (const item of add) groupFor(item.date).add.push(item)
  for (const item of remove) groupFor(item.date).remove.push(item)
  return Array.from(byDate.values()).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
}

// Tarjeta de una propuesta con su diff añadir/quitar por día (spec §8 «Propuestas»).
// Pendiente: aprobar/descartar llaman a decideProposalAction con estado
// deshabilitado optimista mientras está en curso; no pendiente: solo la
// etiqueta de estado, sin botones.
export function ProposalCard({ proposal }: ProposalCardProps) {
  const t = useTranslations('plan')
  const locale = useLocale()
  const router = useRouter()
  const [pending, setPending] = useState(false)

  const groups = groupDiffByDate(proposal.diff.add, proposal.diff.remove)
  const createdAt = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(proposal.createdAt))

  // Envueltas en funciones (no plantillas en línea en el JSX): react/jsx-no-literals
  // marca una TemplateLiteral usada directamente como hijo, pero no el resultado
  // de una llamada de función (mismo motivo por el que el resto del código usa
  // t('clave', { ... }) en vez de concatenar).
  function originLabel(): string {
    return `${t(`proposals.from.${proposal.source}`)} · ${createdAt}`
  }
  function addLine(item: ProposalAddClient): string {
    return t('proposals.addLine', { title: item.title, slot: t(`slots.${item.slot}`), servings: item.servings })
  }
  function removeLine(item: PlanEntryClient): string {
    return t('proposals.removeLine', { title: item.title, slot: t(`slots.${item.slot}`) })
  }
  // allergenConflicts viene de conflictingRecipeIds (lib/services/allergens.ts), que solo
  // devuelve ids ya filtrados contra ALLERGENS: el cast es seguro, no una entrada de usuario
  // sin validar (mismo criterio que members-panel.tsx con AllergenId).
  function allergenWarning(item: ProposalAddClient): string {
    const names = item.allergenConflicts.map((a) => t(`proposals.allergens.${a as AllergenId}`))
    return t('proposals.allergenWarning', { allergens: names.join(', ') })
  }
  // Mismo formato que day-column.tsx (semana), pero con el locale activo en vez
  // del locale del navegador: aquí el grupo va dentro de un texto ya localizado
  // por next-intl, así que conviene que coincida con el resto de la tarjeta.
  function dayLabel(date: string): string {
    return new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`))
  }

  async function decide(decision: 'approve' | 'reject') {
    setPending(true)
    const result = await decideProposalAction(proposal.id, decision)
    setPending(false)
    if (!result.ok) {
      toast.error(t('proposals.error'))
      return
    }
    router.refresh()
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border bg-card p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-text-2">{originLabel()}</span>
        {proposal.status === 'pending' ? (
          <div className="flex gap-2">
            <Button type="button" size="sm" disabled={pending} onClick={() => void decide('approve')}>
              {t('proposals.approve')}
            </Button>
            <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => void decide('reject')}>
              {t('proposals.reject')}
            </Button>
          </div>
        ) : (
          <Badge variant={proposal.status === 'approved' ? 'default' : 'secondary'}>{t(`proposals.${proposal.status}`)}</Badge>
        )}
      </div>
      {groups.map((group) => (
        <div key={group.date} className="flex flex-col gap-1">
          <p className="text-xs font-medium text-text-2">{dayLabel(group.date)}</p>
          {group.add.length > 0 ? (
            <ul aria-label={t('proposals.adds')} className="flex flex-col gap-0.5">
              {group.add.map((item, i) => (
                <li key={`${group.date}-add-${i}`} className="text-sm text-acc-ink">
                  {addLine(item)}
                  {item.allergenConflicts.length > 0 ? (
                    <p role="note" className="text-xs text-warn">
                      {allergenWarning(item)}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
          {group.remove.length > 0 ? (
            <ul aria-label={t('proposals.removes')} className="flex flex-col gap-0.5">
              {group.remove.map((item) => (
                <li key={item.id} className="text-sm text-warn">
                  {removeLine(item)}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ))}
    </div>
  )
}

export interface ProposalsListProps {
  proposals: ProposalClient[]
}

// Envoltorio de cliente mínimo para la página de propuestas (server
// component): se suscribe a los eventos SSE del hogar y refresca la página
// al llegar una propuesta nueva o un cambio en el plan (spec §14).
export function ProposalsList({ proposals }: ProposalsListProps) {
  const router = useRouter()
  useHouseholdEvents(() => router.refresh(), ['proposal.created', 'plan.changed'])
  return (
    <div className="flex flex-col gap-3">
      {proposals.map((p) => (
        <ProposalCard key={p.id} proposal={p} />
      ))}
    </div>
  )
}
