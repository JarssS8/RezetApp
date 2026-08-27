import type { Metadata, Viewport } from 'next'
import { DM_Sans, JetBrains_Mono, Outfit } from 'next/font/google'
import { cookies } from 'next/headers'
import { NextIntlClientProvider } from 'next-intl'
import { getLocale, getMessages } from 'next-intl/server'
import { PREFS_COOKIE, readPrefs } from '@/lib/prefs'
import './globals.css'

const outfit = Outfit({ subsets: ['latin'], weight: ['600', '700'], variable: '--font-outfit', display: 'swap' })
const dmSans = DM_Sans({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-dm-sans', display: 'swap' })
const mono = JetBrains_Mono({ subsets: ['latin'], weight: ['500', '600'], variable: '--font-jetbrains-mono', display: 'swap' })

export const metadata: Metadata = { title: 'RezetApp', applicationName: 'RezetApp' }
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
        <NextIntlClientProvider locale={locale} messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
