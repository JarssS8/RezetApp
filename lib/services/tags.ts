// Etiquetas del hogar y globales, con su jerarquía (tags.parent_id). El árbol
// lo arma el dominio (buildTagTree); aquí solo se traen las filas.
import { eq, isNull, or, sql } from 'drizzle-orm'
import * as schema from '@/db/schema'
import { descendantSlugs, type TagNodeInput } from '@/lib/domain/tags'
import type { Ctx } from './ctx'
import { slugify } from './recipes'

export interface TagRow extends TagNodeInput {
  recipeCount: number
}

function visibleTags(ctx: Ctx) {
  return or(isNull(schema.tags.householdId), eq(schema.tags.householdId, ctx.householdId))
}

// El recuento es SIEMPRE del hogar: una etiqueta global usada por otra casa no
// debe delatar que existen recetas ajenas.
//
// La subconsulta usa nombres de tabla/columna literales (no referencias
// `schema.recipeTags.tagId` etc.) a propósito: al no haber ningún `join` en la
// consulta principal, Drizzle marca la selección como "de una sola tabla" y
// des-cualifica CUALQUIER columna que aparezca en las expresiones del select
// -incluidas las de esta subconsulta correlacionada-, así que "tags.id" acaba
// escrito como "id" y Postgres lo resuelve contra "recipes" (que también tiene
// "id") en vez de correlar con la tabla externa. Con texto literal Drizzle no
// toca nada y la correlación queda intacta.
export async function listTags(ctx: Ctx): Promise<TagRow[]> {
  const rows = await ctx.db
    .select({
      id: schema.tags.id,
      name: schema.tags.name,
      nameEn: schema.tags.nameEn,
      slug: schema.tags.slug,
      parentId: schema.tags.parentId,
      recipeCount: sql<number>`(
        select count(*)::int from recipe_tags
        join recipes on recipes.id = recipe_tags.recipe_id
        where recipe_tags.tag_id = tags.id
          and recipes.household_id = ${ctx.householdId}
          and recipes.deleted_at is null
      )`,
    })
    .from(schema.tags)
    .where(visibleTags(ctx))
    .orderBy(schema.tags.name)
  return rows
}

// "Filtra por dieta" tiene que encontrar las veganas: un slug se expande a él
// mismo más toda su descendencia (dominio: descendantSlugs).
export async function expandTagSlugs(ctx: Ctx, slugs: string[]): Promise<string[]> {
  if (slugs.length === 0) return []
  const rows = await ctx.db
    .select({ id: schema.tags.id, name: schema.tags.name, nameEn: schema.tags.nameEn, slug: schema.tags.slug, parentId: schema.tags.parentId })
    .from(schema.tags)
    .where(visibleTags(ctx))
  const out = new Set<string>()
  for (const raw of slugs) for (const slug of descendantSlugs(rows, slugify(raw))) out.add(slug)
  return Array.from(out)
}
