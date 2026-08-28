import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { describe, expect, it } from 'vitest'
import today from '@/messages/es/today.json'
import { KcalRing } from './kcal-ring'

function renderRing(props: { plannedKcal: number; cookedKcal: number; isEstimated: boolean }) {
  return render(
    <NextIntlClientProvider locale="es" messages={{ today }}>
      <KcalRing {...props} dateLabel="jueves, 28 de agosto" />
    </NextIntlClientProvider>,
  )
}

describe('KcalRing', () => {
  it('vive dentro de un hero con fecha, acento suave y sombra', () => {
    const { container } = renderRing({ plannedKcal: 2000, cookedKcal: 800, isEstimated: false })
    const hero = container.firstElementChild
    expect(hero?.className).toContain('bg-acc-soft')
    expect(hero?.className).toContain('shadow-hero')
    expect(screen.getByText('jueves, 28 de agosto')).toBeInTheDocument()
  })

  it('la cifra protagonista se pinta con la voz display, no con la monoespaciada', () => {
    renderRing({ plannedKcal: 2000, cookedKcal: 800, isEstimated: false })
    const number = screen.getByText('800')
    expect(number.className).toContain('num-hero')
    // La incoherencia que W6 cierra: aquí el mismo dato salía en JetBrains Mono
    // y en la ficha de receta en Outfit.
    expect(number.className).not.toContain('tabular')
  })

  it('mantiene la etiqueta accesible que usan los e2e', () => {
    renderRing({ plannedKcal: 2000, cookedKcal: 800, isEstimated: false })
    expect(screen.getByRole('img', { name: '800 de 2.000 kcal cocinadas' })).toBeInTheDocument()
  })

  it('el progreso transita en vez de saltar, y solo transita el trazo', () => {
    renderRing({ plannedKcal: 2000, cookedKcal: 800, isEstimated: false })
    const progress = screen.getByTestId('kcal-ring-progress')
    // className en un SVGElement es un SVGAnimatedString en el DOM real (jsdom
    // lo simplifica a string): el cast cubre ambos sin usar "any".
    const progressClassName = progress.className as unknown as SVGAnimatedString | string
    expect(typeof progressClassName === 'string' ? progressClassName : progressClassName.baseVal).toContain('transition-[stroke-dashoffset]')
    // Nunca el color: el acento no parpadea al cocinar.
    expect(progress.getAttribute('class')).not.toContain('transition-colors')
  })
})
