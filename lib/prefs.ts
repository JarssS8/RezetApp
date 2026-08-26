// Preferencias visuales espejo de users.* — se leen en SSR para pintar <html> sin flash.
export const ACCENTS = ['huerta', 'miel', 'tomate', 'pistacho', 'higo', 'berenjena', 'arandano', 'canela'] as const
export const THEMES = ['system', 'light', 'dark'] as const
export const LOCALES = ['es', 'en'] as const

export type Accent = (typeof ACCENTS)[number]
export type Theme = (typeof THEMES)[number]
export type Locale = (typeof LOCALES)[number]
export type Prefs = { theme: Theme; accent: Accent; locale: Locale }

export const PREFS_COOKIE = 'rz_prefs'
export const DEFAULT_PREFS: Prefs = { theme: 'system', accent: 'huerta', locale: 'es' }

function pick<T extends readonly string[]>(allowed: T, v: unknown, fallback: T[number]): T[number] {
  return typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T[number]) : fallback
}

export function readPrefs(cookieValue: string | undefined): Prefs {
  if (!cookieValue) return DEFAULT_PREFS
  let raw: unknown
  try {
    raw = JSON.parse(cookieValue)
  } catch {
    return DEFAULT_PREFS
  }
  const o = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {}
  return {
    theme: pick(THEMES, o.theme, DEFAULT_PREFS.theme),
    accent: pick(ACCENTS, o.accent, DEFAULT_PREFS.accent),
    locale: pick(LOCALES, o.locale, DEFAULT_PREFS.locale),
  }
}

export function serializePrefs(p: Prefs): string {
  return JSON.stringify(p)
}
