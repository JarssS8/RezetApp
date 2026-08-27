import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, describe, expect, it, vi } from 'vitest'
import errors from '@/messages/es/errors.json'
import recipes from '@/messages/es/recipes.json'
import { RecipeImportSchema, RecipeInputSchema } from '@/lib/validation/recipes'
import type { RecipeDraft } from '@/lib/actions/recipes'
import { ImportForm } from './import-form'

const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))

// Igual que recipe-detail.test.tsx / food-correction-dialog.test.tsx: la
// acción real tira de lib/auth/guards ('server-only'), así que se sustituye
// por un mock; nunca se invoca la implementación de verdad en este test.
vi.mock('@/lib/actions/recipes', () => ({ importRecipeAction: vi.fn() }))

import { importRecipeAction } from '@/lib/actions/recipes'

const DRAFT_KEY = 'rz.recipeDraft'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  sessionStorage.clear()
})

function renderForm() {
  render(
    <NextIntlClientProvider locale="es" messages={{ recipes, errors }}>
      <ImportForm />
    </NextIntlClientProvider>,
  )
}

const baseDraft: RecipeDraft = {
  title: 'Lentejas importadas',
  description: null,
  servingsBase: 4,
  prepMinutes: null,
  cookMinutes: null,
  difficulty: null,
  sourceUrl: 'https://example.com/receta',
  imageUrls: [],
  notes: null,
  yieldGrams: null,
  tags: [],
  ingredients: [{ rawText: '400 g de lentejas', scalesLinearly: true }],
  steps: [{ text: 'Cuece 45 minutos' }],
  warnings: [],
}

describe('ImportForm', () => {
  it('importa desde una URL: el payload valida contra RecipeImportSchema y guarda el borrador sin warnings', async () => {
    vi.mocked(importRecipeAction).mockResolvedValue({ ok: true, data: baseDraft })
    renderForm()

    fireEvent.change(screen.getByLabelText('Dirección de la receta'), { target: { value: 'https://example.com/receta' } })
    fireEvent.click(screen.getByRole('button', { name: 'Importar' }))

    await waitFor(() => expect(push).toHaveBeenCalledWith('/recipes/new?draft=1'))

    const call = vi.mocked(importRecipeAction).mock.calls[0]?.[0]
    expect(RecipeImportSchema.safeParse(call).success).toBe(true)
    expect(call).toEqual({ kind: 'url', url: 'https://example.com/receta' })

    const stored = sessionStorage.getItem(DRAFT_KEY)
    expect(stored).not.toBeNull()
    const parsed: unknown = JSON.parse(stored ?? 'null')
    expect(parsed).not.toHaveProperty('warnings')
    expect(RecipeInputSchema.safeParse(parsed).success).toBe(true)
  })

  it('importa desde texto: la pestaña cambia el formulario y el payload valida contra RecipeImportSchema', async () => {
    vi.mocked(importRecipeAction).mockResolvedValue({ ok: true, data: baseDraft })
    renderForm()

    fireEvent.click(screen.getByRole('button', { name: 'Desde texto' }))
    expect(screen.getByRole('button', { name: 'Desde texto' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.change(screen.getByLabelText('Pega la receta'), { target: { value: 'Lentejas\n400 g de lentejas\nCuece 45 minutos' } })
    fireEvent.click(screen.getByRole('button', { name: 'Importar' }))

    await waitFor(() => expect(push).toHaveBeenCalledWith('/recipes/new?draft=1'))

    const call = vi.mocked(importRecipeAction).mock.calls[0]?.[0]
    expect(RecipeImportSchema.safeParse(call).success).toBe(true)
    expect(call).toEqual({ kind: 'text', text: 'Lentejas\n400 g de lentejas\nCuece 45 minutos' })
  })

  it('muestra los avisos traducidos cuando el borrador viene incompleto', async () => {
    vi.mocked(importRecipeAction).mockResolvedValue({ ok: true, data: { ...baseDraft, ingredients: [], warnings: ['no_ingredients', 'no_steps'] } })
    renderForm()

    fireEvent.change(screen.getByLabelText('Dirección de la receta'), { target: { value: 'https://example.com/receta' } })
    fireEvent.click(screen.getByRole('button', { name: 'Importar' }))

    await waitFor(() => expect(screen.getByRole('status')).toBeInTheDocument())
    expect(screen.getByText('No se detectaron ingredientes.')).toBeInTheDocument()
    expect(screen.getByText('No se detectaron pasos.')).toBeInTheDocument()
  })

  // Regla I3/15: `result.message` (texto crudo de zod) no se pinta tal cual;
  // se traduce por `result.code` (namespace 'errors').
  it('en un fallo muestra el error traducido por código, no el mensaje crudo, y no navega ni guarda nada', async () => {
    vi.mocked(importRecipeAction).mockResolvedValue({ ok: false, code: 'validation', message: 'Entrada inválida (texto crudo)' })
    renderForm()

    fireEvent.change(screen.getByLabelText('Dirección de la receta'), { target: { value: 'https://example.com/receta' } })
    fireEvent.click(screen.getByRole('button', { name: 'Importar' }))

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Revisa los datos introducidos.'))
    expect(push).not.toHaveBeenCalled()
    expect(sessionStorage.getItem(DRAFT_KEY)).toBeNull()
  })
})
