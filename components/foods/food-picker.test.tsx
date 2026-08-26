import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import type { ComponentProps } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { searchFoodsAction, type FoodSummary } from '@/lib/actions/foods'
import recipes from '@/messages/es/recipes.json'
import { FoodPicker } from './food-picker'

// FoodPicker llama a las server actions directamente; los tests las sustituyen
// por un mock del módulo (no se inyectan por prop).
vi.mock('@/lib/actions/foods', () => ({
  searchFoodsAction: vi.fn(),
  lookupBarcodeAction: vi.fn(),
}))

const mockedSearch = vi.mocked(searchFoodsAction)

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
})
