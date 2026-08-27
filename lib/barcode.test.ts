import { describe, expect, it } from 'vitest'
import { normalizeBarcode } from './barcode'

describe('normalizeBarcode', () => {
  it('acepta un EAN-13 con dígito de control correcto', () => {
    expect(normalizeBarcode('8410000810004')).toBe('8410000810004')
  })

  it('rechaza un EAN-13 con dígito de control incorrecto', () => {
    expect(normalizeBarcode('8410000810005')).toBeNull()
  })

  it('quita espacios sobrantes', () => {
    expect(normalizeBarcode(' 12345678 ')).toBe('12345678')
  })

  it('rechaza texto que no son dígitos', () => {
    expect(normalizeBarcode('abc')).toBeNull()
  })

  it('antepone el 0 a un UPC-A de 12 dígitos', () => {
    expect(normalizeBarcode('036000291452')).toBe('0036000291452')
  })
})
