import type { MetadataRoute } from 'next'

// Manifiesto de la PWA (spec §15). Se sirve en /manifest.webmanifest; Next lo
// enlaza solo desde el <head> al existir este fichero.
// display: 'standalone' y no 'fullscreen': la barra inferior de la app ya
// ocupa el borde de la pantalla y esconder la del sistema deja al usuario sin
// forma de volver.
// name/description/theme_color son fijos: el manifiesto se sirve como una
// ruta estática de Next, sin locale ni cookies de la petición (decisión 25
// del plan), así que install/splash siempre salen en español aunque el hogar
// use la interfaz en inglés — limitación conocida, no un olvido de i18n.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'RezetApp',
    short_name: 'RezetApp',
    description: 'Recetario, plan de comidas y despensa del hogar',
    start_url: '/today',
    scope: '/',
    display: 'standalone',
    // Auditoría W7, hallazgo 5.5: cook-session.tsx tiene un modo pared
    // explícito para tablet en horizontal (spec fase 5); `orientation:
    // 'portrait'` se lo bloquearía en la PWA instalada. Sin la clave, el
    // sistema no fuerza ninguna orientación.
    background_color: '#FBFBFC',
    // Un solo valor, sin variante oscura (el manifiesto no admite media
    // queries como el <meta name="theme-color"> de layout.tsx): se usa el
    // mismo claro que ahí (--bg claro de design-tokens.css) en vez del verde
    // de marca, para que la barra de estado del splash/instalado no
    // desentone del fondo real de la app al arrancar.
    theme_color: '#FBFBFC',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
