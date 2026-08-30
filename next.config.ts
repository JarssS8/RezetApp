import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'

const withNextIntl = createNextIntlPlugin('./lib/i18n/request.ts')

const nextConfig: NextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  // W10: la caché deja de ser un temporizador y pasa a ser un grafo de
  // etiquetas. `cacheComponents` habilita "use cache" + cacheTag/cacheLife
  // (y PPR por defecto). Sustituye al temporizador global de tiempo de
  // frescura de 0f8757d, que cacheaba cualquier segmento 30 s sin mirar si
  // los datos habían cambiado: ahora quien decide que una entrada caducó es
  // la escritura (lib/cache/tags.ts::invalidateHousehold), no el reloj.
  cacheComponents: true,
  // Un único perfil, con nombre propio en vez de redefinir un preset
  // (cacheLife.md desaconseja redefinir `days` y compañía: sorprende a quien
  // lee la llamada). stale 30 s reproduce el tiempo de frescura dinámico que
  // se retira -y es el mínimo que Next respeta para el prefetch-; revalidate
  // y expire son largos a propósito, porque la caducidad de verdad la manda
  // la etiqueta.
  cacheLife: {
    household: { stale: 30, revalidate: 60 * 60 * 24 * 30, expire: 60 * 60 * 24 * 365 },
    // El marco por sesión (idioma, mensajes, sesión) en `use cache: private`.
    // stale 5 min es el umbral que pide cacheLife.md (§Prerendering behavior)
    // para que el contenido entre en el App Shell que el router prefetchea;
    // por debajo de 30 s se caería incluso del prefetch. Solo vive en la
    // memoria del navegador de cada quien, nunca en el servidor.
    session: { stale: 60 * 5, revalidate: 60 * 5, expire: 60 * 60 },
  },
  // Sin telemetría de Next en la imagen: se fija también NEXT_TELEMETRY_DISABLED=1 en el Dockerfile.
  // Evita que Turbopack empaquete el binario nativo de sharp.
  serverExternalPackages: ['sharp'],
  // La ruta de assets lee ficheros del paquete en tiempo de ejecución; el
  // trazado de Next no lo detecta solo porque la ruta se calcula con
  // require.resolve. Sin esto, /api/docs se queda sin estilos en la imagen.
  // La clave es un glob (picomatch): los corchetes del segmento dinámico hay
  // que escaparlos, si no `[file]` se lee como una clase de caracteres.
  outputFileTracingIncludes: { '/api/docs/assets/\\[file\\]': ['./node_modules/swagger-ui-dist/swagger-ui*.{css,js}'] },
  // El service worker no se cachea nunca: si el navegador guarda una versión
  // vieja, la app se queda con ella hasta que caduque. Y Service-Worker-Allowed
  // deja explícito el ámbito raíz aunque el fichero se sirva desde /.
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
    ]
  },
}

export default withNextIntl(nextConfig)
