import { cleanup, render, screen, within } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, describe, expect, it } from 'vitest'
import plan from '@/messages/es/plan.json'
import { addDays } from '@/lib/plan-dates'
import { MonthView, type MonthDayCell } from './month-view'

afterEach(cleanup)

// Rejilla mínima de prueba: 6 semanas × 7 días empezando el lunes 2026-07-27
// (lunes anterior o igual al 1 de agosto de 2026). Solo el día 2026-08-05
// lleva huecos ocupados, para poder aislar la aserción de los puntos.
function buildWeeks(): MonthDayCell[][] {
  const gridStart = '2026-07-27'
  const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i))
  const weeks: MonthDayCell[][] = []
  for (let row = 0; row < 6; row++) {
    const week: MonthDayCell[] = []
    for (let col = 0; col < 7; col++) {
      const date = days[row * 7 + col] as string
      week.push({
        date,
        day: Number(date.slice(8, 10)),
        inMonth: date >= '2026-08-01' && date <= '2026-08-31',
        slots: date === '2026-08-05' ? ['lunch', 'dinner'] : [],
        kcal: date === '2026-08-05' ? 1800 : null,
      })
    }
    weeks.push(week)
  }
  return weeks
}

function renderMonth() {
  render(
    <NextIntlClientProvider locale="es" messages={{ plan }}>
      <MonthView month="2026-08" weeks={buildWeeks()} todayIso="2026-08-05" prevMonth="2026-07" nextMonth="2026-09" />
    </NextIntlClientProvider>,
  )
}

describe('MonthView', () => {
  it('renderiza 42 celdas de día (6×7)', () => {
    renderMonth()
    const grid = screen.getByTestId('month-grid')
    expect(within(grid).getAllByRole('link')).toHaveLength(42)
  })

  it('muestra un punto por hueco ocupado, en orden de slot, con aria-label del recuento', () => {
    renderMonth()
    const dots = screen.getByTestId('meals-2026-08-05')
    expect(dots).toHaveAttribute('aria-label', '2 comidas planificadas')
    expect(within(dots).getAllByTestId('meal-dot')).toHaveLength(2)
  })

  it('no muestra puntos en un día sin comidas planificadas', () => {
    renderMonth()
    expect(screen.queryByTestId('meals-2026-08-06')).not.toBeInTheDocument()
  })

  it('muestra las kcal del día cuando hay', () => {
    renderMonth()
    expect(screen.getByText('1800 kcal')).toBeInTheDocument()
  })

  it('cada celda enlaza a la semana (el lunes de su fila) que la contiene', () => {
    renderMonth()
    // 2026-08-05 es miércoles de la semana que empieza el lunes 2026-08-03
    expect(screen.getByTestId('day-2026-08-05')).toHaveAttribute('href', '/plan?week=2026-08-03')
  })

  it('enlaza a los meses anterior y siguiente', () => {
    renderMonth()
    expect(screen.getByLabelText('Mes anterior')).toHaveAttribute('href', '/plan/month?month=2026-07')
    expect(screen.getByLabelText('Mes siguiente')).toHaveAttribute('href', '/plan/month?month=2026-09')
  })
})
