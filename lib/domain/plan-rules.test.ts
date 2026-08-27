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
