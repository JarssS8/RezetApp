import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import type { ComponentProps } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { lookupBarcodeAction, searchFoodsAction, type FoodSummary, type FoodWithNutrition } from '@/lib/actions/foods'
import recipes from '@/messages/es/recipes.json'
import { FoodPicker } from './food-picker'

// FoodPicker llama a las server actions directamente; los tests las sustituyen
// por un mock del módulo (no se inyectan por prop).
vi.mock('@/lib/actions/foods', () => ({
  searchFoodsAction: vi.fn(),
  lookupBarcodeAction: vi.fn(),
}))

const mockedSearch = vi.mocked(searchFoodsAction)
const mockedLookupBarcode = vi.mocked(lookupBarcodeAction)

const cebolla: FoodSummary = {
  id: 'f1',
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

const cebolleta: FoodSummary = { ...cebolla, id: 'f2', name: 'cebolleta', nameEs: 'cebolleta', nameEn: 'scallion' }

const cebollaConNutricion: FoodWithNutrition = {
  ...cebolla,
  protein100g: 1.1,
  carbs100g: 9,
  fat100g: 0.1,
  fiber100g: 1.7,
  gramsPerCup: null,
  gramsPerTbsp: null,
  gramsPerUnit: null,
  densityGPerMl: null,
}

function renderPicker(props: Partial<ComponentProps<typeof FoodPicker>> = {}) {
  const onChange = vi.fn()
  const onCreateNew = vi.fn()
  render(
    <NextIntlClientProvider locale="es" messages={{ recipes }}>
      <FoodPicker value={null} onChange={onChange} locale="es" onCreateNew={onCreateNew} {...props} />
    </NextIntlClientProvider>,
  )
  return { onChange, onCreateNew }
}

describe('FoodPicker', () => {
  beforeEach(() => {
    mockedSearch.mockReset()
    mockedLookupBarcode.mockReset()
  })
  afterEach(cleanup)

  it('busca al escribir y muestra las opciones', async () => {
    mockedSearch.mockResolvedValue({ ok: true, data: [cebolla] })
    renderPicker()
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'ceb' } })
    await waitFor(() => expect(mockedSearch).toHaveBeenCalledWith('ceb'))
    await waitFor(() => expect(screen.getByRole('option', { name: /cebolla/ })).toBeInTheDocument())
  })

  it('selecciona con Enter', async () => {
    mockedSearch.mockResolvedValue({ ok: true, data: [cebolla] })
    const { onChange } = renderPicker()
    const input = screen.getByRole('combobox')
    fireEvent.change(input, { target: { value: 'ceb' } })
    await waitFor(() => expect(screen.getByRole('option', { name: /cebolla/ })).toBeInTheDocument())
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onChange).toHaveBeenCalledWith(cebolla)
  })

  it('cierra la lista con Escape', async () => {
    mockedSearch.mockResolvedValue({ ok: true, data: [cebolla] })
    renderPicker()
    const input = screen.getByRole('combobox')
    fireEvent.change(input, { target: { value: 'ceb' } })
    await waitFor(() => expect(screen.getByRole('option', { name: /cebolla/ })).toBeInTheDocument())
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('ofrece crear un alimento nuevo cuando no hay coincidencia exacta', async () => {
    mockedSearch.mockResolvedValue({ ok: true, data: [] })
    const { onCreateNew } = renderPicker()
    const input = screen.getByRole('combobox')
    fireEvent.change(input, { target: { value: 'zzz' } })
    await waitFor(() => expect(screen.getByRole('option', { name: /zzz/ })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('option', { name: /zzz/ }))
    expect(onCreateNew).toHaveBeenCalledWith('zzz')
  })

  it('ignora una respuesta de búsqueda obsoleta que llega tarde', async () => {
    let resolveFirst!: (v: { ok: true; data: FoodSummary[] }) => void
    let resolveSecond!: (v: { ok: true; data: FoodSummary[] }) => void
    const firstPromise = new Promise<{ ok: true; data: FoodSummary[] }>((resolve) => {
      resolveFirst = resolve
    })
    const secondPromise = new Promise<{ ok: true; data: FoodSummary[] }>((resolve) => {
      resolveSecond = resolve
    })
    mockedSearch.mockImplementationOnce(() => firstPromise).mockImplementationOnce(() => secondPromise)

    renderPicker()
    const input = screen.getByRole('combobox')

    fireEvent.change(input, { target: { value: 'ceb' } })
    await waitFor(() => expect(mockedSearch).toHaveBeenNthCalledWith(1, 'ceb'))

    fireEvent.change(input, { target: { value: 'cebolleta' } })
    await waitFor(() => expect(mockedSearch).toHaveBeenNthCalledWith(2, 'cebolleta'))

    // La respuesta más reciente llega antes que la obsoleta: la obsoleta no debe pisarla al llegar después.
    await act(async () => {
      resolveSecond({ ok: true, data: [cebolleta] })
      await secondPromise
    })
    await waitFor(() => expect(screen.getByRole('option', { name: /cebolleta/ })).toBeInTheDocument())

    await act(async () => {
      resolveFirst({ ok: true, data: [cebolla] })
      await firstPromise
    })
    expect(screen.queryByRole('option', { name: /^cebolla$/ })).not.toBeInTheDocument()
    expect(screen.getByRole('option', { name: /cebolleta/ })).toBeInTheDocument()
  })

  it('escanea un código de barras y selecciona el resultado', async () => {
    mockedLookupBarcode.mockResolvedValue({ ok: true, data: cebollaConNutricion })
    const { onChange } = renderPicker({ allowBarcode: true })
    fireEvent.click(screen.getByRole('button', { name: /código de barras/i }))
    const barcodeInput = screen.getByPlaceholderText('Código de barras…')
    fireEvent.change(barcodeInput, { target: { value: '1234567890123' } })
    fireEvent.keyDown(barcodeInput, { key: 'Enter' })
    await waitFor(() => expect(mockedLookupBarcode).toHaveBeenCalledWith('1234567890123'))
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(cebollaConNutricion))
  })

  it('avisa cuando el código de barras no tiene coincidencias', async () => {
    mockedLookupBarcode.mockResolvedValue({ ok: true, data: null })
    renderPicker({ allowBarcode: true })
    fireEvent.click(screen.getByRole('button', { name: /código de barras/i }))
    const barcodeInput = screen.getByPlaceholderText('Código de barras…')
    fireEvent.change(barcodeInput, { target: { value: '0000000000000' } })
    fireEvent.keyDown(barcodeInput, { key: 'Enter' })
    await waitFor(() => expect(screen.getByText('Sin resultados para ese código')).toBeInTheDocument())
  })
})
