import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, describe, expect, it, vi } from 'vitest'
import recipes from '@/messages/es/recipes.json'
import { RecipeFilters } from './recipe-filters'

const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))

afterEach(cleanup)

function renderFilters(initial: Parameters<typeof RecipeFilters>[0]['initial'] = {}) {
  render(
    <NextIntlClientProvider locale="es" messages={{ recipes }}>
      <RecipeFilters initial={initial} />
    </NextIntlClientProvider>,
  )
}

describe('RecipeFilters', () => {
  it('navega con la query construida a partir de los filtros iniciales y el cambio del usuario', () => {
    renderFilters({ q: 'lente', sort: 'relevance' })
    fireEvent.click(screen.getByRole('button', { name: 'Fácil' }))
    fireEvent.submit(screen.getByRole('button', { name: 'Filtrar' }).closest('form')!)
    expect(push).toHaveBeenCalledWith('/recipes?q=lente&difficulty=easy&sort=relevance')
  })

  it('no incluye parámetros vacíos', () => {
    renderFilters({})
    fireEvent.submit(screen.getByRole('button', { name: 'Filtrar' }).closest('form')!)
    expect(push).toHaveBeenCalledWith('/recipes?sort=relevance')
  })

  it('vuelve a "cualquiera" al pulsar ese chip', () => {
    renderFilters({ difficulty: 'easy' })
    fireEvent.click(screen.getByRole('button', { name: 'Cualquiera' }))
    fireEvent.submit(screen.getByRole('button', { name: 'Filtrar' }).closest('form')!)
    expect(push).toHaveBeenCalledWith('/recipes?sort=relevance')
  })

  it('incluye maxMinutes y onlyWithPantry cuando están marcados', () => {
    renderFilters({})
    fireEvent.change(screen.getByLabelText('Máx. minutos'), { target: { value: '30' } })
    fireEvent.click(screen.getByLabelText('Tengo los ingredientes'))
    fireEvent.submit(screen.getByRole('button', { name: 'Filtrar' }).closest('form')!)
    expect(push).toHaveBeenCalledWith('/recipes?maxMinutes=30&onlyWithPantry=1&sort=relevance')
  })
})
