import { expect, test } from '@playwright/test'
import { registerHousehold, uniqueName } from './helpers/session'

// El registro crea un hogar nuevo por cada usuario (a diferencia del flujo de
// invitación de e2e/auth.spec.ts, donde el segundo entra en el hogar del
// primero): dos registros son dos hogares, que es lo que aquí hace falta.
test.describe('caché por hogar', () => {
  test('la caché de un hogar no se ve desde otro', async ({ browser }) => {
    const a = await browser.newPage()
    await registerHousehold(a, 'Ana')
    const title = uniqueName('Lentejas')
    // Se crea por la REST a propósito: así este test cubre además el camino de
    // escritura que no pasa por ninguna acción de servidor.
    const created = await a.request.post('/api/v1/recipes', {
      data: { title, servingsBase: 2, ingredients: [], steps: [] },
    })
    expect(created.ok()).toBeTruthy()

    // A calienta la caché de /recipes con su receta dentro.
    await a.goto('/recipes')
    await expect(a.getByText(title)).toBeVisible()

    // B entra después, a la misma URL, con la entrada de A ya caliente.
    const b = await browser.newPage()
    await registerHousehold(b, 'Bo')
    await b.goto('/recipes')
    // Ancla positiva antes de afirmar ausencia: sin esto, un fallo de carga
    // (pantalla en blanco) también dejaría la receta de A en cero repeticiones
    // y el test pasaría en falso.
    await expect(b.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(b.getByText(title)).toHaveCount(0)

    // Y al revés: que B haya pedido la pantalla no le ha quitado la suya a A.
    await a.reload()
    await expect(a.getByText(title)).toBeVisible()
  })

  test('una escritura por REST invalida la pantalla en el acto', async ({ page }) => {
    await registerHousehold(page, 'Cami')
    // Primera visita: la lista queda cacheada, vacía.
    await page.goto('/recipes')
    const title = uniqueName('Sopa')
    // Ancla positiva antes de afirmar ausencia: mismo motivo que en el test
    // anterior (una carga fallida no debe leerse como "receta no cacheada").
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page.getByText(title)).toHaveCount(0)

    // Escritura por la REST -el mismo camino que usa el MCP-: si la
    // invalidación viviera en lib/actions en vez de en lib/services, la
    // recarga siguiente serviría la lista vieja durante toda la vida de la
    // entrada, y este test sería rojo.
    const created = await page.request.post('/api/v1/recipes', {
      data: { title, servingsBase: 2, ingredients: [], steps: [] },
    })
    expect(created.ok()).toBeTruthy()

    await page.reload()
    await expect(page.getByText(title)).toBeVisible()
  })

  test('la pantalla llega con ventana de cliente, como con staleTimes', async ({ page }) => {
    // En desarrollo Next no hace prefetch y la caché de cliente no se comporta
    // como en producción (instant.md): esta comprobación solo tiene sentido
    // contra `next start`. Ver Ruling W10-R3 en el plan de W10.
    test.skip(!process.env.E2E_BASE_URL, 'Requiere un build de producción (E2E_BASE_URL)')
    await registerHousehold(page, 'Dani')
    await page.goto('/today')

    for (const path of ['/today', '/plan', '/recipes', '/pantry', '/cook']) {
      // x-nextjs-prerender dice que la respuesta salió de un armazón y no de
      // un renderizado entero en caliente: es el equivalente en tiempo de
      // ejecución de la `◐` del build. Sin armazón no hay nada que reutilizar
      // y el resto de la comprobación no significaría nada.
      const doc = await page.request.get(path)
      expect(doc.ok()).toBeTruthy()
      expect(doc.headers()['x-nextjs-prerender'], `${path}: la respuesta no viene de un armazón prerenderizado`).toBe('1')

      // El encabezado es el mecanismo, no un síntoma: el router del cliente lo
      // lee para saber cuánto puede reutilizar la respuesta sin volver a
      // pedirla. Lo lee justo en esta petición — la del App Shell por sesión
      // que dispara al pintar los enlaces de la barra inferior (RSC +
      // Next-Router-Prefetch: 3). Una petición RSC de navegación normal no lo
      // lleva nunca por diseño: ahí la ventana viaja dentro de la propia carga
      // útil (segment-cache/cache.ts, getStaleAtFromHeader solo mira el
      // encabezado en respuestas de prefetch).
      const shell = await page.request.get(path, { headers: { RSC: '1', 'Next-Router-Prefetch': '3' } })
      expect(shell.ok()).toBeTruthy()
      const staleTime = shell.headers()['x-nextjs-stale-time']
      expect(staleTime, `${path}: sin ventana de cliente, cambiar de pestaña volvería a pedir la pantalla entera`).toBeDefined()
      expect(Number(staleTime)).toBeGreaterThanOrEqual(30)
    }
  })

  test('el armazón compartido no lleva nada de ningún hogar', async ({ browser }) => {
    // El armazón de una ruta `◐` se genera en el build y se sirve igual a todo
    // el mundo: es el sitio donde una fuga sería peor: no una entrada de caché
    // que caduca, sino HTML en disco. Este canario lo mira desde fuera —
    // contexto limpio, sin cookies — sobre una pantalla que otro hogar acaba
    // de calentar.
    const a = await browser.newPage()
    const owner = await registerHousehold(a, 'Eva')
    const title = uniqueName('Fabada')
    const created = await a.request.post('/api/v1/recipes', {
      data: { title, servingsBase: 2, ingredients: [], steps: [] },
    })
    expect(created.ok()).toBeTruthy()
    await a.goto('/recipes')
    await expect(a.getByText(title)).toBeVisible()

    const anon = await browser.newContext()
    const res = await anon.request.get('/recipes')
    expect(res.ok()).toBeTruthy()
    const html = await res.text()
    expect(html, 'la receta de un hogar ha llegado al armazón compartido').not.toContain(title)
    // El nombre real, con su sufijo único: 'Eva' a secas también aparecería en
    // el armazón de una ejecución anterior y el canario cantaría en falso.
    expect(html, 'el nombre de quien la creó ha llegado al armazón compartido').not.toContain(owner)
    await anon.close()
  })
})
