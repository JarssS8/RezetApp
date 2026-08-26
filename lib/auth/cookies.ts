import type { User } from '@/db/schema'

export const SESSION_COOKIE = 'rz_session'
export const PREFS_COOKIE = 'rz_prefs'
export const SESSION_DAYS = 90

export interface CookieOptions {
  httpOnly: boolean
  sameSite: 'lax'
  secure: boolean
  path: string
  maxAge: number
}

export function sessionCookieOptions(appUrl: string): CookieOptions {
  return { httpOnly: true, sameSite: 'lax', secure: appUrl.startsWith('https://'), path: '/', maxAge: SESSION_DAYS * 86_400 }
}

export function prefsCookieOptions(appUrl: string): CookieOptions {
  return { httpOnly: false, sameSite: 'lax', secure: appUrl.startsWith('https://'), path: '/', maxAge: 365 * 86_400 }
}

export interface Prefs {
  theme: User['theme']
  accent: string
  locale: string
}

// Espejo de users.* para pintar data-theme/data-accent en SSR sin consultar la DB
export function prefsCookieValue(user: Pick<User, 'theme' | 'accent' | 'locale'>): string {
  const p: Prefs = { theme: user.theme, accent: user.accent, locale: user.locale }
  return JSON.stringify(p)
}

export function parsePrefsCookie(value: string | undefined): Prefs | null {
  if (!value) return null
  try {
    const p = JSON.parse(value) as Partial<Prefs>
    if (typeof p.theme !== 'string' || typeof p.accent !== 'string' || typeof p.locale !== 'string') return null
    return { theme: p.theme, accent: p.accent, locale: p.locale }
  } catch {
    return null
  }
}
