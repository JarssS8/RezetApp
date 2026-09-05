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

// Los ocho acentos de docs/02-DISENO.md. `huerta` es el único que cambia en
// esta fase (rediseño 2026-09): el resto sigue con su valor auditado en W6/W7,
// sin tocar.
const ACCENTS = {
  huerta: '#348357',
  miel: '#D99A2B',
  tomate: '#CE5540',
  pistacho: '#7FA344',
  higo: '#B4557A',
  berenjena: '#8C5A9E',
  arandano: '#4A7FB5',
  canela: '#A9764A',
} as const

// sRGB equivalente de los oklch() literales del handoff de rediseño
// (design_handoff_rezet_redesign/tokens.css §3), calculado una vez con las
// matrices estándar OKLab (Björn Ottosson) y fijado aquí a mano: color-mix
// en la app opera en sRGB (`in srgb`), así que la aritmética de contraste
// necesita el equivalente sRGB, no la cadena oklch() literal que sí lleva el
// CSS. --warn oscuro NO es el mismo oklch que el claro (decisión documentada
// en el plan de la Fase 1, Decisión 4): mismo croma/tono (0.12 68), L subido
// de 0.60 a 0.68 para que --warn-ink siga dando AA en oscuro.
const LIGHT = { surf: '#FFFFFF', bg: '#F8FAF6', surf2: '#F4F5F1', text: '#1A201B', text2: '#676E68', warn: '#AF711F', danger: '#C0392B' }
const DARK = { surf: '#1C201D', bg: '#101411', surf2: '#252925', text: '#EFF1EC', text2: '#9BA09A', warn: '#C9893D', danger: '#E06555' }

// Mezclas espejo de las del CSS. Cambiar una aquí sin cambiarla allí hace
// fallar el test de paridad de abajo, que busca la cadena literal.
const accSoft = (acc: string, dark: boolean) => (dark ? mix(acc, '#16130F', 0.17) : mix(acc, LIGHT.surf, 0.11))
// Anclas oscuras: la CSS real fija estos mixes a literales (#F1EBE1 para las
// tintas, #16130F —el --bg oscuro de antes de este rediseño— para
// --acc-soft), no a `var(--text)`/`var(--bg)` — así que el espejo tiene que
// usar los literales, no `DARK.text`/`DARK.bg` (que ahora valen `#EFF1EC`/
// `#101411`, distintos). Antes de este rediseño los valores coincidían por
// casualidad; `DARK.text`/`DARK.bg` siguen siendo los correctos en todo lo
// que sí lee `--text`/`--bg` de verdad (p. ej. "el texto corriente sigue
// siendo legible").
const accInk = (acc: string, dark: boolean) => (dark ? mix(acc, '#F1EBE1', 0.68) : mix(acc, '#0A2118', 0.6))
const warnInk = (dark: boolean) => (dark ? mix(DARK.warn, '#F1EBE1', 0.85) : mix(LIGHT.warn, '#0A2118', 0.65))
const warnSoft = (dark: boolean) => (dark ? mix(DARK.warn, DARK.surf, 0.14) : mix(LIGHT.warn, LIGHT.surf, 0.14))
// Auditoría W7, hallazgo 1.2: espejo de warnInk/warnSoft para --danger-ink.
const dangerInk = (dark: boolean) => (dark ? mix(DARK.danger, '#F1EBE1', 0.85) : mix(LIGHT.danger, '#0A2118', 0.72))
// Fondos reales de `destructive` (button.tsx/badge.tsx): reposo y hover, con
// las opacidades que quedaron tras el hallazgo 1.2 (oscuro bajado de /20-/30
// a /12-/16 porque ninguna tinta de texto razonable llegaba a 4,5:1 con la
// opacidad original).
const dangerBg = (dark: boolean, alpha: number) => (dark ? mix(DARK.danger, DARK.surf, alpha) : mix(LIGHT.danger, LIGHT.surf, alpha))

describe('tokens de diseño', () => {
  it('el documento y la hoja que compila declaran los mismos tokens de W6', () => {
    const shared = [
      '--acc-ink: color-mix(in srgb, var(--acc) 60%, #0A2118)',
      '--acc-line: color-mix(in srgb, var(--acc) 32%, var(--line))',
      '--acc-soft-2: color-mix(in srgb, var(--acc) 20%, var(--surf))',
      '--warn-ink: color-mix(in srgb, var(--warn) 65%, #0A2118)',
      '--danger-ink: color-mix(in srgb, var(--danger) 72%, #0A2118)',
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
      '@keyframes fadein  { from{opacity:0} to{opacity:1} }',
      '@keyframes rise    { from{opacity:0;transform:translateY(14px) scale(.985)} to{opacity:1;transform:none} }',
      '@keyframes pushin  { from{opacity:.4;transform:translateX(26px)} to{opacity:1;transform:none} }',
      '@keyframes toastin { from{opacity:0;transform:translateY(18px) scale(.96)} to{opacity:1;transform:none} }',
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
    for (const token of ['--warn-ink: color-mix(in srgb, var(--warn) 85%, #F1EBE1)', '--danger-ink: color-mix(in srgb, var(--danger) 85%, #F1EBE1)', '--line-2: var(--line)', '--acc-soft-2: color-mix(in srgb, var(--acc) 24%, var(--surf))']) {
      expect(COMPILED.split(token).length - 1, token).toBe(2)
    }
  })

  // `acc-soft-2` queda fuera de estos pares a propósito: hasta W6 `.pill-selected:hover`
  // pintaba `acc-ink` (texto) sobre `acc-soft-2` (fondo) y ese par suspendía AA en
  // miel claro (4,35:1) y berenjena oscuro (4,46:1). El hover ahora solo cambia
  // `border-color` a `--acc` (app/globals.css, design-tokens.css), así que ya no hay
  // ningún sitio de la interfaz que pinte texto sobre `acc-soft-2`. El token se queda
  // declarado (documentado más arriba) por si un futuro estado de dos niveles lo
  // necesita, pero no entra en el contrato de contraste mientras nada lo use como fondo.
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

  // Auditoría W7, hallazgo 1.2. Igual que warn-ink, más los fondos reales de
  // `destructive` (button.tsx/badge.tsx) en sus dos estados: si alguien vuelve
  // a subir la opacidad oscura a /20-/30 sin revisar este test, aquí revienta.
  it('--danger-ink cumple AA sobre superficie, fondo, hundido y los fondos de destructive en los dos temas', () => {
    const failures: string[] = []
    for (const dark of [false, true]) {
      const theme = dark ? DARK : LIGHT
      const ink = dangerInk(dark)
      const pairs = {
        surf: hex(theme.surf),
        bg: hex(theme.bg),
        'surf-2': hex(theme.surf2),
        'destructive-reposo': dangerBg(dark, dark ? 0.12 : 0.1),
        'destructive-hover': dangerBg(dark, dark ? 0.16 : 0.2),
      }
      for (const [where, bgColor] of Object.entries(pairs)) {
        const r = ratio(ink, bgColor)
        if (r < 4.5) failures.push(`${dark ? 'oscuro' : 'claro'} danger-ink sobre ${where}: ${r.toFixed(2)}:1`)
      }
    }
    expect(failures).toEqual([])
  })

  // Auditoría W7, hallazgo 1.3: el borde del campo (--input) es su única
  // frontera visible (no tiene fondo propio) y WCAG 1.4.11 exige 3:1 para el
  // límite de un control. `--input` no está en design-tokens.css (es mapeo
  // shadcn, solo vive en app/globals.css), así que este test lee directamente
  // COMPILED en vez de comparar contra DOC.
  it('--input cumple 3:1 sobre --surf en los dos temas', () => {
    const inputColor = (dark: boolean) => (dark ? mix(DARK.text2, DARK.surf, 0.75) : mix(LIGHT.text2, LIGHT.surf, 0.75))
    expect(COMPILED, '--input debe mezclar --text-2 sobre --surf').toContain(
      '--input: color-mix(in srgb, var(--text-2) 75%, var(--surf))'
    )
    for (const dark of [false, true]) {
      const theme = dark ? DARK : LIGHT
      const r = ratio(inputColor(dark), hex(theme.surf))
      expect(r, `${dark ? 'oscuro' : 'claro'} --input sobre --surf`).toBeGreaterThanOrEqual(3)
    }
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
      '[data-accent="huerta"]    { --acc: oklch(0.55 0.105 156); --on-acc: #FFFFFF; } /* 4.64:1 */',
      '[data-accent="higo"]      { --acc: #B4557A; --on-acc: #FFFFFF; } /* 4.6:1 */',
      '[data-accent="canela"]    { --acc: #A9764A; --on-acc: #0A100D; } /* 4.9:1 */',
    ]) {
      expect(DOC).toContain(line)
      expect(COMPILED).toContain(line)
    }
  })
})

describe('utilidades de composición', () => {
  it('la hoja que compila define las cinco clases de W6 que siguen en @layer components', () => {
    for (const cls of ['.title-screen', '.title-content', '.num-hero', '.num-lead', '.cn-toast']) {
      expect(COMPILED, `falta ${cls}`).toContain(`${cls} {`)
    }
  })

  it('pill-selected vive en la capa utilities de Tailwind, no en components', () => {
    // Fix del informe de Tarea 5: Tailwind v4 fija el orden de capas
    // `theme, base, components, utilities` y una capa posterior gana SIEMPRE a
    // una anterior sobre la misma propiedad, sin importar el orden de las
    // clases en el JSX. Con la píldora en `components`, un botón
    // `variant="outline"` (bg-background/border-border de `utilities`) se
    // comía su fondo y su borde. Declarada con `@utility` entra en la capa
    // `utilities` y compite en igualdad de condiciones. Ver comentario junto
    // a la declaración en app/globals.css y en design-tokens.css.
    expect(COMPILED, 'pill-selected debe declararse con @utility').toContain('@utility pill-selected {')
    expect(COMPILED, 'pill-selected no debe quedar en @layer components').not.toContain('.pill-selected {')
    // design-tokens.css no pasa por el compilador de Tailwind: ahí se queda
    // como clase plana de referencia, documentando por qué difiere.
    expect(DOC, 'design-tokens.css sigue documentando la clase plana').toContain('.pill-selected {')
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
