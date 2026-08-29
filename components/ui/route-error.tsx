'use client'

import { useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { WarningIcon } from '@/components/icons'
import { Button } from '@/components/ui/button'

// Página de error por segmento (auditoría W7, hallazgo 8.4). Un solo
// componente para los cinco `error.tsx` de app/(app)/*: mismo aspecto, mismo
// texto, un único sitio si hay que tocarlo. `error.tsx` tiene que ser
// Client Component (Next.js lo exige: usa el manejador de errores de React),
// por eso vive fuera de la página server que lo declara.
//
// Cero claves de i18n nuevas (regla de la ola). El mensaje es `errors.generic`
// (ya dice "Algo ha fallado. Inténtalo de nuevo."); el botón reutiliza
// `cook.timerReset` ("Reiniciar"/"Reset") porque es, literalmente, la única
// cadena de todo el catálogo que significa "reset" — no hay ninguna clave de
// "reintentar" todavía. Reutilizar una cadena de otro namespace por su
// significado (no por su sitio de origen) es preferible a inventar una clave
// nueva a mitad de una ola que lo prohíbe expresamente.
export function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations('errors')
  const cook = useTranslations('cook')

  useEffect(() => {
    // Sin telemetría (regla 7 de AGENTS.md): esto es la consola del
    // navegador, no una llamada de red. Ayuda a depurar en local.
    console.error(error)
  }, [error])

  return (
    <div className="view-enter flex flex-col items-center gap-3 rounded-lg bg-surface-sunken px-6 py-10 text-center">
      <span aria-hidden="true" className="flex size-20 items-center justify-center rounded-pill bg-danger-ink/10 text-danger-ink">
        <WarningIcon size={40} />
      </span>
      <p role="alert" className="max-w-[38ch] text-sm text-danger-ink">
        {t('generic')}
      </p>
      <Button type="button" onClick={reset}>
        {cook('timerReset')}
      </Button>
    </div>
  )
}
