import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'

export const runtime = 'nodejs'

// Lista blanca explícita: sin ella, un parámetro con ".." serviría cualquier
// fichero del contenedor. Son los únicos tres que necesita la página.
const ASSETS: Record<string, string> = {
  'swagger-ui.css': 'text/css; charset=utf-8',
  'swagger-ui-bundle.js': 'text/javascript; charset=utf-8',
  'swagger-ui-standalone-preset.js': 'text/javascript; charset=utf-8',
}

const require = createRequire(import.meta.url)

export async function GET(_request: Request, ctx: { params: Promise<{ file: string }> }): Promise<Response> {
  const { file } = await ctx.params
  const contentType = ASSETS[file]
  if (!contentType) return new Response('Not found', { status: 404 })
  try {
    // createRequire().resolve en vez de una ruta a node_modules: en la imagen
    // standalone el paquete no está donde process.cwd() cree que está.
    // `turbopackIgnore`: sin él, Turbopack intenta resolver la ruta en tiempo
    // de build y la sustituye por un id interno de su propio grafo de
    // módulos (nunca una ruta real de fichero), así que `require.resolve`
    // devolvería un número, no una cadena. Con el comentario, deja la llamada
    // intacta para que la resuelva Node en tiempo de ejecución.
    const buf = await readFile(require.resolve(/* turbopackIgnore: true */ `swagger-ui-dist/${file}`))
    return new Response(new Uint8Array(buf), { headers: { 'content-type': contentType, 'cache-control': 'public, max-age=86400' } })
  } catch {
    return new Response('Not found', { status: 404 })
  }
}
