import 'server-only'
import { ApiAuthError } from '@/lib/auth/api-tokens'
import type { Ctx } from '@/lib/auth/ctx'
import { readJson } from '@/lib/auth/http'
import { ServiceError } from '@/lib/services/ctx'
import { API_SCOPES } from '@/lib/validation/tokens'

// Duplicado deliberado del tipo de db/schema/tokens.ts::ApiScope: las
// fronteras prohíben que app vea db directamente, salvo esta excepción que ya
// se retiró (ver política 'api-lib' en eslint.config.mjs). lib/validation es
// el duplicado con el que sí se puede tratar desde app, y su sincronía con
// db/schema/tokens.ts la vigila tests/contracts/api-scopes.test.ts.
type ApiScope = (typeof API_SCOPES)[number]

// Forma de error de §11: { error: { code, message, details? } }. Un único sitio
// para que las 17 rutas no la escriban cada una a su manera.
export function apiError(code: string, message: string, status: number, details?: unknown): Response {
  return Response.json({ error: details === undefined ? { code, message } : { code, message, details } }, { status })
}

const SERVICE_STATUS: Record<ServiceError['code'], number> = { not_found: 404, forbidden: 403, conflict: 409, validation: 400 }

// Traduce cualquier error de servicio o de autenticación a respuesta HTTP. Un
// error desconocido se relanza a propósito: que Next lo registre como 500 en
// vez de esconderlo tras un código inventado.
export function apiFailure(e: unknown): Response {
  if (e instanceof ServiceError) return apiError(e.code, e.message, SERVICE_STATUS[e.code])
  if (e instanceof ApiAuthError) return apiError(e.status === 401 ? 'unauthorized' : 'forbidden', e.message, e.status)
  throw e
}

// requireApiToken exige TODOS los scopes de la lista. Algunos recursos son
// transversales -foods/search lo necesitan tanto quien escribe recetas como
// quien llena la despensa- y API_SCOPES (congelado en W1) no tiene un scope
// propio para ellos: basta con tener UNO de los indicados.
export function requireAnyScope(ctx: Ctx, scopes: ApiScope[]): void {
  if (scopes.some((s) => ctx.scopes.includes(s))) return
  // Una sesión de navegador no tiene scopes: manda el rol, y ya pasó por requireApiToken.
  if (ctx.apiTokenId === null) return
  throw new ApiAuthError(403, `Faltan permisos: uno de ${scopes.join(', ')}`)
}

// Cuerpo JSON validado con un esquema zod. readJson ya devuelve null ante un
// body no-JSON o vacío en lugar de dejar que request.json() lance: aquí solo
// queda validar contra el esquema.
export async function parseBody<T>(
  request: Request,
  schema: { safeParse: (v: unknown) => { success: true; data: T } | { success: false; error: { issues: { message: string }[] } } },
): Promise<{ ok: true; data: T } | { ok: false; response: Response }> {
  const parsed = schema.safeParse(await readJson(request))
  if (!parsed.success) return { ok: false, response: apiError('validation', parsed.error.issues[0]?.message ?? 'Datos inválidos', 400) }
  return { ok: true, data: parsed.data }
}
