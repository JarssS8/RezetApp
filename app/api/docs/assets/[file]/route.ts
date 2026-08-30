import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'

// Lista blanca explícita: sin ella, un parámetro con ".." serviría cualquier
// fichero del contenedor. Son los únicos tres que necesita la página.
const ASSETS = {
  'swagger-ui.css': 'text/css; charset=utf-8',
  'swagger-ui-bundle.js': 'text/javascript; charset=utf-8',
  'swagger-ui-standalone-preset.js': 'text/javascript; charset=utf-8',
} as const

type AssetFile = keyof typeof ASSETS

// Object.hasOwn (no `in`, que también vería la cadena de prototipos) es lo
// que además estrecha el tipo de `file` a AssetFile para el resto de la
// función, sin recurrir a un cast.
function isAssetFile(file: string): file is AssetFile {
  return Object.hasOwn(ASSETS, file)
}

const require = createRequire(import.meta.url)

// Los tres ficheros no cambian entre peticiones: se leen del disco una sola
// vez por proceso y se sirven desde aquí el resto de peticiones.
const cache = new Map<AssetFile, Buffer>()

async function readAsset(file: AssetFile): Promise<Buffer> {
  const cached = cache.get(file)
  if (cached) return cached
  // createRequire().resolve en vez de una ruta a node_modules: en la imagen
  // standalone el paquete no está donde process.cwd() cree que está.
  // `turbopackIgnore`: sin él, Turbopack intenta resolver la ruta en tiempo
  // de build y la sustituye por un id interno de su propio grafo de
  // módulos (nunca una ruta real de fichero), así que `require.resolve`
  // devolvería un número, no una cadena. Con el comentario, deja la llamada
  // intacta para que la resuelva Node en tiempo de ejecución.
  const buf = await readFile(require.resolve(/* turbopackIgnore: true */ `swagger-ui-dist/${file}`))
  cache.set(file, buf)
  return buf
}

export async function GET(_request: Request, ctx: { params: Promise<{ file: string }> }): Promise<Response> {
  const { file } = await ctx.params
  if (!isAssetFile(file)) return new Response('Not found', { status: 404 })
  try {
    const buf = await readAsset(file)
    return new Response(new Uint8Array(buf), { headers: { 'Content-Type': ASSETS[file], 'Cache-Control': 'public, max-age=86400' } })
  } catch {
    return new Response('Not found', { status: 404 })
  }
}
