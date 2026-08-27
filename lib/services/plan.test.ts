import { randomBytes } from 'node:crypto'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { closeTestDb, getTestDb, truncateAll, type TestDb } from '@/db/test/setup'
import * as schema from '@/db/schema'
import { ServiceError, type Ctx } from './ctx'
import {
  applyBatch,
  createLeftover,
  createProposal,
  dayProgress,
  decideProposal,
  listEntries,
  listProposals,
  moveEntry,
  patchEntry,
  plannedEntriesForShopping,
  rangeNutrition,
} from './plan'

async function expectServiceErrorCode(promise: Promise<unknown>, code: 'not_found' | 'forbidden' | 'conflict' | 'validation'): Promise<void> {
  try {
    await promise
    expect.unreachable('se esperaba que la promesa rechazara')
  } catch (e) {
    expect(e).toBeInstanceOf(ServiceError)
    expect((e as ServiceError).code).toBe(code)
  }
}

let db: TestDb
const ctxOf = (householdId: string, overrides: Partial<Ctx> = {}): Ctx => ({
  db,
  householdId,
  userId: 'u1',
  apiTokenId: null,
  role: 'owner',
  locale: 'es',
  scopes: [],
  ...overrides,
})

async function makeHousehold(name: string): Promise<string> {
  const [h] = await db.insert(schema.households).values({ name }).returning()
  if (!h) throw new Error('seed')
  return h.id
}

async function makeUser(displayName: string): Promise<string> {
  const [u] = await db.insert(schema.users).values({ displayName }).returning()
  if (!u) throw new Error('seed')
  return u.id
}

async function makeApiToken(householdId: string, userId: string): Promise<string> {
  const [t] = await db.insert(schema.apiTokens).values({ householdId, userId, name: 'Token de prueba', tokenHash: randomBytes(16).toString('hex'), scopes: ['plan:write'] }).returning()
  if (!t) throw new Error('seed')
  return t.id
}

async function makeRecipe(householdId: string, title: string, overrides: Partial<typeof schema.recipes.$inferInsert> = {}): Promise<string> {
  const [r] = await db
    .insert(schema.recipes)
    .values({
      householdId,
      title,
      kcalPerServing: 400,
      proteinPerServing: 20,
      carbsPerServing: 40,
      fatPerServing: 15,
      fiberPerServing: 5,
      servingsBase: 2,
      prepMinutes: 10,
      cookMinutes: 20,
      ...overrides,
    })
    .returning()
  if (!r) throw new Error('seed')
  return r.id
}

async function makeFood(nameEs: string, nameEn: string, overrides: Partial<typeof schema.foods.$inferInsert> = {}): Promise<string> {
  const [f] = await db
    .insert(schema.foods)
    .values({ nameEs, nameEn, searchNameEs: nameEs.toLowerCase(), searchNameEn: nameEn.toLowerCase(), defaultUnit: 'g', ...overrides })
    .returning()
  if (!f) throw new Error('seed')
  return f.id
}

beforeAll(async () => {
  db = await getTestDb()
})
afterAll(closeTestDb)
beforeEach(async () => {
  await truncateAll(db)
})

describe('applyBatch', () => {
  it('añade entradas, ignora quitar de otro hogar y valida que la receta pertenezca al hogar', async () => {
    const a = await makeHousehold('Casa A')
    const b = await makeHousehold('Casa B')
    const recipeA = await makeRecipe(a, 'Lentejas')
    const recipeB = await makeRecipe(b, 'Tortilla')
    const [foreignEntry] = await db
      .insert(schema.mealPlanEntries)
      .values({ householdId: b, date: '2026-09-01', slot: 'lunch', recipeId: recipeB, servings: 2 })
      .returning()
    if (!foreignEntry) throw new Error('seed')
    const [ownEntry] = await db
      .insert(schema.mealPlanEntries)
      .values({ householdId: a, date: '2026-09-01', slot: 'dinner', recipeId: recipeA, servings: 2 })
      .returning()
    if (!ownEntry) throw new Error('seed')

    const result = await applyBatch(ctxOf(a), {
      add: [
        { date: '2026-09-02', slot: 'lunch', recipeId: recipeA, servings: 2 },
        { date: '2026-09-03', slot: 'dinner', recipeId: recipeA, servings: 4 },
      ],
      remove: [ownEntry.id, foreignEntry.id],
    })

    expect(result.added).toHaveLength(2)
    expect(result.added.map((e) => e.title)).toEqual(['Lentejas', 'Lentejas'])
    expect(result.removed).toEqual([ownEntry.id])
    // La entrada del otro hogar sigue intacta
    const stillThere = await db.select().from(schema.mealPlanEntries).where(eq(schema.mealPlanEntries.id, foreignEntry.id))
    expect(stillThere).toHaveLength(1)

    await expect(applyBatch(ctxOf(a), { add: [{ date: '2026-09-04', slot: 'lunch', recipeId: recipeB, servings: 1 }], remove: [] })).rejects.toThrow()
  })

  it('permite customTitle sin receta', async () => {
    const a = await makeHousehold('Casa A')
    const result = await applyBatch(ctxOf(a), { add: [{ date: '2026-09-05', slot: 'snack', customTitle: 'Fruta libre', servings: 1 }], remove: [] })
    expect(result.added).toHaveLength(1)
    expect(result.added[0]?.title).toBe('Fruta libre')
    expect(result.added[0]?.recipeId).toBeNull()
  })
})

describe('listEntries', () => {
  it('filtra por rango y hogar, y calcula el estado derivado', async () => {
    const a = await makeHousehold('Casa A')
    const b = await makeHousehold('Casa B')
    const recipeA = await makeRecipe(a, 'Lentejas')
    await db.insert(schema.mealPlanEntries).values({ householdId: a, date: '2026-09-01', slot: 'lunch', recipeId: recipeA, servings: 2, cookedAt: new Date() })
    await db.insert(schema.mealPlanEntries).values({ householdId: a, date: '2026-09-10', slot: 'dinner', recipeId: recipeA, servings: 2 }) // fuera de rango
    await db.insert(schema.mealPlanEntries).values({ householdId: b, date: '2026-09-01', slot: 'lunch', customTitle: 'De Bo', servings: 1 }) // otro hogar

    const entries = await listEntries(ctxOf(a), { from: '2026-09-01', to: '2026-09-02' })
    expect(entries).toHaveLength(1)
    expect(entries[0]?.status).toBe('cooked')
    expect(entries[0]?.kcalPerServing).toBe(400)
    expect(entries[0]?.totalMinutes).toBe(30)
  })
})

describe('moveEntry', () => {
  it('cambia fecha, slot y sortOrder; rechaza un id de otro hogar', async () => {
    const a = await makeHousehold('Casa A')
    const b = await makeHousehold('Casa B')
    const recipeA = await makeRecipe(a, 'Lentejas')
    const [entry] = await db.insert(schema.mealPlanEntries).values({ householdId: a, date: '2026-09-01', slot: 'lunch', recipeId: recipeA, servings: 2 }).returning()
    if (!entry) throw new Error('seed')

    const moved = await moveEntry(ctxOf(a), { entryId: entry.id, date: '2026-09-02', slot: 'dinner', sortOrder: 3 })
    expect(moved.date).toBe('2026-09-02')
    expect(moved.slot).toBe('dinner')
    expect(moved.sortOrder).toBe(3)

    await expect(moveEntry(ctxOf(b), { entryId: entry.id, date: '2026-09-03', slot: 'lunch', sortOrder: 0 })).rejects.toThrow()
  })
})

describe('patchEntry', () => {
  it('skipped:true marca skippedAt; skipped:false lo limpia', async () => {
    const a = await makeHousehold('Casa A')
    const recipeA = await makeRecipe(a, 'Lentejas')
    const [entry] = await db.insert(schema.mealPlanEntries).values({ householdId: a, date: '2026-09-01', slot: 'lunch', recipeId: recipeA, servings: 2 }).returning()
    if (!entry) throw new Error('seed')

    const skipped = await patchEntry(ctxOf(a), entry.id, { skipped: true })
    expect(skipped.status).toBe('skipped')
    const [row] = await db.select().from(schema.mealPlanEntries).where(eq(schema.mealPlanEntries.id, entry.id))
    expect(row?.skippedAt).not.toBeNull()

    const unskipped = await patchEntry(ctxOf(a), entry.id, { skipped: false })
    expect(unskipped.status).toBe('planned')
    const [row2] = await db.select().from(schema.mealPlanEntries).where(eq(schema.mealPlanEntries.id, entry.id))
    expect(row2?.skippedAt).toBeNull()
  })
})

describe('createLeftover', () => {
  it('crea una entrada con leftoverOfEntryId y recipeId heredado', async () => {
    const a = await makeHousehold('Casa A')
    const b = await makeHousehold('Casa B')
    const recipeA = await makeRecipe(a, 'Lentejas')
    const [entry] = await db.insert(schema.mealPlanEntries).values({ householdId: a, date: '2026-09-01', slot: 'lunch', recipeId: recipeA, servings: 4 }).returning()
    if (!entry) throw new Error('seed')

    const leftover = await createLeftover(ctxOf(a), { ofEntryId: entry.id, date: '2026-09-02', slot: 'lunch', servings: 1 })
    expect(leftover.recipeId).toBe(recipeA)
    expect(leftover.leftoverOfEntryId).toBe(entry.id)
    expect(leftover.servings).toBe(1)

    await expect(createLeftover(ctxOf(b), { ofEntryId: entry.id, date: '2026-09-02', slot: 'lunch', servings: 1 })).rejects.toThrow()
  })
})

describe('rangeNutrition', () => {
  it('agrega kcal por fecha excluyendo saltadas y sobras', async () => {
    const a = await makeHousehold('Casa A')
    const recipeA = await makeRecipe(a, 'Lentejas') // 400 kcal/ración
    const [counted] = await db.insert(schema.mealPlanEntries).values({ householdId: a, date: '2026-09-01', slot: 'lunch', recipeId: recipeA, servings: 2 }).returning()
    if (!counted) throw new Error('seed')
    await db.insert(schema.mealPlanEntries).values({ householdId: a, date: '2026-09-01', slot: 'dinner', recipeId: recipeA, servings: 2, skippedAt: new Date() })
    await db.insert(schema.mealPlanEntries).values({ householdId: a, date: '2026-09-01', slot: 'snack', recipeId: recipeA, servings: 2, leftoverOfEntryId: counted.id })

    const { byDate, total } = await rangeNutrition(ctxOf(a), { from: '2026-09-01', to: '2026-09-01' })
    expect(byDate['2026-09-01']?.total.kcal).toBe(800)
    expect(total.total.kcal).toBe(800)
  })
})

describe('dayProgress', () => {
  it('separa lo cocinado de lo planificado y excluye sobras y saltadas', async () => {
    const a = await makeHousehold('Casa A')
    const b = await makeHousehold('Casa B')
    const recipeA = await makeRecipe(a, 'Sopa', { kcalPerServing: 300, servingsBase: 2 })
    const [cooked] = await db.insert(schema.mealPlanEntries).values({ householdId: a, date: '2026-08-27', slot: 'lunch', recipeId: recipeA, servings: 2 }).returning()
    if (!cooked) throw new Error('seed')
    await db.insert(schema.mealPlanEntries).values({ householdId: a, date: '2026-08-27', slot: 'dinner', recipeId: recipeA, servings: 3 })
    const [skipped] = await db.insert(schema.mealPlanEntries).values({ householdId: a, date: '2026-08-27', slot: 'snack', recipeId: recipeA, servings: 1 }).returning()
    if (!skipped) throw new Error('seed')
    await db.update(schema.mealPlanEntries).set({ cookedAt: new Date() }).where(eq(schema.mealPlanEntries.id, cooked.id))
    await db.update(schema.mealPlanEntries).set({ skippedAt: new Date() }).where(eq(schema.mealPlanEntries.id, skipped.id))
    await db.insert(schema.mealPlanEntries).values({ householdId: a, date: '2026-08-27', slot: 'dinner', recipeId: recipeA, servings: 2, leftoverOfEntryId: cooked.id })

    const progress = await dayProgress(ctxOf(a), '2026-08-27')
    expect(progress).toMatchObject({ date: '2026-08-27', plannedKcal: 1500, cookedKcal: 600 })

    // Aislamiento entre hogares
    expect(await dayProgress(ctxOf(b), '2026-08-27')).toMatchObject({ plannedKcal: 0, cookedKcal: 0 })
  })

  // Debt de la revisión de la Tarea 9: el innerJoin con recipes ya filtra por
  // isNull(deletedAt), así que las entradas de una receta borrada dejan de
  // contar en el anillo de Hoy (mismo criterio que lookupRecipeTitles).
  it('una receta borrada deja de contar en el anillo del día', async () => {
    const a = await makeHousehold('Casa A')
    const recipeA = await makeRecipe(a, 'Sopa', { kcalPerServing: 300, servingsBase: 2 })
    const [cooked] = await db.insert(schema.mealPlanEntries).values({ householdId: a, date: '2026-08-27', slot: 'lunch', recipeId: recipeA, servings: 2 }).returning()
    if (!cooked) throw new Error('seed')
    await db.update(schema.mealPlanEntries).set({ cookedAt: new Date() }).where(eq(schema.mealPlanEntries.id, cooked.id))

    expect(await dayProgress(ctxOf(a), '2026-08-27')).toMatchObject({ plannedKcal: 600, cookedKcal: 600 })

    await db.update(schema.recipes).set({ deletedAt: new Date() }).where(eq(schema.recipes.id, recipeA))

    expect(await dayProgress(ctxOf(a), '2026-08-27')).toMatchObject({ plannedKcal: 0, cookedKcal: 0 })
  })
})

describe('createProposal', () => {
  it('usa createdByUserId para un ctx de usuario y createdByTokenId para un ctx de token', async () => {
    const a = await makeHousehold('Casa A')
    const owner = await makeUser('Ana')
    const tokenId = await makeApiToken(a, owner)

    const fromUser = await createProposal(ctxOf(a, { userId: owner }), { source: 'rules', payload: { add: [], remove: [] } })
    expect(fromUser.status).toBe('pending')
    const [rowUser] = await db.select().from(schema.planProposals).where(eq(schema.planProposals.id, fromUser.id))
    expect(rowUser?.createdByUserId).toBe(owner)
    expect(rowUser?.createdByTokenId).toBeNull()

    const fromToken = await createProposal(ctxOf(a, { userId: null, apiTokenId: tokenId }), { source: 'mcp', payload: { add: [], remove: [] } })
    const [rowToken] = await db.select().from(schema.planProposals).where(eq(schema.planProposals.id, fromToken.id))
    expect(rowToken?.createdByTokenId).toBe(tokenId)
    expect(rowToken?.createdByUserId).toBeNull()
  })

  // C1 de la revisión final: un cliente MCP (source: 'mcp') puede mandar cualquier UUID
  // como recipeId; createProposal debe cortar antes de insertar, no solo al aprobar.
  it('rechaza un recipeId que no pertenece al hogar (validation), sin crear la propuesta', async () => {
    const a = await makeHousehold('Casa A')
    const b = await makeHousehold('Casa B')
    const ownerA = await makeUser('Ana')
    const recipeB = await makeRecipe(b, 'Ajena')

    await expectServiceErrorCode(
      createProposal(ctxOf(a, { userId: ownerA }), {
        source: 'mcp',
        payload: { add: [{ date: '2026-09-02', slot: 'lunch', recipeId: recipeB, servings: 2 }], remove: [] },
      }),
      'validation',
    )
    const rows = await db.select().from(schema.planProposals).where(eq(schema.planProposals.householdId, a))
    expect(rows).toHaveLength(0)
  })

  it('también rechaza un recipeId de una receta propia pero borrada', async () => {
    const a = await makeHousehold('Casa A')
    const ownerA = await makeUser('Ana')
    const recipeA = await makeRecipe(a, 'Borrada')
    await db.update(schema.recipes).set({ deletedAt: new Date() }).where(eq(schema.recipes.id, recipeA))

    await expectServiceErrorCode(
      createProposal(ctxOf(a, { userId: ownerA }), {
        source: 'mcp',
        payload: { add: [{ date: '2026-09-02', slot: 'lunch', recipeId: recipeA, servings: 2 }], remove: [] },
      }),
      'validation',
    )
  })

  // El SELECT de lookupRecipeTitles nunca debe filtrar el título de una receta de otro
  // hogar: aquí se comprueba tanto en createProposal (via la validación de arriba) como
  // en el diff que se construye al listar la propuesta.
  it('los títulos del diff nunca vienen de una receta de otro hogar', async () => {
    const a = await makeHousehold('Casa A')
    const b = await makeHousehold('Casa B')
    const ownerA = await makeUser('Ana')
    const recipeA = await makeRecipe(a, 'Propia')
    const recipeB = await makeRecipe(b, 'Secreta de B')

    const proposal = await createProposal(ctxOf(a, { userId: ownerA }), {
      source: 'rules',
      payload: { add: [{ date: '2026-09-02', slot: 'lunch', recipeId: recipeA, customTitle: 'Secreta de B', servings: 2 }], remove: [] },
    })
    expect(proposal.diff.add[0]?.title).toBe('Propia')

    // Manipular el payload guardado para simular un recipeId ajeno colado antes del fix de
    // createProposal (defensa en profundidad de lookupRecipeTitles en el propio diff).
    await db
      .update(schema.planProposals)
      .set({ payload: { add: [{ date: '2026-09-02', slot: 'lunch', recipeId: recipeB, servings: 2 }], remove: [] } })
      .where(eq(schema.planProposals.id, proposal.id))
    const [reloaded] = await listProposals(ctxOf(a, { userId: ownerA }))
    expect(reloaded?.diff.add[0]?.title).toBe('')
  })
})

describe('listProposals', () => {
  it('lista solo las pendientes cuando se pide y aísla por hogar', async () => {
    const a = await makeHousehold('Casa A')
    const b = await makeHousehold('Casa B')
    const ownerA = await makeUser('Ana')
    const ownerB = await makeUser('Bea')

    const pending = await createProposal(ctxOf(a, { userId: ownerA }), { source: 'ai', payload: { add: [], remove: [] } })
    const decided = await createProposal(ctxOf(a, { userId: ownerA }), { source: 'ai', payload: { add: [], remove: [] } })
    await decideProposal(ctxOf(a, { userId: ownerA }), decided.id, 'reject')
    await createProposal(ctxOf(b, { userId: ownerB }), { source: 'ai', payload: { add: [], remove: [] } })

    const all = await listProposals(ctxOf(a, { userId: ownerA }))
    expect(all.map((p) => p.id).sort()).toEqual([pending.id, decided.id].sort())

    const onlyPending = await listProposals(ctxOf(a, { userId: ownerA }), 'pending')
    expect(onlyPending.map((p) => p.id)).toEqual([pending.id])
  })
})

describe('decideProposal', () => {
  it('approve aplica el lote (con título resuelto en el diff), marca approved y resuelve; un segundo approve da conflict', async () => {
    const a = await makeHousehold('Casa A')
    const ownerA = await makeUser('Ana')
    const recipeA = await makeRecipe(a, 'Lentejas')
    const [toRemove] = await db.insert(schema.mealPlanEntries).values({ householdId: a, date: '2026-09-01', slot: 'lunch', recipeId: recipeA, servings: 2 }).returning()
    if (!toRemove) throw new Error('seed')

    const proposal = await createProposal(ctxOf(a, { userId: ownerA }), {
      source: 'ai',
      payload: { add: [{ date: '2026-09-02', slot: 'dinner', recipeId: recipeA, servings: 2 }], remove: [toRemove.id] },
    })
    expect(proposal.diff.add).toEqual([expect.objectContaining({ date: '2026-09-02', recipeId: recipeA, title: 'Lentejas' })])
    expect(proposal.diff.remove.map((e) => e.id)).toEqual([toRemove.id])

    const approved = await decideProposal(ctxOf(a, { userId: ownerA }), proposal.id, 'approve')
    expect(approved.status).toBe('approved')
    const [row] = await db.select().from(schema.planProposals).where(eq(schema.planProposals.id, proposal.id))
    expect(row?.resolvedByUserId).toBe(ownerA)
    expect(row?.resolvedAt).not.toBeNull()

    const remaining = await db.select().from(schema.mealPlanEntries).where(eq(schema.mealPlanEntries.householdId, a))
    expect(remaining).toHaveLength(1)
    expect(remaining[0]?.date).toBe('2026-09-02')

    await expectServiceErrorCode(decideProposal(ctxOf(a, { userId: ownerA }), proposal.id, 'approve'), 'conflict')
  })

  it('reject marca rejected sin tocar el plan', async () => {
    const a = await makeHousehold('Casa A')
    const ownerA = await makeUser('Ana')
    const recipeA = await makeRecipe(a, 'Lentejas')
    const proposal = await createProposal(ctxOf(a, { userId: ownerA }), {
      source: 'rules',
      payload: { add: [{ date: '2026-09-02', slot: 'dinner', recipeId: recipeA, servings: 2 }], remove: [] },
    })

    const rejected = await decideProposal(ctxOf(a, { userId: ownerA }), proposal.id, 'reject')
    expect(rejected.status).toBe('rejected')

    const entries = await db.select().from(schema.mealPlanEntries).where(eq(schema.mealPlanEntries.householdId, a))
    expect(entries).toHaveLength(0)
  })

  it('un token no puede decidir (forbidden), ni aprobar ni rechazar; una propuesta de otro hogar da not_found en ambos', async () => {
    const a = await makeHousehold('Casa A')
    const b = await makeHousehold('Casa B')
    const ownerA = await makeUser('Ana')
    const ownerB = await makeUser('Bea')
    const tokenId = await makeApiToken(a, ownerA)

    const proposal = await createProposal(ctxOf(a, { userId: ownerA }), { source: 'ai', payload: { add: [], remove: [] } })

    await expectServiceErrorCode(decideProposal(ctxOf(a, { userId: null, apiTokenId: tokenId }), proposal.id, 'approve'), 'forbidden')
    await expectServiceErrorCode(decideProposal(ctxOf(a, { userId: null, apiTokenId: tokenId }), proposal.id, 'reject'), 'forbidden')
    await expectServiceErrorCode(decideProposal(ctxOf(b, { userId: ownerB }), proposal.id, 'approve'), 'not_found')
    await expectServiceErrorCode(decideProposal(ctxOf(b, { userId: ownerB }), proposal.id, 'reject'), 'not_found')
  })

  it('dos approves concurrentes sobre la misma propuesta: solo uno se aplica, el otro da conflict, y las entradas se insertan una sola vez', async () => {
    const a = await makeHousehold('Casa A')
    const ownerA = await makeUser('Ana')
    const recipeA = await makeRecipe(a, 'Lentejas')
    const proposal = await createProposal(ctxOf(a, { userId: ownerA }), {
      source: 'ai',
      payload: { add: [{ date: '2026-09-02', slot: 'dinner', recipeId: recipeA, servings: 2 }], remove: [] },
    })

    const results = await Promise.allSettled([
      decideProposal(ctxOf(a, { userId: ownerA }), proposal.id, 'approve'),
      decideProposal(ctxOf(a, { userId: ownerA }), proposal.id, 'approve'),
    ])

    const fulfilled = results.filter((r) => r.status === 'fulfilled')
    const rejected = results.filter((r) => r.status === 'rejected')
    expect(fulfilled).toHaveLength(1)
    expect(rejected).toHaveLength(1)
    const [conflictResult] = rejected
    if (conflictResult && conflictResult.status === 'rejected') {
      expect(conflictResult.reason).toBeInstanceOf(ServiceError)
      expect((conflictResult.reason as ServiceError).code).toBe('conflict')
    }

    const entries = await db.select().from(schema.mealPlanEntries).where(eq(schema.mealPlanEntries.householdId, a))
    expect(entries).toHaveLength(1)
  })

  it('approve revierte el status si applyBatchTx falla (receta borrada tras crear la propuesta); la propuesta sigue pending', async () => {
    const a = await makeHousehold('Casa A')
    const ownerA = await makeUser('Ana')
    const recipeA = await makeRecipe(a, 'Lentejas')
    const proposal = await createProposal(ctxOf(a, { userId: ownerA }), {
      source: 'ai',
      payload: { add: [{ date: '2026-09-02', slot: 'dinner', recipeId: recipeA, servings: 2 }], remove: [] },
    })
    await db.update(schema.recipes).set({ deletedAt: new Date() }).where(eq(schema.recipes.id, recipeA))

    await expectServiceErrorCode(decideProposal(ctxOf(a, { userId: ownerA }), proposal.id, 'approve'), 'validation')

    const [row] = await db.select().from(schema.planProposals).where(eq(schema.planProposals.id, proposal.id))
    expect(row?.status).toBe('pending')
    expect(row?.resolvedAt).toBeNull()
    const entries = await db.select().from(schema.mealPlanEntries).where(eq(schema.mealPlanEntries.householdId, a))
    expect(entries).toHaveLength(0)
  })
})

describe('plannedEntriesForShopping', () => {
  it('carga ingredientes con foodName (según locale) y excluye cocinadas, saltadas y sobras', async () => {
    const a = await makeHousehold('Casa A')
    const recipeA = await makeRecipe(a, 'Lentejas')
    const lentejas = await makeFood('Lentejas secas', 'Dried lentils')
    await db.insert(schema.recipeIngredients).values({ recipeId: recipeA, foodId: lentejas, rawText: '200 g de lentejas', quantity: 200, unit: 'g', scalesLinearly: true, sortOrder: 0 })
    await db.insert(schema.recipeIngredients).values({ recipeId: recipeA, foodId: null, rawText: 'sal al gusto', quantity: null, unit: null, scalesLinearly: false, sortOrder: 1 })

    const [counted] = await db.insert(schema.mealPlanEntries).values({ householdId: a, date: '2026-09-01', slot: 'lunch', recipeId: recipeA, servings: 4 }).returning()
    if (!counted) throw new Error('seed')
    await db.insert(schema.mealPlanEntries).values({ householdId: a, date: '2026-09-01', slot: 'dinner', recipeId: recipeA, servings: 2, cookedAt: new Date() })
    await db.insert(schema.mealPlanEntries).values({ householdId: a, date: '2026-09-01', slot: 'snack', recipeId: recipeA, servings: 2, skippedAt: new Date() })
    await db.insert(schema.mealPlanEntries).values({ householdId: a, date: '2026-09-02', slot: 'lunch', recipeId: recipeA, servings: 1, leftoverOfEntryId: counted.id })
    await db.insert(schema.mealPlanEntries).values({ householdId: a, date: '2026-09-10', slot: 'lunch', recipeId: recipeA, servings: 2 }) // fuera de rango

    const entries = await plannedEntriesForShopping(ctxOf(a), { from: '2026-09-01', to: '2026-09-02' })
    expect(entries).toHaveLength(1)
    expect(entries[0]?.id).toBe(counted.id)
    expect(entries[0]?.servings).toBe(4)
    expect(entries[0]?.recipe.servingsBase).toBe(2)

    const byRawText = new Map(entries[0]?.recipe.ingredients.map((i) => [i.rawText, i]))
    expect(byRawText.get('200 g de lentejas')).toMatchObject({ foodId: lentejas, foodName: 'Lentejas secas', quantity: 200, unit: 'g' })
    expect(byRawText.get('sal al gusto')).toMatchObject({ foodId: null, foodName: 'sal al gusto', quantity: null, unit: null, scalesLinearly: false })
  })

  it('usa el nombre en inglés cuando el locale del ctx es en', async () => {
    const a = await makeHousehold('Casa A')
    const recipeA = await makeRecipe(a, 'Lentils')
    const lentejas = await makeFood('Lentejas secas', 'Dried lentils')
    await db.insert(schema.recipeIngredients).values({ recipeId: recipeA, foodId: lentejas, rawText: '200 g lentils', quantity: 200, unit: 'g' })
    await db.insert(schema.mealPlanEntries).values({ householdId: a, date: '2026-09-01', slot: 'lunch', recipeId: recipeA, servings: 2 })

    const entries = await plannedEntriesForShopping(ctxOf(a, { locale: 'en' }), { from: '2026-09-01', to: '2026-09-01' })
    expect(entries[0]?.recipe.ingredients[0]?.foodName).toBe('Dried lentils')
  })

  it('ignora entradas sin receta (comida libre) y aísla por hogar', async () => {
    const a = await makeHousehold('Casa A')
    const b = await makeHousehold('Casa B')
    await db.insert(schema.mealPlanEntries).values({ householdId: a, date: '2026-09-01', slot: 'lunch', customTitle: 'Pizza', servings: 2 })
    const recipeB = await makeRecipe(b, 'Sopa')
    await db.insert(schema.mealPlanEntries).values({ householdId: b, date: '2026-09-01', slot: 'lunch', recipeId: recipeB, servings: 2 })

    const entries = await plannedEntriesForShopping(ctxOf(a), { from: '2026-09-01', to: '2026-09-01' })
    expect(entries).toEqual([])
  })
})
