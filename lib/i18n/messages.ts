// Resolución de locale (cookie > Accept-Language > es) y fusión de los namespaces de mensajes.
import { LOCALES, type Locale } from '@/lib/prefs'
import { NAMESPACES, type Namespace } from './config'

export type Messages = Record<Namespace, Record<string, unknown>>

export function resolveLocale(prefsLocale: string | undefined, acceptLanguage: string | null | undefined): Locale {
  if (prefsLocale && (LOCALES as readonly string[]).includes(prefsLocale)) return prefsLocale as Locale
  const first = (acceptLanguage ?? '')
    .split(',')
    .map((p) => p.trim().split(';')[0]?.slice(0, 2).toLowerCase() ?? '')
    .find((l) => (LOCALES as readonly string[]).includes(l))
  return (first as Locale | undefined) ?? 'es'
}

export async function loadMessages(locale: Locale): Promise<Messages> {
  const entries = await Promise.all(
    NAMESPACES.map(async (ns) => {
      const mod = (await import(`@/messages/${locale}/${ns}.json`)) as { default: Record<string, unknown> }
      return [ns, mod.default] as const
    }),
  )
  return Object.fromEntries(entries) as Messages
}
