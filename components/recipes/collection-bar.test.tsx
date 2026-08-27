import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, describe, expect, it, vi } from 'vitest'
import recipes from '@/messages/es/recipes.json'
import { CollectionInputSchema } from '@/lib/validation/collections'

// collection-bar.tsx tira de lib/actions/collections (server-only vía
// lib/auth/guards): se sustituye por un mock del módulo, igual que
// recipe-editor.test.tsx con lib/actions/recipes.
const { createCollectionAction, deleteCollectionAction } = vi.hoisted(() => ({
  createCollectionAction: vi.fn(),
  deleteCollectionAction: vi.fn(),
}))
vi.mock('@/lib/actions/collections', () => ({ createCollectionAction, deleteCollectionAction }))

const { CollectionBar } = await import('./collection-bar')
const create = createCollectionAction

afterEach(() => {
  vi.clearAllMocks()
  cleanup()
})

describe('CollectionBar', () => {
  it('cada colección enlaza a su propia búsqueda', () => {
    render(
      <NextIntlClientProvider locale="es" messages={{ recipes }}>
        <CollectionBar collections={[{ id: 'c1', name: 'Cenas rápidas', query: { maxMinutes: 20, tags: ['dieta'] } }]} currentQuery={{}} />
      </NextIntlClientProvider>,
    )
    expect(screen.getByRole('link', { name: 'Cenas rápidas' })).toHaveAttribute('href', '/recipes?maxMinutes=20&tags=dieta')
  })

  it('guardar el filtro actual manda exactamente lo que el esquema espera', async () => {
    const user = userEvent.setup()
    create.mockResolvedValue({ ok: true, data: { id: 'c2', name: 'Rápidas', query: { maxMinutes: 20 } } })
    render(
      <NextIntlClientProvider locale="es" messages={{ recipes }}>
        <CollectionBar collections={[]} currentQuery={{ maxMinutes: 20 }} />
      </NextIntlClientProvider>,
    )
    await user.click(screen.getByRole('button', { name: recipes.collections.save }))
    await user.type(screen.getByLabelText(recipes.collections.name), 'Rápidas')
    await user.click(screen.getByRole('button', { name: recipes.collections.confirm }))
    await waitFor(() => expect(create).toHaveBeenCalledWith({ name: 'Rápidas', query: { maxMinutes: 20 } }))
    // Regla W2-R11
    expect(CollectionInputSchema.safeParse(create.mock.calls[0]?.[0]).success).toBe(true)
  })

  it('sin ningún filtro marcado no se puede guardar una colección vacía', () => {
    render(
      <NextIntlClientProvider locale="es" messages={{ recipes }}>
        <CollectionBar collections={[]} currentQuery={{}} />
      </NextIntlClientProvider>,
    )
    expect(screen.getByRole('button', { name: recipes.collections.save })).toBeDisabled()
  })
})
