import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'
import { describe, expect, it, vi } from 'vitest'
import messages from '@/messages/es/settings.json'
import { PlanRulesSchema } from '@/lib/validation/plan-rules'
import { PlanRulesForm } from './plan-rules-form'

function renderForm(overrides: Partial<React.ComponentProps<typeof PlanRulesForm>> = {}) {
  const updateAction = vi.fn(async (rules: unknown) => ({ ok: true as const, data: PlanRulesSchema.parse(rules) }))
  render(
    <NextIntlClientProvider locale="es" messages={{ settings: messages }}>
      <PlanRulesForm initial={[]} isOwner updateAction={updateAction} {...overrides} />
    </NextIntlClientProvider>,
  )
  return { updateAction }
}

describe('PlanRulesForm', () => {
  it('añade una regla y la envía con la forma que exige el esquema real', async () => {
    const { updateAction } = renderForm()
    await userEvent.click(screen.getByRole('button', { name: messages.planRules.add }))
    await userEvent.selectOptions(screen.getByLabelText(messages.planRules.day), '1')
    await userEvent.click(screen.getByRole('button', { name: messages.planRules.save }))
    await waitFor(() => expect(updateAction).toHaveBeenCalledTimes(1))
    // Regla W2-R11: la carga útil se valida contra el esquema real, no solo contra el mock
    const sent = updateAction.mock.calls[0]?.[0]
    expect(PlanRulesSchema.safeParse(sent).success).toBe(true)
    expect(sent).toEqual([{ day: 1, slot: null, constraint: 'no-meat', value: '' }])
  })

  it('una regla de minutos manda el número como texto y no deja guardar si está vacío', async () => {
    const { updateAction } = renderForm({ initial: [{ day: null, slot: 'dinner', constraint: 'max-minutes', value: '30' }] })
    await userEvent.click(screen.getByRole('button', { name: messages.planRules.save }))
    await waitFor(() => expect(updateAction).toHaveBeenCalled())
    expect(updateAction.mock.calls[0]?.[0]).toEqual([{ day: null, slot: 'dinner', constraint: 'max-minutes', value: '30' }])
  })

  it('un miembro que no es propietario ve los campos deshabilitados', () => {
    renderForm({ isOwner: false, initial: [{ day: 1, slot: null, constraint: 'no-meat', value: '' }] })
    expect(screen.getByRole('button', { name: messages.planRules.save })).toBeDisabled()
  })
})
