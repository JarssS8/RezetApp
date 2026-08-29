import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NuqsTestingAdapter } from 'nuqs/adapters/testing'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, describe, expect, it, vi } from 'vitest'
import recipes from '@/messages/es/recipes.json'
import { TagFilter } from './tag-filter'

const TAGS = [
  { id: '1', name: 'Dieta', nameEn: 'Diet', slug: 'dieta', parentId: null },
  { id: '2', name: 'Vegetariano', nameEn: 'Vegetarian', slug: 'vegetariano', parentId: '1' },
  { id: '3', name: 'Vegano', nameEn: 'Vegan', slug: 'vegano', parentId: '1' },
]

afterEach(cleanup)

// W9: TagFilter ya no recibe `baseParams` (nuqs preserva solo lo que hay en
// la URL real del navegador), así que el resto de la búsqueda que "ya
// estaba puesta" se simula con la URL inicial del NuqsTestingAdapter.
function renderTagFilter(props: { selected: string[] }, initialSearch = '') {
  const onUrlUpdate = vi.fn()
  render(
    <NuqsTestingAdapter searchParams={initialSearch} onUrlUpdate={onUrlUpdate}>
      <NextIntlClientProvider locale="es" messages={{ recipes }}>
        <TagFilter tags={TAGS} {...props} />
      </NextIntlClientProvider>
    </NuqsTestingAdapter>,
  )
  return onUrlUpdate
}

describe('TagFilter', () => {
  it('agrupa las etiquetas por su raíz y marca las seleccionadas', () => {
    renderTagFilter({ selected: ['vegano'] })
    expect(screen.getByText('Dieta')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Vegano' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Vegetariano' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('marcar una etiqueta navega conservando el resto de la búsqueda', async () => {
    const user = userEvent.setup()
    const onUrlUpdate = renderTagFilter({ selected: [] }, 'q=sopa')
    await user.click(screen.getByRole('button', { name: 'Dieta' }))
    expect(onUrlUpdate).toHaveBeenCalledTimes(1)
    expect(onUrlUpdate.mock.calls[0]?.[0].queryString).toBe('?q=sopa&tags=dieta')
  })

  it('desmarcar la última etiqueta quita el parámetro entero', async () => {
    const user = userEvent.setup()
    const onUrlUpdate = renderTagFilter({ selected: ['vegano'] }, 'tags=vegano')
    await user.click(screen.getByRole('button', { name: 'Vegano' }))
    expect(onUrlUpdate.mock.calls[0]?.[0].queryString).toBe('')
  })

  it('no pinta nada sin etiquetas', () => {
    const onUrlUpdate = vi.fn()
    const { container } = render(
      <NuqsTestingAdapter onUrlUpdate={onUrlUpdate}>
        <NextIntlClientProvider locale="es" messages={{ recipes }}>
          <TagFilter tags={[]} selected={[]} />
        </NextIntlClientProvider>
      </NuqsTestingAdapter>,
    )
    expect(container).toBeEmptyDOMElement()
  })
})
