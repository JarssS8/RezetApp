import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, describe, expect, it, vi } from 'vitest'
import common from '@/messages/es/common.json'
import recipes from '@/messages/es/recipes.json'
import { FoodCorrectionDialog } from './food-correction-dialog'

// El componente importa las server actions reales para usarlas como valor por
// defecto; esa cadena tira de lib/auth/guards ('server-only'), que revienta si
// se carga en un test de cliente. Se sustituyen por mocks (nunca se invocan
// cuando el test inyecta correct/create explícitamente).
vi.mock('@/lib/actions/foods', () => ({
  correctFoodAction: vi.fn(),
  createFoodAction: vi.fn(),
}))

const food = {
  id: 'g1',
  householdId: null,
  name: 'pimiento rojo',
  nameEs: 'pimiento rojo',
  nameEn: 'red pepper',
  defaultUnit: 'g' as const,
  kcal100g: 40,
  isEstimated: false,
  source: 'usda' as const,
  allergens: [],
  protein100g: 1,
  carbs100g: 6,
  fat100g: 0.3,
  fiber100g: 2,
  gramsPerCup: null,
  gramsPerTbsp: null,
  gramsPerUnit: 150,
  densityGPerMl: null,
}

describe('FoodCorrectionDialog', () => {
  afterEach(cleanup)

  it('envía solo los campos cambiados y notifica el alimento devuelto', async () => {
    const correct = vi.fn(async (_id: string, patch: unknown) => ({
      ok: true as const,
      data: { ...food, id: 'h1', householdId: 'A', kcal100g: 31, ...(patch as object) },
    }))
    const onSaved = vi.fn()
    render(
      <NextIntlClientProvider locale="es" messages={{ recipes, common }}>
        <FoodCorrectionDialog food={food} open onOpenChange={() => {}} correct={correct} onSaved={onSaved} />
      </NextIntlClientProvider>,
    )
    fireEvent.change(screen.getByLabelText(/kcal/i), { target: { value: '31' } })
    fireEvent.click(screen.getByRole('button', { name: /guardar/i }))
    await waitFor(() => expect(correct).toHaveBeenCalledWith('g1', { kcal100g: 31 }))
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ id: 'h1', kcal100g: 31 }))
  })

  it('en modo creación (food null) llama a create con los datos introducidos', async () => {
    const created = { ...food, id: 'n1', householdId: 'A', nameEs: 'kiwi', nameEn: 'kiwi', kcal100g: 61, source: 'manual' as const }
    const create = vi.fn(async () => ({ ok: true as const, data: created }))
    const onSaved = vi.fn()
    render(
      <NextIntlClientProvider locale="es" messages={{ recipes, common }}>
        <FoodCorrectionDialog food={null} open onOpenChange={() => {}} create={create} onSaved={onSaved} locale="es" />
      </NextIntlClientProvider>,
    )
    fireEvent.change(screen.getByLabelText(/nombre \(es\)/i), { target: { value: 'kiwi' } })
    fireEvent.change(screen.getByLabelText(/nombre \(en\)/i), { target: { value: 'kiwi' } })
    fireEvent.change(screen.getByLabelText(/kcal/i), { target: { value: '61' } })
    fireEvent.click(screen.getByRole('button', { name: /guardar/i }))
    await waitFor(() =>
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({ nameEs: 'kiwi', nameEn: 'kiwi', kcal100g: 61, defaultUnit: 'g', allergens: [] }),
      ),
    )
    expect(onSaved).toHaveBeenCalledWith(created)
  })

  it('muestra la nota de copia cuando el alimento es del catálogo global', () => {
    render(
      <NextIntlClientProvider locale="es" messages={{ recipes, common }}>
        <FoodCorrectionDialog food={food} open onOpenChange={() => {}} onSaved={() => {}} />
      </NextIntlClientProvider>,
    )
    expect(screen.getByText(recipes.food.copyNote)).toBeInTheDocument()
  })
})
