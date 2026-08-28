import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Contrato de interfaz, no de tipos: vive en tests/ (fuera de la valla de
// eslint-boundaries) y lee el código fuente. Comprueba las dos reglas de
// `AGENTS.md` y `docs/02-DISENO.md` que la revisión de W5 hizo cumplir, para
// que nadie las desande sin darse cuenta.
const ROOT = join(import.meta.dirname, '..', '..')

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
    const rel = `${dir}/${entry.name}`
    if (entry.isDirectory()) out.push(...sourceFiles(rel))
    else if (entry.name.endsWith('.tsx') && !entry.name.endsWith('.test.tsx')) out.push(rel)
  }
  return out
}

describe('controles base', () => {
  it('el campo, el botón y la lista desplegable cumplen el objetivo táctil de 44 px', () => {
    for (const file of ['components/ui/input.tsx', 'components/ui/button.tsx', 'components/ui/native-select.tsx']) {
      expect(readFileSync(join(ROOT, file), 'utf8'), file).toContain('min-h-11')
    }
  })

  it('no queda ningún <select> suelto: todos pasan por NativeSelect', () => {
    const offenders = [...sourceFiles('components'), ...sourceFiles('app')]
      .filter((f) => f !== 'components/ui/native-select.tsx')
      .filter((f) => readFileSync(join(ROOT, f), 'utf8').includes('<select'))
    expect(offenders).toEqual([])
  })

  it('ningún componente usa la paleta cruda de Tailwind ni hexadecimales en JSX', () => {
    const palette = /\b(?:bg|text|border|ring)-(?:gray|slate|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/
    const offenders = sourceFiles('components').filter((f) => palette.test(readFileSync(join(ROOT, f), 'utf8')))
    expect(offenders).toEqual([])
  })
})
