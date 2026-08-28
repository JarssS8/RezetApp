'use client'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useCallback, useState } from 'react'
import { CupboardIcon, FreezerIcon, FridgeIcon, PantryIcon } from '@/components/icons'
import { EmptyState } from '@/components/ui/empty-state'
import type { PantryRow as PantryItemRow } from '@/lib/actions/pantry'
import type { UnitSystem } from '@/lib/domain/types'
import { useHouseholdEvents } from '@/lib/events/use-household-events'
import { PantryRow } from './pantry-row'

const LOCATIONS = [
  { id: 'fridge', Icon: FridgeIcon },
  { id: 'freezer', Icon: FreezerIcon },
  { id: 'pantry', Icon: CupboardIcon },
] as const

export interface PantryListProps {
  items: PantryItemRow[]
  unitSystem: UnitSystem
}

// Agrupa por ubicación (nevera/congelador/armario) y se refresca solo con
// pantry.changed (spec §14): otro dispositivo del hogar añade o ajusta algo
// y esta lista lo recoge sin recargar la página entera.
export function PantryList({ items, unitSystem }: PantryListProps) {
  const t = useTranslations('pantry')
  const router = useRouter()
  const [removedIds, setRemovedIds] = useState<ReadonlySet<string>>(new Set())

  useHouseholdEvents(
    useCallback(() => router.refresh(), [router]),
    ['pantry.changed'],
  )

  const handleRemoved = useCallback((id: string) => {
    setRemovedIds((prev) => new Set(prev).add(id))
  }, [])

  const visible = items.filter((item) => !removedIds.has(item.id))
  // Índice global (no por ubicación) para la entrada escalonada del primer
  // pintado (W6.5, §2): recortado a 8 antes de llegar a PantryRow, igual que
  // la parrilla de recetas. Es un contador de renderizado, no estado de
  // React: no necesita sobrevivir a un re-render, solo numerar esta pasada.
  let staggerIndex = 0

  return (
    <div className="mt-4 flex flex-col gap-6">
      {visible.length === 0 ? (
        <EmptyState icon={PantryIcon} title={t('empty')} />
      ) : (
        LOCATIONS.map(({ id, Icon }) => {
          const group = visible.filter((item) => item.location === id)
          if (group.length === 0) return null
          return (
            <section key={id}>
              <h2 className="pill-selected mb-2 inline-flex items-center gap-2 rounded-pill px-3 py-1 text-sm font-semibold">
                <Icon size={18} strokeWidth={2.2} />
                {t(`locations.${id}`)}
              </h2>
              <ul className="flex flex-col gap-2">
                {group.map((item) => (
                  <PantryRow key={item.id} item={item} unitSystem={unitSystem} onRemoved={handleRemoved} staggerIndex={Math.min(staggerIndex++, 8)} />
                ))}
              </ul>
            </section>
          )
        })
      )}
    </div>
  )
}
