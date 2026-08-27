import { readdir } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { API_PATHS, buildOpenApiDocument } from '@/lib/openapi/document'

// Recorre app/api/v1 y devuelve la ruta pública de cada route.ts, con los
// segmentos dinámicos en la notación de OpenAPI ([id] -> {id}) y saltándose
// las carpetas privadas de Next (las que empiezan por "_").
async function routeFiles(dir: string, prefix = '/api/v1'): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  const out: string[] = []
  for (const entry of entries) {
    if (entry.name.startsWith('_')) continue
    if (entry.isDirectory()) {
      const segment = entry.name.startsWith('[') ? `{${entry.name.slice(1, -1)}}` : entry.name
      out.push(...(await routeFiles(path.join(dir, entry.name), `${prefix}/${segment}`)))
    } else if (entry.name === 'route.ts') {
      out.push(prefix)
    }
  }
  return out
}

// Excepción única y explícita (ruling del coordinador): /api/v1/cooking/log
// está documentada por adelantado (ver el comentario junto a su entrada en
// API_PATHS) pero su fichero llega con T17b, cuando se una la pista de
// cocina. Se cuenta como documentada, pero no se exige en disco todavía; el
// segundo test de abajo obliga a T17b a borrar esta entrada en cuanto el
// fichero exista, así el hueco no puede quedar olvidado.
const PENDING_ROUTES = new Set(['/api/v1/cooking/log'])

describe('superficie de la API', () => {
  it('cada route.ts de app/api/v1 está documentado, y cada ruta documentada existe', async () => {
    const onDisk = (await routeFiles(path.join(process.cwd(), 'app/api/v1'))).sort()
    const documented = [...API_PATHS].sort()
    const expectedOnDisk = documented.filter((route) => !PENDING_ROUTES.has(route))
    expect(onDisk).toEqual(expectedOnDisk)
  })

  it('las rutas pendientes siguen sin existir en disco (si aparecen, T17b debe quitarlas de PENDING_ROUTES)', async () => {
    const onDisk = new Set(await routeFiles(path.join(process.cwd(), 'app/api/v1')))
    for (const route of PENDING_ROUTES) {
      expect(onDisk.has(route), `${route} ya existe: borra la entrada de PENDING_ROUTES en tests/contracts/api-surface.test.ts`).toBe(false)
    }
  })

  it('toda operación documentada declara al menos un scope', () => {
    const doc = buildOpenApiDocument()
    for (const [route, item] of Object.entries(doc.paths ?? {})) {
      for (const [method, op] of Object.entries(item as Record<string, { security?: unknown[] }>)) {
        expect(op.security, `${method.toUpperCase()} ${route} sin security`).toBeDefined()
      }
    }
  })
})
