# Rezet — Rediseño, Fase 1: Fundamentos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sentar la base no visual/estructural del rediseño de `design_handoff_rezet_redesign/`: exponente de escalado, paleta de color con su contrato AA, tipografía de sistema, los cuatro keyframes de movimiento base, el integrador de muelle (`motion.js` portado), y la barra de navegación reducida a 4 pestañas. Ninguna pantalla se reconstruye todavía — eso son fases 2+.

**Architecture:** Cada tarea es un cambio autocontenido con su propio test, aplicado directamente sobre los ficheros existentes (no hay reescritura de componentes de pantalla en esta fase). Los tokens de color y sombra se editan en paralelo en `design-tokens.css` (documento pegable) y `app/globals.css` (lo que compila), porque `tests/contracts/design-tokens.test.ts` exige paridad literal entre ambos. El exponente de escalado y la navegación tocan lib/domain y componentes ya existentes sin crear ninguno nuevo. El muelle es la única pieza nueva de verdad: `lib/motion/spring.ts`.

**Tech Stack:** TypeScript, Vitest (proyecto `unit` para `lib/`, proyecto `ui` para `.test.tsx`), Tailwind v4 (`@theme inline`, `color-mix()`), Next.js 16 App Router, next-intl.

**Spec:** `design_handoff_rezet_redesign/README.md` (seguido de `design_handoff_rezet_redesign/tokens.css` y `design_handoff_rezet_redesign/motion.js`, las dos excepciones que se copian casi literales). Decisiones ya cerradas con el usuario antes de escribir este plan:
- 4 pestañas (Hoy·Recetas·Plan·Despensa); Cocinar sale de la barra y se lanza desde Hoy/receta (ya existen esos enlaces: `components/today/today-view.tsx:96` y `components/recipes/recipe-detail.tsx:199`).
- Exponente de escalado no lineal: **0.55** (no 0.65).
- El sistema de tokens de color se sustituye por el del handoff.

## Global Constraints

- `lib/domain` sigue puro (sin React/Next/HTTP) — la Tarea 1 no lo rompe.
- `pnpm check` (typecheck + lint + i18n + tests + cobertura 100% de `lib/domain`) tiene que quedar verde al final de cada tarea, no solo al final del plan.
- `design-tokens.css` y `app/globals.css` tienen que decir lo mismo en todo lo que `tests/contracts/design-tokens.test.ts` compara literalmente — es el propio test el que lo hace cumplir.
- Cualquier tinta de texto (`--acc-ink`, `--warn-ink`, `--on-acc`, texto sobre `--acc-soft`) tiene que dar ≥4.5:1 (AA, WCAG 1.4.3) en TODOS los acentos y los DOS temas — este plan solo toca el acento por defecto (`huerta`) y dos porcentajes compartidos; los otros 7 acentos no se tocan y deben seguir pasando.
- Identificadores en inglés, comentarios en español (AGENTS.md). Commits en español, imperativo, cortos, sin trailers de IA.
- No se toca ninguna pantalla, ningún primitivo visual (`Button`, `Card`, `Sheet`...) ni el conjunto de 8 acentos en esta fase — eso es la Fase 2 y sucesivas.

---

## Decisiones de alcance tomadas al escribir este plan (léelas antes de dudar)

1. **El acento `huerta` (verde por defecto) se ajusta de L=0.575 a L=0.55** manteniendo croma/tono (`0.105 156`) del handoff. Con el valor literal del handoff, ni blanco ni un negro-verdoso pasan 4.5:1 como texto sobre el botón de acento sólido (blanco da 4.16:1, `#0A2118` da 4.06:1) — es un hueco de AA real en el prototipo, no una interpretación. Con L=0.55 el blanco da 4.64:1. Croma y tono (el "verde" en sí) no se tocan; documentado con la aritmética exacta en la Tarea 2.
2. **`--acc-soft` en claro baja de 13% a 12%** (mezcla compartida por los 8 acentos). Con el verde nuevo, el texto secundario (`--text-2`) sobre `--acc-soft` daba 4.45:1 a 13%; a 12% da 4.51:1. Bajar el porcentaje de acento SIEMPRE sube el contraste (el fondo se acerca más a blanco), así que es una dirección segura para los otros 7 acentos, no solo para huerta — aun así, la Tarea 2 corre el contrato completo para confirmarlo, no lo da por supuesto.
3. **`--danger`/`--danger-ink` NO se tocan.** El handoff no define un rojo de peligro — todo lo destructivo en el prototipo usa `--warn` (ámbar). Fusionar "destructivo" en `--warn` tocaría `button.tsx`/`badge.tsx` y su propio contrato AA (los pesos de opacidad 10/12/16/20% están tunados para el rojo actual, no para ámbar) — es trabajo de una fase donde esos componentes se reconstruyan, no de esta.
4. **`--warn` en oscuro NO usa el mismo valor que en claro**, aunque el handoff solo da un valor. El handoff usa `--warn` casi siempre como borde/icono (3:1) o en textos cortos; esta app ya lo usa como texto (`--warn-ink`) sobre superficies y como fondo de `destructive` a varias opacidades, y el valor plano del handoff no llega a 4.5:1 en esos casos en oscuro. Se deriva un valor más claro para oscuro con el MISMO croma/tono del handoff (`0.12 68`), subiendo solo L de 0.60 a 0.68 — el mismo criterio que YA aplicaba el token actual (`#D9803A` claro → `#E8A33D` oscuro, más claro para fondos oscuros). Aritmética exacta en la Tarea 2.
5. **Los otros 7 acentos (miel/tomate/pistacho/higo/berenjena/arandano/canela) no se tocan.** El handoff solo define 4 acentos (green/amber/coral/blue); reducir el conjunto de 8 a 4 implica renombrar ids que usan `lib/prefs.ts`, el esquema zod, el selector de Ajustes y los e2e — es trabajo de la fase de Ajustes, no de tokens puros. Aquí solo se actualiza el valor del acento por defecto y la paleta base compartida (fondo/superficie/texto/línea/ámbar).
6. **Radios (`--r-*`) no se tocan.** El handoff pide una escala de ~10 radios distintos por componente (26/24/22/20/18/16/15/14/12–13/9–10/7/99px) contra los 3 actuales; consumirlos implica tocar cada primitivo — Fase 2 (primitivos).
7. **La barra lateral ≥900px NO se construye en esta fase.** Hoy no existe ningún layout de escritorio (`grep` de `matchMedia`/`ResizeObserver` en el repo no encuentra nada salvo el listener de tema oscuro). Construirla a ciegas antes de fijar los anchos de columna por pantalla (que dependen de pantallas aún no reconstruidas) es prematuro — Fase 2 (shell).

---

### Task 1: Escalado no lineal — exponente 0.55

**Files:**
- Modify: `lib/domain/scaling.ts`
- Modify: `lib/domain/scaling.test.ts`
- Modify: `lib/domain/shopping.test.ts:58-61`
- Modify: `AGENTS.md` (sección "Reglas de dominio críticas")
- Modify: `docs/03-DOMINIO.md:15`

**Interfaces:**
- Consumes: nada nuevo.
- Produces: `DAMP = 0.55` en `lib/domain/scaling.ts` — todo lo que ya usa `scaleQuantity`/`scaleIngredient`/`scaleRecipe` (incluido `lib/domain/shopping.ts:35`) lo hereda sin cambiar su propia firma.

- [ ] **Step 1: Actualizar los tests de `scaling.test.ts` con los valores exactos del nuevo exponente**

Sustituye el bloque `describe('scaleQuantity', ...)` completo:

```ts
describe('scaleQuantity', () => {
  it('lineal multiplica', () => expect(scaleQuantity(100, 2, true)).toBe(200))
  it('no lineal amortigua con ratio^0.55', () => expect(scaleQuantity(10, 2, false)).toBeCloseTo(14.64, 2))
  it('ratio 1 no cambia nada', () => {
    expect(scaleQuantity(7, 1, false)).toBe(7)
    expect(scaleQuantity(7, 1, true)).toBe(7)
  })
  it('reducir también amortigua', () => expect(scaleQuantity(10, 0.5, false)).toBeCloseTo(6.83, 2))
})
```

Y dentro de `describe('scaleIngredient', ...)`, el primer `it`:

```ts
  it('escala base y display con la misma regla', () => {
    const r = scaleIngredient(ing({ quantity: 15, unit: 'ml', displayQuantity: 1, displayUnit: 'tbsp', scalesLinearly: false }), 2)
    expect(r.quantity).toBeCloseTo(21.96, 2)
    expect(r.displayQuantity).toBeCloseTo(1.46, 2)
  })
```

Y dentro de `describe('scaleRecipe', ...)`, la línea del ingrediente no lineal:

```ts
    expect(r.ingredients[1]?.quantity).toBeCloseTo(6.25, 2)
```

- [ ] **Step 2: Correr los tests y comprobar que fallan con el exponente actual (0.65)**

Run: `pnpm test -- lib/domain/scaling.test.ts`
Expected: FAIL — los `toBeCloseTo` no casan porque `DAMP` sigue en 0.65 (p. ej. `scaleQuantity(10,2,false)` da 15.69, no 14.64).

- [ ] **Step 3: Cambiar el exponente en `lib/domain/scaling.ts`**

```ts
// Exponente de amortiguación: duplicar la sal arruina el plato. 0.55, no 0.65
// (handoff de rediseño 2026-09, design_handoff_rezet_redesign/README.md §5.1):
// el prototipo lo fija en factor^0.55 y "los valores... son literales, no
// aproximaciones" (README §0). Recalculado en scaling.test.ts y
// shopping.test.ts.
export const DAMP = 0.55
```

- [ ] **Step 4: Actualizar `lib/domain/shopping.test.ts`**

En el test `'no lineal se escala amortiguado'` (línea ~58-61):

```ts
  it('no lineal se escala amortiguado', () => {
    const lines = consolidateNeeds([entry({ servings: 4 }, [ing({ foodId: 'sal', foodName: 'Sal', quantity: 10, scalesLinearly: false })])], [])
    expect(lines[0]?.quantity).toBeCloseTo(14.64, 2)
  })
```

- [ ] **Step 5: Correr todos los tests de dominio y confirmar que pasan**

Run: `pnpm test -- lib/domain`
Expected: PASS — todos los tests de `lib/domain/**` en verde, incluidos `scaling.test.ts`, `shopping.test.ts` y `nutrition.test.ts` (este último no depende del exponente: su ingrediente no lineal usa `kcal100g: 0`, así que el invariante "escalar no cambia las kcal por ración" sigue intacto sin tocarlo).

- [ ] **Step 6: Actualizar `AGENTS.md`**

Busca en la sección "## Reglas de dominio críticas":

```
- **Escalado no lineal.** Los ingredientes tienen un flag `scales_linearly`. Sal,
  especias, levadura y alcohol se ajustan con `ratio^0.65`, no se multiplican.
  La UI lo marca en ámbar. Duplicar la sal arruina el plato.
```

Cámbialo a:

```
- **Escalado no lineal.** Los ingredientes tienen un flag `scales_linearly`. Sal,
  especias, levadura y alcohol se ajustan con `ratio^0.55`, no se multiplican.
  La UI lo marca en ámbar. Duplicar la sal arruina el plato.
```

- [ ] **Step 7: Actualizar `docs/03-DOMINIO.md:15`**

```ts
const DAMP = 0.55
```

- [ ] **Step 8: Correr `pnpm check` completo**

Run: `pnpm check`
Expected: PASS (typecheck + lint + i18n + tests + cobertura 100% de `lib/domain`).

- [ ] **Step 9: Commit**

```bash
git add lib/domain/scaling.ts lib/domain/scaling.test.ts lib/domain/shopping.test.ts AGENTS.md docs/03-DOMINIO.md
git commit -m "Baja el exponente de amortiguación del escalado a 0.55"
```

---

### Task 2: Paleta base, sombras y contrato AA

**Files:**
- Modify: `design-tokens.css`
- Modify: `app/globals.css`
- Modify: `tests/contracts/design-tokens.test.ts`

**Interfaces:**
- Consumes: ninguna de las tareas anteriores.
- Produces: valores nuevos para `--bg`, `--surf-2`, `--text`, `--text-2`, `--line`, `--warn` (claro y oscuro), acento `huerta` (`--acc`/`--on-acc`), `--sh-card`/`--sh-raised`/`--sh-hero`, y dos tokens nuevos declarados-pero-no-consumidos-todavía: `--bg-2` y `--glass` (los consume la Fase 2, shell). Todo lo que ya lee estos nombres (`bg-background`, `bg-card`, `text-foreground`, `text-text-2`, `border-border`, `shadow-card`, etc., vía `@theme inline`) seguirá funcionando sin tocar ningún componente — solo cambia el valor resuelto.

**Contexto para quien implemente esto (no hace falta rehacer la aritmética, ya está hecha):**

Conversión oklch→sRGB de los valores literales del handoff (matrices estándar OKLab de Björn Ottosson), usadas abajo para editar el CSS y para reescribir el motor de contraste del test:

| Token | oklch (handoff) | sRGB |
|---|---|---|
| `--bg` claro | `oklch(0.982 0.005 120)` | `#F8FAF6` |
| `--bg-2` claro | `oklch(0.955 0.007 120)` | `#EFF1EC` |
| `--surf-2` claro | `oklch(0.968 0.006 120)` | `#F4F5F1` |
| `--text` claro | `oklch(0.235 0.012 150)` | `#1A201B` |
| `--text-2` claro | `oklch(0.53 0.012 150)` | `#676E68` |
| `--line` claro | `oklch(0.905 0.008 150)` | `#DCE1DD` |
| `--warn` claro | `oklch(0.60 0.12 68)` | `#AF711F` |
| `--bg` oscuro | `oklch(0.185 0.008 150)` | `#101411` |
| `--bg-2` oscuro | `oklch(0.16 0.008 150)` | `#0B0E0B` |
| `--surf` oscuro | `oklch(0.238 0.009 150)` | `#1C201D` |
| `--surf-2` oscuro | `oklch(0.275 0.009 150)` | `#252925` |
| `--text` oscuro | `oklch(0.955 0.006 120)` | `#EFF1EC` |
| `--text-2` oscuro | `oklch(0.70 0.011 140)` | `#9BA09A` |
| `--line` oscuro | `oklch(0.325 0.010 150)` | `#313631` |
| `--warn` oscuro (derivado, ver Decisión 4) | `oklch(0.68 0.12 68)` | `#C9893D` |
| `--acc` huerta (ajustado, ver Decisión 1) | `oklch(0.55 0.105 156)` | `#348357` |

- [ ] **Step 1: Reescribir el motor de contraste de `tests/contracts/design-tokens.test.ts` con la paleta nueva**

Sustituye las constantes `LIGHT`, `DARK` y la entrada `huerta` de `ACCENTS` (líneas 46-64 aproximadamente):

```ts
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
```

(El resto del fichero —`mix`, `luminance`, `ratio`, `accSoft`, `accInk`, `warnInk`, `warnSoft`, `dangerInk`, `dangerBg`, y todos los `it(...)`— no cambia: siguen siendo `color-mix(in srgb, ...)` sobre los mismos anchors literales `#0A2118`/`#FFFFFF`, así que las fórmulas no se tocan, solo los datos de entrada de arriba.)

Ahora actualiza el test de `--acc-soft` a 13%→12% en claro (línea ~67):

```ts
const accSoft = (acc: string, dark: boolean) => (dark ? mix(acc, DARK.bg, 0.17) : mix(acc, LIGHT.surf, 0.12))
```

Y el test de "no tocar" de `--on-acc` (líneas 207-218): la entrada de `huerta` cambia de formato (ahora es `oklch()`, no hex), de valor de tinta (blanco, no `#12261C`) y de ratio en el comentario — OJO, el comentario `/* X:1 */` forma parte de la cadena que compara `toContain`, así que `higo`/`canela` tienen que quedarse CON su comentario tal cual estaba, no solo con el valor:

```ts
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
```

- [ ] **Step 2: Correr el contrato de tokens y confirmar que falla (los CSS todavía no cambiaron)**

Run: `pnpm test -- tests/contracts/design-tokens.test.ts`
Expected: FAIL — el test de paridad y el de `--on-acc` fallan porque `design-tokens.css`/`app/globals.css` siguen con los valores viejos.

- [ ] **Step 3: Editar `design-tokens.css` — bloque `:root` (tema claro)**

Sustituye el bloque completo de superficies/texto/línea/acento/warn (desde `--acc:` hasta `color-scheme: light;` inclusive), dejando intactas las líneas de `--danger`, `--acc-soft`/`--acc-ink`/etc. (fórmulas, no valores) salvo el porcentaje de `--acc-soft`:

```css
:root {
  /* Acento — el usuario puede cambiarlo entre los ocho de abajo */
  --acc: oklch(0.55 0.105 156);

  /* Superficies y texto — paleta del rediseño 2026-09
     (design_handoff_rezet_redesign/tokens.css §3), literal salvo --acc (ver
     docs/superpowers/plans/2026-09-05-rezet-redesign-fundamentos.md, Decisión 1). */
  --bg:      oklch(0.982 0.005 120);
  --bg-2:    oklch(0.955 0.007 120); /* fondo de la barra lateral, Fase 2 */
  --surf:    #FFFFFF;
  --surf-2:  oklch(0.968 0.006 120);
  --line:    oklch(0.905 0.008 150);
  --text:    oklch(0.235 0.012 150);
  --text-2:  oklch(0.53 0.012 150);
  --muted:   #8A9691;
  --warn:    oklch(0.60 0.12 68);
  --danger:  #C0392B;
  --glass:   rgba(255, 255, 255, .72); /* cabeceras/barras translúcidas, Fase 2 */

  /* Derivados — nunca los escribas a ojo */
  --acc-soft: color-mix(in srgb, var(--acc) 12%, #FFFFFF);
```

(a partir de aquí, deja el resto del bloque de derivados —`--acc-ink`, `--acc-line`, `--acc-soft-2`, `--on-acc`, `--warn-ink`, `--danger-ink`, `--surf-sunken`, `--line-2`— EXACTAMENTE igual que está: mismas fórmulas, mismos anchors, mismos porcentajes salvo el `12%` de arriba. Deja también `--r-lg/md/sm`, `--sh-*` que edita el Step 5, y `color-scheme: light;` al final del bloque `:root`.)

- [ ] **Step 4: Editar `design-tokens.css` — bloque oscuro (media query y `[data-theme="dark"]`)**

Ambos bloques oscuros de `design-tokens.css` (el de `@media (prefers-color-scheme: dark)` y el de `:root[data-theme="dark"]`) llevan el mismo contenido; en los dos, sustituye la línea de superficies/texto/línea/warn:

```css
    --bg:     oklch(0.185 0.008 150);
    --bg-2:   oklch(0.16 0.008 150);
    --surf:   oklch(0.238 0.009 150);
    --surf-2: oklch(0.275 0.009 150);
    --line:   oklch(0.325 0.010 150);
    --text:   oklch(0.955 0.006 120);
    --text-2: oklch(0.70 0.011 140);
    --muted:  #8B8175;
    --warn:   oklch(0.68 0.12 68); /* NO el mismo oklch que en claro, ver Decisión 4 del plan */
    --danger: #E06555;
    --glass:  rgba(30, 34, 30, .68);
```

(El resto de cada bloque —`--acc-soft`, `--acc-ink`, `--acc-line`, `--acc-soft-2`, `--warn-ink`, `--danger-ink`, `--surf-sunken`, `--line-2`, `--on-acc`, `--sh-*`— no cambia: son fórmulas o valores que no dependen de esta edición, salvo `--sh-*` que edita el Step 5.)

- [ ] **Step 5: Editar las sombras en `design-tokens.css` (los tres bloques: claro, media oscuro, `[data-theme="dark"]`)**

Claro:
```css
  --sh-card:   0 1px 2px rgba(30, 40, 30, .05);
  --sh-raised: 0 1px 2px rgba(30, 40, 30, .05), 0 8px 24px rgba(25, 40, 25, .07);
  --sh-hero:   0 2px 6px rgba(20, 35, 20, .08), 0 24px 60px rgba(20, 35, 20, .14);
```

Oscuro (los dos bloques):
```css
    --sh-card:   0 1px 2px rgba(0, 0, 0, .28);
    --sh-raised: 0 1px 2px rgba(0, 0, 0, .3), 0 12px 32px rgba(0, 0, 0, .34);
    --sh-hero:   0 2px 8px rgba(0, 0, 0, .36), 0 28px 64px rgba(0, 0, 0, .5);
```

- [ ] **Step 6: Editar el acento `huerta` en `design-tokens.css`**

```css
:root[data-accent="huerta"],    [data-accent="huerta"]    { --acc: oklch(0.55 0.105 156); --on-acc: #FFFFFF; } /* 4.64:1 */
```

- [ ] **Step 7: Repetir los Steps 3-6 en `app/globals.css`**

Mismos cambios, en las mismas cinco ubicaciones (bloque `:root` de tokens, bloque `@media (prefers-color-scheme: dark)`, bloque `:root[data-theme="dark"]`, las tres declaraciones de sombra, y la línea de `huerta` en el bloque de acentos). El bloque `@theme inline` de `app/globals.css` NO se toca — sigue mapeando `--color-background: var(--background)` etc., y `--background`/`--foreground`/... siguen apuntando a `var(--bg)`/`var(--text)`/etc. sin cambiar, así que hereda los valores nuevos automáticamente.

- [ ] **Step 8: Correr el contrato de tokens y confirmar que pasa**

Run: `pnpm test -- tests/contracts/design-tokens.test.ts`
Expected: PASS — incluida `'--acc-ink cumple AA... en los ocho acentos'`, `'--warn-ink cumple AA...'`, `'el texto corriente sigue siendo legible sobre el acento suave del hero'` y el test de paridad documento/compilado. Si algo falla fuera de lo que este plan predijo, NO bajes el umbral del test — para y revisa la aritmética (la tabla del Step 0 de esta tarea) antes de tocar cualquier porcentaje.

- [ ] **Step 9: Correr `pnpm check` completo**

Run: `pnpm check`
Expected: PASS.

- [ ] **Step 10: Comprobar visualmente los dos temas y el acento por defecto**

Run: `pnpm dev` (necesita `docker compose up -d db` si no está ya arriba), abre `/today` con el tema en `system`/`light`/`dark` y confirma que el verde por defecto, el fondo y el ámbar se ven coherentes y no rotos (esto no sustituye al test de AA, es una comprobación de que no hay un error de sintaxis CSS que el test no vería, p. ej. una `oklch()` mal cerrada).

- [ ] **Step 11: Commit**

```bash
git add design-tokens.css app/globals.css tests/contracts/design-tokens.test.ts
git commit -m "Sustituye la paleta base por la del rediseño y ajusta el verde por defecto para AA"
```

---

### Task 3: Tipografía de sistema (sin webfonts)

**Files:**
- Modify: `app/layout.tsx`
- Modify: `design-tokens.css`
- Modify: `app/globals.css`
- Modify: `AGENTS.md` (sección "Incoherencias entre docs, resueltas")
- Modify: `docs/02-DISENO.md`

**Interfaces:**
- Consumes: nada de las tareas anteriores.
- Produces: `--f-display`/`--f-body`/`--f-mono` con nuevo valor (los nombres de variable no cambian, así que `.title-screen`, `.num-hero`, `.tabular`, etc. no necesitan tocarse).

- [ ] **Step 1: Quitar la carga de Outfit/DM Sans/JetBrains Mono en `app/layout.tsx`**

Quita el import de `next/font/google` y las tres constantes, y el `className` del `<html>`:

```tsx
import type { Metadata, Viewport } from 'next'
import { NuqsAdapter } from 'nuqs/adapters/next/app'
import { Suspense } from 'react'
import { IntlShell } from '@/components/i18n/intl-shell'
import { RegisterServiceWorker } from '@/components/pwa/register-sw'
import { DEFAULT_PREFS, PREFS_BOOT_SCRIPT } from '@/lib/prefs'
import './globals.css'
```

Y el `<html>`:

```tsx
    <html
      lang={DEFAULT_PREFS.locale}
      data-accent={DEFAULT_PREFS.accent}
      suppressHydrationWarning
    >
```

(Quita también el comentario que documenta `outfit.variable`/`dmSans.variable`/`mono.variable` si queda huérfano; el resto del fichero —metadata, viewport, `PREFS_BOOT_SCRIPT`, `NuqsAdapter`, `IntlShell`— no cambia.)

- [ ] **Step 2: Cambiar los tres tokens de fuente en `design-tokens.css`**

```css
  /* Fuente del sistema — sin webfonts (handoff de rediseño 2026-09,
     design_handoff_rezet_redesign/README.md §3 y §9). */
  --f-display: -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, "Helvetica Neue", Helvetica, sans-serif;
  --f-body:    -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, "Helvetica Neue", Helvetica, sans-serif;
  --f-mono:    ui-monospace, SFMono-Regular, Menlo, monospace;
```

- [ ] **Step 3: Mismo cambio en `app/globals.css`**

Sustituye:
```css
  --f-display: var(--font-outfit), "Helvetica Neue", system-ui, sans-serif;
  --f-body: var(--font-dm-sans), "Segoe UI", system-ui, sans-serif;
  --f-mono: var(--font-jetbrains-mono), ui-monospace, Menlo, monospace;
```
por:
```css
  --f-display: -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, "Helvetica Neue", Helvetica, sans-serif;
  --f-body: -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, "Helvetica Neue", Helvetica, sans-serif;
  --f-mono: ui-monospace, SFMono-Regular, Menlo, monospace;
```

- [ ] **Step 4: Correr el contrato de tokens**

Run: `pnpm test -- tests/contracts/design-tokens.test.ts`
Expected: PASS — el test `'las cifras protagonistas se pintan con la familia display, no con la monoespaciada'` sigue pasando porque sigue comprobando `var(--f-display)` / `var(--f-mono)` por nombre, no por valor.

- [ ] **Step 5: Quitar las dependencias de Google Fonts si `next/font/google` ya no se usa en ningún otro fichero**

Run: `grep -rn "next/font/google" app/ components/ --include="*.tsx"`
Expected: sin resultados (si aparece algo, esta tarea no toca ese fichero — solo confirma que `app/layout.tsx` era el único consumidor).

- [ ] **Step 6: Actualizar `AGENTS.md`**

Busca en "## Incoherencias entre docs, resueltas":

```
- **Cifras**: Outfit para la cifra protagonista, JetBrains Mono para las
  cifras en columna (manda `docs/02-DISENO.md` desde W6).
```

Cámbialo a:

```
- **Cifras**: fuente de sistema para todo (rediseño 2026-09, sin webfonts) —
  `--f-display` para la cifra protagonista con `tabular-nums`, `--f-mono`
  (monoespaciada de sistema) para las cifras en columna. Manda
  `docs/02-DISENO.md`.
```

- [ ] **Step 7: Actualizar `docs/02-DISENO.md`**

Busca la tabla de "## Tipografía" (líneas ~24-33) y sustitúyela por:

```markdown
## Tipografía

Fuente de sistema, sin webfonts (rediseño 2026-09):
`-apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, "Helvetica Neue", Helvetica, sans-serif`.

| Rol | Fuente | Dónde |
|---|---|---|
| Títulos y cifra protagonista | Sistema, 600/700 | Cabeceras de pantalla (`.title-screen`), títulos de contenido (`.title-content`) y la cifra protagonista (`.num-hero`, `.num-lead`) |
| Interfaz | Sistema, 400/500/600/700 | Todo el texto corriente |
| Datos en columna | Monoespaciada de sistema (`ui-monospace, SFMono-Regular, Menlo, monospace`) | Cifras **en columna**: cantidades, fechas, tablas, totales pequeños (`.tabular`) |

La cifra protagonista va con `tabular-nums`, no en monoespaciada: un número
grande se lee como dato de producto, no como panel de control.
```

- [ ] **Step 8: Correr `pnpm check` completo**

Run: `pnpm check`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add app/layout.tsx design-tokens.css app/globals.css AGENTS.md docs/02-DISENO.md
git commit -m "Cambia a fuente de sistema y quita los webfonts"
```

---

### Task 4: Movimiento base — los cuatro keyframes del handoff

**Files:**
- Modify: `design-tokens.css`
- Modify: `app/globals.css`
- Modify: `tests/contracts/design-tokens.test.ts`

**Interfaces:**
- Consumes: nada de las tareas anteriores.
- Produces: cuatro `@keyframes` nuevos (`fadein`, `rise`, `pushin`, `toastin`) declarados en ambos ficheros, sin ninguna clase que los invoque todavía — las pantallas de fases posteriores los consumirán con sus propios `animation:` inline o utilidades, con las duraciones literales de la §6.2 del handoff (que no son las de `--dur-1..4`: el handoff usa duraciones fijas por elemento, no tokenizadas). No se tocan `view-enter`, `stagger-in` ni `icon-pop` — siguen en uso por las pantallas actuales hasta que se reconstruyan.

- [ ] **Step 1: Añadir el test de paridad de los cuatro keyframes**

En `tests/contracts/design-tokens.test.ts`, añade estas cuatro cadenas al array `shared` del primer `it` de `describe('tokens de diseño', ...)` (junto a `'--acc-ink: color-mix(...)'` etc.):

```ts
      '@keyframes fadein  { from{opacity:0} to{opacity:1} }',
      '@keyframes rise    { from{opacity:0;transform:translateY(14px) scale(.985)} to{opacity:1;transform:none} }',
      '@keyframes pushin  { from{opacity:.4;transform:translateX(26px)} to{opacity:1;transform:none} }',
      '@keyframes toastin { from{opacity:0;transform:translateY(18px) scale(.96)} to{opacity:1;transform:none} }',
```

- [ ] **Step 2: Correr el test y confirmar que falla**

Run: `pnpm test -- tests/contracts/design-tokens.test.ts`
Expected: FAIL — ninguno de los dos ficheros declara todavía esos `@keyframes`.

- [ ] **Step 3: Añadir los keyframes a `design-tokens.css`**

Al final del fichero, después del bloque `@media (prefers-reduced-motion: reduce)` ya existente (o antes, da igual mientras estén al nivel superior de la hoja):

```css
/* Animaciones de entrada — handoff de rediseño 2026-09 (README §6.2). Las
   duraciones son literales por elemento, no tokens --dur-*: las fija quien
   las usa cuando reconstruya cada pantalla (pushin .3s para vistas apiladas,
   rise .34s/.5s para hojas y login, toastin .28s para el toast, fadein .22s
   /.28s para scrim y cambio de pestaña — README §6.2). */
@keyframes fadein  { from{opacity:0} to{opacity:1} }
@keyframes rise    { from{opacity:0;transform:translateY(14px) scale(.985)} to{opacity:1;transform:none} }
@keyframes pushin  { from{opacity:.4;transform:translateX(26px)} to{opacity:1;transform:none} }
@keyframes toastin { from{opacity:0;transform:translateY(18px) scale(.96)} to{opacity:1;transform:none} }
```

- [ ] **Step 4: Mismo bloque en `app/globals.css`**

Añádelo dentro de la sección de movimiento existente (junto a `rz-stagger-in`, `rz-icon-pop`), fuera de cualquier `@layer` (igual que en `design-tokens.css`, a nivel superior de la hoja):

```css
/* Los cuatro keyframes del handoff de rediseño 2026-09 (README §6.2). Sin
   utilidad que los invoque todavía: las pantallas de fases posteriores los
   consumen con la duración literal que les toque, no un token --dur-*. */
@keyframes fadein  { from{opacity:0} to{opacity:1} }
@keyframes rise    { from{opacity:0;transform:translateY(14px) scale(.985)} to{opacity:1;transform:none} }
@keyframes pushin  { from{opacity:.4;transform:translateX(26px)} to{opacity:1;transform:none} }
@keyframes toastin { from{opacity:0;transform:translateY(18px) scale(.96)} to{opacity:1;transform:none} }
```

- [ ] **Step 5: Confirmar que el `@media (prefers-reduced-motion: reduce)` global ya cubre estos keyframes**

`app/globals.css` ya tiene, dentro de `@layer base`:
```css
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after { animation-duration: .01ms !important; transition-duration: .01ms !important; }
  }
```
Esto anula CUALQUIER `animation-duration` (selector `*`), incluida cualquier futura clase que use `fadein`/`rise`/`pushin`/`toastin` — no hace falta ningún cambio aquí, solo se documenta que el Step 3 de `docs/superpowers/plans/...` (Global Constraints) ya queda cubierto sin trabajo extra.

- [ ] **Step 6: Correr el test y confirmar que pasa**

Run: `pnpm test -- tests/contracts/design-tokens.test.ts`
Expected: PASS.

- [ ] **Step 7: Correr `pnpm check` completo**

Run: `pnpm check`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add design-tokens.css app/globals.css tests/contracts/design-tokens.test.ts
git commit -m "Añade los cuatro keyframes de entrada del rediseño"
```

---

### Task 5: Muelle — puerto de `motion.js`

**Files:**
- Create: `lib/motion/spring.ts`
- Create: `lib/motion/spring.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces (consumido por la Fase 2, hoja inferior arrastrable):
  - `type SpringState = { x: number; v: number }`
  - `const SPRING_K = 190`, `const SPRING_C = 27`, `const SPRING_DT_MAX = 0.032`, `const SPRING_STOP_DX = 0.6`, `const SPRING_STOP_DV = 14`
  - `function stepSpring(state: SpringState, to: number, dtSeconds: number): SpringState`
  - `function isSpringSettled(state: SpringState, to: number): boolean`
  - `const RUBBER_BAND_FACTOR = 0.25`
  - `function applyRubberBand(dy: number, factor?: number): number`
  - `const MOMENTUM_DECAY = 0.998`
  - `function projectMomentum(y: number, velocityPxPerSec: number, decay?: number): number`

- [ ] **Step 1: Escribir los tests del integrador de muelle**

Crea `lib/motion/spring.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  applyRubberBand,
  isSpringSettled,
  projectMomentum,
  SPRING_C,
  SPRING_K,
  stepSpring,
} from './spring'

describe('stepSpring', () => {
  it('converge al destino sin overshoot (críticamente amortiguado)', () => {
    let state = { x: 0, v: 0 }
    let maxX = 0
    for (let i = 0; i < 200; i++) {
      state = stepSpring(state, 100, 1 / 60)
      maxX = Math.max(maxX, state.x)
    }
    expect(state.x).toBeCloseTo(100, 0)
    // Críticamente amortiguado: nunca se pasa del destino.
    expect(maxX).toBeLessThanOrEqual(100.5)
  })

  it('se detiene cuando |x-to|<0.6 y |v|<14, no antes', () => {
    // Un paso desde muy cerca del destino y con velocidad baja debe asentar.
    const settled = stepSpring({ x: 99.8, v: 5 }, 100, 1 / 60)
    expect(isSpringSettled(settled, 100)).toBe(true)
    // Lejos del destino, no asienta.
    expect(isSpringSettled({ x: 50, v: 0 }, 100)).toBe(false)
  })

  it('limita dt a 32ms aunque se le pase un salto de frame más largo', () => {
    const withCap = stepSpring({ x: 0, v: 0 }, 100, 0.032)
    const withLongerFrame = stepSpring({ x: 0, v: 0 }, 100, 0.5)
    expect(withLongerFrame).toEqual(withCap)
  })

  it('usa las constantes exactas k=190, c=27', () => {
    expect(SPRING_K).toBe(190)
    expect(SPRING_C).toBe(27)
  })

  it('parte siempre del x y v actuales, nunca reinicia la velocidad', () => {
    const withMomentum = stepSpring({ x: 50, v: 800 }, 100, 1 / 60)
    const withoutMomentum = stepSpring({ x: 50, v: 0 }, 100, 1 / 60)
    expect(withMomentum.x).not.toBeCloseTo(withoutMomentum.x, 2)
  })
})

describe('applyRubberBand', () => {
  it('amortigua al 25% cuando se arrastra hacia arriba (dy negativo)', () => {
    expect(applyRubberBand(-40)).toBeCloseTo(-10, 6)
  })
  it('sigue 1:1 cuando se arrastra hacia abajo (dy positivo)', () => {
    expect(applyRubberBand(40)).toBe(40)
  })
  it('en dy=0 no cambia nada', () => {
    expect(applyRubberBand(0)).toBe(0)
  })
})

describe('projectMomentum', () => {
  it('reproduce la fórmula de proyección de Apple con decay 0.998', () => {
    // y=0, velocidad=500px/s → 0 + (500/1000)*0.998/(1-0.998) = 249.5
    expect(projectMomentum(0, 500)).toBeCloseTo(249.5, 1)
  })
  it('con velocidad 0 no proyecta nada', () => {
    expect(projectMomentum(80, 0)).toBe(80)
  })
  it('con velocidad negativa proyecta hacia atrás', () => {
    expect(projectMomentum(200, -1000)).toBeLessThan(200)
  })
})
```

- [ ] **Step 2: Correr los tests y comprobar que fallan (el módulo no existe)**

Run: `pnpm test -- lib/motion/spring.test.ts`
Expected: FAIL con `Cannot find module './spring'` o equivalente.

- [ ] **Step 3: Escribir `lib/motion/spring.ts`**

```ts
// Puerto 1:1 de design_handoff_rezet_redesign/motion.js: el integrador de
// muelle, la proyección de momento y el rubber-banding de la hoja inferior
// arrastrable. Sin dependencias — igual que el original. Consumido por el
// componente de hoja inferior de la Fase 2 (README §6.3-6.4).

export type SpringState = { x: number; v: number }

// Constantes exactas del handoff (README §6.3): rigidez k=190, amortiguación
// c=27 — críticamente amortiguado, sin rebote. NO son aproximaciones.
export const SPRING_K = 190
export const SPRING_C = 27
export const SPRING_DT_MAX = 0.032
export const SPRING_STOP_DX = 0.6
export const SPRING_STOP_DV = 14

// Un paso del integrador, por frame. Se anima siempre desde el x/v actuales
// en pantalla, nunca desde el valor lógico ni reiniciando v a 0 (README
// §6.3): por eso recibe `state` completo y lo devuelve completo, en vez de
// llevar estado interno propio.
export function stepSpring(state: SpringState, to: number, dtSeconds: number): SpringState {
  const dt = Math.min(SPRING_DT_MAX, dtSeconds)
  const v = state.v + (-SPRING_K * (state.x - to) - SPRING_C * state.v) * dt
  const x = state.x + v * dt
  return { x, v }
}

export function isSpringSettled(state: SpringState, to: number): boolean {
  return Math.abs(state.x - to) < SPRING_STOP_DX && Math.abs(state.v) < SPRING_STOP_DV
}

// Rubber-banding del arrastre de la hoja inferior (README §6.4 paso 2): solo
// al arrastrar hacia arriba (dy negativo) se amortigua al 25%; hacia abajo
// sigue el dedo 1:1.
export const RUBBER_BAND_FACTOR = 0.25

export function applyRubberBand(dy: number, factor: number = RUBBER_BAND_FACTOR): number {
  return dy < 0 ? dy * factor : dy
}

// Proyección de momento de Apple (README §6.4 paso 4): dónde acabaría la hoja
// si soltase el dedo ahora mismo y siguiera decayendo con esta velocidad,
// no la distancia ya recorrida.
export const MOMENTUM_DECAY = 0.998

export function projectMomentum(y: number, velocityPxPerSec: number, decay: number = MOMENTUM_DECAY): number {
  return y + ((velocityPxPerSec / 1000) * decay) / (1 - decay)
}
```

- [ ] **Step 4: Correr los tests y confirmar que pasan**

Run: `pnpm test -- lib/motion/spring.test.ts`
Expected: PASS.

- [ ] **Step 5: Confirmar que el typecheck no se rompe**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 6: Correr `pnpm check` completo**

Run: `pnpm check`
Expected: PASS. (`lib/motion` no es `lib/domain`: no le aplica el umbral de cobertura 100%, aunque en la práctica estos tests ya lo cubren entero.)

- [ ] **Step 7: Commit**

```bash
git add lib/motion/spring.ts lib/motion/spring.test.ts
git commit -m "Porta el integrador de muelle del handoff a lib/motion"
```

---

### Task 6: Navegación — 4 pestañas, Cocinar fuera de la barra

**Files:**
- Modify: `components/nav/bottom-bar.tsx`
- Modify: `components/nav/bottom-bar.test.tsx`
- Modify: `app/(app)/layout.tsx` (un comentario)
- Modify: `AGENTS.md` (sección "## Las cinco pantallas")
- Modify: `docs/01-PRODUCTO.md`

**Interfaces:**
- Consumes: nada de las tareas anteriores.
- Produces: `NAV_ITEMS` con 4 entradas en vez de 5 — nada más importa `NAV_ITEMS` hoy salvo `bottom-bar.tsx`/`bottom-bar.test.tsx` (confirmado: `grep -rn "NAV_ITEMS" --include="*.tsx" .` solo los encuentra a ellos dos).

- [ ] **Step 1: Actualizar el test primero**

En `components/nav/bottom-bar.test.tsx`, cambia el primer `it`:

```ts
  it('pinta cuatro pestañas y marca la activa', () => {
    render(
      <NextIntlClientProvider locale="es" messages={{ common }}>
        <BottomBar />
      </NextIntlClientProvider>,
    )
    const links = screen.getAllByRole('link')
    expect(links).toHaveLength(4)
    expect(screen.getByRole('link', { name: 'Plan' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Hoy' })).not.toHaveAttribute('aria-current')
  })
```

(Los otros dos `it` de ese fichero usan `getByRole('link', { name: 'Plan' })` / `{ name: 'Hoy' }`, que siguen existiendo — no necesitan cambios.)

- [ ] **Step 2: Correr el test y comprobar que falla**

Run: `pnpm test -- components/nav/bottom-bar.test.tsx`
Expected: FAIL — `BottomBar` todavía pinta 5 enlaces.

- [ ] **Step 3: Editar `NAV_ITEMS` y el grid en `components/nav/bottom-bar.tsx`**

```tsx
'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { PantryIcon, PlanIcon, RecipesIcon, TodayIcon } from '@/components/icons'
import { cn } from '@/lib/utils'

// Cocinar sale de la barra (rediseño 2026-09, README §2): pasa a ser un modo
// a pantalla completa que se lanza desde una comida de Hoy
// (components/today/today-view.tsx) o desde "Cocinar ahora" en el detalle de
// receta (components/recipes/recipe-detail.tsx) — las dos entradas ya
// existían antes de este cambio, así que quitar la pestaña no rompe el
// acceso. Orden Hoy·Recetas·Plan·Despensa, el del handoff.
export const NAV_ITEMS = [
  { href: '/today', labelKey: 'today', Icon: TodayIcon },
  { href: '/recipes', labelKey: 'recipes', Icon: RecipesIcon },
  { href: '/plan', labelKey: 'plan', Icon: PlanIcon },
  { href: '/pantry', labelKey: 'pantry', Icon: PantryIcon },
] as const
```

Y el `<ul>`:

```tsx
      <ul className="mx-auto grid max-w-xl grid-cols-4">
```

(El resto del componente —el `<li>`/`<Link>` por entrada, `pill-selected`, `icon-pop`— no cambia.)

- [ ] **Step 4: Correr el test y confirmar que pasa**

Run: `pnpm test -- components/nav/bottom-bar.test.tsx`
Expected: PASS.

- [ ] **Step 5: Confirmar que `CookIcon` no queda huérfano en otro sitio que lo necesite desde este import**

Run: `grep -rn "CookIcon" components/nav/bottom-bar.tsx`
Expected: sin resultados (ya lo quitaste del import en el Step 3; `CookIcon` sigue existiendo en `components/icons` y sigue en uso en `today-view.tsx`/`recipe-detail.tsx`, no se toca ni se borra).

- [ ] **Step 6: Actualizar el comentario de `app/(app)/layout.tsx`**

Busca:
```
// El marco de las cinco pantallas: ancho de lectura, relleno seguro y barra
```
Cámbialo a:
```
// El marco de las cuatro pantallas: ancho de lectura, relleno seguro y barra
```

- [ ] **Step 7: Actualizar `AGENTS.md`**

Sustituye la sección completa:

```markdown
## Las cinco pantallas

Hoy · Cocinar · Plan · Despensa · Recetas. Barra inferior, nada más.
La nutrición, los ajustes y las tiendas **no tienen pestaña**: viven dentro de la
pantalla donde importan. Si una funcionalidad nueva pide una sexta pestaña,
probablemente esté mal ubicada. Ver `docs/01-PRODUCTO.md`.
```

por:

```markdown
## Las cuatro pantallas

Hoy · Recetas · Plan · Despensa. Barra inferior, nada más. **Cocinar no es una
pestaña** (rediseño 2026-09): es un modo a pantalla completa que se lanza
desde una comida de Hoy o desde "Cocinar ahora" en el detalle de receta.
La nutrición, los ajustes y las tiendas **no tienen pestaña**: viven dentro de la
pantalla donde importan. Si una funcionalidad nueva pide una quinta pestaña,
probablemente esté mal ubicada. Ver `docs/01-PRODUCTO.md`.
```

- [ ] **Step 8: Actualizar `docs/01-PRODUCTO.md`**

Sustituye:

```markdown
## Las cinco pantallas

Regla heredada de openGym: *cinco pantallas, cero ruido*. Tiene 1.324 ejercicios
y aun así se navega con cinco. La contención es la decisión de diseño.

| Pantalla | Responde a | Contenido |
|---|---|---|
| **Hoy** | "¿Qué ceno?" sin tocar nada | Comida de hoy, anillo de calorías, lo que caduca, atajos |
| **Cocinar** | Estoy con la sartén al fuego | Un paso por pantalla, raciones, temporizadores, wake lock |
| **Plan** | La semana | Calendario arrastrar y soltar, sobras, propuestas de la IA |
| **Despensa** | Qué hay en casa | Inventario por ubicación, caducidades, descuento automático |
| **Recetas** | El archivo | Búsqueda, filtros, importación |

**Sin pestaña propia** (viven dentro de donde importan): nutrición, ajustes,
proveedores de IA, tiendas, miembros del hogar, importar y exportar.

Si una funcionalidad nueva parece pedir una sexta pestaña, casi seguro está mal
ubicada. Pregunta antes de añadirla.
```

por:

```markdown
## Las cuatro pantallas

Regla heredada de openGym: *pocas pantallas, cero ruido*. Rediseño 2026-09:
Cocinar deja de ser una pestaña de navegación (era un destino vacío hasta que
elegías algo) y pasa a ser un modo a pantalla completa que se lanza desde
Hoy o desde el detalle de receta.

| Pantalla | Responde a | Contenido |
|---|---|---|
| **Hoy** | "¿Qué ceno?" sin tocar nada | Comida de hoy, anillo de calorías, lo que caduca, sugerencias cocinables |
| **Recetas** | El archivo | Búsqueda, filtros, importación |
| **Plan** | La semana | Calendario arrastrar y soltar, sobras, lista de la compra |
| **Despensa** | Qué hay en casa | Inventario por ubicación, caducidades, descuento automático |

**Fuera de las cuatro pestañas**: Cocinar (pantalla completa, se lanza desde
Hoy o receta), nutrición, ajustes, proveedores de IA, tiendas, miembros del
hogar, importar y exportar.

Si una funcionalidad nueva parece pedir una quinta pestaña, casi seguro está mal
ubicada. Pregunta antes de añadirla.
```

- [ ] **Step 9: Correr `pnpm check` completo**

Run: `pnpm check`
Expected: PASS.

- [ ] **Step 10: Comprobar a mano que `/cook/[entryId]` y `/cook/recipe/[id]` siguen siendo alcanzables**

Run: `pnpm dev`, entra en `/today` con al menos una comida planificada y pulsa "Cocinar"; entra en el detalle de una receta y pulsa "Cocinar ahora". Ambos deben seguir abriendo el modo cocina con normalidad — este plan no toca esas rutas, solo confirma que no dependían de la pestaña.

- [ ] **Step 11: Commit**

```bash
git add components/nav/bottom-bar.tsx components/nav/bottom-bar.test.tsx "app/(app)/layout.tsx" AGENTS.md docs/01-PRODUCTO.md
git commit -m "Reduce la barra inferior a cuatro pestañas: Cocinar se lanza, no navega"
```

---

## Qué queda fuera de esta fase (a propósito)

Backlog para las plans siguientes, en el orden sugerido por el handoff (README §11):

- **Fase 2 — Shell y primitivos:** barra lateral ≥900px (`useBreakpoint` con `matchMedia`+`ResizeObserver` medido en cada render, no en el montaje — README §2), escala de radios (~10 valores por componente), alturas de control, primitivos (botón, chip, fila de lista, tarjeta, stepper, casilla, eyebrow), hoja inferior arrastrable consumiendo `lib/motion/spring.ts`, materiales translúcidos (`--glass`, ya declarado en la Tarea 2).
- **Fase 3 — Reglas de negocio restantes:** cobertura de despensa, lista de la compra (agrupación Fresco/Seco/Conserva), conversión imperial (`g→oz ÷28.35`, `ml→fl oz ÷29.57`) — revisar contra lo que ya hace `lib/domain/units-data.ts`/`shopping.ts` antes de tocar nada, puede que ya cumplan.
- **Fase 4 — Pantallas**, en el orden del README §11: Hoy → Recetas → Detalle → Cocinar → Plan → Despensa → Nueva receta → Login → Onboarding → Ajustes.
- **Fase 5 — Ajustes/prefs:** reducir el conjunto de acentos de 8 a 4 y renombrar sus ids (`huerta`→`green`, etc.) — toca `lib/prefs.ts`, el esquema zod, el selector de Ajustes y los e2e; se hace junto con la reconstrucción de la propia pantalla de Ajustes, no antes.
- **Fase 6 — i18n y unidades finales**, verificación de "Definición de terminado" (AGENTS.md/README §0) en 390px y escritorio, y pasada de axe AA en las pantallas nuevas.
