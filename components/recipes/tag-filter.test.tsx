import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, describe, expect, it, vi } from 'vitest'
import recipes from '@/messages/es/recipes.json'

const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))
const { TagFilter } = await import('./tag-filter')

const TAGS = [
  { id: '1', name: 'Dieta', nameEn: 'Diet', slug: 'dieta', parentId: null },
  { id: '2', name: 'Vegetariano', nameEn: 'Vegetarian', slug: 'vegetariano', parentId: '1' },
  { id: '3', name: 'Vegano', nameEn: 'Vegan', slug: 'vegano', parentId: '1' },
]

afterEach(cleanup)

describe('TagFilter', () => {
  it('agrupa las etiquetas por su raíz y marca las seleccionadas', () => {
    render(
      <NextIntlClientProvider locale="es" messages={{ recipes }}>
        <TagFilter tags={TAGS} selected={['vegano']} baseParams={{ q: 'sopa' }} />
      </NextIntlClientProvider>,
    )
    expect(screen.getByText('Dieta')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Vegano' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Vegetariano' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('marcar una etiqueta navega conservando el resto de la búsqueda', async () => {
    const user = userEvent.setup()
    render(
      <NextIntlClientProvider locale="es" messages={{ recipes }}>
        <TagFilter tags={TAGS} selected={[]} baseParams={{ q: 'sopa' }} />
      </NextIntlClientProvider>,
    )
    await user.click(screen.getByRole('button', { name: 'Dieta' }))
    expect(push).toHaveBeenCalledWith('/recipes?q=sopa&tags=dieta')
  })

  it('desmarcar la última etiqueta quita el parámetro entero', async () => {
    const user = userEvent.setup()
    render(
      <NextIntlClientProvider locale="es" messages={{ recipes }}>
        <TagFilter tags={TAGS} selected={['vegano']} baseParams={{}} />
      </NextIntlClientProvider>,
    )
    await user.click(screen.getByRole('button', { name: 'Vegano' }))
    expect(push).toHaveBeenCalledWith('/recipes')
  })

  it('no pinta nada sin etiquetas', () => {
    const { container } = render(
      <NextIntlClientProvider locale="es" messages={{ recipes }}>
        <TagFilter tags={[]} selected={[]} baseParams={{}} />
      </NextIntlClientProvider>,
    )
    expect(container).toBeEmptyDOMElement()
  })
})
