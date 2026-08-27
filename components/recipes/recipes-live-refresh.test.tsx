import { render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RecipesLiveRefresh } from './recipes-live-refresh'

const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))

// Item 31: /recipes se refresca cuando otro dispositivo del hogar cambia una
// receta, igual que ya hace la despensa (pantry-list.tsx).
describe('RecipesLiveRefresh', () => {
  let listeners: Record<string, (ev: MessageEvent<string>) => void>

  beforeEach(() => {
    listeners = {}
    class FakeEventSource {
      addEventListener(type: string, cb: EventListener) {
        listeners[type] = cb as (ev: MessageEvent<string>) => void
      }
      close() {}
    }
    vi.stubGlobal('EventSource', FakeEventSource as unknown as typeof EventSource)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('se suscribe solo a recipe.changed y refresca el router al recibirlo', () => {
    render(<RecipesLiveRefresh />)

    expect(Object.keys(listeners)).toEqual(['recipe.changed'])
    listeners['recipe.changed']?.({ data: JSON.stringify({ type: 'recipe.changed' }) } as MessageEvent<string>)

    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('no pinta nada', () => {
    const { container } = render(<RecipesLiveRefresh />)
    expect(container).toBeEmptyDOMElement()
  })
})
