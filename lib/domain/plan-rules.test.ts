import { describe, expect, it } from 'vitest'
import { avoidRecentRepeats, type CookedHistory, type RecipeSummary } from './plan-rules'

const recipe = (id: string, over: Partial<RecipeSummary> = {}): RecipeSummary => ({
  id,
  title: id,
  totalMinutes: 30,
  tagSlugs: [],
  timesCooked: 0,
  ...over,
})

describe('avoidRecentRepeats', () => {
  it('descarta lo cocinado dentro de la ventana y conserva lo de antes', () => {
    const candidates = [recipe('a'), recipe('b'), recipe('c')]
    const history: CookedHistory = [
      { recipeId: 'a', daysAgo: 2 },
      { recipeId: 'b', daysAgo: 30 },
    ]
    expect(avoidRecentRepeats(candidates, history, 14).map((r) => r.id)).toEqual(['b', 'c'])
  })

  it('el borde es estricto: exactamente hace `days` días ya vuelve a valer', () => {
    const history: CookedHistory = [{ recipeId: 'a', daysAgo: 14 }]
    expect(avoidRecentRepeats([recipe('a')], history, 14).map((r) => r.id)).toEqual(['a'])
    expect(avoidRecentRepeats([recipe('a')], [{ recipeId: 'a', daysAgo: 13 }], 14)).toEqual([])
  })

  it('sin historial no descarta nada, y con days = 0 tampoco', () => {
    const candidates = [recipe('a'), recipe('b')]
    expect(avoidRecentRepeats(candidates, [], 14)).toHaveLength(2)
    expect(avoidRecentRepeats(candidates, [{ recipeId: 'a', daysAgo: 0 }], 0)).toHaveLength(2)
  })

  it('mantiene el orden de entrada (el desempate lo decide applyPlanRules, no esto)', () => {
    const candidates = [recipe('z'), recipe('a')]
    expect(avoidRecentRepeats(candidates, [], 7).map((r) => r.id)).toEqual(['z', 'a'])
  })
})

import { applyPlanRules, ruleAllows, type PlanRule } from './plan-rules'

const monday = new Date(Date.UTC(2026, 7, 31)) // 2026-08-31, lunes (getUTCDay() === 1)
const rule = (over: Partial<PlanRule> = {}): PlanRule => ({ day: null, slot: null, constraint: 'no-meat', value: '', ...over })

describe('ruleAllows', () => {
  it('no-meat solo deja pasar lo etiquetado vegetariano o vegano', () => {
    expect(ruleAllows(rule(), recipe('a', { tagSlugs: ['vegetariano'] }))).toBe(true)
    expect(ruleAllows(rule(), recipe('a', { tagSlugs: ['vegano', 'horno'] }))).toBe(true)
    expect(ruleAllows(rule(), recipe('a', { tagSlugs: ['horno'] }))).toBe(false)
  })

  it('max-minutes descarta las recetas sin tiempo conocido', () => {
    const r = rule({ constraint: 'max-minutes', value: '30' })
    expect(ruleAllows(r, recipe('a', { totalMinutes: 30 }))).toBe(true)
    expect(ruleAllows(r, recipe('a', { totalMinutes: 45 }))).toBe(false)
    expect(ruleAllows(r, recipe('a', { totalMinutes: null }))).toBe(false)
  })

  it('max-minutes con un valor que no es número no filtra nada', () => {
    expect(ruleAllows(rule({ constraint: 'max-minutes', value: 'pronto' }), recipe('a'))).toBe(true)
  })

  it('tag y not-tag comparan por slug', () => {
    expect(ruleAllows(rule({ constraint: 'tag', value: 'rapido' }), recipe('a', { tagSlugs: ['rapido'] }))).toBe(true)
    expect(ruleAllows(rule({ constraint: 'tag', value: 'rapido' }), recipe('a'))).toBe(false)
    expect(ruleAllows(rule({ constraint: 'not-tag', value: 'postre' }), recipe('a'))).toBe(true)
    expect(ruleAllows(rule({ constraint: 'not-tag', value: 'postre' }), recipe('a', { tagSlugs: ['postre'] }))).toBe(false)
  })
})

describe('applyPlanRules', () => {
  it('rellena comida y cena de siete días sin repetir mientras haya candidatas', () => {
    const candidates = Array.from({ length: 14 }, (_, i) => recipe(`r${i}`, { timesCooked: i }))
    const payload = applyPlanRules([], candidates, [], monday)
    expect(payload.remove).toEqual([])
    expect(payload.add).toHaveLength(14)
    expect(new Set(payload.add.map((a) => a.recipeId)).size).toBe(14)
    expect(payload.add[0]).toEqual({ date: '2026-08-31', slot: 'lunch', recipeId: 'r0', servings: 2 })
    expect(payload.add[1]).toMatchObject({ date: '2026-08-31', slot: 'dinner' })
    expect(payload.add[13]).toMatchObject({ date: '2026-09-06', slot: 'dinner' })
  })

  it('deja el hueco vacío antes que saltarse una regla', () => {
    // "lunes sin carne" (day 1) y ninguna receta vegetariana: el lunes queda a cero
    const rules = [rule({ day: 1 })]
    const payload = applyPlanRules(rules, [recipe('a'), recipe('b')], [], monday, { days: 2 })
    expect(payload.add.filter((a) => a.date === '2026-08-31')).toEqual([])
    expect(payload.add.map((a) => a.date)).toEqual(['2026-09-01', '2026-09-01'])
  })

  it('una regla con slot solo se aplica a ese hueco', () => {
    const rules = [rule({ slot: 'dinner', constraint: 'max-minutes', value: '10' })]
    const payload = applyPlanRules(rules, [recipe('lenta', { totalMinutes: 90 }), recipe('rapida', { totalMinutes: 5 })], [], monday, { days: 1 })
    expect(payload.add).toEqual([
      { date: '2026-08-31', slot: 'lunch', recipeId: 'lenta', servings: 2 },
      { date: '2026-08-31', slot: 'dinner', recipeId: 'rapida', servings: 2 },
    ])
  })

  it('ordena por veces cocinada y, a igualdad, por título', () => {
    const candidates = [recipe('zeta', { timesCooked: 1 }), recipe('alfa', { timesCooked: 1 }), recipe('nueva', { timesCooked: 0 })]
    const payload = applyPlanRules([], candidates, [], monday, { days: 1, slots: ['lunch'] })
    expect(payload.add.map((a) => a.recipeId)).toEqual(['nueva'])
    const dos = applyPlanRules([], candidates, [], monday, { days: 2, slots: ['lunch'] })
    expect(dos.add.map((a) => a.recipeId)).toEqual(['nueva', 'alfa'])
  })

  it('si evitar repeticiones deja el pozo vacío, repite antes que no proponer nada', () => {
    const candidates = [recipe('a'), recipe('b')]
    const history = [{ recipeId: 'a', daysAgo: 1 }, { recipeId: 'b', daysAgo: 1 }]
    const payload = applyPlanRules([], candidates, history, monday, { days: 1, slots: ['lunch'], avoidRepeatDays: 14 })
    expect(payload.add.map((a) => a.recipeId)).toEqual(['a'])
  })

  it('respeta defaultServings, slots y days de las opciones', () => {
    const payload = applyPlanRules([], [recipe('a'), recipe('b')], [], monday, { defaultServings: 4, slots: ['breakfast'], days: 2 })
    expect(payload.add).toEqual([
      { date: '2026-08-31', slot: 'breakfast', recipeId: 'a', servings: 4 },
      { date: '2026-09-01', slot: 'breakfast', recipeId: 'b', servings: 4 },
    ])
  })

  it('sin candidatas devuelve una propuesta vacía en vez de fallar', () => {
    expect(applyPlanRules([], [], [], monday)).toEqual({ add: [], remove: [] })
  })
})
