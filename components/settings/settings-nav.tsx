'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'

export const SETTINGS_SECTIONS = [
  { slug: 'household', labelKey: 'household' },
  { slug: 'members', labelKey: 'members' },
  { slug: 'ai', labelKey: 'ai' },
  { slug: 'shoplist', labelKey: 'shoplist' },
  { slug: 'tokens', labelKey: 'tokens' },
  { slug: 'appearance', labelKey: 'appearance' },
  { slug: 'passkeys', labelKey: 'passkeys' },
  { slug: 'data', labelKey: 'data' },
  { slug: 'notifications', labelKey: 'notifications' },
] as const

export function SettingsNav() {
  const t = useTranslations('settings')
  const pathname = usePathname()
  return (
    <ul className="flex gap-2 overflow-x-auto py-2">
      {SETTINGS_SECTIONS.map(({ slug, labelKey }) => {
        const href = `/settings/${slug}`
        const active = pathname === href
        return (
          <li key={slug} className="shrink-0">
            <Link
              href={href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'inline-flex min-h-10 items-center rounded-pill border px-3.5 text-sm font-medium',
                active ? 'border-primary bg-accent text-accent-foreground' : 'border-border bg-card text-text-2',
              )}
            >
              {t(`sections.${labelKey}`)}
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
