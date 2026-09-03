// Preferencias visuales espejo de users.* — PREFS_BOOT_SCRIPT las pinta en el
// cliente antes del primer pintado; desde T11b el servidor ya no las lee para
// el <html> (ver el comentario de PREFS_BOOT_SCRIPT más abajo).
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

// Script en línea que estampa tema, acento e idioma en <html> antes del
// primer pintado. Hace falta porque el layout raíz ya no puede leer la cookie
// en el servidor: si lo hiciera, ninguna ruta tendría armazón estático
// (08-caching.md dice justo esto para un atributo del elemento raíz — "no hay
// hijo que envolver en <Suspense>" — y receta un script antes del pintado).
// El HTML servido lleva los valores por defecto de DEFAULT_PREFS; este script
// los corrige con los de quien mira, sin parpadeo y sin meter nada de la
// sesión en el armazón compartido.
export const PREFS_BOOT_SCRIPT = `(function(){try{
var m=document.cookie.match(/(?:^|;\\s*)${PREFS_COOKIE}=([^;]*)/);if(!m)return;
var p=JSON.parse(decodeURIComponent(m[1]));var e=document.documentElement;
if(${JSON.stringify(LOCALES)}.indexOf(p.locale)>=0)e.lang=p.locale;
if(${JSON.stringify(ACCENTS)}.indexOf(p.accent)>=0)e.setAttribute('data-accent',p.accent);
if(p.theme==='light'||p.theme==='dark')e.setAttribute('data-theme',p.theme);else e.removeAttribute('data-theme');
}catch(_){}})()`
