import { cacheLife } from 'next/cache'
import { NextIntlClientProvider } from 'next-intl'
import { getLocale } from 'next-intl/server'
import { HtmlLang } from './html-lang'

// El proveedor de next-intl resuelve idioma, mensajes, zona y formatos desde
// lib/i18n/request.ts, que lee la cookie rz_prefs y Accept-Language. Eso es
// dato de petición: fuera de un ámbito cacheado impediría prerenderizar el
// armazón estático de TODAS las rutas (era el motivo real de que las cinco
// pantallas salieran `ƒ` en el build, no los `requireHousehold()` de cada
// página).
//
// `use cache: private` es la respuesta documentada (08-caching.md, "App
// Shell"): puede leer cookies() y headers(), nunca se guarda en el servidor
// -solo en la memoria del navegador de quien pide- y con `stale` >= 5 min
// entra en el App Shell por sesión que el router prefetchea. Los `children`
// pasan de largo: no se leen ni se cachean, así que el árbol de la página
// sigue resolviéndose por su cuenta.
export async function IntlShell({ children }: { children: React.ReactNode }) {
  'use cache: private'
  cacheLife('session')
  // El idioma se resuelve aquí una vez y se usa dos veces: para el proveedor y
  // para corregir el `lang` del <html>, que el armazón compartido no puede
  // saber (ver components/i18n/html-lang.tsx).
  const locale = await getLocale()
  return (
    <NextIntlClientProvider locale={locale}>
      <HtmlLang locale={locale} />
      {children}
    </NextIntlClientProvider>
  )
}
