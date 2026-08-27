import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'

const withNextIntl = createNextIntlPlugin('./lib/i18n/request.ts')

const nextConfig: NextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  // Sin telemetría de Next en la imagen: se fija también NEXT_TELEMETRY_DISABLED=1 en el Dockerfile.
  // Evita que Turbopack empaquete el binario nativo de sharp.
  serverExternalPackages: ['sharp'],
  // La ruta de assets lee ficheros del paquete en tiempo de ejecución; el
  // trazado de Next no lo detecta solo porque la ruta se calcula con
  // require.resolve. Sin esto, /api/docs se queda sin estilos en la imagen.
  // La clave es un glob (picomatch): los corchetes del segmento dinámico hay
  // que escaparlos, si no `[file]` se lee como una clase de caracteres.
  outputFileTracingIncludes: { '/api/docs/assets/\\[file\\]': ['./node_modules/swagger-ui-dist/swagger-ui*.{css,js}'] },
}

export default withNextIntl(nextConfig)
