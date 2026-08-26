import { useLocale, useTranslations } from 'next-intl'
import { formatQuantity } from '@/lib/domain'
import type { Locale, ShoppingLine } from '@/lib/domain'
import { cn } from '@/lib/utils'

export interface ShoppingSummaryProps {
  lines: ShoppingLine[]
}

interface Groups {
  resolved: ShoppingLine[]
  unresolved: ShoppingLine[]
  noQuantity: ShoppingLine[]
}

// Un alimento sin cantidad ("al gusto") pesa más que "sin identificar": una
// línea sin food_id pero también sin cantidad va al grupo "sin cantidad", no
// al ámbar (no hay nada que resolver comprando, solo un aviso informativo).
function groupLines(lines: ShoppingLine[]): Groups {
  const groups: Groups = { resolved: [], unresolved: [], noQuantity: [] }
  for (const line of lines) {
    if (line.quantity === null || line.unit === null) groups.noQuantity.push(line)
    else if (line.unresolved) groups.unresolved.push(line)
    else groups.resolved.push(line)
  }
  return groups
}

function lineKey(line: ShoppingLine): string {
  return `${line.foodId ?? line.name}|${line.unit ?? '-'}`
}

interface ShoppingGroupProps {
  title: string
  lines: ShoppingLine[]
  locale: Locale
  amber?: boolean
  showQuantity?: boolean
}

function ShoppingGroup({ title, lines, locale, amber, showQuantity = true }: ShoppingGroupProps) {
  const t = useTranslations('plan')
  if (lines.length === 0) return null
  return (
    <div className="flex flex-col gap-1.5">
      <h2 className={cn('text-sm font-medium', amber && 'text-warn')}>{title}</h2>
      <ul className="flex flex-col gap-1">
        {lines.map((line) => (
          <li
            key={lineKey(line)}
            className={cn(
              'flex items-center justify-between gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm',
              amber && 'border-warn/40 text-warn',
            )}
          >
            <span className="truncate">{line.name}</span>
            <span className="flex shrink-0 items-center gap-2">
              {line.pantryUnmatched ? <span className="text-xs text-warn">{t('shopping.pantryUnmatched')}</span> : null}
              {showQuantity ? <span className="tabular-nums text-text-2">{formatQuantity(line.quantity, line.unit, locale)}</span> : null}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// Resumen de compra: agrupa las líneas ya consolidadas (lib/domain/shopping.ts)
// en resueltas, sin alimento identificado (ámbar, --warn) y sin cantidad
// definida. Sin botón "Enviar a ShopList": lo añade la pista (f).
export function ShoppingSummary({ lines }: ShoppingSummaryProps) {
  const t = useTranslations('plan')
  const locale = useLocale() as Locale
  const { resolved, unresolved, noQuantity } = groupLines(lines)

  if (lines.length === 0) return <p className="text-sm text-text-2">{t('shopping.empty')}</p>

  return (
    <div className="flex flex-col gap-4">
      <ShoppingGroup title={t('shopping.resolved')} lines={resolved} locale={locale} />
      <ShoppingGroup title={t('shopping.unresolved')} lines={unresolved} locale={locale} amber />
      <ShoppingGroup title={t('shopping.noQuantity')} lines={noQuantity} locale={locale} showQuantity={false} />
    </div>
  )
}
