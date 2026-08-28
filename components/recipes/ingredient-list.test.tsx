import { cleanup, render, screen, within } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, describe, expect, it } from 'vitest'
import recipes from '@/messages/es/recipes.json'
import type { FoodWithNutrition } from '@/lib/actions/foods'
import { scaleRecipe } from '@/lib/domain'
import { buildIngredientRows, IngredientList, type DetailIngredient } from './ingredient-list'

const onionFood: FoodWithNutrition = {
  id: 'f-onion',
  householdId: null,
  name: 'cebolla',
  nameEs: 'cebolla',
  nameEn: 'onion',
  defaultUnit: 'g',
  kcal100g: 40,
  isEstimated: false,
  source: 'usda',
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

const saltFood: FoodWithNutrition = {
  id: 'f-salt',
  householdId: null,
  name: 'sal',
  nameEs: 'sal',
  nameEn: 'salt',
  defaultUnit: 'g',
  kcal100g: 0,
  isEstimated: false,
  source: 'usda',
  allergens: [],
  protein100g: 0,
  carbs100g: 0,
  fat100g: 0,
  fiber100g: 0,
  gramsPerCup: null,
  gramsPerTbsp: 18, // 18 g/cda -> 6 g/cdta
  gramsPerUnit: null,
  densityGPerMl: null,
}

const onion: DetailIngredient = {
  id: 'onion',
  foodId: 'f-onion',
  rawText: '600 g de cebolla',
  quantity: 600,
  unit: 'g',
  displayQuantity: 600,
  displayUnit: 'g',
  preparation: 'picada',
  groupLabel: null,
  stepIndex: null,
  scalesLinearly: true,
  sortOrder: 0,
  food: onionFood,
}

// 9 g = 1 ½ cdta de sal (a 6 g/cdta)
const salt: DetailIngredient = {
  id: 'salt',
  foodId: 'f-salt',
  rawText: '1 ½ cdta de sal',
  quantity: 9,
  unit: 'g',
  displayQuantity: 1.5,
  displayUnit: 'tsp',
  preparation: null,
  groupLabel: null,
  stepIndex: null,
  scalesLinearly: false,
  sortOrder: 1,
  food: saltFood,
}

function renderRows(items: DetailIngredient[]) {
  // Ratio 1 (servings pedidas == base): aísla la comprobación de formato del
  // redondeo por escalado no lineal, que ya cubre lib/domain/scaling.test.ts.
  const scaled = scaleRecipe({ servingsBase: 4, ingredients: items }, 4)
  const rows = buildIngredientRows(scaled, items, 'es', 'metric')
  render(
    <NextIntlClientProvider locale="es" messages={{ recipes }}>
      <IngredientList rows={rows} />
    </NextIntlClientProvider>,
  )
  return rows
}

describe('IngredientList', () => {
  afterEach(cleanup)

  it('marca en ámbar la fila no lineal, con icono de aviso y cantidades formateadas', () => {
    renderRows([onion, salt])

    expect(screen.getByText('600 g')).toBeInTheDocument()
    expect(screen.getByText('1 ½ cdtas')).toBeInTheDocument()

    const saltRow = screen.getByText('sal').closest('li')
    expect(saltRow).not.toBeNull()
    expect(saltRow).toHaveClass('text-warn-ink')
    expect(within(saltRow as HTMLElement).getByTitle(recipes.detail.nonLinear)).toBeInTheDocument()

    const onionRow = screen.getByText('cebolla').closest('li')
    expect(onionRow).not.toBeNull()
    expect(onionRow).not.toHaveClass('text-warn-ink')
  })

  it('muestra la nota de no-lineales una sola vez', () => {
    renderRows([onion, salt])
    expect(screen.getAllByText(recipes.detail.nonLinearNote)).toHaveLength(1)
  })

  it('no muestra la nota cuando no hay ingredientes no lineales', () => {
    renderRows([onion])
    expect(screen.queryByText(recipes.detail.nonLinearNote)).not.toBeInTheDocument()
  })

  it('marca un ingrediente sin alimento asignado como no resuelto', () => {
    const mystery: DetailIngredient = { ...onion, id: 'mystery', foodId: null, rawText: 'algo raro', food: null }
    renderRows([mystery])
    expect(screen.getByText('algo raro')).toBeInTheDocument()
    expect(screen.getByText(recipes.detail.unresolved)).toBeInTheDocument()
  })
})
