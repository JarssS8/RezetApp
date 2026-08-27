import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import type { ComponentProps } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import common from '@/messages/es/common.json'
import errors from '@/messages/es/errors.json'
import pantry from '@/messages/es/pantry.json'
import recipes from '@/messages/es/recipes.json'
import { createFoodAction, searchFoodsAction, type FoodSummary, type FoodWithNutrition } from '@/lib/actions/foods'
import { PantryItemInputSchema } from '@/lib/validation/pantry'
import { PantryItemForm } from './pantry-item-form'

// El componente importa las server actions reales de foods/pantry como valor
// por defecto de sus props inyectables; esa cadena tira de lib/auth/guards
// ('server-only'), que revienta en un test de cliente. Se sustituyen por
// mocks (nunca se invocan cuando el test inyecta `upsert` explícitamente).
vi.mock('@/lib/actions/foods', () => ({
  searchFoodsAction: vi.fn(),
  lookupBarcodeAction: vi.fn(),
  createFoodAction: vi.fn(),
  correctFoodAction: vi.fn(),
}))
vi.mock('@/lib/actions/pantry', () => ({
  upsertPantryItemAction: vi.fn(),
}))

const pushMock = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: pushMock }) }))

const mockedSearch = vi.mocked(searchFoodsAction)
const mockedCreate = vi.mocked(createFoodAction)

const cebolla: FoodSummary = {
  id: 'a1111111-1111-4111-8111-111111111111',
  householdId: null,
  name: 'cebolla',
  nameEs: 'cebolla',
  nameEn: 'onion',
  defaultUnit: 'g',
  kcal100g: 40,
  isEstimated: false,
  source: 'manual',
  allergens: [],
}

function renderForm(props: Partial<ComponentProps<typeof PantryItemForm>> = {}) {
  const upsert = vi.fn(async (input: unknown) => ({ ok: true as const, data: input as never }))
  render(
    <NextIntlClientProvider locale="es" messages={{ pantry, recipes, common, errors }}>
      <PantryItemForm upsert={upsert} {...props} />
    </NextIntlClientProvider>,
  )
  return { upsert }
}

async function pickCebolla() {
  fireEvent.change(screen.getByPlaceholderText(recipes.food.searchPlaceholder), { target: { value: 'ceb' } })
  await waitFor(() => expect(screen.getByRole('option', { name: /cebolla/ })).toBeInTheDocument())
  fireEvent.click(screen.getByRole('option', { name: /cebolla/ }))
}

describe('PantryItemForm', () => {
  beforeEach(() => {
    mockedSearch.mockReset()
    mockedCreate.mockReset()
    pushMock.mockReset()
  })
  afterEach(cleanup)

  it('deshabilita guardar sin alimento elegido y ofrece crear uno nuevo', () => {
    renderForm()
    expect(screen.getByRole('button', { name: pantry.form.save })).toBeDisabled()
    expect(screen.getByRole('button', { name: pantry.form.createFood })).toBeInTheDocument()
  })

  it('preselecciona la unidad por defecto del alimento elegido y habilita guardar', async () => {
    mockedSearch.mockResolvedValue({ ok: true, data: [cebolla] })
    renderForm()
    await pickCebolla()

    expect(screen.getByRole('button', { name: pantry.form.save })).not.toBeDisabled()
    expect(screen.getByLabelText(pantry.form.unit)).toHaveValue('g')
  })

  it('envía cantidad, unidad, ubicación y caducidad, y redirige a /pantry', async () => {
    mockedSearch.mockResolvedValue({ ok: true, data: [cebolla] })
    const { upsert } = renderForm()
    await pickCebolla()

    fireEvent.change(screen.getByLabelText(pantry.form.quantity), { target: { value: '500' } })
    fireEvent.click(screen.getByRole('button', { name: pantry.locations.fridge }))
    fireEvent.change(screen.getByLabelText(pantry.form.expiresAt), { target: { value: '2026-09-01' } })
    fireEvent.click(screen.getByRole('button', { name: pantry.form.save }))

    await waitFor(() =>
      expect(upsert).toHaveBeenCalledWith({
        foodId: cebolla.id,
        quantity: 500,
        unit: 'g',
        location: 'fridge',
        expiresAt: '2026-09-01',
      }),
    )
    const payload = upsert.mock.calls[0]?.[0]
    expect(PantryItemInputSchema.safeParse(payload).success).toBe(true)
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/pantry'))
  })

  it('el botón de ubicación activo queda marcado con aria-pressed', async () => {
    mockedSearch.mockResolvedValue({ ok: true, data: [cebolla] })
    renderForm()
    await pickCebolla()

    expect(screen.getByRole('button', { name: pantry.locations.pantry })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: pantry.locations.freezer }))
    expect(screen.getByRole('button', { name: pantry.locations.freezer })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: pantry.locations.pantry })).toHaveAttribute('aria-pressed', 'false')
  })

  it('abre el diálogo de creación y usa el alimento creado como seleccionado', async () => {
    const created: FoodWithNutrition = {
      ...cebolla,
      id: 'b2222222-2222-4222-8222-222222222222',
      nameEs: 'kiwi',
      nameEn: 'kiwi',
      defaultUnit: 'ud',
      protein100g: null,
      carbs100g: null,
      fat100g: null,
      fiber100g: null,
      gramsPerCup: null,
      gramsPerTbsp: null,
      gramsPerUnit: null,
      densityGPerMl: null,
    }
    mockedCreate.mockResolvedValue({ ok: true, data: created })
    renderForm()

    fireEvent.click(screen.getByRole('button', { name: pantry.form.createFood }))
    const dialog = within(screen.getByRole('dialog'))
    fireEvent.change(dialog.getByLabelText(/nombre \(es\)/i), { target: { value: 'kiwi' } })
    fireEvent.change(dialog.getByLabelText(/nombre \(en\)/i), { target: { value: 'kiwi' } })
    fireEvent.click(dialog.getByRole('button', { name: /guardar/i }))

    await waitFor(() => expect(mockedCreate).toHaveBeenCalled())
    const foodInput = mockedCreate.mock.calls[0]?.[0]
    expect(foodInput).toMatchObject({ nameEs: 'kiwi', nameEn: 'kiwi' })

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByRole('button', { name: pantry.form.save })).not.toBeDisabled()
    expect(screen.getByLabelText(pantry.form.unit)).toHaveValue('ud')
  })
})
