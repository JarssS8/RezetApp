import { describe, expect, it } from 'vitest'
import { decryptSecret, deriveKeys, encryptSecret, signValue, verifySignedValue } from './crypto'

const keys = deriveKeys('secreto-de-prueba-con-suficiente-longitud')

describe('crypto', () => {
  it('deriva dos claves distintas y deterministas', () => {
    const again = deriveKeys('secreto-de-prueba-con-suficiente-longitud')
    expect(keys.session.equals(again.session)).toBe(true)
    expect(keys.secrets.equals(again.secrets)).toBe(true)
    expect(keys.session.equals(keys.secrets)).toBe(false)
    expect(keys.session.length).toBe(32)
  })
  it('cifra y descifra; dos cifrados del mismo texto difieren (IV aleatorio)', () => {
    const a = encryptSecret('sk-123', keys.secrets)
    const b = encryptSecret('sk-123', keys.secrets)
    expect(a.equals(b)).toBe(false)
    expect(decryptSecret(a, keys.secrets)).toBe('sk-123')
  })
  it('descifrar con otra clave o blob manipulado falla', () => {
    const blob = encryptSecret('x', keys.secrets)
    expect(() => decryptSecret(blob, keys.session)).toThrow()
    const tampered = Buffer.from(blob)
    tampered[tampered.length - 1] = (tampered[tampered.length - 1] ?? 0) ^ 1
    expect(() => decryptSecret(tampered, keys.secrets)).toThrow()
  })
  it('firma y verifica valores; rechaza alteraciones', () => {
    const signed = signValue('abc', keys.session)
    expect(signed.startsWith('abc.')).toBe(true)
    expect(verifySignedValue(signed, keys.session)).toBe('abc')
    expect(verifySignedValue('abd.' + signed.split('.')[1], keys.session)).toBeNull()
    expect(verifySignedValue('sin-punto', keys.session)).toBeNull()
    expect(verifySignedValue(signed, keys.secrets)).toBeNull()
  })
  it('exige secreto de al menos 32 caracteres', () => {
    expect(() => deriveKeys('corto')).toThrow()
  })
})
