import { describe, expect, it } from 'vitest'
import { API_SCOPES } from '@/lib/validation/tokens'
import { API_PATHS, buildOpenApiDocument } from './document'

describe('documento OpenAPI', () => {
  const doc = buildOpenApiDocument()

  it('es 3.1 y se identifica como la app', () => {
    expect(doc.openapi).toBe('3.1.0')
    expect(doc.info.title).toContain('RezetApp')
  })

  it('documenta los 17 recursos de §11', () => {
    for (const path of API_PATHS) expect(doc.paths?.[path]).toBeDefined()
    expect(API_PATHS).toContain('/api/v1/cooking/log')
    expect(API_PATHS).toContain('/api/v1/plan/proposals/{id}')
    expect(API_PATHS).toContain('/api/v1/foods/search')
  })

  it('declara el Bearer y los scopes de cada operación', () => {
    expect(doc.components?.securitySchemes?.bearerAuth).toMatchObject({ type: 'http', scheme: 'bearer' })
    const log = doc.paths?.['/api/v1/cooking/log']?.post
    expect(log?.security).toEqual([{ bearerAuth: ['cooking:write'] }])
  })

  it('convierte los esquemas zod, no cadenas escritas a mano', () => {
    const body = doc.paths?.['/api/v1/cooking/log']?.post?.requestBody
    const schema = (body as { content: Record<string, { schema: { properties?: Record<string, unknown> } }> }).content['application/json']?.schema
    expect(schema?.properties).toHaveProperty('servingsCooked')
  })

  it('los scopes que menciona existen en API_SCOPES', () => {
    const used = new Set<string>()
    for (const item of Object.values(doc.paths ?? {})) {
      for (const op of Object.values(item as Record<string, { security?: { bearerAuth?: string[] }[] }>)) {
        for (const s of op?.security ?? []) for (const scope of s.bearerAuth ?? []) used.add(scope)
      }
    }
    for (const scope of used) expect(API_SCOPES).toContain(scope)
  })
})
