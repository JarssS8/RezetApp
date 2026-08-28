import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { RecipePlaceholder, placeholderAngle } from './recipe-placeholder'

describe('placeholderAngle', () => {
  it('es determinista: el mismo id da siempre el mismo ángulo', () => {
    const id = '0f6f1c2e-1111-4c3a-9d0e-3b2a1f0c7d55'
    expect(placeholderAngle(id)).toBe(placeholderAngle(id))
  })

  it('reparte los ángulos: veinte ids distintos no caen todos en el mismo', () => {
    const angles = new Set(Array.from({ length: 20 }, (_, i) => placeholderAngle(`receta-${i}`)))
    expect(angles.size).toBeGreaterThan(3)
  })

  it('nunca devuelve undefined aunque el id sea vacío', () => {
    expect(Number.isFinite(placeholderAngle(''))).toBe(true)
  })
})

describe('RecipePlaceholder', () => {
  it('pinta el degradado del token con el ángulo del id y se oculta al lector', () => {
    const { container } = render(<RecipePlaceholder recipeId="abc" />)
    const box = container.firstElementChild as HTMLElement
    expect(box.className).toContain('bg-(image:--grad-food)')
    expect(box.style.getPropertyValue('--grad-food-angle')).toBe(`${placeholderAngle('abc')}deg`)
    expect(box.getAttribute('aria-hidden')).toBe('true')
  })
})
