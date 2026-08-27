import { buildOpenApiDocument } from '@/lib/openapi/document'

// Público a propósito: un documento OpenAPI describe la forma de la API, no
// sus datos. Sin él, conectar un cliente exigiría leer el código.
export const runtime = 'nodejs'

export function GET(): Response {
  return Response.json(buildOpenApiDocument(), { headers: { 'Cache-Control': 'public, max-age=3600' } })
}
