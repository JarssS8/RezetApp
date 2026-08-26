import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, describe, expect, it, vi } from 'vitest'
import errors from '@/messages/es/errors.json'
import pantry from '@/messages/es/pantry.json'
import type { PantryRow as PantryItemRow } from '@/lib/actions/pantry'
import type { FoodWithNutrition } from '@/lib/actions/foods'
import { PantryAdjustSchema } from '@/lib/validation/pantry'
import { PantryRow } from './pantry-row'

// El componente importa las server actions reales como valor por defecto; esa
// cadena tira de lib/auth/guards ('server-only'), que revienta en un test de
// cliente. Se sustituyen por mocks (nunca se invocan cuando el test inyecta
// adjust/remove explícitamente).
vi.mock('@/lib/actions/pantry', () => ({
  adjustPantryItemAction: vi.fn(),
  removePantryItemAction: vi.fn(),
}))

const food: FoodWithNutrition = {
  id: 'f1',
  householdId: null,
  name: 'leche',
  nameEs: 'leche',
  nameEn: 'milk',
  defaultUnit: 'ml',
  kcal100g: 42,
  isEstimated: false,
  source: 'usda',
  allergens: ['milk'],
  protein100g: 3.4,
  carbs100g: 5,
  fat100g: 1,
  fiber100g: 0,
  gramsPerCup: null,
  gramsPerTbsp: null,
  gramsPerUnit: null,
  densityGPerMl: null,
}

function makeItem(overrides: Partial<PantryItemRow> = {}): PantryItemRow {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    foodId: food.id,
    name: 'leche',
    quantity: 500,
    unit: 'g',
    location: 'fridge',
    expiresAt: '2026-08-30',
    openedAt: null,
    addedAt: '2026-08-20T00:00:00.000Z',
    daysToExpiry: 3,
    food,
    ...overrides,
  }
}

function renderRow(props: Partial<Parameters<typeof PantryRow>[0]> = {}) {
  return render(
    <NextIntlClientProvider locale="es" messages={{ pantry, errors }}>
      <PantryRow item={makeItem()} unitSystem="metric" {...props} />
    </NextIntlClientProvider>,
  )
}

describe('PantryRow', () => {
  afterEach(cleanup)

  it('muestra la cantidad en unidad de presentación y la caducidad en ámbar cuando faltan menos de 7 días', () => {
    renderRow()
    expect(screen.getByText('500 g')).toBeInTheDocument()
    const expiryText = screen.getByText(pantry.expiresIn.replace('{days}', '3'))
    expect(expiryText).toHaveClass('text-warn')
  })

  it('no marca en ámbar una caducidad lejana', () => {
    renderRow({ item: makeItem({ daysToExpiry: 10 }) })
    const expiryText = screen.getByText(pantry.expiresIn.replace('{days}', '10'))
    expect(expiryText).not.toHaveClass('text-warn')
  })

  it('al pulsar "+" ajusta de forma optimista y llama a adjust con (id, paso)', async () => {
    const adjust = vi.fn(async (itemId: string, delta: number) => ({ ok: true as const, data: makeItem({ quantity: 500 + delta, id: itemId }) }))
    renderRow({ adjust })
    fireEvent.click(screen.getByRole('button', { name: pantry.increase }))
    expect(screen.getByText('510 g')).toBeInTheDocument()
    expect(adjust).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111', 10)
    const [itemId, delta] = adjust.mock.calls[0] as [string, number]
    expect(PantryAdjustSchema.safeParse({ itemId, delta }).success).toBe(true)
  })

  it('al pulsar "-" resta el paso', () => {
    const adjust = vi.fn(async () => ({ ok: true as const, data: makeItem({ quantity: 490 }) }))
    renderRow({ adjust })
    fireEvent.click(screen.getByRole('button', { name: pantry.decrease }))
    expect(adjust).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111', -10)
  })

  it('el paso es 1 para unidades y 100 a partir de 1 kg', () => {
    const adjustUd = vi.fn(async () => ({ ok: true as const, data: makeItem() }))
    const { unmount } = renderRow({ item: makeItem({ unit: 'ud', quantity: 3 }), adjust: adjustUd })
    fireEvent.click(screen.getByRole('button', { name: pantry.increase }))
    expect(adjustUd).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111', 1)
    unmount()

    const adjustKg = vi.fn(async () => ({ ok: true as const, data: makeItem() }))
    renderRow({ item: makeItem({ quantity: 1500 }), adjust: adjustKg })
    fireEvent.click(screen.getByRole('button', { name: pantry.increase }))
    expect(adjustKg).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111', 100)
  })

  it('revierte la cantidad si el ajuste falla', async () => {
    const adjust = vi.fn(async () => ({ ok: false as const, code: 'internal', message: 'no' }))
    renderRow({ adjust })
    fireEvent.click(screen.getByRole('button', { name: pantry.increase }))
    expect(await screen.findByText('500 g')).toBeInTheDocument()
  })

  it('al quitar, llama a remove y notifica onRemoved', async () => {
    const remove = vi.fn(async () => ({ ok: true as const, data: undefined }))
    const onRemoved = vi.fn()
    renderRow({ remove, onRemoved })
    fireEvent.click(screen.getByRole('button', { name: pantry.remove }))
    await waitFor(() => expect(onRemoved).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111'))
    expect(remove).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111')
  })
})
