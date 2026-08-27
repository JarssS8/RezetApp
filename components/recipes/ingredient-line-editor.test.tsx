import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, describe, expect, it, vi } from 'vitest'
import recipes from '@/messages/es/recipes.json'
import type { PreparedIngredient } from '@/lib/actions/recipes'
import { confidenceLevel, IngredientLineEditor, type EditableIngredientLine } from './ingredient-line-editor'

// FoodPicker (usado dentro de la línea para corregir el alimento) llama a las
// server actions de alimentos directamente: se sustituyen por un mock del
// módulo, igual que food-picker.test.tsx.
vi.mock('@/lib/actions/foods', () => ({
  searchFoodsAction: vi.fn(),
  lookupBarcodeAction: vi.fn(),
}))

afterEach(cleanup)

const base: PreparedIngredient = {
  rawText: '200 g de lentejas',
  foodId: 'f-lentejas',
  quantity: 200,
  unit: 'g',
  displayQuantity: 200,
  displayUnit: 'g',
  preparation: null,
  groupLabel: null,
  stepIndex: null,
  scalesLinearly: true,
  sortOrder: 0,
  needsReview: false,
}

function renderLine(line: EditableIngredientLine) {
  const onChange = vi.fn()
  render(
    <NextIntlClientProvider locale="es" messages={{ recipes }}>
      <IngredientLineEditor line={line} onChange={onChange} locale="es" />
    </NextIntlClientProvider>,
  )
  return { onChange }
}

describe('IngredientLineEditor', () => {
  it('muestra el texto original y el alimento reconocido', () => {
    renderLine({ ...base, touched: false })
    expect(screen.getByText('200 g de lentejas')).toBeInTheDocument()
    expect(screen.getByText('lentejas')).toBeInTheDocument()
  })

  it('muestra "sin alimento asignado" cuando no hay foodId', () => {
    renderLine({ ...base, foodId: null, needsReview: true, touched: false })
    expect(screen.getAllByText('Sin alimento asignado').length).toBeGreaterThan(0)
  })

  it('cambiar la cantidad llama a onChange con displayQuantity y touched', () => {
    const { onChange } = renderLine({ ...base, touched: false })
    const quantityInput = screen.getByLabelText('Cantidad')
    fireEvent.change(quantityInput, { target: { value: '250' } })
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ displayQuantity: 250, touched: true }))
  })

  it('el switch de escalado lineal alterna y llama a onChange', () => {
    const { onChange } = renderLine({ ...base, touched: false })
    const toggle = screen.getByRole('switch')
    fireEvent.click(toggle)
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ scalesLinearly: false, touched: true }))
  })
})

describe('confidenceLevel', () => {
  it('es "high" cuando hay alimento resuelto sin revisión', () => {
    expect(confidenceLevel({ foodId: 'f1', needsReview: false })).toBe('high')
  })
  it('es "mid" cuando hay alimento resuelto pero necesita revisión', () => {
    expect(confidenceLevel({ foodId: 'f1', needsReview: true })).toBe('mid')
  })
  it('es "low" cuando no hay alimento resuelto', () => {
    expect(confidenceLevel({ foodId: null, needsReview: true })).toBe('low')
  })
})
