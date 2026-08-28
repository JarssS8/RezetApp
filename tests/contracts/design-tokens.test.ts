import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Contrato de tokens. Hace dos cosas que ningún otro test hace:
//
// 1) Paridad. `design-tokens.css` es el documento y `app/globals.css` es lo que
//    compila; AGENTS.md exige que digan lo mismo. Aquí se comprueba token a
//    token, no de oídas.
// 2) Contraste. Las mezclas de color viven en CSS (`color-mix`), donde nadie
//    puede medirlas. Este test las reproduce en TypeScript y calcula el ratio
//    WCAG de cada par que la interfaz pinta de verdad, para los OCHO acentos y
//    los DOS temas. Si alguien retoca un porcentaje "porque se ve mejor", el
//    test dice exactamente qué acento se quedó por debajo de 4,5:1.
//
// La aritmética de `color-mix(in srgb, A p%, B)` es una interpolación lineal en
// sRGB sin premultiplicar (los dos colores son opacos): mix(a, b, p) = a*p + b*(1-p).
const ROOT = join(import.meta.dirname, '..', '..')
const DOC = readFileSync(join(ROOT, 'design-tokens.css'), 'utf8')
const COMPILED = readFileSync(join(ROOT, 'app/globals.css'), 'utf8')

type Rgb = readonly [number, number, number]

function hex(value: string): Rgb {
  const h = value.replace('#', '')
  const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h
  return [0, 2, 4].map((i) => Number.parseInt(full.slice(i, i + 2), 16)) as unknown as Rgb
}

function mix(a: string, b: string, ratioA: number): Rgb {
  const [ar, ag, ab] = hex(a)
  const [br, bg, bb] = hex(b)
  return [ar * ratioA + br * (1 - ratioA), ag * ratioA + bg * (1 - ratioA), ab * ratioA + bb * (1 - ratioA)]
}

function luminance(c: Rgb): number {
  const [r, g, b] = c.map((v) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }) as unknown as Rgb
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function ratio(a: Rgb, b: Rgb): number {
  const [x, y] = [luminance(a) + 0.05, luminance(b) + 0.05]
  return Math.max(x, y) / Math.min(x, y)
}

// Los ocho acentos de docs/02-DISENO.md. Duplicarlos aquí es deliberado: si
// alguien cambia uno en el CSS sin actualizar esta lista, el primer test falla.
const ACCENTS = {
  huerta: '#2F9E6B',
  miel: '#D99A2B',
  tomate: '#CE5540',
  pistacho: '#7FA344',
  higo: '#B4557A',
  berenjena: '#8C5A9E',
  arandano: '#4A7FB5',
  canela: '#A9764A',
} as const

const LIGHT = { surf: '#FFFFFF', bg: '#FBFBFC', surf2: '#F2F5F3', text: '#161C1A', text2: '#485450', warn: '#D9803A' }
const DARK = { surf: '#1F1B16', bg: '#16130F', surf2: '#2A241D', text: '#F1EBE1', text2: '#BBB0A1', warn: '#E8A33D' }

// Mezclas espejo de las del CSS. Cambiar una aquí sin cambiarla allí hace
// fallar el test de paridad de abajo, que busca la cadena literal.
const accSoft = (acc: string, dark: boolean) => (dark ? mix(acc, DARK.bg, 0.17) : mix(acc, LIGHT.surf, 0.13))
const accInk = (acc: string, dark: boolean) => (dark ? mix(acc, DARK.text, 0.68) : mix(acc, '#0A2118', 0.6))
const warnInk = (dark: boolean) => (dark ? mix(DARK.warn, DARK.text, 0.85) : mix(LIGHT.warn, '#0A2118', 0.65))
const warnSoft = (dark: boolean) => (dark ? mix(DARK.warn, DARK.surf, 0.14) : mix(LIGHT.warn, LIGHT.surf, 0.14))

describe('tokens de diseño', () => {
  it('el documento y la hoja que compila declaran los mismos tokens de W6', () => {
    const shared = [
      '--acc-ink: color-mix(in srgb, var(--acc) 60%, #0A2118)',
      '--acc-line: color-mix(in srgb, var(--acc) 32%, var(--line))',
      '--acc-soft-2: color-mix(in srgb, var(--acc) 20%, var(--surf))',
      '--warn-ink: color-mix(in srgb, var(--warn) 65%, #0A2118)',
      '--surf-sunken: var(--surf-2)',
      '--line-2: color-mix(in srgb, var(--line) 55%, var(--surf))',
      '--fs-title: 1.875rem',
      '--fs-hero: 2.75rem',
      '--fs-num: 2rem',
      '--dur-1: 140ms',
      '--dur-2: 200ms',
      '--dur-3: 500ms',
      '--ease-out: cubic-bezier(.23, 1, .32, 1)',
      '--ease-in: cubic-bezier(.4, 0, 1, 1)',
      '--grad-food: linear-gradient(var(--grad-food-angle, 135deg), var(--acc-soft), var(--surf-2))',
    ]
    for (const token of shared) {
      expect(DOC, `design-tokens.css debe declarar ${token}`).toContain(token)
      expect(COMPILED, `app/globals.css debe declarar ${token}`).toContain(token)
    }
  })

  it('los tokens de tema oscuro se declaran dos veces en la hoja que compila', () => {
    // La media query y el [data-theme="dark"] explícito: el patrón que ya usan
    // todos los tokens de tema desde W0. Contar ocurrencias evita el fallo
    // clásico de arreglar solo una de las dos ramas.
    for (const token of ['--warn-ink: color-mix(in srgb, var(--warn) 85%, #F1EBE1)', '--line-2: var(--line)', '--acc-soft-2: color-mix(in srgb, var(--acc) 24%, var(--surf))']) {
      expect(COMPILED.split(token).length - 1, token).toBe(2)
    }
  })

  it('--acc-ink cumple AA sobre superficie, fondo, hundido y acento suave en los ocho acentos y los dos temas', () => {
    const failures: string[] = []
    for (const [name, acc] of Object.entries(ACCENTS)) {
      for (const dark of [false, true]) {
        const theme = dark ? DARK : LIGHT
        const ink = accInk(acc, dark)
        const pairs = {
          surf: hex(theme.surf),
          bg: hex(theme.bg),
          'surf-2': hex(theme.surf2),
          'acc-soft': accSoft(acc, dark),
        }
        for (const [where, bgColor] of Object.entries(pairs)) {
          const r = ratio(ink, bgColor)
          if (r < 4.5) failures.push(`${name}/${dark ? 'oscuro' : 'claro'} acc-ink sobre ${where}: ${r.toFixed(2)}:1`)
        }
      }
    }
    expect(failures).toEqual([])
  })

  it('--warn-ink cumple AA sobre superficie, fondo, hundido y el ámbar tenue en los dos temas', () => {
    const failures: string[] = []
    for (const dark of [false, true]) {
      const theme = dark ? DARK : LIGHT
      const ink = warnInk(dark)
      const pairs = { surf: hex(theme.surf), bg: hex(theme.bg), 'surf-2': hex(theme.surf2), 'warn-soft': warnSoft(dark) }
      for (const [where, bgColor] of Object.entries(pairs)) {
        const r = ratio(ink, bgColor)
        if (r < 4.5) failures.push(`${dark ? 'oscuro' : 'claro'} warn-ink sobre ${where}: ${r.toFixed(2)}:1`)
      }
    }
    expect(failures).toEqual([])
  })

  it('el texto corriente sigue siendo legible sobre el acento suave del hero', () => {
    for (const [name, acc] of Object.entries(ACCENTS)) {
      for (const dark of [false, true]) {
        const theme = dark ? DARK : LIGHT
        const soft = accSoft(acc, dark)
        expect(ratio(hex(theme.text), soft), `${name} texto/acc-soft`).toBeGreaterThanOrEqual(4.5)
        expect(ratio(hex(theme.text2), soft), `${name} texto-2/acc-soft`).toBeGreaterThanOrEqual(4.5)
      }
    }
  })

  it('el bloque --on-acc por acento sigue intacto en los dos ficheros', () => {
    // Lista "NO tocar" del informe de identidad: --on-acc depende del acento,
    // no del tema, y su cascada es frágil. Este test es el seguro.
    for (const line of [
      '[data-accent="huerta"]    { --acc: #2F9E6B; --on-acc: #12261C; }',
      '[data-accent="higo"]      { --acc: #B4557A; --on-acc: #FFFFFF; }',
      '[data-accent="canela"]    { --acc: #A9764A; --on-acc: #0A100D; }',
    ]) {
      expect(DOC).toContain(line)
      expect(COMPILED).toContain(line)
    }
  })
})

describe('utilidades de composición', () => {
  it('la hoja que compila define las seis clases de W6 en @layer components', () => {
    for (const cls of ['.title-screen', '.title-content', '.num-hero', '.num-lead', '.pill-selected', '.cn-toast']) {
      expect(COMPILED, `falta ${cls}`).toContain(`${cls} {`)
    }
  })

  it('las cifras protagonistas se pintan con la familia display, no con la monoespaciada', () => {
    // La incoherencia que W6 cierra: kcal-ring usaba .tabular (JetBrains Mono)
    // y nutrition-row font-display (Outfit) para el MISMO dato. La regla queda
    // escrita aquí y en docs/02-DISENO.md: Outfit para la cifra protagonista,
    // JetBrains Mono (.tabular) para las cifras en columna.
    const heroBlock = COMPILED.slice(COMPILED.indexOf('.num-hero {'), COMPILED.indexOf('.num-hero {') + 260)
    expect(heroBlock).toContain('var(--f-display)')
    expect(heroBlock).toContain('tabular-nums')
    expect(heroBlock).not.toContain('var(--f-mono)')
  })

  it('el toast tiene estilo propio: la clase que aplica sonner existe', () => {
    // components/ui/sonner.tsx:21 aplica `cn-toast` desde W0 y la clase no
    // estaba definida en ningún sitio: los toasts salían con el aspecto por
    // defecto de la librería, sombra dura incluida.
    expect(readFileSync(join(ROOT, 'components/ui/sonner.tsx'), 'utf8')).toContain('cn-toast')
    expect(COMPILED).toContain('.cn-toast {')
  })
})
