import { describe, expect, it } from 'vitest'
import { CANONICAL_UNITS, UNIT_ALIASES, findUnit, unitLabel } from './units-data'

describe('units-data', () => {
  it('resuelve alias en español con plural y acentos', () => {
    expect(findUnit('cucharaditas', 'es')?.id).toBe('tsp')
    expect(findUnit('Puñado', 'es')?.id).toBe('handful')
    expect(findUnit('gr.', 'es')?.id).toBe('g')
  })
  it('cae al otro idioma y al id canónico', () => {
    expect(findUnit('tbsp', 'es')?.id).toBe('tbsp')
    expect(findUnit('cdta', 'en')?.id).toBe('tsp')
    expect(findUnit('floz', 'es')?.id).toBe('floz')
  })
  it('devuelve null para lo desconocido', () => {
    expect(findUnit('pechuga', 'es')).toBeNull()
  })
  it('UNIT_ALIASES solo contiene unidades convertibles y cl = 10 ml', () => {
    expect(UNIT_ALIASES.every((u) => ['g', 'ml', 'ud'].includes(u.unit))).toBe(true)
    expect(UNIT_ALIASES.find((u) => u.alias === 'cl')?.factorToBase).toBe(10)
    expect(UNIT_ALIASES.find((u) => u.alias === 'pizca')).toBeUndefined()
  })
  it('etiquetas por locale y número', () => {
    expect(unitLabel('tbsp', 2, 'es')).toBe('cdas')
    expect(unitLabel('cup', 1, 'en')).toBe('cup')
    expect(CANONICAL_UNITS.map((u) => u.id)).toContain('pinch')
  })
})
