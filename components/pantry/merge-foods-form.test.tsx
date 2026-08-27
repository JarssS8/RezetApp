import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'
import { describe, expect, it, vi } from 'vitest'
import pantry from '@/messages/es/pantry.json'
import errors from '@/messages/es/errors.json'
import recipes from '@/messages/es/recipes.json'

const search = vi.fn()
const merge = vi.fn()
vi.mock('@/lib/actions/foods', () => ({
  searchFoodsAction: (q: string) => search(q),
  mergeFoodsAction: (from: string, into: string) => merge(from, into),
}))
const { MergeFoodsForm } = await import('./merge-foods-form')

const FOODS = [
  { id: '11111111-1111-4111-8111-111111111111', householdId: null, name: 'cebolla blanca', nameEs: 'cebolla blanca', nameEn: 'white onion', defaultUnit: 'g', kcal100g: 40, isEstimated: false, source: 'manual', allergens: [] },
  { id: '22222222-2222-4222-8222-222222222222', householdId: null, name: 'cebolla', nameEs: 'cebolla', nameEn: 'onion', defaultUnit: 'g', kcal100g: 40, isEstimated: false, source: 'manual', allergens: [] },
]

function renderForm() {
  render(
    <NextIntlClientProvider locale="es" messages={{ pantry, errors, recipes }}>
      <MergeFoodsForm />
    </NextIntlClientProvider>,
  )
}

// Cada FoodPicker vive dentro de su propio data-testid (merge-from/merge-into):
// acotar las consultas a ese contenedor evita que una reapertura tardía del
// otro combobox (misma búsqueda, mismos nombres) contamine la comprobación.
async function pick(testId: string, name: string) {
  const user = userEvent.setup()
  const container = screen.getByTestId(testId)
  await user.type(within(container).getByRole('combobox'), 'cebolla')
  await waitFor(() => expect(within(container).getByRole('option', { name })).toBeVisible())
  await user.click(within(container).getByRole('option', { name }))
}

describe('MergeFoodsForm', () => {
  it('fusiona el duplicado en el que se queda', async () => {
    search.mockResolvedValue({ ok: true, data: FOODS })
    merge.mockResolvedValue({ ok: true, data: { fromId: FOODS[0]!.id, intoId: FOODS[1]!.id, ingredientsRepointed: 2, pantryItemsRepointed: 1 } })
    renderForm()
    await pick('merge-from', 'cebolla blanca')
    await pick('merge-into', 'cebolla')
    await userEvent.click(screen.getByRole('button', { name: pantry.merge.submit }))
    await waitFor(() => expect(merge).toHaveBeenCalledWith(FOODS[0]!.id, FOODS[1]!.id))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('2'))
  })

  it('sin los dos elegidos el botón no deja pulsar', () => {
    search.mockResolvedValue({ ok: true, data: FOODS })
    renderForm()
    expect(screen.getByRole('button', { name: pantry.merge.submit })).toBeDisabled()
  })

  it('con el mismo alimento a los dos lados el botón sigue bloqueado', async () => {
    search.mockResolvedValue({ ok: true, data: FOODS })
    renderForm()
    await pick('merge-from', 'cebolla')
    await pick('merge-into', 'cebolla')
    expect(screen.getByRole('button', { name: pantry.merge.submit })).toBeDisabled()
  })

  it('un error se pinta traducido por su código, nunca el mensaje crudo', async () => {
    search.mockResolvedValue({ ok: true, data: FOODS })
    merge.mockResolvedValue({ ok: false, code: 'forbidden', message: 'texto interno en español' })
    renderForm()
    await pick('merge-from', 'cebolla blanca')
    await pick('merge-into', 'cebolla')
    await userEvent.click(screen.getByRole('button', { name: pantry.merge.submit }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(errors.forbidden))
    expect(screen.queryByText('texto interno en español')).toBeNull()
  })
})
