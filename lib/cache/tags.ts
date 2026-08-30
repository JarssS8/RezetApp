import 'server-only'
import { revalidateTag } from 'next/cache'

// Cinco familias de datos, no una por tabla ni una por pantalla: una por
// "cosa que cambia junta". La tabla de escritura -> etiquetas vive en el plan
// de W10 y la fija tests/contracts/cache.test.ts.
export const CACHE_SCOPES = ['recipes', 'plan', 'pantry', 'foods', 'settings'] as const
export type CacheScope = (typeof CACHE_SCOPES)[number]

// `h:<uuid>:<ámbito>`: 47 caracteres como mucho, muy por debajo del límite de
// 256 de cacheTag/revalidateTag. El identificador del hogar viaja en texto
// plano a propósito -las claves y las etiquetas de la caché se guardan sin
// cifrar-, así que aquí solo entran identificadores estables: nunca un nombre,
// un correo ni un token.
export function householdTag(householdId: string, scope: CacheScope): string {
  return `h:${householdId}:${scope}`
}

// Invariante E263 de Next: revalidate() exige un "work store", que solo existe
// dentro de una petición. Los servicios de escritura también se llaman desde
// vitest y desde scripts/import-*.ts, donde no hay petición -ni caché que
// invalidar-. Se reconoce por el código de error, con el mensaje como reserva.
function isMissingWorkStore(e: unknown): boolean {
  if (!(e instanceof Error)) return false
  const code = (e as { __NEXT_ERROR_CODE?: unknown }).__NEXT_ERROR_CODE
  return code === 'E263' || e.message.includes('static generation store missing')
}

// Caduca ya, sin servir nada rancio. `{ expire: 0 }` es el equivalente exacto
// de updateTag(), que no se puede usar aquí porque lanza en Route Handlers y
// por tanto en la REST y en el MCP; los dos caminos acaban en el mismo
// `pathWasRevalidated = ActionDidRevalidateStaticAndDynamic` (comprobado en
// node_modules/next/dist/server/web/spec-extension/revalidate.js).
//
// Único sitio del repositorio que llama a revalidateTag: todo lo demás llama
// aquí. Se invoca desde lib/services/**, pegado a emitHouseholdEvent, para
// que las tres puertas de escritura -interfaz, REST y MCP- la hereden.
export function invalidateHousehold(householdId: string, scopes: readonly CacheScope[]): void {
  for (const scope of scopes) {
    try {
      revalidateTag(householdTag(householdId, scope), { expire: 0 })
    } catch (e) {
      // Solo el invariante de "no hay petición". Un error de "usado durante el
      // render" (E7) o "dentro de un use cache" (E181) son fallos de verdad y
      // tienen que sonar.
      if (!isMissingWorkStore(e)) throw e
    }
  }
}
