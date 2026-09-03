import type { User } from '@/db/schema'
import { readPrefs, serializePrefs } from '@/lib/prefs'

export const SESSION_COOKIE = 'rz_session'
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

// Espejo de users.* para que PREFS_BOOT_SCRIPT pinte data-theme/data-accent en
// el cliente sin consultar la DB (desde T11b el servidor ya no lee esta
// cookie para el <html>). El contrato de la cookie rz_prefs vive entero en
// lib/prefs.ts: se serializa a
// través de readPrefs para no escribir un tema, acento o idioma que la app no
// sepa pintar (users.accent y users.locale son texto libre en la base).
export function prefsCookieValue(user: Pick<User, 'theme' | 'accent' | 'locale'>): string {
  return serializePrefs(readPrefs(JSON.stringify({ theme: user.theme, accent: user.accent, locale: user.locale })))
}
