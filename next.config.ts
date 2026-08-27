import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'

const withNextIntl = createNextIntlPlugin('./lib/i18n/request.ts')

const nextConfig: NextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  // Sin telemetría de Next en la imagen: se fija también NEXT_TELEMETRY_DISABLED=1 en el Dockerfile.
  // Evita que Turbopack empaquete el binario nativo de sharp.
  serverExternalPackages: ['sharp'],
}

export default withNextIntl(nextConfig)
