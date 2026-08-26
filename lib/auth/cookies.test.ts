import { describe, expect, it } from 'vitest'
import { DEFAULT_PREFS, readPrefs } from '@/lib/prefs'
import { prefsCookieValue, sessionCookieOptions } from './cookies'

describe('cookies', () => {
  it('sessionCookieOptions marca secure según el esquema de APP_URL', () => {
    expect(sessionCookieOptions('https://x')).toEqual({
      httpOnly: true, sameSite: 'lax', secure: true, path: '/', maxAge: 7_776_000,
    })
    expect(sessionCookieOptions('http://localhost:3000').secure).toBe(false)
  })
  it('prefsCookieValue produce un valor que readPrefs acepta', () => {
    const user = { theme: 'dark' as const, accent: 'higo', locale: 'en' }
    expect(readPrefs(prefsCookieValue(user))).toEqual(user)
  })
  it('valores de users.* fuera de contrato caen a los de por defecto', () => {
    const user = { theme: 'dark' as const, accent: 'neón', locale: 'fr' }
    expect(readPrefs(prefsCookieValue(user))).toEqual({ ...DEFAULT_PREFS, theme: 'dark' })
  })
})
