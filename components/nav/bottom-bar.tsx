'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { PantryIcon, PlanIcon, RecipesIcon, TodayIcon } from '@/components/icons'
import { cn } from '@/lib/utils'

// Cocinar sale de la barra (rediseño 2026-09, README §2): pasa a ser un modo
// a pantalla completa que se lanza desde una comida de Hoy
// (components/today/today-view.tsx) o desde "Cocinar ahora" en el detalle de
// receta (components/recipes/recipe-detail.tsx) — las dos entradas ya
// existían antes de este cambio, así que quitar la pestaña no rompe el
// acceso. Orden Hoy·Recetas·Plan·Despensa, el del handoff.
export const NAV_ITEMS = [
  { href: '/today', labelKey: 'today', Icon: TodayIcon },
  { href: '/recipes', labelKey: 'recipes', Icon: RecipesIcon },
  { href: '/plan', labelKey: 'plan', Icon: PlanIcon },
  { href: '/pantry', labelKey: 'pantry', Icon: PantryIcon },
] as const

export function BottomBar() {
  const t = useTranslations('common')
  const pathname = usePathname()
  return (
    <nav
      aria-label={t('navLabel')}
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line-2 bg-card/95 backdrop-blur pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="mx-auto grid max-w-xl grid-cols-4">
        {NAV_ITEMS.map(({ href, labelKey, Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`)
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  // Color de la etiqueta con transición de token (W6.5,
                  // ruling W6-R5: la barra inferior deja de estar prohibida).
                  'flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs font-medium transition-colors duration-(--dur-1) ease-(--ease-out)',
                  active ? 'text-acc-ink' : 'text-text-2',
                )}
              >
                {/* La píldora vive dentro del área táctil de 56 px: el objetivo
                    no se toca (AGENTS.md), solo se pinta lo que hay dentro. El
                    trazo del icono engorda a 2.2 en la pestaña activa: es la
                    segunda señal, además del fondo, y la que se lee de reojo. */}
                {/* border-transparent y pill-selected nunca van juntas: las dos
                    tocan border-color y, aunque pill-selected ya vive en la
                    capa utilities de Tailwind (ver app/globals.css), un
                    empate ahí se resuelve por orden de aparición en la hoja
                    compilada, no por el orden de las clases aquí — más
                    seguro no dejar que compitan. transition-colors anima el
                    fondo/tinta/borde de la píldora al cambiar de pestaña. */}
                <span
                  className={cn(
                    'flex items-center justify-center rounded-pill border px-4 py-0.5 transition-colors duration-(--dur-1) ease-(--ease-out)',
                    active ? 'pill-selected' : 'border-transparent',
                  )}
                >
                  {/* icon-pop solo se aplica en la pestaña que ACABA de
                      activarse: se calcula del mismo `active` que ya decide
                      el trazo grueso, así que solo dispara una vez por
                      cambio de pestaña (cambia de "sin clase" a "con clase"),
                      nunca en cada refresco de la página. */}
                  <Icon size={24} strokeWidth={active ? 2.2 : 1.85} {...(active ? { className: 'icon-pop' } : {})} />
                </span>
                <span>{t(`nav.${labelKey}`)}</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
