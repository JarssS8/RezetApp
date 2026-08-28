import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, describe, expect, it, vi } from 'vitest'
import plan from '@/messages/es/plan.json'
import { EntryChip } from './entry-chip'
import type { PlanEntryClient } from './types'

// EntryChip incrusta LeftoverDialog, que a su vez usa el router y la acción
// del servidor: se simulan para no ejecutar código de Next/servidor real en
// este test, centrado en el propio chip.
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('@/lib/actions/plan', () => ({ createLeftoverAction: vi.fn() }))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

afterEach(cleanup)

function baseEntry(overrides: Partial<PlanEntryClient> = {}): PlanEntryClient {
  return {
    id: 'e1',
    date: '2026-08-26',
    slot: 'lunch',
    recipeId: 'r1',
    title: 'Lentejas',
    servings: 2,
    leftoverOfEntryId: null,
    timeBudgetMinutes: null,
    status: 'planned',
    sortOrder: 0,
    kcalPerServing: 400,
    totalMinutes: 45,
    imageUrl: null,
    ...overrides,
  }
}

function renderChip(props: Partial<Parameters<typeof EntryChip>[0]> = {}) {
  const defaults = {
    entry: baseEntry(),
    defaultServings: 2,
    onServingsChange: vi.fn(),
    onSkip: vi.fn(),
    onRemove: vi.fn(),
  }
  const merged = { ...defaults, ...props }
  render(
    <NextIntlClientProvider locale="es" messages={{ plan }}>
      <EntryChip {...merged} />
    </NextIntlClientProvider>,
  )
  return merged
}

describe('EntryChip', () => {
  it('muestra el título y las raciones', () => {
    renderChip({ entry: baseEntry({ title: 'Lentejas', servings: 3 }) })
    expect(screen.getByText('Lentejas')).toBeInTheDocument()
    expect(screen.getByText('×3')).toBeInTheDocument()
  })

  it('tacha el título cuando la entrada está saltada', () => {
    renderChip({ entry: baseEntry({ status: 'skipped' }) })
    expect(screen.getByText('Lentejas')).toHaveClass('line-through')
  })

  it('no tacha el título cuando la entrada está planificada', () => {
    renderChip({ entry: baseEntry({ status: 'planned' }) })
    expect(screen.getByText('Lentejas')).not.toHaveClass('line-through')
  })

  it('llama a onSkip al pulsar el icono de saltar', () => {
    const onSkip = vi.fn()
    renderChip({ entry: baseEntry({ status: 'planned' }), onSkip })
    fireEvent.click(screen.getByRole('button', { name: 'Saltar' }))
    expect(onSkip).toHaveBeenCalledWith('e1', true)
  })

  it('el botón muestra "Reactivar" cuando ya está saltada y llama a onSkip con false', () => {
    const onSkip = vi.fn()
    renderChip({ entry: baseEntry({ status: 'skipped' }), onSkip })
    fireEvent.click(screen.getByRole('button', { name: 'Reactivar' }))
    expect(onSkip).toHaveBeenCalledWith('e1', false)
  })

  it('ofrece cocinar solo si la entrada tiene receta y sigue planificada', () => {
    renderChip({ entry: baseEntry({ recipeId: 'r1', status: 'planned' }) })
    expect(screen.getByRole('link', { name: /cocinar/i })).toHaveAttribute('href', '/cook/e1')
    cleanup()
    renderChip({ entry: baseEntry({ recipeId: 'r1', status: 'cooked' }) })
    expect(screen.queryByRole('link', { name: /cocinar/i })).toBeNull()
    cleanup()
    renderChip({ entry: baseEntry({ recipeId: null, status: 'planned' }) })
    expect(screen.queryByRole('link', { name: /cocinar/i })).toBeNull()
    cleanup()
    renderChip({ entry: baseEntry({ recipeId: 'r1', leftoverOfEntryId: 'e0', status: 'planned' }) })
    expect(screen.queryByRole('link', { name: /cocinar/i })).toBeNull()
  })

  it('ofrece crear una sobra solo si la entrada tiene receta y no es ya una sobra', () => {
    renderChip({ entry: baseEntry({ recipeId: 'r1', leftoverOfEntryId: null }) })
    expect(screen.getByRole('button', { name: /crear sobra/i })).toBeInTheDocument()
    cleanup()
    // Una sobra ya descontó la despensa el día que se cocinó (docs/03-DOMINIO):
    // no puede generar, a su vez, otra sobra.
    renderChip({ entry: baseEntry({ recipeId: 'r1', leftoverOfEntryId: 'e0' }) })
    expect(screen.queryByRole('button', { name: /crear sobra/i })).toBeNull()
    cleanup()
    renderChip({ entry: baseEntry({ recipeId: null, leftoverOfEntryId: null }) })
    expect(screen.queryByRole('button', { name: /crear sobra/i })).toBeNull()
  })

  it('el chip de cocinado usa la píldora de acento, no el primario al 10 %', () => {
    renderChip({ entry: baseEntry({ status: 'cooked' }) })
    const cooked = screen.getByText(/cocinad/i)
    expect(cooked.className).toContain('pill-selected')
    // bg-primary/10 con text-primary daba 3,03:1 con el acento por defecto.
    expect(document.body.innerHTML).not.toContain('bg-primary/10')
  })
})
