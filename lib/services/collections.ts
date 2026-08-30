import { and, eq } from 'drizzle-orm'
import * as schema from '@/db/schema'
import { invalidateHousehold } from '@/lib/cache/tags'
import { CollectionQuerySchema, type CollectionInput, type CollectionQuery } from '@/lib/validation/collections'
import { type Ctx, ServiceError } from './ctx'

export interface CollectionView {
  id: string
  name: string
  query: CollectionQuery
}

// El jsonb puede venir de una versión anterior o de una edición manual: si no
// valida, la colección se enseña con el filtro vacío en vez de tirar la lista.
function toView(row: { id: string; name: string; query: unknown }): CollectionView {
  const parsed = CollectionQuerySchema.safeParse(row.query)
  return { id: row.id, name: row.name, query: parsed.success ? parsed.data : {} }
}

export async function listCollections(ctx: Ctx): Promise<CollectionView[]> {
  const rows = await ctx.db
    .select({ id: schema.collections.id, name: schema.collections.name, query: schema.collections.query })
    .from(schema.collections)
    .where(eq(schema.collections.householdId, ctx.householdId))
    .orderBy(schema.collections.name)
  return rows.map(toView)
}

export async function createCollection(ctx: Ctx, input: CollectionInput): Promise<CollectionView> {
  const [row] = await ctx.db
    .insert(schema.collections)
    .values({ householdId: ctx.householdId, name: input.name, query: input.query })
    .returning({ id: schema.collections.id, name: schema.collections.name, query: schema.collections.query })
  if (!row) throw new ServiceError('conflict', 'No se pudo crear la colección')
  invalidateHousehold(ctx.householdId, ['recipes'])
  return toView(row)
}

// Una colección de otro hogar es "no encontrada", no "prohibida": distinguirlas
// delataría que existe.
export async function deleteCollection(ctx: Ctx, id: string): Promise<void> {
  const deleted = await ctx.db
    .delete(schema.collections)
    .where(and(eq(schema.collections.id, id), eq(schema.collections.householdId, ctx.householdId)))
    .returning({ id: schema.collections.id })
  if (deleted.length === 0) throw new ServiceError('not_found', 'Colección no encontrada')
  invalidateHousehold(ctx.householdId, ['recipes'])
}
