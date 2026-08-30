import { cacheLife } from 'next/cache'
import { NextIntlClientProvider } from 'next-intl'

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
  return <NextIntlClientProvider>{children}</NextIntlClientProvider>
}
