import { describe, expect, it } from 'vitest'
import { displayTagName } from './tags'

describe('displayTagName', () => {
  it('devuelve el español en es y el inglés en en', () => {
    const tag = { name: 'Postre', nameEn: 'Dessert' }
    expect(displayTagName(tag, 'es')).toBe('Postre')
    expect(displayTagName(tag, 'en')).toBe('Dessert')
  })
  it('sin traducción cae al español también en en', () => {
    expect(displayTagName({ name: 'Cena de los martes', nameEn: null }, 'en')).toBe('Cena de los martes')
    expect(displayTagName({ name: 'Cena de los martes', nameEn: '' }, 'en')).toBe('Cena de los martes')
  })
})
