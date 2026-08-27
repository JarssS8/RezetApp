import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { describe, expect, it } from 'vitest'
import messages from '@/messages/es/today.json'
import { KcalRing } from './kcal-ring'

function renderRing(planned: number, cooked: number, isEstimated = false, hasUnknownKcal = false) {
  return render(
    <NextIntlClientProvider locale="es" messages={{ today: messages }}>
      <KcalRing plannedKcal={planned} cookedKcal={cooked} isEstimated={isEstimated} hasUnknownKcal={hasUnknownKcal} />
    </NextIntlClientProvider>,
  )
}

describe('KcalRing', () => {
  it('enseña cocinadas sobre planificadas y el porcentaje accesible', () => {
    renderRing(2000, 500)
    expect(screen.getByText('500')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /500.*2000/ })).toBeInTheDocument()
  })
  it('sin nada planificado no divide por cero', () => {
    renderRing(0, 0)
    expect(screen.getByRole('img')).toBeInTheDocument()
  })
  it('cocinar más de lo planificado no desborda el anillo', () => {
    renderRing(1000, 3000)
    const circle = screen.getByTestId('kcal-ring-progress')
    // El trazo nunca supera la circunferencia completa
    expect(Number(circle.getAttribute('stroke-dashoffset'))).toBeGreaterThanOrEqual(0)
  })
  it('marca la nutrición estimada', () => {
    renderRing(1000, 500, true)
    expect(screen.getByText(/estimad/i)).toBeInTheDocument()
  })
  it('avisa cuando alguna receta no tiene kcal', () => {
    renderRing(1000, 500, false, true)
    expect(screen.getByText(/no tiene kcal/i)).toBeInTheDocument()
  })
  it('no avisa cuando todas las recetas tienen kcal', () => {
    renderRing(1000, 500, false, false)
    expect(screen.queryByText(/no tiene kcal/i)).toBeNull()
  })
})
