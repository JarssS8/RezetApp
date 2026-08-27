import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import common from '@/messages/es/common.json'
import plan from '@/messages/es/plan.json'
import { weekRange } from '@/lib/plan-dates'
import { WeekView } from './week-view'
import type { PlanEntryClient } from './types'

const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))

const patchPlanEntryAction = vi.fn()
vi.mock('@/lib/actions/plan', () => ({
  applyPlanBatchAction: vi.fn(),
  movePlanEntryAction: vi.fn(),
  patchPlanEntryAction: (...args: unknown[]) => patchPlanEntryAction(...args),
  searchRecipesForPlanAction: vi.fn(),
}))

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

function makeEntry(overrides: Partial<PlanEntryClient> & { id: string }): PlanEntryClient {
  return {
    date: '2026-08-24',
    slot: 'lunch',
    recipeId: 'r1',
    title: 'Entrada',
    servings: 2,
    leftoverOfEntryId: null,
    timeBudgetMinutes: null,
    status: 'planned',
    sortOrder: 0,
    kcalPerServing: 400,
    totalMinutes: 30,
    imageUrl: null,
    ...overrides,
  }
}

// Regresión: withOptimism revertía TODO el array (foto tomada antes de la
// mutación) en vez de solo la entrada afectada. Con dos acciones optimistas
// en vuelo, el fallo de la primera pisaba el éxito ya aplicado de la segunda.
describe('WeekView - revierte solo la entrada afectada', () => {
  beforeEach(() => {
    class FakeEventSource {
      addEventListener() {}
      close() {}
    }
    vi.stubGlobal('EventSource', FakeEventSource as unknown as typeof EventSource)
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('si falla el saltar de una entrada, no deshace el saltar ya aplicado de otra', async () => {
    const { from: monday, days } = weekRange('2026-08-26')
    const e1 = makeEntry({ id: 'e1', title: 'Sopa', slot: 'lunch' })
    const e2 = makeEntry({ id: 'e2', title: 'Pasta', slot: 'dinner' })

    let resolveFirst!: (v: { ok: boolean }) => void
    const firstPending = new Promise<{ ok: boolean }>((res) => {
      resolveFirst = res
    })
    patchPlanEntryAction.mockImplementationOnce(() => firstPending)
    patchPlanEntryAction.mockImplementationOnce(() => Promise.resolve({ ok: true, data: e2 }))

    render(
      <NextIntlClientProvider locale="es" messages={{ plan, common }}>
        <WeekView
          monday={monday}
          days={days}
          entries={[e1, e2]}
          defaultServings={2}
          kcalByDate={{}}
          todayIso="2026-08-26"
          initialAddRecipeId={null}
          initialAddServings={0}
          pendingProposals={0}
        />
      </NextIntlClientProvider>,
    )

    const skipButtons = screen.getAllByRole('button', { name: 'Saltar' })
    expect(skipButtons).toHaveLength(2)

    // El enlace a "Plan y realidad" vive dentro de la semana, sin pestaña propia (AGENTS.md).
    const statsLink = screen.getByRole('link', { name: 'Ver plan y realidad' })
    expect(statsLink).toHaveAttribute('href', expect.stringContaining('/plan/stats'))

    // Dos acciones optimistas "en vuelo": e1 (se rechazará después) y e2
    // (se resuelve con éxito mientras e1 sigue pendiente).
    fireEvent.click(skipButtons[0] as HTMLElement)
    fireEvent.click(skipButtons[1] as HTMLElement)

    await waitFor(() => expect(screen.getByText('Pasta')).toHaveClass('line-through'))

    resolveFirst({ ok: false })

    await waitFor(() => expect(screen.getByText('Sopa')).not.toHaveClass('line-through'))
    // El cambio de e2, ya aplicado con éxito, sobrevive al fallo de e1.
    expect(screen.getByText('Pasta')).toHaveClass('line-through')
  })
})
