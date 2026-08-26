// Config de next-intl: locale desde la cookie rz_prefs (si existe) o Accept-Language, si no es.
import { cookies, headers } from 'next/headers'
import { getRequestConfig } from 'next-intl/server'
import { PREFS_COOKIE, readPrefs } from '@/lib/prefs'
import { loadMessages, resolveLocale } from './messages'

export default getRequestConfig(async () => {
  const jar = await cookies()
  const hasCookie = jar.has(PREFS_COOKIE)
  const prefs = readPrefs(jar.get(PREFS_COOKIE)?.value)
  const locale = resolveLocale(hasCookie ? prefs.locale : undefined, (await headers()).get('accept-language'))
  return { locale, messages: await loadMessages(locale), timeZone: 'Europe/Madrid' }
})
