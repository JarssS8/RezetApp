import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Contrato de movimiento de W6. Vale tanto por lo que exige como por lo que
// prohíbe: el informe de animaciones aceptó cinco filas y rechazó otras cinco
// por frecuencia de uso o por función, y las rechazadas son las que más fácil
// se cuelan "de paso" en una oleada de estilo.
const ROOT = join(import.meta.dirname, '..', '..')
const read = (f: string) => readFileSync(join(ROOT, f), 'utf8')

describe('movimiento', () => {
  it('las cinco animaciones aceptadas están, con su presupuesto', () => {
    expect(read('components/today/kcal-ring.tsx')).toContain('transition-[stroke-dashoffset]')
    expect(read('components/pantry/pantry-row.tsx')).toContain('data-removing')
    expect(read('components/plan/day-column.tsx')).toContain('transition-colors')
    expect(read('components/cook/cook-session.tsx')).toContain('transition-opacity')
    expect(read('components/cook/finish-dialog.tsx')).toContain('grid-rows-[0fr]')
  })

  it('las duraciones salen de tokens, no de números sueltos', () => {
    for (const file of [
      'components/today/kcal-ring.tsx',
      'components/pantry/pantry-row.tsx',
      'components/cook/cook-session.tsx',
      'components/cook/finish-dialog.tsx',
    ]) {
      expect(read(file), file).toMatch(/duration-\(--dur-[123]\)/)
    }
  })

  it('los cinco candidatos rechazados siguen sin animar', () => {
    // Navegación core (100+/día), stepper y lista de comprobación (se tocan con
    // prisa), intercambio de propuesta (sin identidad de elemento estable) y
    // parrilla de recetas (contenido funcional, no decoración).
    const forbidden = /\b(transition|animate-in|animate-out|duration-)\S*/
    for (const file of [
      'components/nav/bottom-bar.tsx',
      'components/recipes/servings-stepper.tsx',
      'components/cook/ingredient-checklist.tsx',
    ]) {
      expect(read(file), file).not.toMatch(forbidden)
    }
    // recipe-card conserva su `transition-shadow` de W2 (hover de la tarjeta,
    // dentro de presupuesto); lo que se prohíbe es el stagger de entrada.
    expect(read('components/recipes/recipe-card.tsx')).not.toContain('animate-in')
    expect(read('components/plan/proposal-card.tsx')).not.toContain('animate-')
  })

  it('nadie escribe su propia media query de reduced-motion', () => {
    // Ya hay un interruptor global en app/globals.css: duplicarlo por componente
    // es la forma clásica de que uno se quede sin actualizar.
    const globals = read('app/globals.css')
    expect(globals).toContain('prefers-reduced-motion')
    for (const file of ['components/today/kcal-ring.tsx', 'components/cook/cook-session.tsx', 'components/cook/finish-dialog.tsx']) {
      expect(read(file), file).not.toContain('prefers-reduced-motion')
    }
  })
})
