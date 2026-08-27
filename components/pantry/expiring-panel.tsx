import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { WarningIcon } from '@/components/icons'
import type { PantryRow } from '@/lib/actions/pantry'

export interface ExpiringPanelProps {
  items: PantryRow[]
}

// Server Component: nada de interacción, solo lista lo que caduca pronto
// (expiringPantry, dominio puro por debajo) y enlaza a recetas filtradas por
// esos alimentos. La consolidación de qué se puede cocinar vive en la pista
// (c)/recetas, no aquí: este panel solo agrega los foodId a la URL.
export async function ExpiringPanel({ items }: ExpiringPanelProps) {
  if (items.length === 0) return null
  const t = await getTranslations('pantry')
  const foodIds = [...new Set(items.map((item) => item.foodId))]

  return (
    <section className="mt-4 rounded-lg border border-warn/40 bg-warn-soft p-3">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-warn">
        <WarningIcon size={18} />
        {t('expiringTitle')}
      </h2>
      <ul className="mt-2 flex flex-col gap-1">
        {items.map((item) => (
          <li key={item.id} className="text-sm text-text-2">
            {item.name}
          </li>
        ))}
      </ul>
      <Link href={`/recipes?hasIngredients=${foodIds.join(',')}&sort=most_cooked`} className="mt-3 inline-block text-sm font-medium text-acc-ink underline">
        {t('whatToCook')}
      </Link>
    </section>
  )
}
