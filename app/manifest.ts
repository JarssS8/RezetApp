import type { MetadataRoute } from 'next'

// Manifiesto de la PWA (spec §15). Se sirve en /manifest.webmanifest; Next lo
// enlaza solo desde el <head> al existir este fichero.
// display: 'standalone' y no 'fullscreen': la barra inferior de la app ya
// ocupa el borde de la pantalla y esconder la del sistema deja al usuario sin
// forma de volver.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'RezetApp',
    short_name: 'RezetApp',
    description: 'Recetario, plan de comidas y despensa del hogar',
    start_url: '/today',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#FBFBFC',
    theme_color: '#2F9E6B',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
