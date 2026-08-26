// Tests del cliente de Open Food Facts: sin red real, fetchImpl inyectado.
import { describe, expect, it, vi } from 'vitest'
import { OffError, fetchOffProduct, offToFoodInput } from './open-food-facts'

const sample = {
  status: 1,
  product: {
    code: '8410000810004',
    product_name: 'Galletas María',
    product_name_es: 'Galletas María',
    product_name_en: 'Maria biscuits',
    nutriments: { 'energy-kcal_100g': 436, proteins_100g: 7.5, carbohydrates_100g: 74, fat_100g: 12, fiber_100g: 2.5 },
    allergens_tags: ['en:gluten', 'en:milk'],
    quantity: '800 g',
  },
}

function fakeFetch(body: unknown, status = 200): typeof fetch {
  return (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch
}

describe('open-food-facts', () => {
  it('devuelve el producto y lo convierte a FoodInput', async () => {
    const p = await fetchOffProduct('8410000810004', fakeFetch(sample))
    expect(p?.code).toBe('8410000810004')
    const input = offToFoodInput(p!)
    expect(input).toMatchObject({
      nameEs: 'Galletas María',
      nameEn: 'Maria biscuits',
      kcal100g: 436,
      protein100g: 7.5,
      carbs100g: 74,
      fat100g: 12,
      fiber100g: 2.5,
      barcode: '8410000810004',
    })
    expect(input.allergens).toEqual(['gluten', 'lactose'])
  })

  it('devuelve null si OFF no conoce el código o falla', async () => {
    expect(await fetchOffProduct('0000', fakeFetch({ status: 0 }))).toBeNull()
    expect(await fetchOffProduct('0000', fakeFetch({}, 500))).toBeNull()
  })

  it('devuelve null cuando la respuesta HTTP es 404', async () => {
    expect(await fetchOffProduct('0000', fakeFetch({}, 404))).toBeNull()
  })

  it('sin nombre en inglés usa el genérico; sin kcal deja null', async () => {
    const p = await fetchOffProduct('1', fakeFetch({ status: 1, product: { code: '1', product_name: 'Cosa', nutriments: {} } }))
    const input = offToFoodInput(p!)
    expect(input.nameEn).toBe('Cosa')
    expect(input.kcal100g).toBeNull()
  })

  it('sin ningún nombre de producto devuelve null', async () => {
    const p = await fetchOffProduct('2', fakeFetch({ status: 1, product: { code: '2', nutriments: {} } }))
    expect(p).toBeNull()
  })

  it('el nombre genérico prefiere product_name_es sobre product_name', async () => {
    const p = await fetchOffProduct(
      '3',
      fakeFetch({ status: 1, product: { code: '3', product_name: 'Generic name', product_name_es: 'Nombre en español', nutriments: {} } }),
    )
    // nameEs y nameEn quedan null (sin campos propios); offToFoodInput cae al
    // nombre genérico, que debe ser el español, no el "product_name" plano.
    const input = offToFoodInput(p!)
    expect(input.nameEs).toBe('Nombre en español')
    expect(input.nameEn).toBe('Nombre en español')
  })

  it('mapea serving_quantity a gramos por unidad cuando la unidad es g', async () => {
    const p = await fetchOffProduct(
      '4',
      fakeFetch({
        status: 1,
        product: { code: '4', product_name: 'Yogur', nutriments: {}, serving_quantity: 125, serving_quantity_unit: 'g' },
      }),
    )
    expect(p?.gramsPerUnit).toBe(125)
    expect(offToFoodInput(p!).gramsPerUnit).toBe(125)
  })

  it('no mapea serving_quantity cuando la unidad no es g', async () => {
    const p = await fetchOffProduct(
      '5',
      fakeFetch({
        status: 1,
        product: { code: '5', product_name: 'Zumo', nutriments: {}, serving_quantity: 200, serving_quantity_unit: 'ml' },
      }),
    )
    expect(p?.gramsPerUnit).toBeNull()
  })

  it('vuelca la marca como alias', async () => {
    const p = await fetchOffProduct(
      '6',
      fakeFetch({ status: 1, product: { code: '6', product_name: 'Cosa', nutriments: {}, brands: 'Hacendado,Mercadona' } }),
    )
    expect(offToFoodInput(p!).aliases).toEqual(['Hacendado', 'Mercadona'])
  })

  it('envía el User-Agent de OFF y usa la URL del código de barras', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ status: 0 }), { status: 200 }))
    await fetchOffProduct('8410000810004', fetchImpl)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const call = fetchImpl.mock.calls[0]
    if (!call) throw new Error('fetchImpl no fue llamado')
    const [url, init] = call
    expect(String(url)).toContain('8410000810004.json')
    expect(new Headers(init?.headers).get('user-agent')).toBe('RezetApp/0.1 (self-hosted recipe manager)')
    expect(init?.signal).toBeInstanceOf(AbortSignal)
  })

  it('lanza OffError con code "network" si el fetch falla', async () => {
    const failing: typeof fetch = async () => {
      throw new TypeError('fetch failed')
    }
    await expect(fetchOffProduct('0000', failing)).rejects.toMatchObject({ code: 'network' })
  })

  it('lanza OffError con code "invalid" si la respuesta no es JSON', async () => {
    const badJson: typeof fetch = async () => new Response('no es json', { status: 200 })
    await expect(fetchOffProduct('0000', badJson)).rejects.toBeInstanceOf(OffError)
  })
})
