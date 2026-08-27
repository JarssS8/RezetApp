import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'
import { describe, expect, it, vi } from 'vitest'
import today from '@/messages/es/today.json'
import common from '@/messages/es/common.json'
import errors from '@/messages/es/errors.json'
import { DateRangeSchema } from '@/lib/validation/common'

let rulesPayload: unknown
const proposeFromRules = vi.fn(async (input: unknown) => {
  rulesPayload = input
  return { ok: true as const, data: { proposalId: 'p1' } }
})
const push = vi.fn()
vi.mock('@/lib/actions/plan-rules', () => ({ proposeWeekFromRulesAction: (input: unknown) => proposeFromRules(input) }))
vi.mock('@/lib/actions/ai', () => ({ aiProposeWeekAction: vi.fn(async () => ({ ok: true as const, data: { proposalId: 'p2' } })) }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))

const { QuickActions } = await import('./quick-actions')

describe('QuickActions', () => {
  it('autorrellena por reglas aunque el hogar no tenga IA', async () => {
    render(
      <NextIntlClientProvider locale="es" messages={{ today, common, errors }}>
        <QuickActions aiEnabled={false} date="2026-08-31" />
      </NextIntlClientProvider>,
    )
    const button = screen.getByRole('button', { name: today.autofillWeek })
    expect(button).toBeEnabled()
    await userEvent.click(button)
    await waitFor(() => expect(proposeFromRules).toHaveBeenCalledWith({ from: '2026-09-07', to: '2026-09-13' }))
    // W2-R11: la carga útil que manda el componente debe validar contra el esquema real de la acción.
    expect(DateRangeSchema.safeParse(rulesPayload).success).toBe(true)
    expect(push).toHaveBeenCalledWith('/plan/proposals')
  })
})
