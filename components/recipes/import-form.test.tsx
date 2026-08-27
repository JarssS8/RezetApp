import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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
vi.mock('@/lib/actions/recipes', () => ({ importRecipeAction: vi.fn(), uploadImageAction: vi.fn(), uploadPdfAction: vi.fn() }))

import { importRecipeAction as importRecipe, uploadImageAction as uploadImage, uploadPdfAction as uploadPdf } from '@/lib/actions/recipes'

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

const draftBase: RecipeDraft = {
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
    vi.mocked(importRecipe).mockResolvedValue({ ok: true, data: draftBase })
    renderForm()

    fireEvent.change(screen.getByLabelText('Dirección de la receta'), { target: { value: 'https://example.com/receta' } })
    fireEvent.click(screen.getByRole('button', { name: 'Importar' }))

    await waitFor(() => expect(push).toHaveBeenCalledWith('/recipes/new?draft=1'))

    const call = vi.mocked(importRecipe).mock.calls[0]?.[0]
    expect(RecipeImportSchema.safeParse(call).success).toBe(true)
    expect(call).toEqual({ kind: 'url', url: 'https://example.com/receta' })

    const stored = sessionStorage.getItem(DRAFT_KEY)
    expect(stored).not.toBeNull()
    const parsed: unknown = JSON.parse(stored ?? 'null')
    expect(parsed).not.toHaveProperty('warnings')
    expect(RecipeInputSchema.safeParse(parsed).success).toBe(true)
  })

  it('importa desde texto: la pestaña cambia el formulario y el payload valida contra RecipeImportSchema', async () => {
    vi.mocked(importRecipe).mockResolvedValue({ ok: true, data: draftBase })
    renderForm()

    fireEvent.click(screen.getByRole('button', { name: 'Desde texto' }))
    expect(screen.getByRole('button', { name: 'Desde texto' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.change(screen.getByLabelText('Pega la receta'), { target: { value: 'Lentejas\n400 g de lentejas\nCuece 45 minutos' } })
    fireEvent.click(screen.getByRole('button', { name: 'Importar' }))

    await waitFor(() => expect(push).toHaveBeenCalledWith('/recipes/new?draft=1'))

    const call = vi.mocked(importRecipe).mock.calls[0]?.[0]
    expect(RecipeImportSchema.safeParse(call).success).toBe(true)
    expect(call).toEqual({ kind: 'text', text: 'Lentejas\n400 g de lentejas\nCuece 45 minutos' })
  })

  it('muestra los avisos traducidos cuando el borrador viene incompleto', async () => {
    vi.mocked(importRecipe).mockResolvedValue({ ok: true, data: { ...draftBase, ingredients: [], warnings: ['no_ingredients', 'no_steps'] } })
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
    vi.mocked(importRecipe).mockResolvedValue({ ok: false, code: 'validation', message: 'Entrada inválida (texto crudo)' })
    renderForm()

    fireEvent.change(screen.getByLabelText('Dirección de la receta'), { target: { value: 'https://example.com/receta' } })
    fireEvent.click(screen.getByRole('button', { name: 'Importar' }))

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Revisa los datos introducidos.'))
    expect(push).not.toHaveBeenCalled()
    expect(sessionStorage.getItem(DRAFT_KEY)).toBeNull()
  })

  it('sube la foto y pide la importación con su uploadId', async () => {
    const user = userEvent.setup()
    vi.mocked(uploadImage).mockResolvedValue({ ok: true, data: { url: '/api/uploads/h/abc.webp', uploadId: 'abc.webp' } })
    vi.mocked(importRecipe).mockResolvedValue({ ok: true, data: { ...draftBase, warnings: [] } })
    renderForm()
    await user.click(screen.getByRole('button', { name: recipes.import.fromPhoto }))
    await user.upload(screen.getByLabelText(recipes.import.file), new File(['x'], 'foto.png', { type: 'image/png' }))
    await user.click(screen.getByRole('button', { name: recipes.import.submit }))
    await waitFor(() => expect(importRecipe).toHaveBeenCalledWith({ kind: 'image', uploadId: 'abc.webp' }))
    // Regla W2-R11: la carga útil también tiene que valer para el esquema real
    expect(RecipeImportSchema.safeParse(vi.mocked(importRecipe).mock.calls[0]?.[0]).success).toBe(true)
  })

  it('en la pestaña de foto, enviar sin fichero no llama a ninguna acción y no deja el formulario colgado', async () => {
    const user = userEvent.setup()
    renderForm()
    await user.click(screen.getByRole('button', { name: recipes.import.fromPhoto }))
    const submitButton = screen.getByRole('button', { name: recipes.import.submit })
    await user.click(submitButton)
    expect(uploadImage).not.toHaveBeenCalled()
    expect(importRecipe).not.toHaveBeenCalled()
    expect(submitButton).toHaveAttribute('aria-busy', 'false')
    expect(submitButton).not.toBeDisabled()
  })

  it('un aviso de IA se enseña traducido en vez de dejar la pantalla en blanco', async () => {
    const user = userEvent.setup()
    vi.mocked(uploadPdf).mockResolvedValue({ ok: true, data: { url: '/api/uploads/h/abc.pdf', uploadId: 'abc.pdf' } })
    vi.mocked(importRecipe).mockResolvedValue({ ok: true, data: { ...draftBase, title: '', warnings: ['ai_no_provider'] } })
    renderForm()
    await user.click(screen.getByRole('button', { name: recipes.import.fromPdf }))
    await user.upload(screen.getByLabelText(recipes.import.file), new File(['%PDF-'], 'r.pdf', { type: 'application/pdf' }))
    await user.click(screen.getByRole('button', { name: recipes.import.submit }))
    await waitFor(() => expect(screen.getByText(recipes.import.warnings.ai_no_provider)).toBeVisible())
  })
})
