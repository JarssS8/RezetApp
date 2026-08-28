import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Contrato de movimiento. Hasta W6.5 esto era, sobre todo, una lista de
// prohibiciones: el informe de animaciones original aceptó cinco filas y
// rechazó otras cinco por frecuencia de uso o por función. El usuario miró la
// app desplegada y dijo, dos veces, que no veía animaciones — ruling W6-R5
// (progress.md, W6.5): su decisión de gusto ANULA los cinco rechazos. Este
// fichero ya no prohíbe nada por sitio; solo exige que TODO movimiento salga
// de un presupuesto de duración (--dur-1..4) y respete el interruptor global
// de accesibilidad. Las cinco filas originales siguen documentadas porque
// siguen siendo el ejemplo de referencia de cada patrón (transición simple,
// dos pasos con `data-removing`, colores, @starting-style, grid-rows).
const ROOT = join(import.meta.dirname, '..', '..')
const read = (f: string) => readFileSync(join(ROOT, f), 'utf8')

// Único retraso fuera de la tabla de presupuestos (docs/02-DISENO.md): el
// desplegable de sobras de finish-dialog.tsx necesita que el contenido no
// empiece a aparecer hasta que el contenedor ha abierto una fracción.
const SANCTIONED_DELAYS = new Set(['components/cook/finish-dialog.tsx|delay-75'])

// Recorre components/ y app/ recogiendo todo el código de interfaz (.tsx,
// sin los .test.tsx): es donde puede aparecer una transición o una animación.
function collectTsx(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(join(ROOT, dir))) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue
    const rel = join(dir, entry)
    const abs = join(ROOT, rel)
    const st = statSync(abs)
    if (st.isDirectory()) collectTsx(rel, out)
    else if (entry.endsWith('.tsx') && !entry.endsWith('.test.tsx')) out.push(rel.split('\\').join('/'))
  }
  return out
}

const SOURCE_FILES = [...collectTsx('components'), ...collectTsx('app')]

describe('movimiento', () => {
  it('las cinco animaciones de referencia de W6 siguen con su presupuesto', () => {
    expect(read('components/today/kcal-ring.tsx')).toContain('transition-[stroke-dashoffset]')
    expect(read('components/pantry/pantry-row.tsx')).toContain('data-removing')
    expect(read('components/plan/day-column.tsx')).toContain('transition-colors')
    expect(read('components/cook/cook-session.tsx')).toContain('transition-opacity')
    expect(read('components/cook/finish-dialog.tsx')).toContain('grid-rows-[0fr]')
    // El desplegable de sobras necesita las dos mitades del patrón `group`:
    // el contenedor que abre y el hijo que se desvanece al mismo ritmo.
    expect(read('components/cook/finish-dialog.tsx')).toContain('group')
    expect(read('components/cook/finish-dialog.tsx')).toContain('group-data-open:opacity-100')

    for (const file of [
      'components/today/kcal-ring.tsx',
      'components/pantry/pantry-row.tsx',
      'components/plan/day-column.tsx',
      'components/cook/cook-session.tsx',
      'components/cook/finish-dialog.tsx',
    ]) {
      expect(read(file), file).toMatch(/duration-\(--dur-[1234]\)/)
    }
  })

  it('W6.5: los cinco candidatos que el informe rechazó ahora animan, dentro de presupuesto', () => {
    // Barra inferior (ruling W6-R5 levanta la prohibición explícitamente): la
    // píldora y el color de la pestaña transicionan en --dur-1, y el icono
    // hace un pop de escala SOLO al volverse activo (icon-pop, app/globals.css).
    const bottomBar = read('components/nav/bottom-bar.tsx')
    expect(bottomBar).toMatch(/transition-colors duration-\(--dur-1\)/)
    expect(bottomBar).toContain('icon-pop')

    // Stepper de raciones: el valor se remonta con `key` y entra con un
    // fundido de --dur-1 (140ms, el presupuesto más corto: se toca con prisa).
    const stepper = read('components/recipes/servings-stepper.tsx')
    expect(stepper).toContain('key={value}')
    expect(stepper).toMatch(/duration-\(--dur-1\)/)

    // Lista de comprobación: opacidad y color de texto al marcar, mismo
    // presupuesto de 140ms que el stepper.
    const checklist = read('components/cook/ingredient-checklist.tsx')
    expect(checklist).toMatch(/duration-\(--dur-1\)/)

    // Propuestas del plan: ya no hace falta identidad estable de elemento
    // entre A y B para animar algo — la etiqueta de estado que sustituye a
    // los botones al decidir entra con view-enter.
    expect(read('components/plan/proposal-card.tsx')).toContain('view-enter')

    // Parrilla de recetas: el stagger vive en la página (índice por tarjeta),
    // no en recipe-card.tsx, que sigue siendo un Server Component sin estado.
    expect(read('app/(app)/recipes/page.tsx')).toContain('stagger-in')
  })

  it('las tres utilidades compartidas de W6.5 están declaradas y mirroradas', () => {
    const compiled = read('app/globals.css')
    const doc = read('design-tokens.css')
    for (const utility of ['view-enter', 'stagger-in', 'icon-pop']) {
      expect(compiled, `app/globals.css debe declarar @utility ${utility}`).toContain(`@utility ${utility} {`)
      expect(doc, `design-tokens.css debe documentar .${utility}`).toContain(`.${utility} {`)
    }
    for (const token of ['--dur-4: 300ms', '--ease-spring: cubic-bezier(.34, 1.56, .64, 1)']) {
      expect(compiled, `app/globals.css debe declarar ${token}`).toContain(token)
      expect(doc, `design-tokens.css debe declarar ${token}`).toContain(token)
    }
  })

  it('presión: los botones y la tarjeta de receta responden al toque', () => {
    expect(read('components/ui/button.tsx')).toContain('active:scale-[.98]')
    expect(read('components/recipes/recipe-card.tsx')).toContain('active:scale-[.98]')
    expect(read('components/recipes/recipe-card.tsx')).toContain('hover:-translate-y-0.5')
  })

  it('diálogos y hojas: duraciones de token, la hoja usa el presupuesto largo nuevo', () => {
    expect(read('components/ui/dialog.tsx')).toMatch(/duration-\(--dur-2\)/)
    expect(read('components/ui/sheet.tsx')).toMatch(/duration-\(--dur-4\)/)
  })

  it('ninguna duración ni retraso sale de un número suelto: todo token, salvo la excepción sancionada', () => {
    for (const file of SOURCE_FILES) {
      const src = read(file)
      // duration-100, duration-150... (el utility numérico nativo de
      // Tailwind): prohibido en toda la interfaz, dentro y fuera de la lista
      // de referencia de arriba. Los tokens usan duration-(--dur-N).
      expect(src, `${file}: duración fuera de --dur-*`).not.toMatch(/\bduration-\d/)
      const delays = src.match(/\bdelay-\d+\b/g) ?? []
      for (const delay of delays) {
        const key = `${file}|${delay}`
        expect(SANCTIONED_DELAYS.has(key), `${file}: "${delay}" no es la excepción sancionada de finish-dialog`).toBe(true)
      }
    }
  })

  it('nadie escribe su propia media query de reduced-motion: el interruptor es global', () => {
    // Ya hay un interruptor global en app/globals.css: duplicarlo por
    // componente es la forma clásica de que uno se quede sin actualizar.
    const globals = read('app/globals.css')
    expect(globals).toContain('prefers-reduced-motion')
    for (const file of SOURCE_FILES) {
      expect(read(file), file).not.toContain('prefers-reduced-motion')
    }
  })
})
