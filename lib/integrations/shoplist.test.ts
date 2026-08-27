// Tests del cliente de la Edge Function de ShopList: sin red real, fetchImpl inyectado.
import { describe, expect, it, vi } from 'vitest'
import type { ShoppingLine } from '@/lib/domain/types'
import { ShopListError, pushToShopList, shopListDeepLink } from './shoplist'

const cfg = { fnUrl: 'https://edge.example/functions/v1', secret: 'topsecret', listToken: 'lst_abc123' }

const line = (over: Partial<ShoppingLine>): ShoppingLine => ({
  foodId: 'f',
  name: 'Alimento',
  quantity: 1,
  unit: 'ud',
  unresolved: false,
  pantryUnmatched: false,
  ...over,
})

function fakeFetch(body: unknown, status = 200): typeof fetch {
  return (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch
}

describe('pushToShopList', () => {
  it('divide en lotes de 100 y suma inserted', async () => {
    const lines = Array.from({ length: 250 }, (_, i) => line({ foodId: `f${i}`, name: `Alimento ${i}` }))
    const fetchImpl = vi.fn<typeof fetch>(async (_url, init) => {
      const body = JSON.parse(String(init?.body)) as { items: unknown[] }
      return new Response(JSON.stringify({ inserted: body.items.length }), { status: 200 })
    })
    const result = await pushToShopList(cfg, lines, fetchImpl)
    expect(fetchImpl).toHaveBeenCalledTimes(3)
    expect(result).toEqual({ inserted: 250, batches: 3 })
  })

  it('envía cabeceras y body correctos', async () => {
    const fetchImpl = vi.fn<typeof fetch>(fakeFetch({ inserted: 1 }))
    await pushToShopList(cfg, [line({ name: 'Huevos', quantity: 6, unit: 'ud' })], fetchImpl)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const call = fetchImpl.mock.calls[0]
    if (!call) throw new Error('fetchImpl no fue llamado')
    const [url, init] = call
    expect(String(url)).toBe('https://edge.example/functions/v1/import-items')
    expect(init?.method).toBe('POST')
    expect(new Headers(init?.headers).get('content-type')).toBe('application/json')
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer topsecret')
    expect(init?.signal).toBeInstanceOf(AbortSignal)
    const body = JSON.parse(String(init?.body)) as unknown
    expect(body).toEqual({
      source: 'RezetApp',
      listToken: 'lst_abc123',
      items: [{ name: 'Huevos', quantity: 6 }],
    })
  })

  it('un error HTTP lanza ShopListError con status y body', async () => {
    const fetchImpl: typeof fetch = async () => new Response('no autorizado', { status: 401 })
    await expect(pushToShopList(cfg, [line({})], fetchImpl)).rejects.toBeInstanceOf(ShopListError)
    try {
      await pushToShopList(cfg, [line({})], fetchImpl)
      throw new Error('no debería llegar aquí')
    } catch (err) {
      expect(err).toBeInstanceOf(ShopListError)
      expect((err as ShopListError).status).toBe(401)
      expect((err as ShopListError).body).toBe('no autorizado')
    }
  })

  it('sin líneas no llama a fetch', async () => {
    const fetchImpl = vi.fn<typeof fetch>(fakeFetch({ inserted: 0 }))
    const result = await pushToShopList(cfg, [], fetchImpl)
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(result).toEqual({ inserted: 0, batches: 0 })
  })

  it('integra toShopListItem: piezas en quantity, masa en el nombre', async () => {
    const fetchImpl = vi.fn<typeof fetch>(fakeFetch({ inserted: 2 }))
    await pushToShopList(
      cfg,
      [line({ name: 'Huevos', quantity: 5.2, unit: 'ud' }), line({ name: 'Lentejas pardinas', quantity: 300, unit: 'g' })],
      fetchImpl,
    )
    const call = fetchImpl.mock.calls[0]
    if (!call) throw new Error('fetchImpl no fue llamado')
    const body = JSON.parse(String(call[1]?.body)) as { items: unknown[] }
    expect(body.items).toEqual([
      { name: 'Huevos', quantity: 6 },
      { name: 'Lentejas pardinas · 300 g', quantity: null },
    ])
  })
})

describe('shopListDeepLink', () => {
  it('genera el enlace de compartir de ShopList', () => {
    expect(shopListDeepLink('lst_abc123')).toBe('https://shop.jarsss8.es/#/s/lst_abc123')
  })
})
