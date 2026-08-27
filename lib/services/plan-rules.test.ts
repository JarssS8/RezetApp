import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import * as schema from '@/db/schema'
import { closeTestDb, getTestDb, truncateAll, type TestDb } from '@/db/test/setup'
import type { Ctx } from '@/lib/services/ctx'
import { createRecipe } from '@/lib/services/recipes'
import { getPlanRules, planCandidates, proposeWeekFromRules, updatePlanRules } from './plan-rules'

let db: TestDb
let ctxA: Ctx
let ctxB: Ctx

async function makeHousehold(name: string): Promise<Ctx> {
  const [h] = await db.insert(schema.households).values({ name }).returning()
  const [u] = await db.insert(schema.users).values({ displayName: name }).returning()
  if (!h || !u) throw new Error('seed')
  await db.insert(schema.householdMembers).values({ householdId: h.id, userId: u.id, role: 'owner' })
  return { db, householdId: h.id, userId: u.id, apiTokenId: null, role: 'owner', locale: 'es', scopes: [] }
}

beforeAll(async () => {
  db = await getTestDb()
})
afterAll(closeTestDb)

beforeEach(async () => {
  await truncateAll(db)
  ctxA = await makeHousehold('Casa A')
  ctxB = await makeHousehold('Casa B')
})

describe('plan-rules', () => {
  it('guarda y relee las reglas del hogar, y no ve las del vecino', async () => {
    await updatePlanRules(ctxA, [{ day: 1, slot: null, constraint: 'no-meat', value: '' }])
    expect(await getPlanRules(ctxA)).toEqual([{ day: 1, slot: null, constraint: 'no-meat', value: '' }])
    expect(await getPlanRules(ctxB)).toEqual([])
  })

  it('un jsonb corrupto se lee como lista vacía en vez de reventar la pantalla', async () => {
    await db.update(schema.households).set({ planRules: [{ nada: 1 }] }).where(eq(schema.households.id, ctxA.householdId))
    expect(await getPlanRules(ctxA)).toEqual([])
  })

  it('planCandidates trae etiquetas y veces cocinada, solo del hogar', async () => {
    await createRecipe(ctxA, { title: 'Lentejas', servingsBase: 4, prepMinutes: 10, cookMinutes: 40, tags: ['Vegetariano'], ingredients: [{ rawText: '300 g de lentejas' }], steps: [{ text: 'Cuece 40 minutos' }], imageUrls: [] })
    await createRecipe(ctxB, { title: 'Ajena', servingsBase: 2, tags: [], ingredients: [{ rawText: '1 huevo' }], steps: [{ text: 'Fríe' }], imageUrls: [] })
    const { candidates } = await planCandidates(ctxA)
    expect(candidates).toHaveLength(1)
    expect(candidates[0]).toMatchObject({ title: 'Lentejas', totalMinutes: 50, tagSlugs: ['vegetariano'], timesCooked: 0 })
  })

  it('crea una propuesta con source=rules aplicando la regla del lunes sin carne', async () => {
    await createRecipe(ctxA, { title: 'Lentejas', servingsBase: 4, tags: ['Vegetariano'], ingredients: [{ rawText: '300 g de lentejas' }], steps: [{ text: 'Cuece' }], imageUrls: [] })
    await createRecipe(ctxA, { title: 'Filete', servingsBase: 2, tags: [], ingredients: [{ rawText: '200 g de ternera' }], steps: [{ text: 'Plancha' }], imageUrls: [] })
    await updatePlanRules(ctxA, [{ day: 1, slot: null, constraint: 'no-meat', value: '' }])

    const view = await proposeWeekFromRules(ctxA, { from: '2026-08-31', to: '2026-09-06' })
    expect(view.source).toBe('rules')
    expect(view.status).toBe('pending')
    const monday = view.payload.add.filter((a) => a.date === '2026-08-31')
    expect(monday.every((a) => a.recipeId !== null)).toBe(true)
    // Solo hay una vegetariana: el lunes tiene como mucho un hueco, y su título lo dice
    expect(view.diff.add.filter((a) => a.date === '2026-08-31').map((a) => a.title)).toEqual(['Lentejas'])
    // El plan no se ha escrito: la propuesta se aprueba aparte (spec §12)
    const entries = await db.select().from(schema.mealPlanEntries).where(eq(schema.mealPlanEntries.householdId, ctxA.householdId))
    expect(entries).toEqual([])
  })

  it('sin recetas devuelve un error de validación explicable, no una propuesta vacía', async () => {
    await expect(proposeWeekFromRules(ctxA, { from: '2026-08-31', to: '2026-09-06' })).rejects.toMatchObject({ code: 'validation' })
  })

  it('usa las raciones por defecto del hogar', async () => {
    await db.update(schema.households).set({ defaultServings: 5 }).where(eq(schema.households.id, ctxA.householdId))
    await createRecipe(ctxA, { title: 'Sopa', servingsBase: 2, tags: [], ingredients: [{ rawText: '1 cebolla' }], steps: [{ text: 'Pocha' }], imageUrls: [] })
    const view = await proposeWeekFromRules(ctxA, { from: '2026-08-31', to: '2026-09-06' })
    expect(view.payload.add.every((a) => a.servings === 5)).toBe(true)
  })
})
