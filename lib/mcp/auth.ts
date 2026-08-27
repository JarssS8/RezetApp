import { db } from '@/db'
import { authenticateApiToken } from '@/lib/auth/api-tokens'
import type { Ctx } from '@/lib/auth/ctx'

// Contexto de una petición MCP autenticada: un token de API con perfil
// (básico/completo) además de los campos habituales de Ctx.
export type McpCtx = Ctx & { mcpProfile: 'basic' | 'full' }

// El MCP solo acepta Bearer rz_…, nunca la cookie de sesión (a diferencia de
// REST vía lib/auth/guards.ts::requireApiToken): un cliente MCP siempre trae
// su propio token. Los scopes se comprueban por herramienta al registrarla
// (Task 39), así que aquí no se exige ninguno.
export async function authenticateMcp(request: Request): Promise<McpCtx> {
  const authorization = request.headers.get('authorization') ?? undefined
  return authenticateApiToken(db, authorization, [])
}
