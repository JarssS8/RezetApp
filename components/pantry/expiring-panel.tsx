import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { WarnPanel } from '@/components/ui/warn-panel'
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
    <div className="mt-4">
      <WarnPanel
        title={t('expiringTitle')}
        footer={
          <Link href={`/recipes?hasIngredients=${foodIds.join(',')}&sort=most_cooked`} className="inline-block text-sm font-medium text-acc-ink underline">
            {t('whatToCook')}
          </Link>
        }
      >
        <ul className="flex flex-col gap-1">
          {items.map((item) => (
            <li key={item.id} className="text-sm text-text-2">
              {item.name}
            </li>
          ))}
        </ul>
      </WarnPanel>
    </div>
  )
}
