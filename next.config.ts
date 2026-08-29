import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'

const withNextIntl = createNextIntlPlugin('./lib/i18n/request.ts')

const nextConfig: NextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  // Caché de cliente del enrutador: sin esto, cada cambio de pestaña vuelve a
  // pedir la pantalla entera al servidor y enseña su loading.tsx aunque no
  // haya cambiado nada. 30s es seguro aquí: los cambios de datos en vivo ya
  // llegan por SSE (useHouseholdEvents → router.refresh, que ignora la caché).
  experimental: { staleTimes: { dynamic: 30, static: 180 } },
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
