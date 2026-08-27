import { describe, expect, it } from 'vitest'
import { allergenConflicts, recipeAllergens } from './allergens'

describe('recipeAllergens', () => {
  it('une los alérgenos de todos los ingredientes, ordenados y sin repetir', () => {
    const info = recipeAllergens([
      { foodId: 'f1', allergens: ['gluten', 'egg'] },
      { foodId: 'f2', allergens: ['egg'] },
      { foodId: 'f3', allergens: [] },
    ])
    expect(info).toEqual({ allergens: ['egg', 'gluten'], unknown: false })
  })

  it('marca unknown cuando algún ingrediente no tiene alimento resuelto', () => {
    expect(recipeAllergens([{ foodId: null, allergens: [] }])).toEqual({ allergens: [], unknown: true })
    expect(recipeAllergens([{ foodId: 'f1', allergens: ['fish'] }, { foodId: null, allergens: [] }])).toEqual({ allergens: ['fish'], unknown: true })
  })

  it('descarta lo que no está en la lista de alérgenos conocidos', () => {
    // foods.allergens es text[]: puede traer basura de una importación
    expect(recipeAllergens([{ foodId: 'f1', allergens: ['lactosa', 'gluten'] }])).toEqual({ allergens: ['gluten'], unknown: false })
  })

  it('una receta sin ingredientes no tiene alérgenos ni incógnitas', () => {
    expect(recipeAllergens([])).toEqual({ allergens: [], unknown: false })
  })
})

describe('allergenConflicts', () => {
  it('devuelve la intersección, ordenada', () => {
    expect(allergenConflicts(['gluten', 'egg'], ['egg', 'fish'])).toEqual(['egg'])
    expect(allergenConflicts(['gluten'], ['fish'])).toEqual([])
    expect(allergenConflicts([], ['fish'])).toEqual([])
  })
})
