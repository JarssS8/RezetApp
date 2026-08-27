import { describe, expect, it } from 'vitest'
import type { Db } from '@/db/types'
import type { McpCtx } from './auth'
import { guarded, hasScope, isFull, toolError, toolJson } from './guards'

const ctx = (scopes: string[], mcpProfile: 'basic' | 'full' = 'basic'): McpCtx => ({ db: {} as unknown as Db, householdId: 'h', userId: null, apiTokenId: 't', role: null, locale: 'es', scopes, mcpProfile })

describe('guards del MCP', () => {
  it('hasScope exige todos los scopes indicados', () => {
    expect(hasScope(ctx(['plan:read', 'plan:write']), 'plan:read', 'plan:write')).toBe(true)
    expect(hasScope(ctx(['plan:read']), 'plan:read', 'plan:write')).toBe(false)
  })
  it('isFull distingue el perfil', () => {
    expect(isFull(ctx([], 'full'))).toBe(true)
    expect(isFull(ctx([]))).toBe(false)
  })
  it('guarded convierte cualquier excepción en un error de herramienta sin filtrar el mensaje real', async () => {
    const run = guarded('No se pudo hacer.', async () => {
      throw new Error('detalle interno con el id del hogar')
    })
    const result = await run({})
    expect(result).toEqual({ isError: true, content: [{ type: 'text', text: 'No se pudo hacer.' }] })
  })
  it('guarded serializa el resultado como texto JSON', async () => {
    const run = guarded('nope', async () => ({ a: 1 }))
    expect(await run({})).toEqual({ content: [{ type: 'text', text: '{"a":1}' }] })
  })
  it('toolJson y toolError tienen la forma del SDK', () => {
    expect(toolJson({ a: 1 }).content[0]?.type).toBe('text')
    expect(toolError('x').isError).toBe(true)
  })
})
