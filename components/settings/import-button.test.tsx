import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, describe, expect, it, vi } from 'vitest'
import errors from '@/messages/es/errors.json'
import settings from '@/messages/es/settings.json'
import { MAX_IMPORT_BYTES, RecipeExportSchema } from '@/lib/validation/data'
import { ImportButton } from './import-button'

const { importRecipesAction } = vi.hoisted(() => ({ importRecipesAction: vi.fn() }))
vi.mock('@/lib/actions/recipes', () => ({ importRecipesAction }))

function renderButton() {
  render(
    <NextIntlClientProvider locale="es" messages={{ settings, errors }}>
      <ImportButton />
    </NextIntlClientProvider>,
  )
}

const validDump = {
  version: 1 as const,
  exportedAt: '2026-08-27T12:00:00.000Z',
  recipes: [
    { title: 'Sopa', servingsBase: 4, tags: ['sopa'], imageUrls: [], ingredients: [{ rawText: '2 cebollas' }], steps: [{ text: 'Pocha' }] },
  ],
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('ImportButton', () => {
  it('sube un volcado válido y muestra cuántas recetas se importaron', async () => {
    const user = userEvent.setup()
    importRecipesAction.mockResolvedValue({ ok: true, data: { created: 1, failed: [] } })
    renderButton()

    const file = new File([JSON.stringify(validDump)], 'recetas.json', { type: 'application/json' })
    await user.upload(screen.getByLabelText('Importar recetas'), file)

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('1 recetas importadas'))
    // Regla W2-R11: la carga útil también tiene que valer para el esquema real
    expect(RecipeExportSchema.safeParse(importRecipesAction.mock.calls[0]?.[0]).success).toBe(true)
  })

  it('cuando hay recetas fallidas, además del recuento importado enseña cuántas fallaron', async () => {
    const user = userEvent.setup()
    importRecipesAction.mockResolvedValue({ ok: true, data: { created: 1, failed: ['Mala'] } })
    renderButton()

    const file = new File([JSON.stringify(validDump)], 'recetas.json', { type: 'application/json' })
    await user.upload(screen.getByLabelText('Importar recetas'), file)

    await waitFor(() => expect(screen.getAllByRole('status')).toHaveLength(2))
    expect(screen.getByText('1 recetas importadas')).toBeInTheDocument()
    expect(screen.getByText('1 no se pudieron importar')).toBeInTheDocument()
  })

  it('un fichero que no es JSON muestra el error sin llamar a la acción', async () => {
    const user = userEvent.setup()
    renderButton()

    const file = new File(['no soy json'], 'recetas.json', { type: 'application/json' })
    await user.upload(screen.getByLabelText('Importar recetas'), file)

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('El fichero no es una exportación válida'))
    expect(importRecipesAction).not.toHaveBeenCalled()
  })

  it('un fichero que pesa más de la cuenta se rechaza sin llamar a la acción', async () => {
    const user = userEvent.setup()
    renderButton()

    const file = new File([JSON.stringify(validDump)], 'recetas.json', { type: 'application/json' })
    Object.defineProperty(file, 'size', { value: MAX_IMPORT_BYTES + 1 })
    await user.upload(screen.getByLabelText('Importar recetas'), file)

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(errors.too_large))
    expect(importRecipesAction).not.toHaveBeenCalled()
  })

  it('un código de fallo del servidor que no es "validation" se traduce por el namespace errors, nunca el mensaje crudo', async () => {
    const user = userEvent.setup()
    importRecipesAction.mockResolvedValue({ ok: false, code: 'internal', message: 'texto crudo de ServiceError' })
    renderButton()

    const file = new File([JSON.stringify(validDump)], 'recetas.json', { type: 'application/json' })
    await user.upload(screen.getByLabelText('Importar recetas'), file)

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(errors.internal))
    expect(screen.queryByText('texto crudo de ServiceError')).not.toBeInTheDocument()
  })
})
