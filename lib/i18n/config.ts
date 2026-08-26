// Namespaces de mensajes: un fichero JSON por namespace y locale.
export const NAMESPACES = ['common', 'auth', 'today', 'cook', 'plan', 'pantry', 'recipes', 'settings', 'errors'] as const
export type Namespace = (typeof NAMESPACES)[number]
export { LOCALES, DEFAULT_PREFS } from '@/lib/prefs'
export type { Locale } from '@/lib/prefs'
