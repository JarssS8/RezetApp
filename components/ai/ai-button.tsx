'use client'
// Reusable trigger for AI-assisted actions (rule 3 of AGENTS.md: the app must
// work fully without AI, so every caller controls `aiEnabled` from the
// household's AI settings and this button never assumes a provider exists).
//
// Hook points for tracks (a) recipes and (c) plan, once merged into this
// worktree (2-5 lines per page, no logic lives here):
//   - Recipe editor, "Analyze with AI" (recipes.ai.analyze): call
//     `aiParseIngredientsAction` from `lib/actions/ai.ts` with the free-text
//     ingredient lines flagged `needsReview`, then apply the parsed result to
//     the form fields.
//   - Recipe import, "Import with AI" (recipes.ai.importText): call
//     `aiImportRecipeAction` with `{ kind: 'text', text }` (or `{ kind: 'image', ... }`)
//     and prefill the recipe form with the returned `RecipeInput`.
//   - Unresolved food/pantry item, "Estimate nutrition with AI"
//     (recipes.ai.estimate): call `aiEstimateFoodAction(foodName)` and store
//     the returned nutrition on the food.
//   - Plan screen, "Propose week" (plan.ai.propose): call
//     `aiProposeWeekAction({ from, to, notes })` and, on success, redirect to
//     `/plan/proposals/{proposalId}`.
// Every one of these already exists in `lib/actions/ai.ts`; pass it (or a
// wrapper around it) as `onClick` here.
import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { SparklesIcon } from '@/components/icons'
import { cn } from '@/lib/utils'

export interface AiButtonProps {
  label: string
  onClick: () => void
  /** Whether the household has a usable AI provider configured. */
  aiEnabled: boolean
  /** Extra disabled state (e.g. a request already in flight). */
  disabled?: boolean
  /** Shows `common.ai.working` instead of `label` and disables the button. */
  busy?: boolean
  className?: string
}

export function AiButton({ label, onClick, aiEnabled, disabled = false, busy = false, className }: AiButtonProps) {
  const c = useTranslations('common')

  // Without a provider: keep the button focusable/hoverable (native `disabled`
  // would swallow both) so the tooltip explaining why can still show.
  if (!aiEnabled) {
    const content: ReactNode = (
      <Button type="button" variant="outline" className={cn('gap-1.5 opacity-50', className)} aria-disabled onClick={(e) => e.preventDefault()}>
        <SparklesIcon size={16} />
        {label}
      </Button>
    )
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger render={content} />
          <TooltipContent>{c('ai.unavailable')}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }

  return (
    <Button type="button" variant="outline" className={cn('gap-1.5', className)} disabled={disabled || busy} aria-busy={busy || undefined} onClick={onClick}>
      <SparklesIcon size={16} />
      {busy ? c('ai.working') : label}
    </Button>
  )
}
