import { describe, expect, it } from 'vitest'
import { parsePrefsCookie, prefsCookieValue, sessionCookieOptions } from './cookies'

describe('cookies', () => {
  it('sessionCookieOptions marca secure según el esquema de APP_URL', () => {
    expect(sessionCookieOptions('https://x')).toEqual({
      httpOnly: true, sameSite: 'lax', secure: true, path: '/', maxAge: 7_776_000,
    })
    expect(sessionCookieOptions('http://localhost:3000').secure).toBe(false)
  })
  it('parsePrefsCookie sin valor devuelve null', () => {
    expect(parsePrefsCookie(undefined)).toBeNull()
  })
  it('prefsCookieValue e ida y vuelta con parsePrefsCookie', () => {
    const user = { theme: 'dark' as const, accent: 'huerta', locale: 'es' }
    expect(parsePrefsCookie(prefsCookieValue(user))).toEqual(user)
  })
})
