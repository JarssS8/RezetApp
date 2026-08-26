import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, describe, expect, it, vi } from 'vitest'
import plan from '@/messages/es/plan.json'
import { EntryChip } from './entry-chip'
import type { PlanEntryClient } from './types'

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
})
