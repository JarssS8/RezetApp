import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, describe, expect, it, vi } from 'vitest'
import common from '@/messages/es/common.json'
import errors from '@/messages/es/errors.json'
import recipes from '@/messages/es/recipes.json'
import type { RecipeInput } from '@/lib/validation/recipes'
import { RecipeEditor, type RecipeEditorProps } from './recipe-editor'

const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

// recipe-editor.tsx tira de lib/actions/recipes (server-only vía
// lib/auth/guards): se sustituye por un mock del módulo, igual que
// ingredient-line-editor.test.tsx.
const { createRecipeAction, updateRecipeAction, prepareIngredientsAction, uploadImageAction } = vi.hoisted(() => ({
  createRecipeAction: vi.fn(),
  updateRecipeAction: vi.fn(),
  prepareIngredientsAction: vi.fn(),
  uploadImageAction: vi.fn(),
}))
vi.mock('@/lib/actions/recipes', () => ({ createRecipeAction, updateRecipeAction, prepareIngredientsAction, uploadImageAction }))

// FoodPicker (dentro de cada IngredientLineEditor) llama a estas acciones directamente.
vi.mock('@/lib/actions/foods', () => ({ searchFoodsAction: vi.fn(), lookupBarcodeAction: vi.fn() }))

afterEach(() => {
  vi.clearAllMocks()
})

// Una receta ya guardada con dos pasos -uno con temporizador y foto- y un
// ingrediente con stepIndex asignado (por ejemplo, importada o creada por
// MCP): el editor no debe perder esos datos solo por reabrirla y guardar.
const baseInitial: RecipeInput = {
  title: 'Sopa de lentejas',
  description: null,
  servingsBase: 2,
  prepMinutes: null,
  cookMinutes: null,
  difficulty: null,
  sourceUrl: null,
  imageUrls: [],
  notes: null,
  yieldGrams: null,
  tags: [],
  ingredients: [
    {
      rawText: '200 g de lentejas',
      foodId: '11111111-1111-4111-8111-111111111111',
      quantity: 200,
      unit: 'g',
      displayQuantity: 200,
      displayUnit: 'g',
      scalesLinearly: true,
      stepIndex: 1,
    },
  ],
  steps: [
    { text: 'Trocea la cebolla', timerSeconds: null, imageUrl: null },
    { text: 'Cuece 45 minutos', timerSeconds: 2700, imageUrl: 'https://example.com/step2.jpg' },
  ],
}

function renderEditor(props: Partial<RecipeEditorProps> = {}) {
  render(
    <NextIntlClientProvider locale="es" messages={{ recipes, common, errors }}>
      <RecipeEditor initial={baseInitial} recipeId="r1" locale="es" {...props} />
    </NextIntlClientProvider>,
  )
}

function submit() {
  fireEvent.click(screen.getByRole('button', { name: 'Guardar receta' }))
}

// Regresión I4: antes, guardar re-derivaba `steps` del textarea con
// `{text, timerSeconds: null, imageUrl: null}` fijo, perdiendo el
// temporizador y la foto de cualquier paso ya guardado.
describe('RecipeEditor - conserva pasos e índices al reeditar (I4/13)', () => {
  it('conserva timerSeconds/imageUrl de un paso al editar solo el texto de otro', async () => {
    updateRecipeAction.mockResolvedValue({ ok: true, data: { id: 'r1' } })
    renderEditor()

    fireEvent.change(screen.getByLabelText('Pasos'), { target: { value: 'Trocea la cebolla y el ajo\n\nCuece 45 minutos' } })
    submit()

    await waitFor(() => expect(updateRecipeAction).toHaveBeenCalledTimes(1))
    const input = updateRecipeAction.mock.calls[0]?.[1] as RecipeInput
    expect(input.steps).toEqual([
      { text: 'Trocea la cebolla y el ajo', timerSeconds: null, imageUrl: null },
      { text: 'Cuece 45 minutos', timerSeconds: 2700, imageUrl: 'https://example.com/step2.jpg' },
    ])
  })

  it('un paso nuevo (más bloques que antes) se crea con temporizador y foto a null', async () => {
    updateRecipeAction.mockResolvedValue({ ok: true, data: { id: 'r1' } })
    renderEditor()

    fireEvent.change(screen.getByLabelText('Pasos'), {
      target: { value: 'Trocea la cebolla\n\nCuece 45 minutos\n\nSirve caliente' },
    })
    submit()

    await waitFor(() => expect(updateRecipeAction).toHaveBeenCalledTimes(1))
    const input = updateRecipeAction.mock.calls[0]?.[1] as RecipeInput
    expect(input.steps[2]).toEqual({ text: 'Sirve caliente', timerSeconds: null, imageUrl: null })
    // Los dos pasos ya existentes no pierden lo suyo solo porque se añadió un tercero.
    expect(input.steps[1]).toEqual({ text: 'Cuece 45 minutos', timerSeconds: 2700, imageUrl: 'https://example.com/step2.jpg' })
  })

  it('quitar un bloque de texto recorta los pasos sin arrastrar metadatos de más', async () => {
    updateRecipeAction.mockResolvedValue({ ok: true, data: { id: 'r1' } })
    renderEditor()

    fireEvent.change(screen.getByLabelText('Pasos'), { target: { value: 'Trocea la cebolla' } })
    submit()

    await waitFor(() => expect(updateRecipeAction).toHaveBeenCalledTimes(1))
    const input = updateRecipeAction.mock.calls[0]?.[1] as RecipeInput
    expect(input.steps).toEqual([{ text: 'Trocea la cebolla', timerSeconds: null, imageUrl: null }])
  })

  it('conserva el stepIndex de un ingrediente sin tocar', async () => {
    updateRecipeAction.mockResolvedValue({ ok: true, data: { id: 'r1' } })
    renderEditor()

    submit()

    await waitFor(() => expect(updateRecipeAction).toHaveBeenCalledTimes(1))
    const input = updateRecipeAction.mock.calls[0]?.[1] as RecipeInput
    expect(input.ingredients[0]).toMatchObject({ stepIndex: 1 })
  })
})
