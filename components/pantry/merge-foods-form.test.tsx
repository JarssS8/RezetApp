import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'
import { describe, expect, it, vi } from 'vitest'
import pantry from '@/messages/es/pantry.json'
import errors from '@/messages/es/errors.json'

const search = vi.fn()
const merge = vi.fn()
vi.mock('@/lib/actions/foods', () => ({
  searchFoodsAction: (q: string) => search(q),
  mergeFoodsAction: (from: string, into: string) => merge(from, into),
}))
const { MergeFoodsForm } = await import('./merge-foods-form')

const FOODS = [
  { id: '11111111-1111-4111-8111-111111111111', name: 'cebolla blanca', defaultUnit: 'g' },
  { id: '22222222-2222-4222-8222-222222222222', name: 'cebolla', defaultUnit: 'g' },
]

function renderForm() {
  render(
    <NextIntlClientProvider locale="es" messages={{ pantry, errors }}>
      <MergeFoodsForm />
    </NextIntlClientProvider>,
  )
}

async function pick(label: string, name: string) {
  const user = userEvent.setup()
  await user.type(screen.getByLabelText(label), 'cebolla')
  await waitFor(() => expect(screen.getByRole('button', { name })).toBeVisible())
  await user.click(screen.getByRole('button', { name }))
}

describe('MergeFoodsForm', () => {
  it('fusiona el duplicado en el que se queda', async () => {
    search.mockResolvedValue({ ok: true, data: FOODS })
    merge.mockResolvedValue({ ok: true, data: { fromId: FOODS[0]!.id, intoId: FOODS[1]!.id, ingredientsRepointed: 2, pantryItemsRepointed: 1 } })
    renderForm()
    await pick(pantry.merge.from, 'cebolla blanca')
    await pick(pantry.merge.into, 'cebolla')
    await userEvent.click(screen.getByRole('button', { name: pantry.merge.submit }))
    await waitFor(() => expect(merge).toHaveBeenCalledWith(FOODS[0]!.id, FOODS[1]!.id))
  })

  it('sin los dos elegidos el botón no deja pulsar', () => {
    search.mockResolvedValue({ ok: true, data: FOODS })
    renderForm()
    expect(screen.getByRole('button', { name: pantry.merge.submit })).toBeDisabled()
  })

  it('un error se pinta traducido por su código, nunca el mensaje crudo', async () => {
    search.mockResolvedValue({ ok: true, data: FOODS })
    merge.mockResolvedValue({ ok: false, code: 'forbidden', message: 'texto interno en español' })
    renderForm()
    await pick(pantry.merge.from, 'cebolla blanca')
    await pick(pantry.merge.into, 'cebolla')
    await userEvent.click(screen.getByRole('button', { name: pantry.merge.submit }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(errors.forbidden))
    expect(screen.queryByText('texto interno en español')).toBeNull()
  })
})
