import { getTranslations } from 'next-intl/server'

// La puerta de entrada. Hasta W6 era un div centrado sin fondo, sin color y sin
// una sola señal de RezetApp. El wordmark se resuelve con Outfit (la familia de
// títulos, ya cargada por app/layout.tsx): no hace falta ningún activo nuevo, y
// así el nombre cambia de acento con el hogar como todo lo demás.
export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const c = await getTranslations('common')
  return (
    <div className="min-h-dvh bg-acc-soft">
      <div className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 px-6">
        <p className="text-center font-display text-2xl font-bold tracking-tight text-acc-ink">{c('appName')}</p>
        {children}
      </div>
    </div>
  )
}
