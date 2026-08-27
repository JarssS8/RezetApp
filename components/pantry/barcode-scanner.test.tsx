import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import common from '@/messages/es/common.json'
import errors from '@/messages/es/errors.json'
import pantry from '@/messages/es/pantry.json'
import recipes from '@/messages/es/recipes.json'
import { lookupBarcodeAction, type FoodWithNutrition } from '@/lib/actions/foods'
import { BarcodeSchema } from '@/lib/validation/foods'
import { BarcodeScanner } from './barcode-scanner'

// El componente importa las server actions reales de foods como valor por
// defecto de sus props inyectables; esa cadena tira de lib/auth/guards
// ('server-only'), que revienta en un test de cliente. Se sustituyen por mocks.
vi.mock('@/lib/actions/foods', () => ({
  searchFoodsAction: vi.fn(),
  lookupBarcodeAction: vi.fn(),
  createFoodAction: vi.fn(),
  correctFoodAction: vi.fn(),
}))

const pushMock = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: pushMock }) }))

const mockedLookup = vi.mocked(lookupBarcodeAction)

const cebolla: FoodWithNutrition = {
  id: 'a1111111-1111-4111-8111-111111111111',
  householdId: null,
  name: 'cebolla',
  nameEs: 'cebolla',
  nameEn: 'onion',
  defaultUnit: 'g',
  kcal100g: 40,
  isEstimated: false,
  source: 'off',
  allergens: [],
  protein100g: 1.1,
  carbs100g: 9,
  fat100g: 0.1,
  fiber100g: 1.7,
  gramsPerCup: null,
  gramsPerTbsp: null,
  gramsPerUnit: null,
  densityGPerMl: null,
}

function renderScanner() {
  render(
    <NextIntlClientProvider locale="es" messages={{ pantry, recipes, common, errors }}>
      <BarcodeScanner />
    </NextIntlClientProvider>,
  )
}

// jsdom no implementa la Barcode Detection API ni navigator.mediaDevices: el
// escáner cae de forma natural a "sin cámara" + entrada manual, que es
// exactamente el camino que este fichero cubre (el de la cámara no se testea
// en jsdom, según el plan de la Task 16).
describe('BarcodeScanner', () => {
  beforeEach(() => {
    mockedLookup.mockReset()
    pushMock.mockReset()
  })
  afterEach(cleanup)

  async function typeAndLookup(code: string) {
    await waitFor(() => expect(screen.getByText(pantry.scan.noCamera)).toBeInTheDocument())
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: code } })
    fireEvent.click(screen.getByRole('button', { name: pantry.scan.lookup }))
  }

  it('sin cámara, busca el código introducido a mano y redirige al encontrar el alimento', async () => {
    mockedLookup.mockResolvedValue({ ok: true, data: cebolla })
    renderScanner()

    await typeAndLookup('8410000810004')

    await waitFor(() => expect(mockedLookup).toHaveBeenCalled())
    const code = mockedLookup.mock.calls[0]?.[0]
    expect(BarcodeSchema.safeParse(code).success).toBe(true)
    expect(code).toBe('8410000810004')

    await waitFor(() =>
      expect(pushMock).toHaveBeenCalledWith(`/pantry/add?foodId=${cebolla.id}&name=${encodeURIComponent(cebolla.name)}`),
    )
  })

  it('avisa y ofrece crear el alimento cuando el código no resuelve', async () => {
    mockedLookup.mockResolvedValue({ ok: true, data: null })
    renderScanner()

    await typeAndLookup('12345678')

    await waitFor(() => expect(screen.getByText(pantry.scan.notFound)).toBeInTheDocument())
    expect(screen.getByRole('button', { name: pantry.form.createFood })).toBeInTheDocument()
    expect(pushMock).not.toHaveBeenCalled()
  })

  it('si la búsqueda falla, avisa y mantiene la entrada manual visible para reintentar', async () => {
    mockedLookup.mockResolvedValue({ ok: false, code: 'internal', message: 'Error interno' })
    renderScanner()

    await typeAndLookup('8410000810004')

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(screen.getByRole('textbox')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: pantry.scan.lookup })).toBeInTheDocument()
    expect(pushMock).not.toHaveBeenCalled()
  })

  it('rechaza un código con formato inválido sin llamar a la búsqueda', async () => {
    renderScanner()
    await waitFor(() => expect(screen.getByText(pantry.scan.noCamera)).toBeInTheDocument())
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'abc' } })
    fireEvent.click(screen.getByRole('button', { name: pantry.scan.lookup }))

    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(mockedLookup).not.toHaveBeenCalled()
  })
})
