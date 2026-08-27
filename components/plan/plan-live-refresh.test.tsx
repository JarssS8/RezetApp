import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PlanLiveRefresh } from './plan-live-refresh'

const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))
const useHouseholdEvents = vi.hoisted(() => vi.fn())
vi.mock('@/lib/events/use-household-events', () => ({ useHouseholdEvents }))

describe('PlanLiveRefresh', () => {
  it('se suscribe a los tipos indicados y refresca al recibirlos', () => {
    render(<PlanLiveRefresh types={['plan.changed', 'pantry.changed']} />)
    const [handler, types] = useHouseholdEvents.mock.calls[0] ?? []
    expect(types).toEqual(['plan.changed', 'pantry.changed'])
    ;(handler as () => void)()
    expect(refresh).toHaveBeenCalled()
  })
  it('por defecto escucha solo los cambios de plan', () => {
    render(<PlanLiveRefresh />)
    const [, types] = useHouseholdEvents.mock.calls.at(-1) ?? []
    expect(types).toEqual(['plan.changed'])
  })
})
