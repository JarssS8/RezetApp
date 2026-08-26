// Tipado de next-intl: autocompleta claves de traducción y falla el build si no existen.
import type { Messages } from '@/lib/i18n/messages'
import type es from '@/messages/es/common.json'

declare module 'next-intl' {
  interface AppConfig {
    Locale: 'es' | 'en'
    // 'common' se tipa con el JSON real para autocompletar; el índice genérico de
    // Record<string, unknown> del resto de namespaces rompería la inferencia si se
    // intersecara en vez de sustituirse (ver Omit).
    Messages: Omit<Messages, 'common'> & { common: typeof es }
  }
}
