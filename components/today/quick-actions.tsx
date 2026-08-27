'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { PlusIcon } from '@/components/icons'
import { AiButton } from '@/components/ai/ai-button'
import { Button } from '@/components/ui/button'
import { aiProposeWeekAction } from '@/lib/actions/ai'
import { actionErrorKey } from '@/lib/actions/result'
import { addDays, weekRange } from '@/lib/plan-dates'

export interface QuickActionsProps {
  aiEnabled: boolean
  date: string
}

// Los tres atajos de spec §8: añadir a despensa, cocinar (ya está en cada
// comida) y proponer semana. "Proponer semana" crea una plan_proposal que el
// usuario aprueba en /plan/proposals: nunca escribe el plan directamente.
export function QuickActions({ aiEnabled, date }: QuickActionsProps) {
  const t = useTranslations('today')
  const e = useTranslations('errors')
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  async function propose() {
    setBusy(true)
    const next = weekRange(addDays(date, 7))
    const result = await aiProposeWeekAction({ from: next.from, to: next.to })
    setBusy(false)
    if (!result.ok) {
      toast.error(e(actionErrorKey(result.code)))
      return
    }
    router.push('/plan/proposals')
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" className="gap-1.5" render={<Link href="/pantry/add" />}>
        <PlusIcon size={18} />
        {t('addToPantry')}
      </Button>
      <AiButton label={t('proposeWeek')} onClick={() => void propose()} aiEnabled={aiEnabled} busy={busy} />
    </div>
  )
}
