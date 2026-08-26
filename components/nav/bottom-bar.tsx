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
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 backdrop-blur pb-[env(safe-area-inset-bottom)]"
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
                  'flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium',
                  active ? 'text-primary' : 'text-text-2',
                )}
              >
                <Icon size={24} />
                <span>{t(`nav.${labelKey}`)}</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
