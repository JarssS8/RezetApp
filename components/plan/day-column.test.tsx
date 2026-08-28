import { DndContext } from '@dnd-kit/core'
import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { describe, expect, it, vi } from 'vitest'
import plan from '@/messages/es/plan.json'
import { DayColumn } from './day-column'

// DayColumn importa EntryChip, que importa LeftoverDialog: sin este mock la
// cadena estática llega a lib/auth/guards.ts (server-only) aunque los huecos
// estén vacíos, porque el import ocurre al cargar el módulo, no al renderizar
// (mismo mock que entry-chip.test.tsx y week-view.test.tsx).
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('@/lib/actions/plan', () => ({ createLeftoverAction: vi.fn() }))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

const noop = vi.fn()
const empty = { breakfast: [], lunch: [], dinner: [], snack: [] }

function renderColumn(isToday: boolean) {
  return render(
    <NextIntlClientProvider locale="es" messages={{ plan }}>
      <DndContext>
        <DayColumn
          date="2026-08-28"
          isToday={isToday}
          kcal={null}
          defaultServings={2}
          days={['2026-08-28']}
          entriesBySlot={empty}
          onAdd={noop}
          onServingsChange={noop}
          onSkip={noop}
          onRemove={noop}
          onMove={noop}
        />
      </DndContext>
    </NextIntlClientProvider>,
  )
}

describe('DayColumn', () => {
  it('los huecos vacíos son superficie hundida, no punteado gris', () => {
    const { container } = renderColumn(false)
    expect(container.innerHTML).not.toContain('border-dashed')
    expect(container.innerHTML).toContain('bg-surface-sunken')
  })

  it('la cabecera de hoy es verde de acento, no un bloque de tinta', () => {
    renderColumn(true)
    const header = screen.getByTestId('today-column')
    expect(header.className).toContain('pill-selected')
    expect(header.className).not.toContain('bg-acc-ink')
    // e2e/loop.spec.ts:50 y e2e/today.spec.ts:14 navegan con xpath=..: la
    // cabecera tiene que seguir siendo hija directa de la columna.
    expect(header.parentElement?.className).toContain('flex-col')
  })

  it('la celda destino transita el resaltado en vez de encenderse de golpe', () => {
    const { container } = renderColumn(false)
    const cell = container.querySelector('[class*="min-h-"]')
    expect(cell?.className).toContain('transition-colors')
  })
})
