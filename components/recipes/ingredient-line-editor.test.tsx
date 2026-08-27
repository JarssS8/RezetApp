import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, describe, expect, it, vi } from 'vitest'
import recipes from '@/messages/es/recipes.json'
import type { PreparedIngredient } from '@/lib/actions/recipes'
import { RecipeIngredientInputSchema } from '@/lib/validation/recipes'
import { confidenceLevel, IngredientLineEditor, type EditableIngredientLine } from './ingredient-line-editor'
import { buildIngredientInput } from './recipe-editor'

// FoodPicker (usado dentro de la línea para corregir el alimento) llama a las
// server actions de alimentos directamente: se sustituyen por un mock del
// módulo, igual que food-picker.test.tsx.
vi.mock('@/lib/actions/foods', () => ({
  searchFoodsAction: vi.fn(),
  lookupBarcodeAction: vi.fn(),
}))

// recipe-editor.tsx (de donde se importa buildIngredientInput) importa a su
// vez las acciones de recetas, que tiran de lib/auth/guards ('server-only') y
// revientan si se cargan en un test de cliente -mismo motivo que
// recipe-detail.test.tsx- : se sustituyen por un mock del módulo.
vi.mock('@/lib/actions/recipes', () => ({
  createRecipeAction: vi.fn(),
  prepareIngredientsAction: vi.fn(),
  updateRecipeAction: vi.fn(),
}))

afterEach(cleanup)

const base: PreparedIngredient = {
  rawText: '200 g de lentejas',
  foodId: '11111111-1111-4111-8111-111111111111',
  foodName: 'lentejas',
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
  it('muestra el texto original y el nombre real del alimento resuelto', () => {
    renderLine({ ...base, touched: false })
    expect(screen.getByText('200 g de lentejas')).toBeInTheDocument()
    expect(screen.getByText('lentejas')).toBeInTheDocument()
  })

  it('muestra "sin alimento asignado" cuando no hay foodId', () => {
    renderLine({ ...base, foodId: null, foodName: null, needsReview: true, touched: false })
    expect(screen.getAllByText('Sin alimento asignado').length).toBeGreaterThan(0)
  })

  it('cambiar la cantidad llama a onChange con displayQuantity y touched, sin arrastrar quantity/unit', () => {
    const { onChange } = renderLine({ ...base, touched: false })
    const quantityInput = screen.getByLabelText('Cantidad')
    fireEvent.change(quantityInput, { target: { value: '250' } })
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ displayQuantity: 250, touched: true }))
    // Regla W2-R18: el navegador no convierte unidades. quantity/unit no
    // pueden quedarse con el valor anterior (200 g): se limpian a null hasta
    // que el servidor los recalcule con los datos reales del alimento.
    const updated = onChange.mock.calls[0]?.[0] as EditableIngredientLine
    expect(updated.quantity).toBeNull()
    expect(updated.unit).toBeNull()
  })

  it('cambiar la unidad también limpia quantity/unit en vez de dejar un valor obsoleto', () => {
    const { onChange } = renderLine({ ...base, touched: false })
    const unitInput = screen.getByLabelText('Unidad')
    fireEvent.change(unitInput, { target: { value: 'diente' } })
    const updated = onChange.mock.calls[0]?.[0] as EditableIngredientLine
    expect(updated.displayUnit).toBe('diente')
    expect(updated.quantity).toBeNull()
    expect(updated.unit).toBeNull()
  })

  it('el switch de escalado lineal alterna y llama a onChange', () => {
    const { onChange } = renderLine({ ...base, touched: false })
    const toggle = screen.getByRole('switch')
    fireEvent.click(toggle)
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ scalesLinearly: false, touched: true }))
  })

  it('el objeto que produce buildIngredientInput a partir del onChange pasa el esquema y omite quantity/unit en una línea touched (W2-R11)', () => {
    const { onChange } = renderLine({ ...base, touched: false })
    const quantityInput = screen.getByLabelText('Cantidad')
    fireEvent.change(quantityInput, { target: { value: '250' } })
    const updated = onChange.mock.calls[0]?.[0] as EditableIngredientLine
    const projected = buildIngredientInput(updated)
    expect(RecipeIngredientInputSchema.safeParse(projected).success).toBe(true)
    expect(projected).not.toHaveProperty('quantity')
    expect(projected).not.toHaveProperty('unit')
  })

  it('buildIngredientInput sí manda quantity/unit de una línea sin tocar', () => {
    const projected = buildIngredientInput({ ...base, touched: false })
    expect(RecipeIngredientInputSchema.safeParse(projected).success).toBe(true)
    expect(projected).toMatchObject({ quantity: 200, unit: 'g' })
  })

  // Regresión I4: buildIngredientInput mandaba `stepIndex: null` fijo, así que
  // guardar una receta con ingredientes ya asignados a un paso (por ejemplo,
  // importada o creada por MCP) los desasignaba en silencio.
  it('buildIngredientInput conserva el stepIndex de la línea', () => {
    const projected = buildIngredientInput({ ...base, stepIndex: 2, touched: false })
    expect(RecipeIngredientInputSchema.safeParse(projected).success).toBe(true)
    expect(projected).toMatchObject({ stepIndex: 2 })
  })

  it('buildIngredientInput omite stepIndex cuando la línea no tiene uno', () => {
    const projected = buildIngredientInput({ ...base, stepIndex: null, touched: false })
    expect(projected).not.toHaveProperty('stepIndex')
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
