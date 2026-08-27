import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { describe, expect, it } from 'vitest'
import plan from '@/messages/es/plan.json'
import { PlanStatsPanel } from './plan-stats-panel'

const stats = {
  from: '2026-08-31',
  to: '2026-09-06',
  planned: 14,
  cooked: 9,
  skipped: 2,
  pending: 3,
  adherence: 9 / 11,
  plannedKcal: 12000,
  cookedKcal: 7800,
  cookedOffPlan: 1,
  topRecipes: [{ title: 'Sopa', times: 3 }],
}

describe('PlanStatsPanel', () => {
  it('enseña los recuentos y la adherencia en porcentaje', () => {
    render(
      <NextIntlClientProvider locale="es" messages={{ plan }}>
        <PlanStatsPanel stats={stats} />
      </NextIntlClientProvider>,
    )
    expect(screen.getByText('82 %')).toBeVisible()
    expect(screen.getByText(plan.stats.cooked)).toBeVisible()
    expect(screen.getByText('Sopa')).toBeVisible()
  })

  it('sin nada decidido no inventa un 0 %', () => {
    render(
      <NextIntlClientProvider locale="es" messages={{ plan }}>
        <PlanStatsPanel stats={{ ...stats, cooked: 0, skipped: 0, pending: 14, adherence: null, topRecipes: [] }} />
      </NextIntlClientProvider>,
    )
    expect(screen.queryByText(/%/)).toBeNull()
    expect(screen.getByText(plan.stats.noData)).toBeVisible()
  })
})
