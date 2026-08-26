// Tipado de next-intl: autocompleta claves de traducción y falla el build si no existen.
// Se tipa cada namespace con su JSON real (es como fuente de verdad) para que
// useTranslations/getTranslations infieran claves concretas en vez de `never`.
import type es from '@/messages/es/common.json'
import type esAuth from '@/messages/es/auth.json'
import type esCook from '@/messages/es/cook.json'
import type esErrors from '@/messages/es/errors.json'
import type esPantry from '@/messages/es/pantry.json'
import type esPlan from '@/messages/es/plan.json'
import type esRecipes from '@/messages/es/recipes.json'
import type esSettings from '@/messages/es/settings.json'
import type esToday from '@/messages/es/today.json'

declare module 'next-intl' {
  interface AppConfig {
    Locale: 'es' | 'en'
    Messages: {
      common: typeof es
      auth: typeof esAuth
      today: typeof esToday
      cook: typeof esCook
      plan: typeof esPlan
      pantry: typeof esPantry
      recipes: typeof esRecipes
      settings: typeof esSettings
      errors: typeof esErrors
    }
  }
}
