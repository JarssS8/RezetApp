import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { describe, expect, it, vi } from 'vitest'
import today from '@/messages/es/today.json'
import common from '@/messages/es/common.json'
import plan from '@/messages/es/plan.json'
import errors from '@/messages/es/errors.json'
import { TodayView } from './today-view'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }))
vi.mock('@/lib/events/use-household-events', () => ({ useHouseholdEvents: vi.fn() }))
// lib/actions/ai.ts y lib/actions/plan-rules.ts importan requireHousehold
// (lib/auth/guards.ts, 'server-only'): sin mock, cargar QuickActions en jsdom
// rompería con el mismo error que en week-view.test.tsx y compañía.
vi.mock('@/lib/actions/ai', () => ({ aiProposeWeekAction: vi.fn() }))
vi.mock('@/lib/actions/plan-rules', () => ({ proposeWeekFromRulesAction: vi.fn() }))

const entry = { id: 'e1', date: '2026-08-27', slot: 'dinner' as const, recipeId: 'r1', title: 'Sopa', servings: 2, leftoverOfEntryId: null, timeBudgetMinutes: null, status: 'planned' as const, sortOrder: 0, kcalPerServing: 300, totalMinutes: 25, imageUrl: null }

function renderToday(over: Partial<Parameters<typeof TodayView>[0]> = {}) {
  return render(
    <NextIntlClientProvider locale="es" messages={{ today, common, plan, errors }}>
      <TodayView
        date="2026-08-27"
        entries={[entry]}
        progress={{ date: '2026-08-27', plannedKcal: 600, cookedKcal: 0, hasEstimates: false, hasUnknownKcal: false }}
        expiring={[{ id: 'p1', name: 'yogur', daysToExpiry: 1 }]}
        aiEnabled={false}
        {...over}
      />
    </NextIntlClientProvider>,
  )
}

describe('TodayView', () => {
  it('agrupa las comidas por hueco y enlaza al modo cocina', () => {
    renderToday()
    expect(screen.getByText('Sopa')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /cocinar|cook/i })).toHaveAttribute('href', '/cook/e1')
  })
  it('avisa de lo que caduca', () => {
    renderToday()
    expect(screen.getByText(/yogur/)).toBeInTheDocument()
  })
  it('sin nada planificado ofrece ir al plan', () => {
    renderToday({ entries: [] })
    expect(screen.getByRole('link', { name: /plan/i })).toBeInTheDocument()
  })
  it('una comida ya cocinada no ofrece cocinarla otra vez', () => {
    renderToday({ entries: [{ ...entry, status: 'cooked' }] })
    expect(screen.queryByRole('link', { name: /cocinar|cook/i })).toBeNull()
  })
  it('una sobra no ofrece cocinarla (la despensa ya se descontó el día que se cocinó)', () => {
    renderToday({ entries: [{ ...entry, leftoverOfEntryId: 'e0' }] })
    expect(screen.queryByRole('link', { name: /cocinar|cook/i })).toBeNull()
  })
})
