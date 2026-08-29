import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { NuqsTestingAdapter } from 'nuqs/adapters/testing'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, describe, expect, it, vi } from 'vitest'
import recipes from '@/messages/es/recipes.json'
import { RecipeFilters } from './recipe-filters'

afterEach(cleanup)

// W9: RecipeFilters ya no recibe un `initial` (lee la URL con nuqs), así que
// el punto de partida de cada test es la URL que se le da al
// NuqsTestingAdapter — el mismo papel que hacía antes la prop `initial`.
// onUrlUpdate sustituye al spy sobre useRouter().push de antes de nuqs.
function renderFilters(initialSearch = '') {
  const onUrlUpdate = vi.fn()
  render(
    <NuqsTestingAdapter searchParams={initialSearch} onUrlUpdate={onUrlUpdate}>
      <NextIntlClientProvider locale="es" messages={{ recipes }}>
        <RecipeFilters />
      </NextIntlClientProvider>
    </NuqsTestingAdapter>,
  )
  return onUrlUpdate
}

describe('RecipeFilters', () => {
  // nuqs encola las actualizaciones y las vuelca en el siguiente tick (para
  // poder fundir varios useQueryState en una sola navegación): con
  // fireEvent, sin avanzar el reloj, onUrlUpdate aún no se ha llamado justo
  // después del submit — de ahí el waitFor en vez de una aserción directa.
  it('navega con la query construida a partir de los filtros iniciales y el cambio del usuario', async () => {
    const onUrlUpdate = renderFilters('q=lente&sort=relevance')
    fireEvent.click(screen.getByRole('button', { name: 'Fácil' }))
    fireEvent.submit(screen.getByRole('button', { name: 'Filtrar' }).closest('form')!)
    await waitFor(() => expect(onUrlUpdate).toHaveBeenCalledTimes(1))
    // nuqs actualiza la URL real conservando la posición de las claves que ya
    // estaban (q, sort) y añade al final la que es nueva (difficulty): orden
    // distinto al de la versión anterior (que reconstruía la query entera
    // desde cero), pero sin ninguna diferencia para el servidor, que la lee
    // como un Record sin importar el orden.
    expect(onUrlUpdate.mock.calls[0]?.[0].queryString).toBe('?q=lente&sort=relevance&difficulty=easy')
  })

  it('no incluye parámetros vacíos', async () => {
    const onUrlUpdate = renderFilters()
    fireEvent.submit(screen.getByRole('button', { name: 'Filtrar' }).closest('form')!)
    await waitFor(() => expect(onUrlUpdate).toHaveBeenCalledTimes(1))
    expect(onUrlUpdate.mock.calls[0]?.[0].queryString).toBe('?sort=relevance')
  })

  it('vuelve a "cualquiera" al pulsar ese chip', async () => {
    const onUrlUpdate = renderFilters('difficulty=easy')
    fireEvent.click(screen.getByRole('button', { name: 'Cualquiera' }))
    fireEvent.submit(screen.getByRole('button', { name: 'Filtrar' }).closest('form')!)
    await waitFor(() => expect(onUrlUpdate).toHaveBeenCalledTimes(1))
    expect(onUrlUpdate.mock.calls[0]?.[0].queryString).toBe('?sort=relevance')
  })

  it('incluye maxMinutes y onlyWithPantry cuando están marcados', async () => {
    const onUrlUpdate = renderFilters()
    fireEvent.change(screen.getByLabelText('Máx. minutos'), { target: { value: '30' } })
    fireEvent.click(screen.getByLabelText('Tengo los ingredientes'))
    fireEvent.submit(screen.getByRole('button', { name: 'Filtrar' }).closest('form')!)
    await waitFor(() => expect(onUrlUpdate).toHaveBeenCalledTimes(1))
    expect(onUrlUpdate.mock.calls[0]?.[0].queryString).toBe('?maxMinutes=30&onlyWithPantry=1&sort=relevance')
  })
})
