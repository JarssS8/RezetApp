import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import tagsSeed from '@/db/seed/tags.json'
import { closeTestDb, getTestDb, truncateAll, type TestDb } from '@/db/test/setup'
import * as schema from '@/db/schema'
import type { Ctx } from '@/lib/services/ctx'
import { createRecipe } from './recipes'
import { expandTagSlugs, listTags } from './tags'

type TagSeed = { slug: string; name: { es: string; en: string }; parent: string | null }

// Etiquetas globales de docs/db/seed/tags.json, sin pasar por scripts/seed.ts
// (los tests de servicios no pueden depender de 'scripts': ver eslint boundaries).
// Dos pasadas: padres (parent null) antes que hijos, igual que seedTags.
async function seedGlobalTags(db: TestDb): Promise<void> {
  const list = tagsSeed as TagSeed[]
  const idBySlug = new Map<string, string>()
  for (const pass of [0, 1]) {
    for (const t of list) {
      if ((t.parent === null) !== (pass === 0)) continue
      const parentId = t.parent ? (idBySlug.get(t.parent) ?? null) : null
      const [row] = await db.insert(schema.tags).values({ householdId: null, slug: t.slug, name: t.name.es, nameEn: t.name.en, parentId }).returning({ id: schema.tags.id })
      if (row) idBySlug.set(t.slug, row.id)
    }
  }
}

let db: TestDb
let ctxA: Ctx
let ctxB: Ctx

async function makeHousehold(name: string): Promise<Ctx> {
  const [h] = await db.insert(schema.households).values({ name }).returning()
  const [u] = await db.insert(schema.users).values({ displayName: name }).returning()
  if (!h || !u) throw new Error('setup')
  await db.insert(schema.householdMembers).values({ householdId: h.id, userId: u.id, role: 'owner' })
  return { db, householdId: h.id, userId: u.id, apiTokenId: null, role: 'owner', locale: 'es', scopes: [] }
}

beforeAll(async () => {
  db = await getTestDb()
})
afterAll(closeTestDb)
beforeEach(async () => {
  await truncateAll(db)
  ctxA = await makeHousehold('A')
  ctxB = await makeHousehold('B')
})

describe('listTags', () => {
  it('lista las etiquetas globales y las del hogar, con el recuento del hogar', async () => {
    await seedGlobalTags(db)
    await createRecipe(ctxA, {
      title: 'Lentejas',
      servingsBase: 4,
      tags: ['Vegetariano', 'De la abuela'],
      ingredients: [{ rawText: '300 g de lentejas' }],
      steps: [{ text: 'Cuece' }],
      imageUrls: [],
    })

    const tags = await listTags(ctxA)
    const vegetariano = tags.find((t) => t.slug === 'vegetariano')
    expect(vegetariano).toMatchObject({ recipeCount: 1 })
    expect(vegetariano?.parentId).not.toBeNull()
    // La etiqueta propia del hogar aparece con nameEn null (regla W1-R19)
    expect(tags.find((t) => t.slug === 'de-la-abuela')).toMatchObject({ nameEn: null, recipeCount: 1 })
    // El vecino no ve ni la etiqueta propia ni el recuento
    const tagsB = await listTags(ctxB)
    expect(tagsB.find((t) => t.slug === 'de-la-abuela')).toBeUndefined()
    expect(tagsB.find((t) => t.slug === 'vegetariano')?.recipeCount).toBe(0)
  })
})

describe('expandTagSlugs', () => {
  it('añade los descendientes y normaliza el slug', async () => {
    await seedGlobalTags(db)
    expect((await expandTagSlugs(ctxA, ['Dieta'])).sort()).toEqual(['dieta', 'sin-gluten', 'sin-lactosa', 'vegano', 'vegetariano'])
    expect(await expandTagSlugs(ctxA, ['rapido'])).toEqual(['rapido'])
  })
})
