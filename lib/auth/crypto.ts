import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes, timingSafeEqual } from 'node:crypto'

export interface DerivedKeys {
  session: Buffer // HMAC de cookies
  secrets: Buffer // AES-GCM de secretos por hogar
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
