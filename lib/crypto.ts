// Derivación de claves y cifrado de secretos, compartido entre lib/auth (firma
// de cookies de sesión) y lib/ai (descifrado de la clave de API del hogar).
// Vive fuera de lib/auth porque las fronteras (eslint boundaries) no dejan que
// lib/ai importe de lib/auth: solo lib/domain, lib/validation, db y lib/*.
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto'

export interface DerivedKeys {
  session: Buffer // HMAC de cookies (lib/auth/crypto.ts)
  secrets: Buffer // AES-GCM de secretos por hogar (p. ej. la clave de IA)
}

// APP_SECRET nunca se usa directo: dos claves por HKDF con `info` distinto
export function deriveKeys(appSecret: string): DerivedKeys {
  if (appSecret.length < 32) throw new Error('APP_SECRET debe tener al menos 32 caracteres')
  const derive = (info: string) => Buffer.from(hkdfSync('sha256', appSecret, 'rezetapp', info, 32))
  return { session: derive('rezetapp/session'), secrets: derive('rezetapp/secrets') }
}

let cached: DerivedKeys | null = null
export function getKeys(): DerivedKeys {
  if (!cached) {
    const secret = process.env.APP_SECRET
    if (!secret) throw new Error('Falta APP_SECRET')
    cached = deriveKeys(secret)
  }
  return cached
}

// Formato: iv(12) || tag(16) || ciphertext
export function encryptSecret(plain: string, key: Buffer): Buffer {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), enc])
}

export function decryptSecret(blob: Buffer, key: Buffer): string {
  const iv = blob.subarray(0, 12)
  const tag = blob.subarray(12, 28)
  const data = blob.subarray(28)
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')
}
