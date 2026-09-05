import type { Metadata, Viewport } from 'next'
import { NuqsAdapter } from 'nuqs/adapters/next/app'
import { Suspense } from 'react'
import { IntlShell } from '@/components/i18n/intl-shell'
import { RegisterServiceWorker } from '@/components/pwa/register-sw'
import { DEFAULT_PREFS, PREFS_BOOT_SCRIPT } from '@/lib/prefs'
import './globals.css'

// El layout raíz es síncrono a propósito: no lee cookies ni mensajes. Es la
// pieza que decide si la app tiene armazón estático — mientras esperaba aquí
// la cookie de preferencias, `today.html` salía de 0 bytes y las cinco
// pantallas se marcaban `ƒ` en el build pasara lo que pasara dentro de cada
// página. Ahora el <html> se prerenderiza con los valores por defecto y
// PREFS_BOOT_SCRIPT los corrige antes del pintado; el idioma y los mensajes
// entran por IntlShell, en un ámbito privado por sesión.
//
// W10 sigue permitiendo rutas que bloquean (settings, subpantallas, /login…):
// `instant = false` aquí desactiva la validación de armazón para todo el
// árbol. No convierte nada en dinámico que no lo fuera ya — lo dice
// instant.md — y las cinco pantallas de la barra sí lo producen.
export const instant = false

export const metadata: Metadata = { title: 'RezetApp', applicationName: 'RezetApp', icons: { apple: '/apple-touch-icon.png' } }
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  // Dos colores para que la barra del sistema acompañe al tema del usuario
  // (los valores salen de design-tokens.css: --bg claro y --bg oscuro).
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#FBFBFC' },
    { media: '(prefers-color-scheme: dark)', color: '#16130F' },
  ],
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: PREFS_BOOT_SCRIPT cambia lang/data-* antes de
    // que React hidrate, así que el HTML servido y el DOM real difieren a
    // propósito en este elemento (y solo en este).
    <html
      lang={DEFAULT_PREFS.locale}
      data-accent={DEFAULT_PREFS.accent}
      suppressHydrationWarning
    >
      <head>
        {/* Contenido generado en lib/prefs.ts, sin ninguna entrada del usuario. */}
        <script dangerouslySetInnerHTML={{ __html: PREFS_BOOT_SCRIPT }} />
      </head>
      <body className="min-h-dvh antialiased">
        {/* URL como estado (nuqs, W9): los filtros de /recipes leen y escriben
            la query con useQueryState(s) en vez de construir URLSearchParams
            a mano; el adaptador de App Router es quien sabe hablar con
            next/navigation por debajo. */}
        <NuqsAdapter>
          {/* El proveedor de idioma es un ámbito privado por sesión: no corre
              durante la generación del armazón estático, así que necesita su
              propio <Suspense> (si no, el prerender falla en cada ruta). El
              fallback va vacío a propósito: en el armazón compartido no puede
              entrar nada traducido — sería el idioma de quien construyó el
              build para todo el mundo.
              Ojo con lo que se mete en los esqueletos de cada pantalla: sí
              entran en el armazón compartido de su ruta (`_full.segment.rsc`,
              artefacto del build, una copia por ruta y para todo el mundo). Se
              libran de traducir texto porque el único que lleva —el aviso para
              lector de pantalla— vive en LoadingStatus, un componente de
              cliente: en el armazón va la referencia, no la cadena. Cualquier
              `getTranslations` que se cuele ahí sí sería una fuga de idioma. */}
          <Suspense fallback={null}>
            <IntlShell>
              <RegisterServiceWorker />
              {children}
            </IntlShell>
          </Suspense>
        </NuqsAdapter>
      </body>
    </html>
  )
}
