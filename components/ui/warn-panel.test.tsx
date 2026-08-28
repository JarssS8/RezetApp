import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { WarnPanel } from './warn-panel'

describe('WarnPanel', () => {
  it('pinta título, contenido y pie con los props recibidos', () => {
    render(
      // eslint-disable-next-line react/jsx-no-literals -- texto de prueba, no de interfaz
      <WarnPanel title="Caduca pronto" footer={<button type="button">Ver despensa</button>}>
        {/* eslint-disable-next-line react/jsx-no-literals -- texto de prueba, no de interfaz */}
        <p>Leche — 2 días</p>
      </WarnPanel>,
    )
    expect(screen.getByText('Caduca pronto')).toBeInTheDocument()
    expect(screen.getByText('Leche — 2 días')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ver despensa' })).toBeInTheDocument()
  })

  it('el pie es opcional y no deja hueco si no llega', () => {
    const { container } = render(
      <WarnPanel title="Caduca pronto">
        {/* eslint-disable-next-line react/jsx-no-literals -- texto de prueba, no de interfaz */}
        <p>Leche — 2 días</p>
      </WarnPanel>,
    )
    // Solo dos <div>: el de children (siempre) y ninguno más para el footer ausente.
    expect(container.querySelectorAll('div')).toHaveLength(1)
  })

  it('se apoya en los tokens de aviso (--warn), nunca en un color fijo', () => {
    const { container } = render(
      <WarnPanel title="Caduca pronto">
        {/* eslint-disable-next-line react/jsx-no-literals -- texto de prueba, no de interfaz */}
        <p>Leche — 2 días</p>
      </WarnPanel>,
    )
    const section = container.querySelector('section')
    expect(section?.className).toContain('bg-warn-soft')
    expect(section?.className).toContain('border-warn/40')
    expect(screen.getByText('Caduca pronto').className).toContain('text-warn-ink')
    expect(section?.className).not.toMatch(/\b(bg|text|border)-(gray|slate|zinc|neutral|red|green|blue|amber|orange)-\d/)
  })
})
