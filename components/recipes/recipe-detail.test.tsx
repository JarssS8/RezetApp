import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, describe, expect, it, vi } from 'vitest'
import common from '@/messages/es/common.json'
import recipes from '@/messages/es/recipes.json'
import type { FoodWithNutrition } from '@/lib/actions/foods'
import { IdSchema } from '@/lib/validation/common'
import type { DetailIngredient } from './ingredient-list'
import { RecipeDetailView, type SerializableDetail } from './recipe-detail'

const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))

// El componente importa la server action real, que tira de lib/auth/guards
// ('server-only') y revienta si se carga en un test de cliente — se sustituye
// por un mock (mismo patrón que food-correction-dialog.test.tsx).
vi.mock('@/lib/actions/recipes', () => ({ deleteRecipeAction: vi.fn() }))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

import { deleteRecipeAction } from '@/lib/actions/recipes'
import { toast } from 'sonner'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

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

const onion: DetailIngredient = {
  id: 'onion',
  foodId: 'f-onion',
  rawText: '600 g de cebolla',
  quantity: 600,
  unit: 'g',
  displayQuantity: 600,
  displayUnit: 'g',
  preparation: null,
  groupLabel: null,
  stepIndex: null,
  scalesLinearly: true,
  sortOrder: 0,
  food: onionFood,
}

function buildDetail(): SerializableDetail {
  return {
    recipe: {
      id: '11111111-1111-4111-8111-111111111111',
      householdId: 'h1',
      title: 'Sopa de cebolla',
      description: null,
      servingsBase: 4,
      prepMinutes: 10,
      cookMinutes: 20,
      difficulty: null,
      sourceUrl: null,
      imageUrls: [],
      notes: null,
      yieldGrams: null,
      kcalPerServing: 100,
      proteinPerServing: null,
      carbsPerServing: null,
      fatPerServing: null,
      fiberPerServing: null,
      kcal100g: null,
      nutritionIsEstimated: false,
      timesCooked: 3,
      lastCookedAt: null,
      searchVector: '',
      deletedAt: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    ingredients: [onion],
    steps: [],
    tags: [],
    // perServing.kcal = 100, invariante al escalar; total = perServing * raciones (docs/03 §2).
    nutrition: {
      perServing: { kcal: 100, protein: 0, carbs: 0, fat: 0, fiber: 0 },
      total: { kcal: 400, protein: 0, carbs: 0, fat: 0, fiber: 0 },
      per100g: null,
      isEstimated: false,
    },
    scaled: null,
  }
}

function renderView() {
  return render(
    <NextIntlClientProvider locale="es" messages={{ recipes, common }}>
      <RecipeDetailView detail={buildDetail()} locale="es" units="metric" />
    </NextIntlClientProvider>,
  )
}

describe('RecipeDetailView', () => {
  it('las kcal por ración no cambian al escalar (solo el total)', () => {
    const { container } = renderView()

    const perServingEl = container.querySelector('[data-testid="kcal-per-serving"]')
    expect(perServingEl).not.toBeNull()
    const perServingBefore = perServingEl?.textContent
    expect(container.textContent).toContain('400')

    const more = screen.getByRole('button', { name: recipes.detail.more })
    fireEvent.click(more)
    fireEvent.click(more)

    expect(container.querySelector('[data-testid="kcal-per-serving"]')?.textContent).toBe(perServingBefore)
    expect(container.textContent).toContain('600')
    expect(container.textContent).not.toContain('400')
  })

  it('elimina la receta con un id válido y navega a /recipes', async () => {
    vi.mocked(deleteRecipeAction).mockResolvedValue({ ok: true, data: null })
    renderView()

    fireEvent.click(screen.getByRole('button', { name: recipes.detail.delete }))
    const dialog = screen.getByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: common.actions.delete }))

    await waitFor(() => expect(push).toHaveBeenCalledWith('/recipes'))
    expect(deleteRecipeAction).toHaveBeenCalledTimes(1)
    expect(IdSchema.safeParse(vi.mocked(deleteRecipeAction).mock.calls[0]?.[0]).success).toBe(true)
  })

  it('si el borrado falla, avisa con un toast y no navega', async () => {
    vi.mocked(deleteRecipeAction).mockResolvedValue({ ok: false, code: 'not_found', message: 'no encontrada' })
    renderView()

    fireEvent.click(screen.getByRole('button', { name: recipes.detail.delete }))
    const dialog = screen.getByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: common.actions.delete }))

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(recipes.detail.deleteError))
    expect(push).not.toHaveBeenCalled()
  })
})
