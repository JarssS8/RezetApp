import { createHmac, timingSafeEqual } from 'node:crypto'

// Derivación de claves y cifrado de secretos: en lib/crypto.ts (fuera de
// lib/auth) porque lib/ai también necesita descifrar la clave de IA del hogar
// y las fronteras no dejan que lib/ai dependa de lib/auth. Se reexportan aquí
// para no romper a quien ya importaba desde lib/auth/crypto.
export { type DerivedKeys, decryptSecret, deriveKeys, encryptSecret, getKeys } from '@/lib/crypto'

function hmac(value: string, key: Buffer): string {
  return createHmac('sha256', key).update(value).digest('base64url')
}

export function signValue(value: string, key: Buffer): string {
  return `${value}.${hmac(value, key)}`
}

export function verifySignedValue(signed: string, key: Buffer): string | null {
  const dot = signed.lastIndexOf('.')
  if (dot <= 0) return null
  const value = signed.slice(0, dot)
  const sig = signed.slice(dot + 1)
  const expected = hmac(value, key)
  if (sig.length !== expected.length) return null
  return timingSafeEqual(Buffer.from(sig), Buffer.from(expected)) ? value : null
}
