import { render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { HouseholdEvent } from './bus'
import { useHouseholdEvents } from './use-household-events'

// EventSource falso: jsdom no lo trae. Cuenta cuántas conexiones se abren para
// comprobar que un array de tipos en línea (nuevo en cada render) no reconecta.
class FakeEventSource {
  static instances: FakeEventSource[] = []
  listeners = new Map<string, EventListener>()
  closed = false
  onerror: (() => void) | null = null
  constructor(public url: string) {
    FakeEventSource.instances.push(this)
  }
  addEventListener(type: string, fn: EventListener): void {
    this.listeners.set(type, fn)
  }
  close(): void {
    this.closed = true
  }
  emit(type: HouseholdEvent['type'], data: string): void {
    this.listeners.get(type)?.(new MessageEvent(type, { data }) as Event)
  }
}

function Probe({ handler, onError }: { handler: (e: HouseholdEvent) => void; onError?: () => void }) {
  useHouseholdEvents(handler, ['plan.changed'], onError)
  return null
}

beforeEach(() => {
  FakeEventSource.instances = []
  vi.stubGlobal('EventSource', FakeEventSource)
})
afterEach(() => vi.unstubAllGlobals())

describe('useHouseholdEvents', () => {
  it('no reconecta al re-renderizar con un array de tipos en línea', () => {
    const handler = vi.fn()
    const nuevo = vi.fn()
    const { rerender } = render(<Probe handler={handler} />)
    rerender(<Probe handler={handler} />)
    rerender(<Probe handler={nuevo} />)
    expect(FakeEventSource.instances).toHaveLength(1)
    FakeEventSource.instances[0]?.emit('plan.changed', JSON.stringify({ type: 'plan.changed', payload: { dates: [] } }))
    // El handler más reciente recibe el evento sin haber reabierto la conexión
    expect(nuevo).toHaveBeenCalledTimes(1)
    expect(handler).not.toHaveBeenCalled()
  })
  it('cierra la conexión al desmontar', () => {
    const { unmount } = render(<Probe handler={vi.fn()} />)
    unmount()
    expect(FakeEventSource.instances[0]?.closed).toBe(true)
  })
  it('un error avisa a onError y no cierra la conexión (EventSource reconecta solo)', () => {
    const onError = vi.fn()
    render(<Probe handler={vi.fn()} onError={onError} />)
    const es = FakeEventSource.instances[0]
    es?.onerror?.()
    expect(onError).toHaveBeenCalledTimes(1)
    expect(es?.closed).toBe(false)
  })
  it('datos malformados no rompen el handler', () => {
    const handler = vi.fn()
    render(<Probe handler={handler} />)
    FakeEventSource.instances[0]?.emit('plan.changed', 'no-json')
    expect(handler).not.toHaveBeenCalled()
  })
})
