'use client'
import { useEffect } from 'react'

// El <html> del armazón compartido se prerenderiza con DEFAULT_PREFS y
// PREFS_BOOT_SCRIPT solo lo corrige si hay cookie de preferencias. Quien llega
// sin ella (login, registro, invitación, offline) recibe el cuerpo en el
// idioma que negoció su navegador y un `lang` que miente — WCAG 3.1.1. Aquí se
// estampa el que de verdad resolvió next-intl, que es el mismo con el que se
// han pintado los textos.
export function HtmlLang({ locale }: { locale: string }) {
  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])
  return null
}
