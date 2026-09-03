import { eq } from 'drizzle-orm'
import type { z } from 'zod'
import * as schema from '@/db/schema'
import type { User } from '@/db/schema'
import { invalidateHousehold } from '@/lib/cache/tags'
import type { UserPrefsSchema } from '@/lib/validation/household'
import { type Ctx, ServiceError } from './ctx'

export type UserPrefs = z.infer<typeof UserPrefsSchema>

// Las preferencias de apariencia son siempre del usuario de la sesión: un
// token de API (sin userId) no tiene un usuario al que pintarle un tema.
export async function updateUserPrefs(ctx: Ctx, input: UserPrefs): Promise<User> {
  if (!ctx.userId) throw new ServiceError('forbidden', 'Solo una sesión de usuario tiene preferencias de apariencia')
  const [row] = await ctx.db.update(schema.users).set(input).where(eq(schema.users.id, ctx.userId)).returning()
  if (!row) throw new ServiceError('not_found', 'Usuario no encontrado')
  // displayName viaja en getHouseholdOverviewCached (ámbito 'settings'): sin
  // esto, cambiar el nombre no se vería en la lista de miembros hasta que
  // caducara solo por el paso del tiempo.
  invalidateHousehold(ctx.householdId, ['settings'])
  return row
}
