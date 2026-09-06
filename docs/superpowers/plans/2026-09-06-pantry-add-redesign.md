# Pantry-Add Sheet Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the pantry-add sheet's three stacked forms (mode chips / unit chips / location chips) with one camera-first action: live barcode+photo scanning, a real segmented control, combined quantity+unit parsing, smart default location, relative expiry chips, and a stay-open batch-add flow with undo.

**Architecture:** A new `PantryScanCapture` component opens a live camera and continuously decodes barcodes client-side (`@zxing/browser`), with a manual "Reconocer por foto" fallback to the existing Gemini Edge Function. `PantryAddSheet` becomes a two-state (`scan`/`manual`) sheet instead of three equal-weight chips. `pantryAdd`'s contract changes in both stores to merge quantities into an existing matching row (instead of silently failing on a real unique-constraint conflict or silently duplicating in demo mode) and to report what happened, so undo can reverse exactly what an add did.

**Tech Stack:** React + TypeScript (existing app), `@zxing/browser` (already a dependency, using its live-video decode API for the first time), a new Postgres RPC (`pantry_add`), no new npm dependencies.

**Spec:** `docs/superpowers/specs/2026-09-06-pantry-add-redesign-design.md`

## Global Constraints

- `Unit` is the closed union `'g' | 'ml' | 'ud'` (types.ts:1). Never forward a free-text unit string into a `Unit`-typed field without normalizing/validating it first (`parseQuantityInput` must always resolve to one of the three).
- Business rules live in `domain/` only, pure and tested. `inferFoodGroup`, `defaultLocationFor`, `findIngredientByName` go in `domain/recipeText.ts` (that file already hosts "guess a property of an ingredient from its name" logic — `SENSITIVE_RE` — and is already imported by both stores for exactly that). `parseQuantityInput` goes in `domain/units.ts` (the parse-side counterpart to the existing `formatQuantity`).
- No themed component libraries. Build `SegmentedControl` from the existing hand-written primitives only (`Pressable`, tokens).
- Color tokens only — no stray hex. `--warn-ink` for error text on untinted background, `--accent-ink` for a text link, `--muted`/`--text` for inactive/active segment labels.
- This repo's only unit tests are in `app/src/domain/__tests__/domain.test.ts` via `vitest run` (`npm test`) — that ONE file already covers every existing domain function across `scaling.ts`, `coverage.ts`, `units.ts`, `recipeText.ts`, and `shopping.ts` in one place; new functions added to `units.ts`/`recipeText.ts` get their tests appended to that same file, matching the file's existing per-source-file convention. There is no jsdom/React-Testing-Library setup — UI is verified manually in the browser.
- `PantryItem`'s public shape (`types.ts:56`) is not modified by this plan.
- `pantryAdd`'s signature changes deliberately (see Task 8) — this is a reviewed, approved contract change, not an accident. Every caller must be updated in the same task that changes the signature.
- Camera access requires a secure context; `rezet.jarsss8.es` is already HTTPS, and `localhost`/local dev also count as secure contexts, so no special handling is needed for local testing.
- Every commit message ends with:
  ```
  Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01KzPF5aTDAt1N9CpuoXvSzU
  ```

---

## Task 1: Ingredient-lookup domain helpers (`findIngredientByName`, `inferFoodGroup`, `defaultLocationFor`)

**Files:**
- Modify: `app/src/domain/recipeText.ts`
- Modify: `app/src/domain/__tests__/domain.test.ts`

**Interfaces:**
- Produces: `findIngredientByName(list: Ingredient[], name: string): Ingredient | undefined`, `inferFoodGroup(name: string): FoodGroup`, `defaultLocationFor(group: FoodGroup): PantryLoc`, all exported from `domain/recipeText.ts`. Consumed by Tasks 2 (quantity fallback unit), 5/6 (both stores' ingredient creation and buyChecked), and 12 (the redesigned sheet's location default).

- [ ] **Step 1: Write the failing tests**

Add to `app/src/domain/__tests__/domain.test.ts`. First, extend the existing import line (currently `import { parseIngredientLines, textMentions } from '../recipeText';`) to:

```ts
import { defaultLocationFor, findIngredientByName, inferFoodGroup, parseIngredientLines, textMentions } from '../recipeText';
```

Then add these `describe` blocks anywhere at the top level of the file (e.g. right after the existing `recipeText`-related blocks, if any, or at the end before the closing of the file):

```ts
describe('findIngredientByName', () => {
  const list: Ingredient[] = [
    { id: 'i1', name: { es: 'Leche', en: 'Milk' }, group: 'fresco', sensitive: false, defaultUnit: 'ml' },
    { id: 'i2', name: { es: 'Lentejas', en: 'Lentils' }, group: 'seco', sensitive: false, defaultUnit: 'g' },
  ];
  it('encuentra por nombre en español, sin distinguir mayúsculas', () => {
    expect(findIngredientByName(list, 'leche')?.id).toBe('i1');
  });
  it('encuentra por nombre en inglés', () => {
    expect(findIngredientByName(list, 'Milk')?.id).toBe('i1');
  });
  it('no hace coincidencia parcial ("le" no debe encontrar "Leche")', () => {
    expect(findIngredientByName(list, 'le')).toBeUndefined();
  });
  it('undefined si no hay coincidencia exacta', () => {
    expect(findIngredientByName(list, 'Arroz')).toBeUndefined();
  });
});

describe('inferFoodGroup', () => {
  it('reconoce fresco en español', () => {
    expect(inferFoodGroup('Leche')).toBe('fresco');
    expect(inferFoodGroup('Yogur natural')).toBe('fresco');
  });
  it('reconoce fresco en inglés (bilingüe, igual que SENSITIVE_RE)', () => {
    expect(inferFoodGroup('Milk')).toBe('fresco');
    expect(inferFoodGroup('Chicken breast')).toBe('fresco');
  });
  it('reconoce conserva en español e inglés', () => {
    expect(inferFoodGroup('Lata de tomate')).toBe('conserva');
    expect(inferFoodGroup('Canned beans')).toBe('conserva');
  });
  it('no confunde "botella" con "bote" (límite de palabra)', () => {
    expect(inferFoodGroup('Botella de agua')).toBe('seco');
  });
  it('cae a seco por defecto', () => {
    expect(inferFoodGroup('Arroz')).toBe('seco');
    expect(inferFoodGroup('Pasta')).toBe('seco');
  });
});

describe('defaultLocationFor', () => {
  it('fresco va a nevera', () => {
    expect(defaultLocationFor('fresco')).toBe('fridge');
  });
  it('seco y conserva van a armario', () => {
    expect(defaultLocationFor('seco')).toBe('cupboard');
    expect(defaultLocationFor('conserva')).toBe('cupboard');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd app && npx vitest run src/domain/__tests__/domain.test.ts`
Expected: FAIL — `findIngredientByName`/`inferFoodGroup`/`defaultLocationFor` are not exported from `../recipeText` yet.

- [ ] **Step 3: Implement in `domain/recipeText.ts`**

Change the top import line (currently `import type { Ingredient, Locale, Recipe, Unit } from '../types';`) to:

```ts
import type { FoodGroup, Ingredient, Locale, PantryLoc, Recipe, Unit } from '../types';
```

Then add, right after the existing `SENSITIVE_RE` line (`export const SENSITIVE_RE = /sal|salt|especia|spice|pimienta|pepper|levadura|yeast|curry/i;`):

```ts
/** Coincidencia exacta (insensible a mayúsculas) por nombre ES o EN — no sustituye a las sugerencias de IngredientNameField, que buscan por subcadena. */
export function findIngredientByName(list: Ingredient[], name: string): Ingredient | undefined {
  const q = name.trim().toLowerCase();
  return list.find((i) => i.name.es.toLowerCase() === q || i.name.en.toLowerCase() === q);
}

const FRESH_RE = /leche|milk|yogur|yogurt|carne|meat|pollo|chicken|pescado|fish|marisco|seafood|huevo|egg|queso|cheese|fruta|fruit|verdura|vegetable|ensalada|salad|nata|cream|mantequilla|butter|tofu/i;
const TINNED_RE = /\b(lata|conserva|bote|enlatad\w*|tinned?|canned?|jarred?)\b/i;

/** Adivina el grupo de un ingrediente nuevo por su nombre — mismo criterio que SENSITIVE_RE: heurística barata, bilingüe, el usuario corrige si hace falta. */
export function inferFoodGroup(name: string): FoodGroup {
  if (FRESH_RE.test(name)) return 'fresco';
  if (TINNED_RE.test(name)) return 'conserva';
  return 'seco';
}

/** fresco → nevera, seco/conserva → armario. Única fuente de esta regla — antes vivía duplicada en store.tsx, supabaseStore.tsx (dos veces) y esta hoja. */
export function defaultLocationFor(group: FoodGroup): PantryLoc {
  return group === 'fresco' ? 'fridge' : 'cupboard';
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd app && npx vitest run src/domain/__tests__/domain.test.ts`
Expected: PASS (all tests in the file, including the 10 new ones)

- [ ] **Step 5: Commit**

```bash
cd /home/jars/Programing/Rezet
git add app/src/domain/recipeText.ts app/src/domain/__tests__/domain.test.ts
git commit -m "$(cat <<'EOF'
Add findIngredientByName, inferFoodGroup, defaultLocationFor

Pure, tested, bilingual (matches SENSITIVE_RE's existing convention).
First step of the pantry-add redesign (see
docs/superpowers/specs/2026-09-06-pantry-add-redesign-design.md) —
these replace three separate hardcoded/inline/duplicated copies of
"guess where a new ingredient goes" spread across both data stores.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01KzPF5aTDAt1N9CpuoXvSzU
EOF
)"
```

---

## Task 2: `parseQuantityInput`

**Files:**
- Modify: `app/src/domain/units.ts`
- Modify: `app/src/domain/__tests__/domain.test.ts`

**Interfaces:**
- Produces: `parseQuantityInput(input: string, fallbackUnit: Unit): { quantity: number; unit: Unit }`, exported from `domain/units.ts`. Consumed by Task 12 (the redesigned sheet's combined quantity+unit field).

- [ ] **Step 1: Write the failing tests**

Add to `app/src/domain/__tests__/domain.test.ts`. Extend the existing units import line (currently `import { formatQuantity, roundNice } from '../units';`) to:

```ts
import { formatQuantity, parseQuantityInput, roundNice } from '../units';
```

Add this `describe` block:

```ts
describe('parseQuantityInput', () => {
  it('parsea gramos', () => {
    expect(parseQuantityInput('500 g', 'ud')).toEqual({ quantity: 500, unit: 'g' });
  });
  it('normaliza kg a gramos', () => {
    expect(parseQuantityInput('2 kg', 'ud')).toEqual({ quantity: 2000, unit: 'g' });
  });
  it('normaliza litros a mililitros', () => {
    expect(parseQuantityInput('1.5 l', 'ud')).toEqual({ quantity: 1500, unit: 'ml' });
  });
  it('acepta uds y pcs como ud', () => {
    expect(parseQuantityInput('3 uds', 'g')).toEqual({ quantity: 3, unit: 'ud' });
    expect(parseQuantityInput('3 pcs', 'g')).toEqual({ quantity: 3, unit: 'ud' });
  });
  it('sin unidad, usa la unidad de respaldo', () => {
    expect(parseQuantityInput('3', 'ml')).toEqual({ quantity: 3, unit: 'ml' });
  });
  it('sufijo no reconocido: conserva el número, usa la unidad de respaldo (no lo descarta a 1)', () => {
    expect(parseQuantityInput('500 gramos', 'g')).toEqual({ quantity: 500, unit: 'g' });
  });
  it('coma decimal', () => {
    expect(parseQuantityInput('1,5 kg', 'ud')).toEqual({ quantity: 1500, unit: 'g' });
  });
  it('entrada irreconocible cae a 1 con la unidad de respaldo', () => {
    expect(parseQuantityInput('abc', 'ud')).toEqual({ quantity: 1, unit: 'ud' });
  });
  it('numérico patológico no produce NaN', () => {
    expect(parseQuantityInput('1.2.3', 'ud').quantity).not.toBeNaN();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd app && npx vitest run src/domain/__tests__/domain.test.ts`
Expected: FAIL — `parseQuantityInput` is not exported from `../units` yet.

- [ ] **Step 3: Implement in `domain/units.ts`**

Add at the end of the file:

```ts
const QUANTITY_INPUT_RE = /^([\d.,]+)\s*(g|kg|ml|l|ud|uds|pcs)?\s*$/i;
const LEADING_NUMBER_RE = /^([\d.,]+)/;

function toNumber(raw: string | undefined): number {
  const n = parseFloat((raw ?? '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : 1;
}

/**
 * Parsea "500 g" / "2 kg" / "3" en cantidad + unidad. Sin unidad escrita, o
 * con un sufijo que no reconoce, usa `fallbackUnit` — pero SIEMPRE conserva
 * el número que escribió el usuario, nunca lo descarta a 1 solo porque la
 * unidad no se entendió. kg/l se normalizan a g/ml. Nunca lanza.
 */
export function parseQuantityInput(input: string, fallbackUnit: Unit): { quantity: number; unit: Unit } {
  const trimmed = input.trim();
  const full = trimmed.match(QUANTITY_INPUT_RE);
  if (!full) {
    const lead = trimmed.match(LEADING_NUMBER_RE);
    return { quantity: toNumber(lead?.[1]), unit: fallbackUnit };
  }
  const quantity = toNumber(full[1]);
  const rawUnit = (full[2] ?? '').toLowerCase();
  if (rawUnit === 'kg') return { quantity: quantity * 1000, unit: 'g' };
  if (rawUnit === 'l') return { quantity: quantity * 1000, unit: 'ml' };
  if (rawUnit === 'g' || rawUnit === 'ml') return { quantity, unit: rawUnit };
  if (rawUnit === 'ud' || rawUnit === 'uds' || rawUnit === 'pcs') return { quantity, unit: 'ud' };
  return { quantity, unit: fallbackUnit };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd app && npx vitest run src/domain/__tests__/domain.test.ts`
Expected: PASS (all tests, including the 9 new ones)

- [ ] **Step 5: Commit**

```bash
cd /home/jars/Programing/Rezet
git add app/src/domain/units.ts app/src/domain/__tests__/domain.test.ts
git commit -m "$(cat <<'EOF'
Add parseQuantityInput for the combined pantry quantity+unit field

Never discards the user's typed number just because the unit suffix
wasn't recognized, and accepts "pcs" (the label English users already
see for 'ud', PantryAddSheet.tsx today) alongside "uds".

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01KzPF5aTDAt1N9CpuoXvSzU
EOF
)"
```

---

## Task 3: `SegmentedControl` primitive

**Files:**
- Modify: `app/src/ui/tokens.ts`
- Create: `app/src/ui/SegmentedControl.tsx`

**Interfaces:**
- Consumes: `EASE` from `../motion/motion`; `height`, `radius` from `./tokens`; `Pressable` from `./Pressable`.
- Produces: `SegmentedControl<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: Array<{ value: T; label: string }> })`. Consumed by Task 12.

- [ ] **Step 1: Add the `height.segment` token**

In `app/src/ui/tokens.ts`, find the `height` object (currently):

```ts
export const height = {
  cta: 54,
  primary: 52,
  secondary: 48,
  input: 46,
  header: 42,
  touch: 44,
  chip: 34,
  stepper: 32,
} as const;
```

Add `segment: 38,` anywhere in that object, e.g.:

```ts
export const height = {
  cta: 54,
  primary: 52,
  secondary: 48,
  input: 46,
  header: 42,
  touch: 44,
  chip: 34,
  stepper: 32,
  segment: 38,
} as const;
```

- [ ] **Step 2: Create the component**

Create `app/src/ui/SegmentedControl.tsx`:

```tsx
import { useLayoutEffect, useRef, useState } from 'react';
import { Pressable } from './Pressable';
import { EASE } from '../motion/motion';
import { height, radius } from './tokens';

/**
 * Control segmentado real: una pista hundida y una píldora que se desliza,
 * no N botones de igual peso. Genérico sobre un union de strings para poder
 * reutilizarlo sin rediseñarlo.
 */
export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: Array<{ value: T; label: string }>;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [pill, setPill] = useState<{ left: number; width: number } | null>(null);
  const index = options.findIndex((o) => o.value === value);

  useLayoutEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const measure = () => {
      const btn = track.querySelectorAll('button')[index] as HTMLElement | undefined;
      if (btn) setPill({ left: btn.offsetLeft, width: btn.offsetWidth });
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [index, options.length]);

  return (
    <div
      ref={trackRef}
      role="radiogroup"
      style={{
        position: 'relative',
        display: 'flex',
        background: 'var(--surface2)',
        borderRadius: radius.chip,
        padding: 3,
      }}
    >
      {pill && (
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: 3,
            bottom: 3,
            left: pill.left,
            width: pill.width,
            background: 'var(--surface)',
            borderRadius: radius.chip - 3,
            boxShadow: 'var(--shadow-s)',
            transition: `left .22s ${EASE}, width .22s ${EASE}`,
          }}
        />
      )}
      {options.map((o) => (
        <Pressable
          key={o.value}
          onClick={() => onChange(o.value)}
          role="radio"
          ariaChecked={o.value === value}
          scale={0.97}
          style={{
            position: 'relative',
            flex: 1,
            height: height.segment,
            borderRadius: radius.chip - 3,
            fontSize: 14,
            fontWeight: 600,
            color: o.value === value ? 'var(--text)' : 'var(--muted)',
            transition: `color .18s ${EASE}`,
          }}
        >
          {o.label}
        </Pressable>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `cd app && npm run lint`
Expected: no errors.

- [ ] **Step 4: Manual verification**

This component isn't wired into any screen yet (that's Task 12). Verify it compiles and, optionally, temporarily render `<SegmentedControl value="a" onChange={() => {}} options={[{value:'a',label:'A'},{value:'b',label:'B'},{value:'c',label:'C'}]} />` anywhere convenient (e.g. briefly in `Pantry.tsx`) via `npm run dev` to see the pill slide when you click each segment, then remove the temporary usage before committing — full integration and real verification happens in Task 12.

- [ ] **Step 5: Commit**

```bash
cd /home/jars/Programing/Rezet
git add app/src/ui/tokens.ts app/src/ui/SegmentedControl.tsx
git commit -m "$(cat <<'EOF'
Add SegmentedControl primitive

A real segmented control (sunken track + sliding pill), not three
equal-weight OptionChips. Measures segment position by querying
<button> elements specifically, not by DOM child index — the pill div
itself is also a child of the track, so positional indexing is
off-by-one after the first render.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01KzPF5aTDAt1N9CpuoXvSzU
EOF
)"
```

---

## Task 4: `TextField` ref forwarding

**Files:**
- Modify: `app/src/ui/Fields.tsx`
- Modify: `app/src/ui/IngredientNameField.tsx`

**Interfaces:**
- Produces: `TextField` becomes `forwardRef`-wrapped, ref type `HTMLInputElement`. `IngredientNameField` gains an optional `inputRef?: Ref<HTMLInputElement>` prop, threaded to its inner `TextField`. Consumed by Task 12 (autofocus on gesture).

- [ ] **Step 1: Wrap `TextField` in `forwardRef`**

In `app/src/ui/Fields.tsx`, add `forwardRef` and `Ref` to the React import (currently `import type { CSSProperties, KeyboardEvent, ReactNode } from 'react';`):

```ts
import { forwardRef } from 'react';
import type { CSSProperties, KeyboardEvent, ReactNode, Ref } from 'react';
```

Change the `TextField` function declaration from:

```ts
export function TextField({
  value,
  onChange,
  placeholder,
  inputMode,
  type = 'text',
  min,
  style,
  onFocus,
  onBlur,
  onKeyDown,
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  inputMode?: 'numeric' | 'decimal' | 'text';
  type?: 'text' | 'date';
  min?: string;
  style?: CSSProperties;
  onFocus?: () => void;
  onBlur?: () => void;
  onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void;
  ariaLabel?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      inputMode={inputMode}
      min={min}
      onFocus={onFocus}
      onBlur={onBlur}
      onKeyDown={onKeyDown}
      aria-label={ariaLabel}
      style={{
        width: '100%',
        height: 50,
        border: '1px solid var(--line)',
        background: 'var(--surface2)',
        borderRadius: radius.input,
        padding: '0 14px',
        fontSize: 16.5,
        outline: 'none',
        ...style,
      }}
    />
  );
}
```

to:

```ts
export const TextField = forwardRef(function TextField(
  {
    value,
    onChange,
    placeholder,
    inputMode,
    type = 'text',
    min,
    style,
    onFocus,
    onBlur,
    onKeyDown,
    ariaLabel,
  }: {
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
    inputMode?: 'numeric' | 'decimal' | 'text';
    type?: 'text' | 'date';
    min?: string;
    style?: CSSProperties;
    onFocus?: () => void;
    onBlur?: () => void;
    onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void;
    ariaLabel?: string;
  },
  ref: Ref<HTMLInputElement>,
) {
  return (
    <input
      ref={ref}
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      inputMode={inputMode}
      min={min}
      onFocus={onFocus}
      onBlur={onBlur}
      onKeyDown={onKeyDown}
      aria-label={ariaLabel}
      style={{
        width: '100%',
        height: 50,
        border: '1px solid var(--line)',
        background: 'var(--surface2)',
        borderRadius: radius.input,
        padding: '0 14px',
        fontSize: 16.5,
        outline: 'none',
        ...style,
      }}
    />
  );
});
```

- [ ] **Step 2: Thread a ref through `IngredientNameField`**

In `app/src/ui/IngredientNameField.tsx`, add `forwardRef`/`Ref` to the React import (currently `import { useMemo, useState } from 'react';`):

```ts
import { forwardRef, useMemo, useState } from 'react';
import type { CSSProperties, Ref } from 'react';
```

(Note: `CSSProperties` was already imported via `import type { CSSProperties } from 'react';` on its own line — merge these into one `import type` line rather than duplicating it.)

Change the function declaration from:

```ts
export function IngredientNameField({
  value,
  onChange,
  onPick,
  placeholder,
  ingredients,
  locale,
  loc,
  style,
}: {
  value: string;
  onChange: (v: string) => void;
  onPick?: (ingredient: Ingredient) => void;
  placeholder?: string;
  ingredients: Ingredient[];
  locale: Locale;
  loc: (v: Ingredient['name']) => string;
  style?: CSSProperties;
}) {
  const [open, setOpen] = useState(false);
```

to:

```ts
export const IngredientNameField = forwardRef(function IngredientNameField(
  {
    value,
    onChange,
    onPick,
    placeholder,
    ingredients,
    locale,
    loc,
    style,
  }: {
    value: string;
    onChange: (v: string) => void;
    onPick?: (ingredient: Ingredient) => void;
    placeholder?: string;
    ingredients: Ingredient[];
    locale: Locale;
    loc: (v: Ingredient['name']) => string;
    style?: CSSProperties;
  },
  ref: Ref<HTMLInputElement>,
) {
  const [open, setOpen] = useState(false);
```

Then find the inner `<TextField ... />` (currently):

```tsx
      <TextField
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        style={style}
      />
```

add `ref={ref}` to it:

```tsx
      <TextField
        ref={ref}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        style={style}
      />
```

Finally, close the `forwardRef` wrapper: find the end of the component (the closing `}` that currently ends the `export function IngredientNameField({...}) { ... }` block — it's the last `}` in the file) and add a closing `);` after it, since `forwardRef(function IngredientNameField(...) { ... })` needs its own closing paren. Concretely, the very end of the file currently reads:

```tsx
        </div>
      )}
    </div>
  );
}
```

and must become:

```tsx
        </div>
      )}
    </div>
  );
});
```

- [ ] **Step 3: Typecheck**

Run: `cd app && npm run lint`
Expected: no errors.

- [ ] **Step 4: Manual verification**

Run `cd app && npm run dev`, open Pantry → Añadir (still the old sheet at this point in the plan) and confirm the name field and all other `TextField`/`IngredientNameField` usages across the app (RecipeForm, CreateOrJoinHousehold) still render and behave identically — this task is purely additive (a `ref` prop nobody passes yet), so there should be zero visible change anywhere.

- [ ] **Step 5: Commit**

```bash
cd /home/jars/Programing/Rezet
git add app/src/ui/Fields.tsx app/src/ui/IngredientNameField.tsx
git commit -m "$(cat <<'EOF'
Forward refs through TextField and IngredientNameField

Purely additive — no existing caller passes a ref today. Needed by
the pantry-add redesign to focus the name field from a user-gesture
handler (iOS won't raise the keyboard for a useEffect-triggered
focus).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01KzPF5aTDAt1N9CpuoXvSzU
EOF
)"
```

---

## Task 5: Demo store — real food-group inference, shared location logic

**Files:**
- Modify: `app/src/data/store.tsx`

**Interfaces:**
- Consumes: `inferFoodGroup`, `defaultLocationFor` from `../domain/recipeText` (Task 1).

- [ ] **Step 1: Import the new helpers**

Add `inferFoodGroup` and `defaultLocationFor` to the existing `recipeText` import in `app/src/data/store.tsx` (currently `import { SENSITIVE_RE } from '../domain/recipeText';`):

```ts
import { SENSITIVE_RE, defaultLocationFor, inferFoodGroup } from '../domain/recipeText';
```

- [ ] **Step 2: `resolveIngredient` uses `inferFoodGroup`**

Find (inside `resolveIngredient`):

```ts
      const created: Ingredient = {
        id: uid('ing'),
        name: { es: name, en: name },
        group: 'seco',
        defaultUnit: unit,
        sensitive: SENSITIVE_RE.test(name),
      };
```

Replace with:

```ts
      const created: Ingredient = {
        id: uid('ing'),
        name: { es: name, en: name },
        group: inferFoodGroup(name),
        defaultUnit: unit,
        sensitive: SENSITIVE_RE.test(name),
      };
```

- [ ] **Step 3: `buyChecked` uses `defaultLocationFor`**

Find (inside `buyChecked`):

```ts
              location: need.group === 'fresco' ? 'fridge' : 'cupboard',
              expiresOn: null,
```

Replace with:

```ts
              location: defaultLocationFor(need.group),
              expiresOn: null,
```

- [ ] **Step 4: Typecheck and test**

Run: `cd app && npm run lint && npm test`
Expected: both clean; the existing 40 tests still pass (this task doesn't touch anything they cover, but confirms nothing broke).

- [ ] **Step 5: Manual verification**

Run `cd app && npm run dev` in demo mode, open Pantry → Añadir, type a brand-new ingredient name your seed catalog doesn't have yet (e.g. "Chorizo" — not fresh, not tinned, should stay "seco") and one that should be fresh (e.g. "Leche" or "Milk" if in English mode) and confirm via the Añadir screen's location default section — **this step's location UI doesn't exist until Task 12**, so for now just confirm no crash and that adding still works; the actual visible effect of this task is only observable end-to-end after Task 12.

- [ ] **Step 6: Commit**

```bash
cd /home/jars/Programing/Rezet
git add app/src/data/store.tsx
git commit -m "$(cat <<'EOF'
Demo store: infer new-ingredient food group, dedupe location logic

resolveIngredient no longer hardcodes group: 'seco' for every new
ingredient (the exact bug that would have made "leche -> nevera"
never work); buyChecked's inline fresco/fridge ternary is replaced
with the shared defaultLocationFor, removing one of three duplicate
copies of this rule.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01KzPF5aTDAt1N9CpuoXvSzU
EOF
)"
```

---

## Task 6: Real store — same fixes, Supabase side

**Files:**
- Modify: `app/src/data/supabaseStore.tsx`

**Interfaces:**
- Consumes: `inferFoodGroup`, `defaultLocationFor` from `../domain/recipeText` (Task 1).

- [ ] **Step 1: Import the new helpers**

Add to the existing `recipeText` import (currently `import { SENSITIVE_RE } from '../domain/recipeText';`):

```ts
import { SENSITIVE_RE, defaultLocationFor, inferFoodGroup } from '../domain/recipeText';
```

- [ ] **Step 2: `resolveIngredientId`'s insert includes `food_group`**

Find (inside `resolveIngredientId`):

```ts
      const { data: created, error } = await supabase
        .from('ingredient')
        .insert({
          household_id: householdId,
          name_es: name,
          name_en: name,
          default_unit: unit,
          is_sensitive: SENSITIVE_RE.test(name),
        })
        .select('id')
        .single();
```

Replace with:

```ts
      const { data: created, error } = await supabase
        .from('ingredient')
        .insert({
          household_id: householdId,
          name_es: name,
          name_en: name,
          default_unit: unit,
          food_group: inferFoodGroup(name),
          is_sensitive: SENSITIVE_RE.test(name),
        })
        .select('id')
        .single();
```

- [ ] **Step 3: `buyChecked`'s client-side location computation uses `defaultLocationFor`**

Find (inside `buyChecked`):

```ts
          location: n.group === 'fresco' ? 'fridge' : 'cupboard',
```

Replace with:

```ts
          location: defaultLocationFor(n.group),
```

- [ ] **Step 4: Typecheck and test**

Run: `cd app && npm run lint && npm test`
Expected: both clean.

- [ ] **Step 5: Commit**

```bash
cd /home/jars/Programing/Rezet
git add app/src/data/supabaseStore.tsx
git commit -m "$(cat <<'EOF'
Real store: infer new-ingredient food group, dedupe location logic

Mirrors the demo store's fix in the previous commit. resolveIngredientId
now sends a real food_group on insert instead of relying on the DB
column's 'seco' default; buyChecked's inline ternary is replaced with
the shared defaultLocationFor (the second of three duplicate copies).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01KzPF5aTDAt1N9CpuoXvSzU
EOF
)"
```

---

## Task 7: `pantry_add` RPC migration

**Files:**
- Create: `app/supabase/migrations/20260906030000_rezet_pantry_add_rpc.sql`

**Interfaces:**
- Produces: a Postgres function `public.pantry_add(p_ingredient_id uuid, p_quantity numeric, p_unit public.unit, p_location public.pantry_loc, p_expires_on date) returns table (id uuid, merged boolean, added_quantity numeric)`. Consumed by Task 8 (`supabaseStore.tsx`'s `pantryAdd`).

- [ ] **Step 1: Write the migration**

Create `app/supabase/migrations/20260906030000_rezet_pantry_add_rpc.sql`:

```sql
-- Añadir un item a la despensa desde la hoja de "Añadir": si ya existe una
-- fila con el mismo ingrediente+unidad+ubicación (pantry_item_uq es un
-- índice único real sobre esas tres columnas), suma la cantidad en vez de
-- fallar o duplicar — igual que buy_checked ya hace para la lista de la
-- compra. Devuelve si fusionó o creó, y cuánto se añadió, para que el
-- deshacer del cliente sepa restar solo lo que esta llamada añadió, no
-- borrar la fila entera si ya tenía más cantidad de antes.
create or replace function public.pantry_add(
  p_ingredient_id uuid,
  p_quantity numeric,
  p_unit public.unit,
  p_location public.pantry_loc,
  p_expires_on date
)
returns table (id uuid, merged boolean, added_quantity numeric)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_household_id uuid := private.current_household();
  v_existing record;
begin
  if v_household_id is null then
    raise exception 'not authenticated or no household';
  end if;

  select p.id, p.expires_on into v_existing
  from public.pantry_item p
  where p.household_id = v_household_id
    and p.ingredient_id = p_ingredient_id
    and p.unit = p_unit
    and p.location = p_location;

  if v_existing.id is not null then
    -- Conserva la fecha de caducidad que ya había si tenía una: no se puede
    -- representar "dos lotes con dos fechas" en una sola fila, así que se
    -- prioriza no perder una fecha real por una nueva o por null (mismo
    -- criterio implícito que ya tiene buy_checked, que ni siquiera toca
    -- expires_on al fusionar).
    update public.pantry_item
    set quantity = quantity + p_quantity,
        expires_on = coalesce(v_existing.expires_on, p_expires_on)
    where public.pantry_item.id = v_existing.id;
    return query select v_existing.id, true, p_quantity;
  else
    return query
      insert into public.pantry_item (household_id, ingredient_id, quantity, unit, location, expires_on)
      values (v_household_id, p_ingredient_id, p_quantity, p_unit, p_location, p_expires_on)
      returning pantry_item.id, false, p_quantity;
  end if;
end;
$$;

revoke all on function public.pantry_add(uuid, numeric, public.unit, public.pantry_loc, date) from public;
revoke execute on function public.pantry_add(uuid, numeric, public.unit, public.pantry_loc, date) from anon;
grant execute on function public.pantry_add(uuid, numeric, public.unit, public.pantry_loc, date) to authenticated;
```

- [ ] **Step 2: Visually verify the SQL**

There's no automated SQL linter in this repo (same situation as the prior plan's `buy_checked` fix migration). Re-read the file and confirm: exactly two `$$` delimiters (function body start/end), `begin`/`end` balanced, `if`/`end if` balanced, parens balanced in both the `create or replace function` signature and the `revoke`/`grant` statements, and that the `returns table (...)` column list (`id`, `merged`, `added_quantity`) matches the order of values in both `return query select ...` (id, true, p_quantity) and `return query insert ... returning ...` (pantry_item.id, false, p_quantity) — `plpgsql`'s `return query` matches a query's output columns to the function's declared output columns positionally.

**Do NOT run `apply_migration` or any command that applies this to the live database.** Just create the file and commit it — applying it is the controller's call, made after this whole plan is implemented and reviewed, same as the prior plan's migration.

- [ ] **Step 3: Commit**

```bash
cd /home/jars/Programing/Rezet
git add app/supabase/migrations/20260906030000_rezet_pantry_add_rpc.sql
git commit -m "$(cat <<'EOF'
Add pantry_add RPC: merge into an existing row instead of failing

pantry_item has a real unique index on (household_id, ingredient_id,
unit, location). The plain insert the real store currently does hits
it silently on every re-add of an existing ingredient+unit+location
and does nothing — about to become the COMMON case once batch-add
ships (Task 8), not an edge case. Mirrors buy_checked's existing
merge-on-conflict shape. Not applied to the live database by this
commit.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01KzPF5aTDAt1N9CpuoXvSzU
EOF
)"
```

---

## Task 8: `pantryAdd` contract change — merge, id-hoist, return shape

**Files:**
- Modify: `app/src/data/storeContext.ts`
- Modify: `app/src/data/store.tsx`
- Modify: `app/src/data/supabaseStore.tsx`

**Interfaces:**
- Produces: `Store.pantryAdd` changes from `(input) => void` to `(input) => Promise<{ id: string; merged: boolean; addedQuantity: number }>` in the shared `Store` interface. Both implementations conform. Consumed by Task 12 (the redesigned sheet's `submit` and undo).
- **No caller exists yet that needs updating in this task** — `PantryAddSheet.tsx`'s current `submit` calls `pantryAdd({...})` without using a return value or awaiting it; that's fine, a `Promise` being ignored doesn't break anything, and Task 12 rewrites that call site anyway. Confirm this by grepping for `pantryAdd(` outside the three files this task touches before starting — the current sole call site (`PantryAddSheet.tsx`) is about to be rewritten in Task 12, not this one.

- [ ] **Step 1: Update the `Store` interface**

In `app/src/data/storeContext.ts`, find:

```ts
  pantryAdd: (input: {
    name: string;
    quantity: number;
    unit: Unit;
    location: PantryLoc;
    expiresOn?: string;
  }) => void;
```

Replace with:

```ts
  pantryAdd: (input: {
    name: string;
    quantity: number;
    unit: Unit;
    location: PantryLoc;
    expiresOn?: string;
  }) => Promise<{ id: string; merged: boolean; addedQuantity: number }>;
```

- [ ] **Step 2: Demo store — hoist the id, merge on conflict, return the new shape**

In `app/src/data/store.tsx`, find the current `pantryAdd`:

```ts
  const pantryAdd = useCallback(
    (input: { name: string; quantity: number; unit: Unit; location: PantryLoc; expiresOn?: string }) =>
      setData((d) => {
        const resolved = resolveIngredient(d.ingredients, input.name, input.unit);
        const item: StoredPantryItem = {
          id: uid('p'),
          ingredientId: resolved.id,
          quantity: input.quantity,
          unit: input.unit,
          location: input.location,
          expiresOn: input.expiresOn ?? null,
        };
        return { ...d, ingredients: resolved.list, pantry: [...d.pantry, item] };
      }),
    [resolveIngredient, setData],
  );
```

Replace with:

```ts
  const pantryAdd = useCallback(
    async (input: { name: string; quantity: number; unit: Unit; location: PantryLoc; expiresOn?: string }) => {
      // Se genera fuera del updater de setData a propósito: bajo
      // <StrictMode>, React invoca el updater dos veces en desarrollo, y un
      // uid() generado DENTRO del updater daría dos ids distintos entre lo
      // que esta función devuelve y lo que React realmente guarda —
      // rompiendo el deshacer en silencio.
      const newId = uid('p');
      let result!: { id: string; merged: boolean; addedQuantity: number };
      setData((d) => {
        const resolved = resolveIngredient(d.ingredients, input.name, input.unit);
        const existing = d.pantry.find(
          (p) => p.ingredientId === resolved.id && p.unit === input.unit && p.location === input.location,
        );
        if (existing) {
          result = { id: existing.id, merged: true, addedQuantity: input.quantity };
          const pantry = d.pantry.map((p) =>
            p.id === existing.id
              ? { ...p, quantity: p.quantity + input.quantity, expiresOn: p.expiresOn ?? input.expiresOn ?? null }
              : p,
          );
          return { ...d, ingredients: resolved.list, pantry };
        }
        result = { id: newId, merged: false, addedQuantity: input.quantity };
        const item: StoredPantryItem = {
          id: newId,
          ingredientId: resolved.id,
          quantity: input.quantity,
          unit: input.unit,
          location: input.location,
          expiresOn: input.expiresOn ?? null,
        };
        return { ...d, ingredients: resolved.list, pantry: [...d.pantry, item] };
      });
      return result;
    },
    [resolveIngredient, setData],
  );
```

- [ ] **Step 3: Real store — use the new RPC, return the new shape**

In `app/src/data/supabaseStore.tsx`, find the current `pantryAdd`:

```ts
  const pantryAdd = useCallback(
    (input: { name: string; quantity: number; unit: Unit; location: PantryLoc; expiresOn?: string }) => {
      void (async () => {
        const ingredientId = await resolveIngredientId(input.name, input.unit);
        const { error } = await supabase.from('pantry_item').insert({
          household_id: householdId,
          ingredient_id: ingredientId,
          quantity: input.quantity,
          unit: input.unit,
          location: input.location,
          expires_on: input.expiresOn ?? null,
        });
        if (!error) {
          void queryClient.invalidateQueries({ queryKey: pantryKey });
          void queryClient.invalidateQueries({ queryKey: ingredientsKey });
        }
      })();
    },
    [resolveIngredientId, householdId, queryClient, pantryKey, ingredientsKey],
  );
```

Replace with:

```ts
  const pantryAdd = useCallback(
    async (input: { name: string; quantity: number; unit: Unit; location: PantryLoc; expiresOn?: string }) => {
      const ingredientId = await resolveIngredientId(input.name, input.unit);
      const { data, error } = await supabase
        .rpc('pantry_add', {
          p_ingredient_id: ingredientId,
          p_quantity: input.quantity,
          p_unit: input.unit,
          p_location: input.location,
          p_expires_on: input.expiresOn ?? null,
        })
        .select('id, merged, added_quantity')
        .single();
      if (error) throw error;
      void queryClient.invalidateQueries({ queryKey: pantryKey });
      void queryClient.invalidateQueries({ queryKey: ingredientsKey });
      return { id: data.id as string, merged: data.merged as boolean, addedQuantity: data.added_quantity as number };
    },
    [resolveIngredientId, queryClient, pantryKey, ingredientsKey],
  );
```

(`householdId` is dropped from the dependency array because it's no longer referenced directly in this function — the RPC resolves the household server-side via `private.current_household()`, same as `resolveIngredientId` and every other RPC-backed action already does. If `npm run lint` flags an unused-variable warning for anything else after this change, that's a signal something wasn't removed correctly — investigate rather than suppressing it.)

- [ ] **Step 4: Typecheck**

Run: `cd app && npm run lint`
Expected: no errors. If TypeScript complains that `pantryAdd`'s new `Promise`-returning signature doesn't match how `PantryAddSheet.tsx` currently calls it (a plain, un-awaited call, `pantryAdd({...});` with no `.then`/`await`), that's expected and fine — a function returning `Promise<X>` called without `await` still type-checks (the promise is just not consumed); it's not an error. Task 12 rewrites that call site properly.

- [ ] **Step 5: Run the full test suite**

Run: `cd app && npm test`
Expected: 40/40 passing — this task doesn't touch any domain function.

- [ ] **Step 6: Commit**

```bash
cd /home/jars/Programing/Rezet
git add app/src/data/storeContext.ts app/src/data/store.tsx app/src/data/supabaseStore.tsx
git commit -m "$(cat <<'EOF'
pantryAdd merges on conflict, returns what happened

Both stores: adding an ingredient+unit+location that already exists
in the pantry now sums into that row instead of silently no-op'ing
(Supabase, which has a real unique constraint on this) or silently
duplicating (demo, which had no such constraint and just pushed a
second row). pantryAdd now returns { id, merged, addedQuantity } so a
future undo can reverse exactly what an add did — pantryBump(id,
-addedQuantity) for a merge, pantryDelete(id) for a fresh row —
rather than deleting an entire pre-existing row's quantity.

Also fixes a real latent bug: the demo store's new-item id used to be
generated inside the setData updater, which React's StrictMode
double-invokes in development — the id returned to the caller and the
id actually persisted could silently diverge. The id is now generated
once, outside the updater, and used consistently on both sides.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01KzPF5aTDAt1N9CpuoXvSzU
EOF
)"
```

---

## Task 9: Delete dead code (`resizeImageFile`, unused icons)

**Files:**
- Modify: `app/src/lib/imageCapture.ts`
- Modify: `app/src/ui/Icon.tsx`

**Interfaces:** none new — this is pure removal, done now (before Task 11 creates `PantryScanCapture`, which would otherwise be tempted to reference the old helper) so that component never has a moment where dead code and new code coexist. Task 10 (i18n keys) is sequenced between this task and Task 11 — this task's removals leave `PantryBarcodeCapture.tsx`/`PantryPhotoCapture.tsx` broken in the interim, which is expected and resolved when Task 11 deletes both.

- [ ] **Step 1: Remove `resizeImageFile` from `imageCapture.ts`**

Read the current full file first — it contains both `resizeImageFile` and `blobToBase64`. Remove only the `resizeImageFile` function and its doc comment (keep `blobToBase64` — it's still used by the new `PantryScanCapture` in Task 11). The file's remaining content should be just the `blobToBase64` function:

```ts
/** Blob -> base64 sin el prefijo `data:...;base64,`, para mandar a una Edge Function. */
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve((reader.result as string).split(',')[1] ?? '');
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
```

(If the current file has anything else in it beyond these two functions, leave it — this step only removes `resizeImageFile`.)

- [ ] **Step 2: Remove the `camera`/`barcode` icon paths from `Icon.tsx`**

In `app/src/ui/Icon.tsx`, remove these two lines from the `PATHS` object:

```ts
  camera: 'M9 4h6l1.5 2.5H19a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8.5a2 2 0 0 1 2-2h2.5Z',
  barcode: 'M4 6v12M7 6v12M9.5 6v12M12 6v12M14.5 6v12M17 6v12M20 6v12',
```

and remove this line from the component body:

```tsx
      {name === 'camera' && <circle cx="12" cy="13" r="3.3" />}
```

- [ ] **Step 3: Typecheck**

Run: `cd app && npm run lint`
Expected: TypeScript will error on any remaining `<Icon name="camera" .../>` or `<Icon name="barcode" .../>` usage, since `IconName` no longer includes them — this is expected. Confirm the ONLY errors are in `app/src/sheets/PantryBarcodeCapture.tsx` and `app/src/sheets/PantryPhotoCapture.tsx` (both about to be deleted in Task 11) and, if it references `resizeImageFile`, `app/src/sheets/PantryPhotoCapture.tsx` again. If any OTHER file errors, stop and investigate before continuing — that would mean one of these was used somewhere this plan didn't account for.

Do not attempt to fix those errors in this task — Task 11 deletes both files, which resolves them. (Task 10, i18n keys, runs in between and doesn't touch either file.)

- [ ] **Step 4: Commit**

```bash
cd /home/jars/Programing/Rezet
git add app/src/lib/imageCapture.ts app/src/ui/Icon.tsx
git commit -m "$(cat <<'EOF'
Remove resizeImageFile and the camera/barcode icons ahead of PantryScanCapture

Dead after the pantry-add redesign: PantryScanCapture (added two
commits from now, after the i18n keys it needs) draws its Gemini-path
resize directly from a <video> element via canvas, never from a
File, so it can't reuse the File-oriented resizeImageFile helper; the
two icons were only ever used by the capture components this redesign
deletes.

This intentionally leaves PantryBarcodeCapture.tsx/PantryPhotoCapture.tsx
failing to typecheck for the next two commits — they're deleted once
PantryScanCapture lands, not here, to keep this diff a pure,
reviewable removal.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01KzPF5aTDAt1N9CpuoXvSzU
EOF
)"
```

---

## Task 10: i18n keys — add new, remove unused

**Files:**
- Modify: `app/src/i18n/es.ts`
- Modify: `app/src/i18n/en.ts`

**Interfaces:**
- Produces: `t.recognizeByPhoto`, `t.enterManually`, `t.cameraUnavailable`, `t.scanAgain`, `t.undo`, `t.pantryAddError`, `t.relative3Days`, `t.relative1Week`, `t.relative1Month`, `t.dateOption`. Consumed by Task 11 (`PantryScanCapture`, not yet created) and Task 12 (the `PantryAddSheet` rewrite). This task is deliberately sequenced *before* Task 11 so that when `PantryScanCapture.tsx` is created, every `t.*` key it references already exists — a fresh component referencing an undeclared key is a hard TypeScript error against the `Dictionary` type (`typeof es`), not a silent `undefined`, so getting the order right here avoids a self-inflicted typecheck failure in the very next task.

- [ ] **Step 1: Add the new keys to `es.ts`**

In `app/src/i18n/es.ts`, find the current pantry-section block ending in:

```ts
  addManual: 'Manual',
  addBarcode: 'Código de barras',
  addPhotoMode: 'Foto',
  takePhoto: 'Tomar foto',
  lookingUp: 'Buscando…',
  scanNotFound: 'No se encontró el producto',
  scanDecodeFailed: 'No se pudo leer el código',
  enterBarcodeManually: 'Escribe el código a mano',
  photoRecognizeFailed: 'No se pudo reconocer la foto',
```

Replace with:

```ts
  lookingUp: 'Buscando…',
  scanNotFound: 'No se encontró el producto',
  photoRecognizeFailed: 'No se pudo reconocer la foto',
  recognizeByPhoto: 'Reconocer por foto',
  enterManually: 'Escribirlo a mano',
  cameraUnavailable: 'No se pudo acceder a la cámara',
  scanAgain: 'Escanear otro',
  undo: 'Deshacer',
  pantryAddError: 'No se pudo añadir. Inténtalo de nuevo.',
  relative3Days: '3 días',
  relative1Week: '1 semana',
  relative1Month: '1 mes',
  dateOption: 'Fecha',
```

(This removes `addManual`, `addBarcode`, `addPhotoMode`, `takePhoto`, `scanDecodeFailed`, `enterBarcodeManually` — all confirmed unused outside the files this plan deletes/rewrites — and adds the 10 new keys.)

- [ ] **Step 2: Same change in `en.ts`**

In `app/src/i18n/en.ts`, find:

```ts
  addManual: 'Manual',
  addBarcode: 'Barcode',
  addPhotoMode: 'Photo',
  takePhoto: 'Take a photo',
  lookingUp: 'Looking up…',
  scanNotFound: 'Product not found',
  scanDecodeFailed: "Couldn't read the barcode",
  enterBarcodeManually: 'Type the code by hand',
  photoRecognizeFailed: "Couldn't recognize the photo",
```

Replace with:

```ts
  lookingUp: 'Looking up…',
  scanNotFound: 'Product not found',
  photoRecognizeFailed: "Couldn't recognize the photo",
  recognizeByPhoto: 'Recognize by photo',
  enterManually: 'Enter it by hand',
  cameraUnavailable: "Couldn't access the camera",
  scanAgain: 'Scan another',
  undo: 'Undo',
  pantryAddError: "Couldn't add it. Please try again.",
  relative3Days: '3 days',
  relative1Week: '1 week',
  relative1Month: '1 month',
  dateOption: 'Date',
```

- [ ] **Step 3: Typecheck**

Run: `cd app && npm run lint`
Expected: **this will NOT be clean yet, and that's expected** — Task 9 already left `PantryBarcodeCapture.tsx`/`PantryPhotoCapture.tsx` failing to typecheck (they reference the now-removed `resizeImageFile` and `camera`/`barcode` icons), and `PantryAddSheet.tsx` still imports both of those files and references the old `addManual`/`addBarcode`/`addPhotoMode` keys this task just removed. Confirm the errors are confined to exactly those three files (the same two from Task 9, plus `PantryAddSheet.tsx` newly erroring on the removed keys) — nothing else should be affected by this task's changes. Both remaining sources of error are resolved in the next two tasks (Task 11 deletes the two capture files; Task 12 rewrites `PantryAddSheet.tsx`), not this one.

- [ ] **Step 4: Commit**

```bash
cd /home/jars/Programing/Rezet
git add app/src/i18n/es.ts app/src/i18n/en.ts
git commit -m "$(cat <<'EOF'
Update i18n for the pantry-add redesign

Adds the 10 keys the new scan/manual flow needs; removes 6 that only
existed for the three-chip mode row and the now-deleted
manual-barcode-entry UI.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01KzPF5aTDAt1N9CpuoXvSzU
EOF
)"
```

---

## Task 11: `PantryScanCapture` — unified live-camera capture

**Files:**
- Create: `app/src/sheets/PantryScanCapture.tsx`
- Delete: `app/src/sheets/PantryBarcodeCapture.tsx`
- Delete: `app/src/sheets/PantryPhotoCapture.tsx`

**Interfaces:**
- Consumes: `mapOpenFoodFactsProduct`, `mapGeminiRecognition`, `OffApiResponse` from `../domain/pantryImport` (already exist, unchanged); `blobToBase64` from `../lib/imageCapture` (Task 9 left this in place); `supabase` from `../data/supabaseClient`.
- Produces: `PantryScanCapture({ allowPhoto, onResult, onManual }: { allowPhoto: boolean; onResult: (item: { name: string; quantity?: number; unit?: Unit; expiresOn?: string }) => void; onManual: () => void })`. Consumed by Task 12.

- [ ] **Step 1: Create the component**

Create `app/src/sheets/PantryScanCapture.tsx`:

```tsx
import { useCallback, useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import type { IScannerControls } from '@zxing/browser';
import { usePrefs } from '../store/prefs';
import { supabase } from '../data/supabaseClient';
import { mapGeminiRecognition, mapOpenFoodFactsProduct, type OffApiResponse } from '../domain/pantryImport';
import { blobToBase64 } from '../lib/imageCapture';
import { Button } from '../ui/Button';
import type { Unit } from '../types';

type Status = 'starting' | 'scanning' | 'looking' | 'notFound' | 'photoFailed' | 'noCamera';

async function lookupBarcode(code: string): Promise<{ name: string; quantity: number; unit: Unit } | null> {
  try {
    const res = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=product_name,quantity,product_quantity,product_quantity_unit`,
    );
    if (!res.ok) return null;
    return mapOpenFoodFactsProduct((await res.json()) as OffApiResponse);
  } catch {
    return null;
  }
}

/**
 * Cámara viva unificada: decodifica código de barras en bucle sobre el
 * vídeo, con un botón manual "Reconocer por foto" (Gemini) como respaldo.
 * Sustituye a PantryBarcodeCapture + PantryPhotoCapture.
 */
export function PantryScanCapture({
  allowPhoto,
  onResult,
  onManual,
}: {
  allowPhoto: boolean;
  onResult: (item: { name: string; quantity?: number; unit?: Unit; expiresOn?: string }) => void;
  onManual: () => void;
}) {
  const { t } = usePrefs();
  const [status, setStatus] = useState<Status>('starting');
  const [attempt, setAttempt] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  // Vive toda la vida del componente (no del efecto de escaneo, que se
  // reinicia en cada `attempt`) — es la única señal de cancelación que le
  // hace falta a captureFrameForGemini, una acción disparada por el
  // usuario una vez, no algo que el efecto de escaneo reinicie.
  const unmountedRef = useRef(false);
  useEffect(() => () => {
    unmountedRef.current = true;
  }, []);

  const runLookup = useCallback(
    async (code: string, cancelledRef: { current: boolean }) => {
      setStatus('looking');
      const item = await lookupBarcode(code);
      if (cancelledRef.current) return;
      if (item) onResult(item);
      else setStatus('notFound');
    },
    [onResult],
  );

  useEffect(() => {
    const cancelledRef = { current: false };
    const video = videoRef.current;
    if (video) video.muted = true;
    const reader = new BrowserMultiFormatReader();
    reader
      .decodeFromConstraints(
        { video: { facingMode: { ideal: 'environment' } } },
        video ?? undefined,
        (result) => {
          if (cancelledRef.current || !result) return;
          controlsRef.current?.stop();
          void runLookup(result.getText(), cancelledRef);
        },
      )
      .then((controls) => {
        if (cancelledRef.current) {
          controls.stop();
          return;
        }
        controlsRef.current = controls;
        setStatus('scanning');
      })
      .catch(() => {
        if (!cancelledRef.current) setStatus('noCamera');
      });
    return () => {
      cancelledRef.current = true;
      controlsRef.current?.stop();
    };
  }, [attempt, runLookup]);

  const captureFrameForGemini = async () => {
    const video = videoRef.current;
    if (!video) return;
    setStatus('looking');
    controlsRef.current?.stop();
    try {
      // Se dibuja directo desde el <video> vivo, no desde un File — por eso
      // no usa resizeImageFile (que se quitó del todo en el commit
      // anterior). El resize aquí SÍ es seguro (a diferencia del código de
      // barras, que decodifica el frame de vídeo directamente, nunca una
      // copia reducida/recomprimida).
      const canvas = document.createElement('canvas');
      const maxDim = 1024;
      const scale = Math.min(1, maxDim / Math.max(video.videoWidth, video.videoHeight));
      canvas.width = video.videoWidth * scale;
      canvas.height = video.videoHeight * scale;
      canvas.getContext('2d')!.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/jpeg', 0.85),
      );
      const image = await blobToBase64(blob);
      const { data, error } = await supabase.functions.invoke('recognize-pantry-item', {
        body: { image, mimeType: 'image/jpeg' },
      });
      if (unmountedRef.current) return;
      if (error) return setStatus('photoFailed');
      const recognized = mapGeminiRecognition(data);
      if (!recognized) return setStatus('photoFailed');
      onResult({
        name: recognized.name,
        quantity: recognized.quantity ?? undefined,
        unit: recognized.unit ?? undefined,
        expiresOn: recognized.expiresOn ?? undefined,
      });
    } catch {
      if (!unmountedRef.current) setStatus('photoFailed');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'center', padding: '4px 0' }}>
      {(status === 'starting' || status === 'scanning' || status === 'looking') && (
        <video
          ref={videoRef}
          playsInline
          style={{ width: '100%', height: 220, borderRadius: 20, objectFit: 'cover', background: 'var(--soft)' }}
        />
      )}

      {status === 'looking' && <div style={{ color: 'var(--muted)', fontSize: 14.5 }}>{t.lookingUp}</div>}

      {status === 'scanning' && allowPhoto && (
        <Button full onClick={() => void captureFrameForGemini()}>
          {t.recognizeByPhoto}
        </Button>
      )}

      {(status === 'noCamera' || status === 'notFound' || status === 'photoFailed') && (
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
          {status === 'noCamera' && <div style={{ fontSize: 13, color: 'var(--warn-ink)' }}>{t.cameraUnavailable}</div>}
          {status === 'notFound' && <div style={{ fontSize: 13, color: 'var(--warn-ink)' }}>{t.scanNotFound}</div>}
          {status === 'photoFailed' && <div style={{ fontSize: 13, color: 'var(--warn-ink)' }}>{t.photoRecognizeFailed}</div>}
          {status !== 'noCamera' && (
            <Button full onClick={() => setAttempt((n) => n + 1)}>
              {t.scanAgain}
            </Button>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={onManual}
        style={{ border: 0, background: 'transparent', padding: 0, fontSize: 14.5, fontWeight: 600, color: 'var(--accent-ink)' }}
      >
        {t.enterManually}
      </button>
    </div>
  );
}
```

**Correction (post-Task-11-implementation).** The version of this code above has already been fixed once: an earlier draft gave `captureFrameForGemini` its own local `const cancelledRef = { current: false };`, disconnected from the mount effect's `cancelledRef` that actually flips to `true` on unmount — so the guard checks inside `captureFrameForGemini` could never fire, making them dead code. The implementer caught this by re-reading the code rather than deviating from the brief unilaterally, correctly implemented the (buggy) version as specified, and flagged it. Fixed by introducing a component-lifetime `unmountedRef` (a `useRef` flipped in a dedicated unmount-only effect, independent of the scanning effect that restarts on `attempt`), which `captureFrameForGemini` now checks instead — the code above already reflects this fix.

- [ ] **Step 2: Delete the two superseded files**

```bash
git rm app/src/sheets/PantryBarcodeCapture.tsx app/src/sheets/PantryPhotoCapture.tsx
```

- [ ] **Step 3: Typecheck**

Run: `cd app && npm run lint`
Expected: errors ONLY in `app/src/sheets/PantryAddSheet.tsx` now (it still imports the two deleted files and references the old three-chip `mode` type — that's Task 12's job to fix). No errors anywhere else. `PantryScanCapture.tsx` itself must be clean.

- [ ] **Step 4: Manual verification (as far as possible before Task 12 wires it in)**

`PantryScanCapture` isn't rendered from anywhere yet. You can still sanity-check the camera/zxing wiring works by temporarily rendering it directly (e.g. swap it in for a moment in `Pantry.tsx` with hardcoded props `allowPhoto={true} onResult={console.log} onManual={() => {}}`), running `npm run dev`, granting camera permission, and confirming: the live video preview appears, pointing it at a real barcode logs a result to the console, denying camera permission (browser site settings) reaches the `noCamera` message, and "Escribirlo a mano" calls `onManual`. Remove the temporary wiring before committing — this is a smoke test, not the real integration (Task 12).

- [ ] **Step 5: Commit**

```bash
cd /home/jars/Programing/Rezet
git add app/src/sheets/PantryScanCapture.tsx
git add app/src/sheets/PantryBarcodeCapture.tsx app/src/sheets/PantryPhotoCapture.tsx
git commit -m "$(cat <<'EOF'
Add PantryScanCapture, delete the two components it replaces

Live camera preview + continuous client-side barcode decode
(@zxing/browser's decodeFromConstraints/IScannerControls, verified
against the installed package), with a manual "Reconocer por foto"
button as a Gemini fallback — merges what were two separate,
near-identical tabs (Barcode / Foto) into one flow. A failed lookup
or recognition offers "Escanear otro" to restart rather than
dead-ending; "Escribirlo a mano" is always reachable regardless of
status.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01KzPF5aTDAt1N9CpuoXvSzU
EOF
)"
```

---

## Task 12: `PantryAddSheet` rewrite

**Files:**
- Modify: `app/src/sheets/PantryAddSheet.tsx`

**Interfaces:**
- Consumes: `SegmentedControl` (Task 3); `findIngredientByName`, `inferFoodGroup`, `defaultLocationFor` (Task 1); `parseQuantityInput` (Task 2); `PantryScanCapture` (Task 11); `Store.pantryAdd`'s new `Promise<{id, merged, addedQuantity}>`-returning signature (Task 8); `Pill` from `../ui/Chip`; `offsetKey`, `todayKey` from `../domain/dates`; forwarded `ref` on `IngredientNameField` (Task 4); the new i18n keys (Task 10).

This is the largest, most integration-heavy task — it's where every prior task's piece gets wired together. Read the whole task before starting.

- [ ] **Step 1: Replace the entire file**

Read the current file first (`app/src/sheets/PantryAddSheet.tsx`) to confirm its current state matches what every prior task in this plan already changed (props: `onClose`, `onToast`, `allowPhoto`; still imports the now-deleted `PantryBarcodeCapture`/`PantryPhotoCapture` and still has the old `mode: 'manual' | 'barcode' | 'photo'` — this is expected, Tasks 9-10 deliberately left this file broken until now).

Replace the entire file with:

```tsx
import { useRef, useState } from 'react';
import { usePrefs } from '../store/prefs';
import { useData } from '../data/store';
import { Button } from '../ui/Button';
import { OptionChip, Pill } from '../ui/Chip';
import { IngredientNameField } from '../ui/IngredientNameField';
import { TextField } from '../ui/Fields';
import { SegmentedControl } from '../ui/SegmentedControl';
import { Sheet } from '../ui/Sheet';
import { radius, text as T } from '../ui/tokens';
import { offsetKey, todayKey } from '../domain/dates';
import { defaultLocationFor, findIngredientByName, inferFoodGroup } from '../domain/recipeText';
import { parseQuantityInput } from '../domain/units';
import { PantryScanCapture } from './PantryScanCapture';
import type { PantryLoc, Unit } from '../types';

type ExpiryChoice = '3d' | '1w' | '1m' | 'date' | null;

interface AddedItem {
  id: string;
  name: string;
  quantitySummary: string;
  merged: boolean;
  addedQuantity: number;
}

export function PantryAddSheet({
  onClose,
  onToast,
  allowPhoto = false,
}: {
  onClose: () => void;
  onToast: (message: string) => void;
  allowPhoto?: boolean;
}) {
  const { t, locale, loc } = usePrefs();
  const { pantryAdd, pantryBump, pantryDelete, ingredients } = useData();

  const [mode, setMode] = useState<'scan' | 'manual'>('scan');
  const [name, setName] = useState('');
  const [quantityInput, setQuantityInput] = useState('');
  const [location, setLocation] = useState<PantryLoc>('cupboard');
  const [locationTouched, setLocationTouched] = useState(false);
  const [expiresOn, setExpiresOn] = useState('');
  const [expiryChoice, setExpiryChoice] = useState<ExpiryChoice>(null);
  const [submitting, setSubmitting] = useState(false);
  const [addedItems, setAddedItems] = useState<AddedItem[]>([]);

  const nameRef = useRef<HTMLInputElement>(null);

  const matchedIngredient = name.trim() ? findIngredientByName(ingredients, name.trim()) : undefined;
  const fallbackUnit: Unit = matchedIngredient?.defaultUnit ?? 'ud';
  const { quantity: resolvedQuantity, unit: resolvedUnit } = parseQuantityInput(quantityInput, fallbackUnit);

  const inferredGroup = matchedIngredient?.group ?? (name.trim() ? inferFoodGroup(name.trim()) : undefined);
  const effectiveLocation = locationTouched ? location : inferredGroup ? defaultLocationFor(inferredGroup) : location;

  const focusName = () => {
    // Se dispara siempre dentro de un gesto del usuario (click), nunca en
    // un useEffect — iOS no levanta el teclado para un focus() disparado
    // fuera de un gesto real.
    requestAnimationFrame(() => nameRef.current?.focus());
  };

  const goManual = () => {
    setMode('manual');
    focusName();
  };

  const applyPrefill = (item: { name: string; quantity?: number; unit?: Unit; expiresOn?: string }) => {
    setName(item.name);
    if (item.quantity != null) setQuantityInput(item.unit ? `${item.quantity} ${item.unit}` : String(item.quantity));
    if (item.expiresOn) {
      if (item.expiresOn === offsetKey(3)) setExpiryChoice('3d');
      else if (item.expiresOn === offsetKey(7)) setExpiryChoice('1w');
      else if (item.expiresOn === offsetKey(30)) setExpiryChoice('1m');
      else setExpiryChoice('date');
      setExpiresOn(item.expiresOn);
    }
    setMode('manual');
    focusName();
  };

  const pickExpiry = (choice: ExpiryChoice) => {
    setExpiryChoice(choice);
    if (choice === '3d') setExpiresOn(offsetKey(3));
    else if (choice === '1w') setExpiresOn(offsetKey(7));
    else if (choice === '1m') setExpiresOn(offsetKey(30));
    else if (choice === 'date') setExpiresOn((v) => v || todayKey());
    else setExpiresOn('');
  };

  const resetForm = () => {
    setName('');
    setQuantityInput('');
    setExpiresOn('');
    setExpiryChoice(null);
    setLocationTouched(false);
  };

  const submit = async () => {
    if (!name.trim() || submitting) return;
    setSubmitting(true);
    try {
      const result = await pantryAdd({
        name: name.trim(),
        quantity: resolvedQuantity,
        unit: resolvedUnit,
        location: effectiveLocation,
        expiresOn: expiresOn || undefined,
      });
      setAddedItems((items) => [
        ...items,
        {
          id: result.id,
          name: name.trim(),
          quantitySummary: `${resolvedQuantity} ${resolvedUnit}`,
          merged: result.merged,
          addedQuantity: result.addedQuantity,
        },
      ]);
      resetForm();
      focusName();
    } catch {
      onToast(t.pantryAddError);
    } finally {
      setSubmitting(false);
    }
  };

  const undoAdd = (item: AddedItem) => {
    if (item.merged) pantryBump(item.id, -item.addedQuantity);
    else pantryDelete(item.id);
    setAddedItems((items) => items.filter((i) => i.id !== item.id));
  };

  const locations: Array<{ value: PantryLoc; label: string }> = [
    { value: 'cupboard', label: t.cupboard },
    { value: 'fridge', label: t.fridge },
    { value: 'freezer', label: t.freezer },
  ];

  return (
    <Sheet title={t.add} onClose={onClose}>
      {mode === 'scan' && (
        <PantryScanCapture allowPhoto={allowPhoto} onResult={applyPrefill} onManual={goManual} />
      )}

      {mode === 'manual' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingBottom: 6 }}>
          <button
            type="button"
            onClick={() => setMode('scan')}
            style={{ alignSelf: 'flex-start', border: 0, background: 'transparent', padding: 0, fontSize: 14, fontWeight: 600, color: 'var(--accent-ink)' }}
          >
            {t.scanAgain}
          </button>

          <IngredientNameField
            ref={nameRef}
            value={name}
            onChange={setName}
            placeholder={t.itemName}
            ingredients={ingredients}
            locale={locale}
            loc={loc}
            style={{ ...T.cardTitle, height: 54 }}
          />

          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <TextField
              value={quantityInput}
              onChange={setQuantityInput}
              placeholder="500 g"
              inputMode="text"
              style={{ flex: 1, fontVariantNumeric: 'tabular-nums' }}
            />
            <Pill>{resolvedUnit}</Pill>
          </div>

          <div>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 8 }}>{t.location}</div>
            <SegmentedControl
              value={effectiveLocation}
              onChange={(v) => {
                setLocation(v);
                setLocationTouched(true);
              }}
              options={locations}
            />
          </div>

          <div>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 8 }}>{t.expiresOnLabel}</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <OptionChip label={t.relative3Days} active={expiryChoice === '3d'} onClick={() => pickExpiry(expiryChoice === '3d' ? null : '3d')} />
              <OptionChip label={t.relative1Week} active={expiryChoice === '1w'} onClick={() => pickExpiry(expiryChoice === '1w' ? null : '1w')} />
              <OptionChip label={t.relative1Month} active={expiryChoice === '1m'} onClick={() => pickExpiry(expiryChoice === '1m' ? null : '1m')} />
              <OptionChip label={t.dateOption} active={expiryChoice === 'date'} onClick={() => pickExpiry(expiryChoice === 'date' ? null : 'date')} />
            </div>
            {expiryChoice === 'date' && (
              <div style={{ marginTop: 10 }}>
                <TextField type="date" min={todayKey()} value={expiresOn} onChange={setExpiresOn} />
              </div>
            )}
          </div>

          <Button full size="primary" disabled={!name.trim() || submitting} onClick={() => void submit()} style={{ borderRadius: radius.button }}>
            {t.add}
          </Button>

          {addedItems.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
              {addedItems.map((item) => (
                <div key={item.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 2px' }}>
                  <div style={{ fontSize: 14.5 }}>
                    {item.name} <span style={{ color: 'var(--muted)' }}>· {item.quantitySummary}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => undoAdd(item)}
                    style={{ border: 0, background: 'transparent', padding: 0, fontSize: 13.5, fontWeight: 600, color: 'var(--warn-ink)' }}
                  >
                    {t.undo}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Sheet>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd app && npm run lint`
Expected: no errors anywhere in the project. This is the point where every previously-deferred error (Task 9's icon/resize removal, Task 10's key rename, Task 11's deleted files) must have finally resolved. If anything still errors, that's this task's problem to fix — don't leave it for a later task.

- [ ] **Step 3: Run the full test suite**

Run: `cd app && npm test`
Expected: 40+ tests passing (should be 40 + the ~19 new ones from Tasks 1-2 = 59 total; check the actual count printed and sanity-check it against `npx vitest run --reporter=verbose` if the number looks off).

- [ ] **Step 4: Manual verification — this is the real integration test**

Run `cd app && npm run dev`. In demo mode, open Pantry → Añadir:

1. Confirm the sheet opens directly on the live camera view (grant permission when prompted).
2. Tap "Escribirlo a mano" → confirm it switches to the Manual form with the name field focused (keyboard should be up on a real mobile device or mobile emulation; on desktop, just confirm the caret is in the name field).
3. Type "Leche" → confirm the location segmented control's pill visibly slides to Nevera without you touching it.
4. Tap "Congelador" yourself → confirm the pill moves there and typing more into the name field no longer overrides your choice.
5. Type "500 g" in quantity → confirm the `Pill` next to it shows "g"; change to "2 kg" → confirm it shows "g" still (2000 stored, displayed unit is the normalized one) — or adjust your own manual check to whatever the `Pill` is actually bound to render (`resolvedUnit`) and confirm it reads correctly for a few inputs (`"3"`, `"3 pcs"`, `"500 gramos"`).
6. Confirm "Añadir" is disabled with an empty name, enabled once you type one.
7. Add the item — confirm the sheet does NOT close, the form clears, focus returns to the name field, and the item appears in a list below with a "Deshacer" button.
8. Add the SAME ingredient+unit+location again — confirm it does not create a second row (check the real Pantry screen behind the sheet after closing) and instead sums the quantity.
9. Tap "Deshacer" on an item that was a fresh add — confirm it disappears from the pantry entirely. Add an item that merges into an existing one, then undo it — confirm only the added amount is subtracted, not the whole row.
10. Close the sheet (×, swipe, or Escape) and confirm the Pantry screen reflects everything correctly.
11. Confirm the "Foto" / "Reconocer por foto" button does NOT appear anywhere in demo mode (open the scan view again — no such button).
12. If you have a real (non-demo) account with the Edge Function deployed and a real Gemini key (see the prior plan's follow-up), also verify: "Reconocer por foto" appears in scan mode for a real account, and a successful recognition with an `expiresOn` correctly pre-selects either a relative chip or "Fecha" with the date populated (per the spec's fix for this).

- [ ] **Step 5: Commit**

```bash
cd /home/jars/Programing/Rezet
git add app/src/sheets/PantryAddSheet.tsx
git commit -m "$(cat <<'EOF'
Rewrite PantryAddSheet: camera-first, segmented location, batch add

Replaces the three-equal-weight-chip layout with: a live-camera scan
mode as the default, a Manual mode with the name field leading
visually and getting keyboard focus on a real user gesture, a
combined quantity+unit field with live parsing, a real segmented
control for location defaulting from the ingredient's inferred food
group, relative expiry chips, a disabled-until-valid submit button,
and a stay-open batch-add flow with per-item undo that correctly
distinguishes a merged add from a freshly created row.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01KzPF5aTDAt1N9CpuoXvSzU
EOF
)"
```

---

## Task 13: Sync the design source of truth

**Files:**
- Modify: `README.md`
- Modify: `RezetApp.dc.html`

**Interfaces:** none (documentation only).

- [ ] **Step 1: Find and read the current pantry-add section**

Run: `grep -n "Hoja \*\*Añadir a despensa\*\*" README.md` to find the section this plan's predecessor last updated (§4.8 Despensa). Read that section plus surrounding context.

- [ ] **Step 2: Update `README.md`**

Replace the "Hoja **Añadir a despensa**" paragraph (whatever its current exact text is, after the prior plan's edits) with a description of the new layout: opens on a live camera view (barcode scan + a manual "Reconocer por foto" Gemini fallback button for real accounts); "Escribirlo a mano" switches to the manual form; name field leads visually with keyboard focus; one combined quantity+unit input (`"500 g"`, parsed) with the resolved unit shown as a pill; a real segmented control (not chips) for location, defaulting from the ingredient's inferred food group (fresh → nevera, dry/tinned → armario) until the user picks one themselves; four expiry chips (3 días / 1 semana / 1 mes / Fecha) instead of a bare date picker by default; "Añadir" disabled until a name is entered; and the sheet stays open after each add, listing what's been added with a per-item "Deshacer", closed only via the sheet's own existing chrome.

- [ ] **Step 3: Update `RezetApp.dc.html`**

Find the pantry-add sheet's markup (`grep -n "isSheetPantryAdd" RezetApp.dc.html`) — this is the block the prior plan's Task 11 last rewrote (three-chip mode selector, manual form, barcode/photo placeholder views). Since the prototype's small state-machine framework has no realistic way to simulate a live `getUserMedia` camera feed, represent the scan mode as a static placeholder view (a labeled box saying roughly "cámara en vivo" with a "Reconocer por foto" button and an "Escribirlo a mano" link below it, mirroring the real component's layout without functional camera code) and rewrite the manual form's markup to match Task 12's new structure: name field styled larger/bolder, one combined quantity input with a small pill showing a hardcoded example unit next to it, a segmented-control-styled location row (three buttons inside a single rounded, padded container, rather than three separate `OptionChip`-styled buttons) defaulting via the same fresco→nevera logic the prototype's `savePantry` already encodes for the demo pantry, four expiry chips instead of the single date input as the primary UI (keep the date input, revealed only when the "Fecha" chip is the active one), and an "Añadir" button whose `disabled` styling reflects an empty name field per the prototype's existing conditional-styling conventions elsewhere.

This step is necessarily an approximation (a static HTML/JS prototype can't truly replicate a live camera or a stay-open batch list with real undo) — match the visual language (colors, radii, spacing) precisely since that's what this file exists to pin down, and don't worry about replicating every piece of interactive behavior exactly.

- [ ] **Step 4: Commit**

```bash
cd /home/jars/Programing/Rezet
git add README.md RezetApp.dc.html
git commit -m "$(cat <<'EOF'
Document the redesigned pantry-add sheet

Keeps RezetApp.dc.html and README in sync with PantryAddSheet.tsx —
camera-first capture, segmented location control, combined
quantity+unit field, relative expiry chips, stay-open batch add.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01KzPF5aTDAt1N9CpuoXvSzU
EOF
)"
```

---

## Task 14: Final verification pass

**Files:** none (verification only; fix forward in the relevant file if something's broken).

- [ ] **Step 1: Full test suite**

Run: `cd app && npm test`
Expected: all tests pass (40 pre-existing + ~19 new from Tasks 1-2).

- [ ] **Step 2: Typecheck + build**

Run: `cd app && npm run lint && npm run build`
Expected: both succeed with no errors. Note the bundle size — this plan doesn't add any new dependency, so it should not grow beyond what the prior plan's `@zxing/browser` addition already put it at.

- [ ] **Step 3: Full manual browser walkthrough**

Repeat Task 12 Step 4's full checklist once more end-to-end after all later tasks (13) have landed, to catch anything a docs-only change might have disturbed (it shouldn't have, but confirm).

- [ ] **Step 4: Report to the user**

Summarize what was verified live vs. what still needs a real (non-demo) account + the deployed `recognize-pantry-item` function + a real Gemini key to exercise the photo-recognition path end-to-end, and hand back the plan file path for reference. Also flag explicitly: the new `pantry_add` RPC migration (Task 7) has NOT been applied to the live Supabase project — that, like the photo-recognition prerequisites, needs the user's explicit go-ahead before this feature works against the real backend (demo mode works fully without it).
