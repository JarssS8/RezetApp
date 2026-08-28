'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { CookIcon, PantryIcon, PlanIcon, RecipesIcon, TodayIcon } from '@/components/icons'
import { cn } from '@/lib/utils'

export const NAV_ITEMS = [
  { href: '/today', labelKey: 'today', Icon: TodayIcon },
  { href: '/cook', labelKey: 'cook', Icon: CookIcon },
  { href: '/plan', labelKey: 'plan', Icon: PlanIcon },
  { href: '/pantry', labelKey: 'pantry', Icon: PantryIcon },
  { href: '/recipes', labelKey: 'recipes', Icon: RecipesIcon },
] as const

export function BottomBar() {
  const t = useTranslations('common')
  const pathname = usePathname()
  return (
    <nav
      aria-label={t('navLabel')}
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line-2 bg-card/95 backdrop-blur pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="mx-auto grid max-w-xl grid-cols-5">
        {NAV_ITEMS.map(({ href, labelKey, Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`)
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs font-medium',
                  active ? 'text-acc-ink' : 'text-text-2',
                )}
              >
                {/* La píldora vive dentro del área táctil de 56 px: el objetivo
                    no se toca (AGENTS.md), solo se pinta lo que hay dentro. El
                    trazo del icono engorda a 2.2 en la pestaña activa: es la
                    segunda señal, además del fondo, y la que se lee de reojo. */}
                <span className={cn('flex items-center justify-center rounded-pill border border-transparent px-4 py-0.5', active && 'pill-selected')}>
                  <Icon size={24} strokeWidth={active ? 2.2 : 1.85} />
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
