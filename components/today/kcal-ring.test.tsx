import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { describe, expect, it } from 'vitest'
import today from '@/messages/es/today.json'
import { KcalRing } from './kcal-ring'

function renderRing(props: { plannedKcal: number; cookedKcal: number; isEstimated?: boolean; hasUnknownKcal?: boolean }) {
  return render(
    <NextIntlClientProvider locale="es" messages={{ today }}>
      <KcalRing isEstimated={false} dateLabel="jueves, 28 de agosto" {...props} />
    </NextIntlClientProvider>,
  )
}

describe('KcalRing', () => {
  it('vive dentro de un hero con fecha, acento suave y sombra', () => {
    const { container } = renderRing({ plannedKcal: 2000, cookedKcal: 800 })
    const hero = container.firstElementChild
    expect(hero?.className).toContain('bg-acc-soft')
    expect(hero?.className).toContain('shadow-hero')
    expect(screen.getByText('jueves, 28 de agosto')).toBeInTheDocument()
  })

  it('la cifra protagonista se pinta con la voz display, no con la monoespaciada', () => {
    renderRing({ plannedKcal: 2000, cookedKcal: 800 })
    const number = screen.getByText('800')
    expect(number.className).toContain('num-hero')
    // La incoherencia que W6 cierra: aquí el mismo dato salía en JetBrains Mono
    // y en la ficha de receta en Outfit.
    expect(number.className).not.toContain('tabular')
  })

  it('mantiene la etiqueta accesible que usan los e2e', () => {
    renderRing({ plannedKcal: 2000, cookedKcal: 800 })
    expect(screen.getByRole('img', { name: '800 de 2.000 kcal cocinadas' })).toBeInTheDocument()
  })

  it('el progreso transita en vez de saltar, y solo transita el trazo', () => {
    renderRing({ plannedKcal: 2000, cookedKcal: 800 })
    const progress = screen.getByTestId('kcal-ring-progress')
    // className en un SVGElement es un SVGAnimatedString en el DOM real (jsdom
    // lo simplifica a string): el cast cubre ambos sin usar "any".
    const progressClassName = progress.className as unknown as SVGAnimatedString | string
    expect(typeof progressClassName === 'string' ? progressClassName : progressClassName.baseVal).toContain('transition-[stroke-dashoffset]')
    // Nunca el color: el acento no parpadea al cocinar.
    expect(progress.getAttribute('class')).not.toContain('transition-colors')
  })

  it('sin nada planificado no divide por cero', () => {
    renderRing({ plannedKcal: 0, cookedKcal: 0 })
    expect(screen.getByRole('img')).toBeInTheDocument()
  })

  it('cocinar más de lo planificado no desborda el anillo', () => {
    renderRing({ plannedKcal: 1000, cookedKcal: 3000 })
    const circle = screen.getByTestId('kcal-ring-progress')
    // El trazo nunca supera la circunferencia completa
    expect(Number(circle.getAttribute('stroke-dashoffset'))).toBeGreaterThanOrEqual(0)
  })

  it('marca la nutrición estimada', () => {
    renderRing({ plannedKcal: 1000, cookedKcal: 500, isEstimated: true })
    expect(screen.getByText(/estimad/i)).toBeInTheDocument()
  })

  it('avisa cuando alguna receta no tiene kcal', () => {
    renderRing({ plannedKcal: 1000, cookedKcal: 500, hasUnknownKcal: true })
    expect(screen.getByText(/no tiene kcal/i)).toBeInTheDocument()
  })

  it('no avisa cuando todas las recetas tienen kcal', () => {
    renderRing({ plannedKcal: 1000, cookedKcal: 500, hasUnknownKcal: false })
    expect(screen.queryByText(/no tiene kcal/i)).toBeNull()
  })
})
