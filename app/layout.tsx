import type { Metadata, Viewport } from 'next'
import { DM_Sans, JetBrains_Mono, Outfit } from 'next/font/google'
import { cookies } from 'next/headers'
import { NextIntlClientProvider } from 'next-intl'
import { getLocale, getMessages } from 'next-intl/server'
import { NuqsAdapter } from 'nuqs/adapters/next/app'
import { RegisterServiceWorker } from '@/components/pwa/register-sw'
import { PREFS_COOKIE, readPrefs } from '@/lib/prefs'
import './globals.css'

const outfit = Outfit({ subsets: ['latin'], weight: ['600', '700'], variable: '--font-outfit', display: 'swap' })
const dmSans = DM_Sans({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-dm-sans', display: 'swap' })
const mono = JetBrains_Mono({ subsets: ['latin'], weight: ['500', '600'], variable: '--font-jetbrains-mono', display: 'swap' })

// El layout raíz lee la cookie de preferencias para pintar data-theme y
// data-accent en el <html>: 08-caching.md dice que cuando una cookie decide
// un atributo del elemento raíz "no hay hijo que envolver en <Suspense>", y
// el arreglo documentado es un <script> en línea antes del pintado. Eso es
// una oleada propia (tema sin parpadeo). Hasta entonces, este segmento
// declara que se le permite bloquear: `instant = false` desactiva la
// validación de armazón estático del árbol, no convierte nada en dinámico
// que no lo fuera ya.
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

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const prefs = readPrefs((await cookies()).get(PREFS_COOKIE)?.value)
  const locale = await getLocale()
  const messages = await getMessages()
  return (
    <html
      lang={locale}
      data-accent={prefs.accent}
      {...(prefs.theme === 'system' ? {} : { 'data-theme': prefs.theme })}
      className={`${outfit.variable} ${dmSans.variable} ${mono.variable}`}
    >
      <body className="min-h-dvh antialiased">
        {/* URL como estado (nuqs, W9): los filtros de /recipes leen y escriben
            la query con useQueryState(s) en vez de construir URLSearchParams
            a mano; el adaptador de App Router es quien sabe hablar con
            next/navigation por debajo. */}
        <NuqsAdapter>
          <NextIntlClientProvider locale={locale} messages={messages}>
            <RegisterServiceWorker />
            {children}
          </NextIntlClientProvider>
        </NuqsAdapter>
      </body>
    </html>
  )
}
