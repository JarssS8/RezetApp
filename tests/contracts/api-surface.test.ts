import { readFileSync } from 'node:fs'
import { readdir } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { API_PATHS, buildOpenApiDocument } from '@/lib/openapi/document'

// Importar dinámicamente los módulos de ruta arrastra lib/auth/guards.ts:
// "server-only" fuera de webpack lanza a propósito, y cookies()/headers() de
// next/headers exigen un contexto de petición real. Ninguna ruta se llega a
// invocar aquí (solo se leen sus exports), así que basta con que el import no
// reviente.
vi.mock('server-only', () => ({}))
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }), headers: async () => new Headers() }))

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as const
type HttpMethod = (typeof HTTP_METHODS)[number]

// Inversa de la conversión de routeFiles: '/api/v1/plan/entries/{id}' ->
// 'plan/entries/[id]', para reconstruir la ruta en disco de una entrada de
// API_PATHS.
function routeToFileSegments(route: string): string {
  return route
    .replace(/^\/api\/v1\//, '')
    .split('/')
    .map((seg) => (seg.startsWith('{') ? `[${seg.slice(1, -1)}]` : seg))
    .join('/')
}

type MethodScopes = { scopes: string[]; any: boolean }

// Extrae, para cada verbo exportado del fichero fuente de una ruta, los
// scopes que exige de verdad en tiempo de ejecución: el array pasado a
// requireApiToken (todos obligatorios) o, si el cuerpo además llama a
// requireAnyScope, los de esa lista (uno de ellos basta, como en
// foods/search). Comparar esto con el documento es lo que detecta que un
// scope cambió en el código sin que nadie tocara lib/openapi/document.ts.
function extractScopesByMethod(source: string): Map<HttpMethod, MethodScopes> {
  const result = new Map<HttpMethod, MethodScopes>()
  const starts = [...source.matchAll(/export async function (GET|POST|PUT|PATCH|DELETE)\s*\(/g)]
  const parseList = (raw: string): string[] =>
    raw
      .split(',')
      .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
      .filter(Boolean)
  for (let i = 0; i < starts.length; i++) {
    const m = starts[i]!
    const method = m[1] as HttpMethod
    const from = m.index! + m[0].length
    const to = starts[i + 1]?.index ?? source.length
    const block = source.slice(from, to)
    const tokenMatch = block.match(/requireApiToken\(request,\s*\[([^\]]*)\]\)/)
    const anyMatch = block.match(/requireAnyScope\(ctx,\s*\[([^\]]*)\]\)/)
    if (anyMatch) result.set(method, { scopes: parseList(anyMatch[1]!), any: true })
    else result.set(method, { scopes: tokenMatch ? parseList(tokenMatch[1]!) : [], any: false })
  }
  return result
}

// Misma forma que extractScopesByMethod, pero leyendo el `security` que
// createDocument generó a partir de sec(...)/secAny(...): un solo grupo con
// varios scopes es AND (sec), varios grupos de un scope cada uno es OR (secAny).
function docScopes(security: { bearerAuth?: string[] }[] | undefined): MethodScopes {
  const groups = security ?? []
  if (groups.length > 1) return { scopes: groups.flatMap((g) => g.bearerAuth ?? []), any: true }
  return { scopes: groups[0]?.bearerAuth ?? [], any: false }
}

function normalize(x: MethodScopes): MethodScopes {
  return { scopes: [...x.scopes].sort(), any: x.any }
}

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

// Mecanismo para rutas documentadas por adelantado cuyo fichero aún no ha
// llegado (ver /api/v1/cooking/log en tareas anteriores, ya resuelta en
// T17b): se cuentan como documentadas sin exigirse en disco todavía, y el
// segundo test de abajo impide que la excepción quede olvidada una vez el
// fichero existe. Vacío mientras no haya ninguna ruta pendiente.
const PENDING_ROUTES = new Set<string>([])

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

  it('cada ruta exporta exactamente los verbos que declara el documento', async () => {
    const doc = buildOpenApiDocument()
    for (const route of API_PATHS) {
      if (PENDING_ROUTES.has(route)) continue
      const mod: Record<string, unknown> = await import(/* @vite-ignore */ `@/app/api/v1/${routeToFileSegments(route)}/route`)
      const exported = Object.keys(mod).filter((k) => (HTTP_METHODS as readonly string[]).includes(k)).sort()
      const documented = Object.keys(doc.paths?.[route] ?? {}).map((m) => m.toUpperCase()).sort()
      expect(exported, `verbos de ${route}`).toEqual(documented)
    }
  })

  it('los scopes exigidos en el código coinciden con los del documento, ruta a ruta', () => {
    const doc = buildOpenApiDocument()
    for (const route of API_PATHS) {
      if (PENDING_ROUTES.has(route)) continue
      const file = path.join(process.cwd(), 'app/api/v1', routeToFileSegments(route), 'route.ts')
      const source = readFileSync(file, 'utf-8')
      const fromCode = extractScopesByMethod(source)
      const item = doc.paths?.[route] as Record<string, { security?: { bearerAuth?: string[] }[] }> | undefined
      for (const [method, scopes] of fromCode) {
        const op = item?.[method.toLowerCase()]
        expect(op, `${method} ${route} no está documentada`).toBeDefined()
        expect(normalize(docScopes(op?.security)), `${method} ${route}`).toEqual(normalize(scopes))
      }
    }
  })
})
