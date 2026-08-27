import { describe, expect, it } from 'vitest'
import { generateVapidKeys } from './web-push'

describe('generateVapidKeys', () => {
  it('devuelve un par base64url distinto en cada llamada', () => {
    const a = generateVapidKeys()
    const b = generateVapidKeys()
    expect(a.publicKey).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(a.privateKey).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(a.publicKey).not.toBe(b.publicKey)
    // La clave pública P-256 sin comprimir son 65 bytes -> 87 caracteres base64url
    expect(a.publicKey.length).toBe(87)
  })
})
