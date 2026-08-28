import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PantryIcon } from '@/components/icons'
import { EmptyState } from './empty-state'

describe('EmptyState', () => {
  it('pinta el título con voz de display y el icono decorativo oculto al lector', () => {
    const { container } = render(<EmptyState icon={PantryIcon} title="La despensa está vacía" />)
    expect(screen.getByText('La despensa está vacía')).toHaveClass('title-content')
    // El icono es decoración: el texto ya dice lo que pasa.
    expect(container.querySelector('[aria-hidden="true"]')).not.toBeNull()
    expect(container.querySelector('svg')).not.toBeNull()
  })

  it('la descripción y la acción son opcionales y no dejan huecos si no van', () => {
    const { container, rerender } = render(<EmptyState icon={PantryIcon} title="Vacío" />)
    expect(container.querySelectorAll('p')).toHaveLength(1)
    rerender(
      // eslint-disable-next-line react/jsx-no-literals -- texto de prueba, no de interfaz
      <EmptyState icon={PantryIcon} title="Vacío" description="Añade algo" action={<button type="button">Añadir</button>} />,
    )
    expect(container.querySelectorAll('p')).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'Añadir' })).toBeInTheDocument()
  })

  it('se apoya en tokens: acento suave en el círculo y superficie hundida de fondo', () => {
    const { container } = render(<EmptyState icon={PantryIcon} title="Vacío" />)
    const box = container.firstElementChild
    expect(box?.className).toContain('bg-surface-sunken')
    expect(container.querySelector('[aria-hidden="true"]')?.className).toContain('bg-acc-soft')
    expect(box?.className).not.toMatch(/\b(bg|text|border)-(gray|slate|zinc|neutral|red|green|blue)-\d/)
  })
})
