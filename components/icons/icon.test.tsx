import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TodayIcon } from './index'

describe('Icon', () => {
  it('mantiene el trazo 1.85 del set por defecto', () => {
    const { container } = render(<TodayIcon />)
    expect(container.querySelector('svg')?.getAttribute('stroke-width')).toBe('1.85')
  })

  it('acepta un trazo más grueso para el estado activo sin redibujar el icono', () => {
    const { container } = render(<TodayIcon strokeWidth={2.2} />)
    expect(container.querySelector('svg')?.getAttribute('stroke-width')).toBe('2.2')
  })
})
