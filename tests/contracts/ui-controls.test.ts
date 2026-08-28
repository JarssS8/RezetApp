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

// Extrae el contenido de cada `className=...` (string simple o `{cn(...)}`)
// de un fuente JSX/TSX. Solo se mira dentro de className: un hex fuera de ahí
// (p. ej. `themeColor` de app/layout.tsx, que necesita valores literales para
// la barra del sistema, no una variable CSS) es legítimo y no debe contarse.
function classNameChunks(source: string): string[] {
  const out: string[] = []
  const marker = /className\s*=\s*/g
  for (const match of source.matchAll(marker)) {
    const start = (match.index ?? 0) + match[0].length
    const opener = source[start]
    if (opener === '"' || opener === "'" || opener === '`') {
      const end = source.indexOf(opener, start + 1)
      out.push(source.slice(start, end === -1 ? source.length : end))
    } else if (opener === '{') {
      let depth = 0
      let i = start
      do {
        if (source[i] === '{') depth += 1
        else if (source[i] === '}') depth -= 1
        i += 1
      } while (depth > 0 && i < source.length)
      out.push(source.slice(start, i))
    }
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
    const hex = /#[0-9a-fA-F]{3,8}\b/
    const offenders = [...sourceFiles('components'), ...sourceFiles('app')].filter((f) => {
      const src = readFileSync(join(ROOT, f), 'utf8')
      if (palette.test(src)) return true
      return classNameChunks(src).some((chunk) => hex.test(chunk))
    })
    expect(offenders).toEqual([])
  })
})

describe('puerta de entrada', () => {
  it('las pantallas de auth llevan marca: wordmark y lavado de acento', () => {
    const layout = readFileSync(join(ROOT, 'app/(auth)/layout.tsx'), 'utf8')
    expect(layout).toContain('bg-acc-soft')
    expect(layout).toContain('appName')
    for (const page of ['app/(auth)/login/page.tsx', 'app/(auth)/register/page.tsx']) {
      const source = readFileSync(join(ROOT, page), 'utf8')
      expect(source, page).toContain('shadow-hero')
      expect(source, page).toContain('title-content')
    }
  })
})

describe('jerarquía y contraste de la interfaz', () => {
  // La sesión de cocina la reescribe entera la pista (c) de W6 (Tarea 13), que
  // le pone su .title-content; hasta que esa pista mergee, es la única
  // excepción de esta regla. La Tarea 13 vacía esta lista.
  const PENDING = ['components/cook/cook-session.tsx']

  it('ninguna cabecera se pinta a mano: todas usan .title-screen o .title-content', () => {
    const offenders = [...sourceFiles('components'), ...sourceFiles('app')]
      .filter((f) => !PENDING.includes(f))
      .filter((f) => {
        const source = readFileSync(join(ROOT, f), 'utf8')
        const index = source.indexOf('<h1')
        if (index === -1) return false
        const tag = source.slice(index, source.indexOf('>', index))
        return !tag.includes('title-screen') && !tag.includes('title-content')
      })
    expect(offenders).toEqual([])
  })

  it('el ámbar pequeño usa la tinta de aviso, no el ámbar crudo', () => {
    // text-warn sobre blanco es 2,97:1 y sobre --warn-soft 2,58:1: sirve para
    // bordes, iconos y fondos, no para leer. text-warn-ink da 5,44:1 y 4,74:1.
    const offenders = [...sourceFiles('components'), ...sourceFiles('app')].filter((f) =>
      /\btext-warn\b(?!-)/.test(readFileSync(join(ROOT, f), 'utf8')),
    )
    expect(offenders).toEqual([])
  })
})
