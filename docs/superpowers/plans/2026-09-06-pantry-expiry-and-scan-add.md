# Pantry Expiry Dates + Barcode/Photo Add — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let pantry items carry a real expiry date (not the current 5-day-guess heuristic), and let the user add a pantry item by scanning a product barcode (Open Food Facts lookup) or taking a photo (Gemini recognition via a new Supabase Edge Function), always landing back in the same manual form for review before saving.

**Architecture:** `pantryAdd`'s input gains an optional `expiresOn` (real ISO date); both the demo (`data/store.tsx`) and real (`data/supabaseStore.tsx`) stores compute the existing `PantryItem.expiresInDays` from it via one shared pure `domain/dates.ts` helper, recomputed on every read so it never goes stale. `PantryAddSheet` gets three modes (Manual/Barcode/Foto) as local UI state — Barcode and Foto are prefill shortcuts that capture a photo, run a pure domain mapper over the lookup result, and hand the fields back to the same manual form; nothing is saved without the user reviewing and pressing "Añadir".

**Tech Stack:** React + TypeScript (existing app), `@zxing/browser` (new, client-side barcode decode), Open Food Facts public REST API (no key), Supabase Edge Function (Deno) calling the Gemini REST API.

**Spec:** `docs/superpowers/specs/2026-09-06-pantry-expiry-and-scan-add-design.md`

## Global Constraints

- `Unit` is the closed union `'g' | 'ml' | 'ud'` (types.ts:1). Never forward a free-text unit string (from Open Food Facts or anywhere else) into a `Unit`-typed field without normalizing/validating it first.
- No themed component libraries. Build new UI from the existing hand-written primitives only: `Button`, `OptionChip`, `TextField`, `Icon`, `Pressable`, `Sheet` (all in `src/ui/`).
- Color tokens only — no stray hex. Text on a light/tinted background uses `--accent-ink`/`--warn-ink`; text on an accent-filled background uses `--onaccent`.
- Third-party API keys used by an Edge Function are read from the `app_secret` table (`key`/`value` columns) via a service-role Supabase client — never `Deno.env` for these. Rows are inserted manually via `execute_sql`, never committed in a migration.
- No native camera. Capacitor isn't installed in this repo yet — photo/barcode capture uses `<input type="file" accept="image/*" capture="environment">` only.
- Photo-recognition mode is real-backend-only (needs the Edge Function + a Supabase project). It must be hidden when `demo === true`, following the exact gating pattern `App.tsx` already uses for invites: `demo || !onInvite ? undefined : ...`. Barcode mode is client-only and stays available in demo mode.
- This repo's only unit tests are in `app/src/domain/__tests__/` via `vitest run` (`npm test`). There is no jsdom/React-Testing-Library setup — do not add one. New pure logic goes in `domain/` and gets a test file there; UI/component work is verified manually in the browser (`npm run dev`), the same way the onboarding-hero work earlier in this project was verified.
- `PantryItem` (`types.ts:56`), the type every screen already consumes, is not modified. Only the *write* path (`pantryAdd`'s input) and the demo store's *internal* persisted shape change.
- Every commit message ends with:
  ```
  Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01KzPF5aTDAt1N9CpuoXvSzU
  ```

---

## Task 1: Hoist `daysUntil` into `domain/dates.ts`, add `resolveExpiry`

**Files:**
- Modify: `app/src/domain/dates.ts`
- Modify: `app/src/data/supabaseStore.tsx:36-40` (delete local `daysUntil`, import from domain instead)
- Test: `app/src/domain/__tests__/dates.test.ts` (new)

**Interfaces:**
- Produces: `daysUntil(dateStr: string): number` — signed day difference from today (local midnight) to `dateStr`, rounded. `resolveExpiry(dateStr: string | null): number | null` — `null` in, `null` out; otherwise `daysUntil(dateStr)`. Both exported from `domain/dates.ts`. Every later task that needs "date string → relative days" imports these two, never reimplements the arithmetic.

- [ ] **Step 1: Write the failing tests**

Create `app/src/domain/__tests__/dates.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { addDays, dateKey, daysUntil, resolveExpiry } from '../dates';

describe('daysUntil', () => {
  it('es 0 para la fecha de hoy', () => {
    expect(daysUntil(dateKey(new Date()))).toBe(0);
  });
  it('es positivo para una fecha futura', () => {
    expect(daysUntil(dateKey(addDays(new Date(), 5)))).toBe(5);
  });
  it('es negativo para una fecha pasada', () => {
    expect(daysUntil(dateKey(addDays(new Date(), -3)))).toBe(-3);
  });
});

describe('resolveExpiry', () => {
  it('null en, null fuera', () => {
    expect(resolveExpiry(null)).toBeNull();
  });
  it('delega en daysUntil cuando hay fecha', () => {
    const future = dateKey(addDays(new Date(), 2));
    expect(resolveExpiry(future)).toBe(2);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd app && npx vitest run src/domain/__tests__/dates.test.ts`
Expected: FAIL — `daysUntil`/`resolveExpiry` are not exported from `../dates` yet.

- [ ] **Step 3: Add the two functions to `domain/dates.ts`**

Open `app/src/domain/dates.ts`. After the existing `todayKey` export (around line 15), add:

```ts
/** Diferencia de días (con signo) entre hoy y `dateStr`. Negativo = ya caducado. */
export function daysUntil(dateStr: string): number {
  const today = new Date(`${todayKey()}T00:00:00`).getTime();
  const target = new Date(`${dateStr}T00:00:00`).getTime();
  return Math.round((target - today) / 86_400_000);
}

/** `null` si no hay fecha; si no, `daysUntil`. Punto único para "fecha real → días relativos". */
export function resolveExpiry(dateStr: string | null): number | null {
  return dateStr ? daysUntil(dateStr) : null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd app && npx vitest run src/domain/__tests__/dates.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Remove the now-duplicate `daysUntil` from `supabaseStore.tsx`**

In `app/src/data/supabaseStore.tsx`:
- Delete the local function (currently lines 36-40):
  ```ts
  function daysUntil(dateStr: string): number {
    const today = new Date(`${todayKey()}T00:00:00`).getTime();
    const target = new Date(`${dateStr}T00:00:00`).getTime();
    return Math.round((target - today) / 86_400_000);
  }
  ```
- Change the import line (currently line 5):
  ```ts
  import { todayKey, slotForNow } from '../domain/dates';
  ```
  to:
  ```ts
  import { todayKey, slotForNow, resolveExpiry } from '../domain/dates';
  ```
- In `mapPantryItem` (around line 130), replace:
  ```ts
  expiresInDays: row.expires_on ? daysUntil(row.expires_on) : null,
  ```
  with:
  ```ts
  expiresInDays: resolveExpiry(row.expires_on),
  ```

- [ ] **Step 6: Verify the app still typechecks**

Run: `cd app && npm run lint`
Expected: no errors (this is a pure rename/relocate, `resolveExpiry(row.expires_on)` is behaviorally identical to the old ternary).

- [ ] **Step 7: Commit**

```bash
cd /home/jars/Programing/Rezet
git add app/src/domain/dates.ts app/src/domain/__tests__/dates.test.ts app/src/data/supabaseStore.tsx
git commit -m "$(cat <<'EOF'
Hoist daysUntil into domain/dates.ts, add resolveExpiry

Single tested place for "date string -> relative days", shared by both
stores instead of supabaseStore.tsx's private copy. First step of real
pantry expiry dates (see docs/superpowers/specs/2026-09-06-pantry-expiry-and-scan-add-design.md).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01KzPF5aTDAt1N9CpuoXvSzU
EOF
)"
```

---

## Task 2: Pure mappers for Open Food Facts + Gemini results

**Files:**
- Create: `app/src/domain/pantryImport.ts`
- Test: `app/src/domain/__tests__/pantryImport.test.ts`

**Interfaces:**
- Consumes: `Unit` from `../types`.
- Produces:
  - `mapOpenFoodFactsProduct(raw: OffApiResponse): { name: string; quantity: number; unit: Unit } | null`
  - `mapGeminiRecognition(raw: unknown): RecognizedPantryItem | null` where `RecognizedPantryItem = { name: string; quantity: number | null; unit: Unit | null; expiresOn: string | null }`
  - Both exported from `domain/pantryImport.ts`. Task 8 imports `mapOpenFoodFactsProduct` and the `OffApiResponse` type; Task 10 imports `mapGeminiRecognition` and `RecognizedPantryItem`.

- [ ] **Step 1: Write the failing tests**

Create `app/src/domain/__tests__/pantryImport.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { mapGeminiRecognition, mapOpenFoodFactsProduct } from '../pantryImport';

describe('mapOpenFoodFactsProduct', () => {
  it('devuelve null si status no es 1', () => {
    expect(mapOpenFoodFactsProduct({ status: 0 })).toBeNull();
  });
  it('devuelve null si no hay product_name', () => {
    expect(mapOpenFoodFactsProduct({ status: 1, product: {} })).toBeNull();
  });
  it('mapea gramos directo', () => {
    expect(
      mapOpenFoodFactsProduct({
        status: 1,
        product: { product_name: 'Lentejas', product_quantity: 500, product_quantity_unit: 'g' },
      }),
    ).toEqual({ name: 'Lentejas', quantity: 500, unit: 'g' });
  });
  it('normaliza kg a gramos', () => {
    expect(
      mapOpenFoodFactsProduct({
        status: 1,
        product: { product_name: 'Arroz', product_quantity: 1.5, product_quantity_unit: 'kg' },
      }),
    ).toEqual({ name: 'Arroz', quantity: 1500, unit: 'g' });
  });
  it('normaliza litros a mililitros', () => {
    expect(
      mapOpenFoodFactsProduct({
        status: 1,
        product: { product_name: 'Leche', product_quantity: 1, product_quantity_unit: 'l' },
      }),
    ).toEqual({ name: 'Leche', quantity: 1000, unit: 'ml' });
  });
  it('normaliza centilitros a mililitros', () => {
    expect(
      mapOpenFoodFactsProduct({
        status: 1,
        product: { product_name: 'Refresco', product_quantity: 33, product_quantity_unit: 'cl' },
      }),
    ).toEqual({ name: 'Refresco', quantity: 330, unit: 'ml' });
  });
  it('cae a 1 ud si el unit no se reconoce', () => {
    expect(
      mapOpenFoodFactsProduct({
        status: 1,
        product: { product_name: 'Cosa rara', product_quantity: 4, product_quantity_unit: 'oz' },
      }),
    ).toEqual({ name: 'Cosa rara', quantity: 1, unit: 'ud' });
  });
  it('cae a 1 ud si no hay product_quantity', () => {
    expect(
      mapOpenFoodFactsProduct({ status: 1, product: { product_name: 'Manzana' } }),
    ).toEqual({ name: 'Manzana', quantity: 1, unit: 'ud' });
  });
});

describe('mapGeminiRecognition', () => {
  it('devuelve null si no es un objeto', () => {
    expect(mapGeminiRecognition('no')).toBeNull();
    expect(mapGeminiRecognition(null)).toBeNull();
    expect(mapGeminiRecognition([1, 2])).toBeNull();
  });
  it('devuelve null si no hay name', () => {
    expect(mapGeminiRecognition({ quantity: 500, unit: 'g', expiresOn: null })).toBeNull();
  });
  it('mapea un resultado completo válido', () => {
    expect(
      mapGeminiRecognition({ name: 'Yogur natural', quantity: 4, unit: 'ud', expiresOn: '2026-09-20' }),
    ).toEqual({ name: 'Yogur natural', quantity: 4, unit: 'ud', expiresOn: '2026-09-20' });
  });
  it('ignora quantity con tipo incorrecto', () => {
    expect(
      mapGeminiRecognition({ name: 'Leche', quantity: '500', unit: 'ml', expiresOn: null }),
    ).toEqual({ name: 'Leche', quantity: null, unit: 'ml', expiresOn: null });
  });
  it('ignora unit fuera de g/ml/ud', () => {
    expect(
      mapGeminiRecognition({ name: 'Leche', quantity: 1, unit: 'kg', expiresOn: null }),
    ).toEqual({ name: 'Leche', quantity: 1, unit: null, expiresOn: null });
  });
  it('ignora expiresOn con formato incorrecto', () => {
    expect(
      mapGeminiRecognition({ name: 'Leche', quantity: 1, unit: 'ud', expiresOn: '20/09/2026' }),
    ).toEqual({ name: 'Leche', quantity: 1, unit: 'ud', expiresOn: null });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd app && npx vitest run src/domain/__tests__/pantryImport.test.ts`
Expected: FAIL — `../pantryImport` doesn't exist yet.

- [ ] **Step 3: Implement `domain/pantryImport.ts`**

Create `app/src/domain/pantryImport.ts`:

```ts
import type { Unit } from '../types';

/** Forma mínima de la respuesta de `GET /api/v2/product/{code}.json` de Open Food Facts. */
export interface OffApiResponse {
  status?: number;
  product?: {
    product_name?: string;
    product_quantity?: string | number;
    product_quantity_unit?: string;
  };
}

/**
 * Mapea una respuesta de Open Food Facts a los campos del formulario manual.
 * Nunca reenvía el string de unidad de OFF tal cual: `Unit` es un union
 * cerrado ('g'|'ml'|'ud') y un string libre como "kg" rompería el matching
 * de stock/shopping en `store.tsx` (`p.unit === need.unit`) en silencio.
 */
export function mapOpenFoodFactsProduct(raw: OffApiResponse): { name: string; quantity: number; unit: Unit } | null {
  const product = raw.product;
  const name = product?.product_name?.trim();
  if (raw.status !== 1 || !name) return null;

  const rawUnit = (product?.product_quantity_unit ?? '').toLowerCase().trim();
  const rawQty = Number(product?.product_quantity);

  if (Number.isFinite(rawQty) && rawQty > 0) {
    switch (rawUnit) {
      case 'g':
        return { name, quantity: rawQty, unit: 'g' };
      case 'kg':
        return { name, quantity: rawQty * 1000, unit: 'g' };
      case 'ml':
        return { name, quantity: rawQty, unit: 'ml' };
      case 'l':
        return { name, quantity: rawQty * 1000, unit: 'ml' };
      case 'cl':
        return { name, quantity: rawQty * 10, unit: 'ml' };
    }
  }
  return { name, quantity: 1, unit: 'ud' };
}

const VALID_UNITS: readonly Unit[] = ['g', 'ml', 'ud'];

export interface RecognizedPantryItem {
  name: string;
  quantity: number | null;
  unit: Unit | null;
  expiresOn: string | null;
}

/**
 * Valida defensivamente el JSON que devuelve Gemini antes de tocarlo — un
 * modelo puede devolver tipos equivocados o campos de más; cualquier campo
 * con forma incorrecta se descarta a `null` en vez de intentar adivinar.
 */
export function mapGeminiRecognition(raw: unknown): RecognizedPantryItem | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;

  const name = typeof r.name === 'string' ? r.name.trim() : '';
  if (!name) return null;

  const quantity = typeof r.quantity === 'number' && r.quantity > 0 ? r.quantity : null;
  const unit = typeof r.unit === 'string' && (VALID_UNITS as string[]).includes(r.unit) ? (r.unit as Unit) : null;
  const expiresOn =
    typeof r.expiresOn === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.expiresOn) ? r.expiresOn : null;

  return { name, quantity, unit, expiresOn };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd app && npx vitest run src/domain/__tests__/pantryImport.test.ts`
Expected: PASS (14 tests)

- [ ] **Step 5: Commit**

```bash
cd /home/jars/Programing/Rezet
git add app/src/domain/pantryImport.ts app/src/domain/__tests__/pantryImport.test.ts
git commit -m "$(cat <<'EOF'
Add pure mappers for Open Food Facts and Gemini pantry recognition

Both normalize/validate defensively before anything downstream sees a
Unit value: OFF's free-text unit never passes through uncast, and
Gemini's JSON is type-checked field by field rather than trusted.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01KzPF5aTDAt1N9CpuoXvSzU
EOF
)"
```

---

## Task 3: Real `expiresOn` end-to-end in the demo store

**Files:**
- Modify: `app/src/data/storeContext.ts`
- Modify: `app/src/data/store.tsx`

**Interfaces:**
- Consumes: `resolveExpiry`, `dateKey`, `addDays` from `../domain/dates` (Task 1).
- Produces: `Store.pantryAdd` now accepts `expiresOn?: string`. `pantry` exposed by `useData()` is still `PantryItem[]` with a correctly-recomputed `expiresInDays` — no consumer of `useData().pantry` changes.

- [ ] **Step 1: Update the `Store` type**

In `app/src/data/storeContext.ts`, find:

```ts
  pantryAdd: (input: { name: string; quantity: number; unit: Unit; location: PantryLoc }) => void;
```

Replace with:

```ts
  pantryAdd: (input: {
    name: string;
    quantity: number;
    unit: Unit;
    location: PantryLoc;
    expiresOn?: string;
  }) => void;
```

- [ ] **Step 2: Give the demo store an internal `StoredPantryItem` shape**

In `app/src/data/store.tsx`, update the import line (currently line 4):

```ts
import { slotForNow, todayKey } from '../domain/dates';
```

to:

```ts
import { addDays, dateKey, resolveExpiry, slotForNow, todayKey } from '../domain/dates';
```

Then, right after the existing imports (before `interface Data`), add:

```ts
/**
 * Forma interna persistida: guarda la fecha real (`expiresOn`), no el
 * número de días derivado. `expiresInDays` se recalcula en cada lectura
 * (ver `pantryExposed` más abajo) — igual que `mapPantryItem` ya hace para
 * el backend real — para que no se quede congelado en localStorage.
 */
type StoredPantryItem = Omit<PantryItem, 'expiresInDays'> & { expiresOn: string | null };

const toStoredPantry = (items: PantryItem[]): StoredPantryItem[] =>
  items.map(({ expiresInDays, ...rest }) => ({
    ...rest,
    expiresOn: expiresInDays != null ? dateKey(addDays(new Date(), expiresInDays)) : null,
  }));
```

- [ ] **Step 3: Update `Data`, `INITIAL`, and add the exposure memo**

Change the `Data` interface's `pantry` field (currently `pantry: PantryItem[];`) to:

```ts
  pantry: StoredPantryItem[];
```

Change `INITIAL`'s `pantry: PANTRY,` to:

```ts
  pantry: toStoredPantry(PANTRY),
```

Inside `DataProvider`, right after the `data`/`locale` destructure (after `const { locale } = usePrefs();`), add:

```ts
  const pantryExposed = useMemo<PantryItem[]>(
    () =>
      data.pantry.map(({ expiresOn, ...rest }) => ({
        ...rest,
        expiresInDays: resolveExpiry(expiresOn),
      })),
    [data.pantry],
  );
```

- [ ] **Step 4: Use `pantryExposed` everywhere pantry is read (not mutated)**

In the `createStoreDerivations` call, change:

```ts
      createStoreDerivations({
        pantry: data.pantry,
```

to:

```ts
      createStoreDerivations({
        pantry: pantryExposed,
```

and its dependency array `[data.pantry, data.plan, recipeById, ingredientById, locale]` to `[pantryExposed, data.plan, recipeById, ingredientById, locale]`.

In the final `value = useMemo<Store>(...)` block, change:

```ts
    () => ({
      ...data,
      recipeById,
```

to:

```ts
    () => ({
      ...data,
      pantry: pantryExposed,
      recipeById,
```

and add `pantryExposed` to that `useMemo`'s dependency array (alongside the existing `data`).

- [ ] **Step 5: Update `pantryAdd` to write `expiresOn`**

Replace the current `pantryAdd` body:

```ts
  const pantryAdd = useCallback(
    (input: { name: string; quantity: number; unit: Unit; location: PantryLoc }) =>
      setData((d) => {
        const resolved = resolveIngredient(d.ingredients, input.name, input.unit);
        const item: PantryItem = {
          id: uid('p'),
          ingredientId: resolved.id,
          quantity: input.quantity,
          unit: input.unit,
          location: input.location,
          expiresInDays: input.location === 'fridge' ? 5 : null,
        };
        return { ...d, ingredients: resolved.list, pantry: [...d.pantry, item] };
      }),
    [resolveIngredient, setData],
  );
```

with:

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

- [ ] **Step 6: Update `buyChecked`'s fresh-item guess to the new shape**

Find (inside `buyChecked`):

```ts
          else
            pantry.push({
              id: uid('p'),
              ingredientId: need.ingredientId,
              quantity: need.quantity,
              unit: need.unit,
              location: need.group === 'fresco' ? 'fridge' : 'cupboard',
              expiresInDays: need.group === 'fresco' ? 5 : null,
            });
```

Replace with:

```ts
          else
            pantry.push({
              id: uid('p'),
              ingredientId: need.ingredientId,
              quantity: need.quantity,
              unit: need.unit,
              location: need.group === 'fresco' ? 'fridge' : 'cupboard',
              expiresOn: need.group === 'fresco' ? dateKey(addDays(new Date(), 5)) : null,
            });
```

(Behavior is unchanged — still a 5-day guess for fresh items bought off the shopping list. Only the stored representation changes, to match `StoredPantryItem`.)

- [ ] **Step 7: Typecheck**

Run: `cd app && npm run lint`
Expected: no errors. If TypeScript complains about `pantry.map((p) => ({ ...p }))` inside `buyChecked` (the `const pantry = d.pantry.map((p) => ({ ...p }));` line) not matching `StoredPantryItem[]`, it's a false alarm from a stale editor cache — re-run `npm run lint` fresh; the spread preserves the shape exactly.

- [ ] **Step 8: Run domain tests (regression check)**

Run: `cd app && npm test`
Expected: all existing tests still pass — this task didn't touch `domain/deriveStore.ts`, `scaling.ts`, `shopping.ts`, or `coverage.ts`, only what feeds them.

- [ ] **Step 9: Manual verification**

Run `cd app && npm run dev`, open the app in demo mode, open Pantry → the existing seeded items (carrots, eggs, tomato, yogurt) still show their original "caduca en N días" text (now derived from a real date computed at load time, same displayed number as before). This confirms `toStoredPantry` didn't change what's on screen for the seed data.

- [ ] **Step 10: Commit**

```bash
cd /home/jars/Programing/Rezet
git add app/src/data/storeContext.ts app/src/data/store.tsx
git commit -m "$(cat <<'EOF'
Store real expiresOn dates in the demo pantry, recompute on read

pantryAdd/buyChecked now write a real ISO date instead of baking a
derived day-count that would freeze forever in localStorage across
reloads. expiresInDays is recomputed via resolveExpiry every time the
pantry is exposed to consumers, mirroring what supabaseStore.tsx
already does for the real backend.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01KzPF5aTDAt1N9CpuoXvSzU
EOF
)"
```

---

## Task 4: Real `expiresOn` write path in `supabaseStore.tsx`

**Files:**
- Modify: `app/src/data/supabaseStore.tsx`

**Interfaces:**
- Consumes: `Store.pantryAdd`'s new `expiresOn?: string` field (Task 3).

- [ ] **Step 1: Update `pantryAdd`'s input type and insert**

Find (around line 458-475):

```ts
  const pantryAdd = useCallback(
    (input: { name: string; quantity: number; unit: Unit; location: PantryLoc }) => {
      void (async () => {
        const ingredientId = await resolveIngredientId(input.name, input.unit);
        const { error } = await supabase.from('pantry_item').insert({
          household_id: householdId,
          ingredient_id: ingredientId,
          quantity: input.quantity,
          unit: input.unit,
          location: input.location,
          expires_on: input.location === 'fridge' ? new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10) : null,
        });
```

Replace with:

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
```

- [ ] **Step 2: Typecheck**

Run: `cd app && npm run lint`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd /home/jars/Programing/Rezet
git add app/src/data/supabaseStore.tsx
git commit -m "$(cat <<'EOF'
Write the real expiry date to Supabase instead of guessing +5 days

pantryAdd now inserts whatever expiresOn the form provides (or null),
matching the demo store's behavior from the previous commit.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01KzPF5aTDAt1N9CpuoXvSzU
EOF
)"
```

---

## Task 5: New i18n copy keys

**Files:**
- Modify: `app/src/i18n/es.ts`
- Modify: `app/src/i18n/en.ts`

**Interfaces:**
- Produces: `t.expired`, `t.expiresOnLabel`, `t.addManual`, `t.addBarcode`, `t.addPhoto`, `t.takePhoto`, `t.lookingUp`, `t.scanNotFound`, `t.scanDecodeFailed`, `t.enterBarcodeManually`, `t.photoRecognizeFailed` — consumed by Tasks 6, 7, 8, 10.

- [ ] **Step 1: Add the keys to `es.ts`**

In `app/src/i18n/es.ts`, right after the existing `noDate: 'sin fecha',` line, add:

```ts
  expired: 'Caducado',
  expiresOnLabel: 'Caduca el (opcional)',
  addManual: 'Manual',
  addBarcode: 'Código de barras',
  addPhoto: 'Foto',
  takePhoto: 'Tomar foto',
  lookingUp: 'Buscando…',
  scanNotFound: 'No se encontró el producto',
  scanDecodeFailed: 'No se pudo leer el código',
  enterBarcodeManually: 'Escribe el código a mano',
  photoRecognizeFailed: 'No se pudo reconocer la foto',
```

- [ ] **Step 2: Add the same keys to `en.ts`**

In `app/src/i18n/en.ts`, right after the existing `noDate: 'no date',` line, add:

```ts
  expired: 'Expired',
  expiresOnLabel: 'Expires on (optional)',
  addManual: 'Manual',
  addBarcode: 'Barcode',
  addPhoto: 'Photo',
  takePhoto: 'Take a photo',
  lookingUp: 'Looking up…',
  scanNotFound: 'Product not found',
  scanDecodeFailed: "Couldn't read the barcode",
  enterBarcodeManually: 'Type the code by hand',
  photoRecognizeFailed: "Couldn't recognize the photo",
```

- [ ] **Step 3: Typecheck**

Run: `cd app && npm run lint`
Expected: no errors — `Dictionary` (`es.ts`'s inferred type) gains these keys automatically since `en.ts` is checked against it structurally; both files must declare exactly the same key set or `lint` will flag the mismatch.

- [ ] **Step 4: Commit**

```bash
cd /home/jars/Programing/Rezet
git add app/src/i18n/es.ts app/src/i18n/en.ts
git commit -m "$(cat <<'EOF'
Add i18n copy for expiry dates and barcode/photo pantry add

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01KzPF5aTDAt1N9CpuoXvSzU
EOF
)"
```

---

## Task 6: `TextField` date support + expired-item rendering

**Files:**
- Modify: `app/src/ui/Fields.tsx`
- Modify: `app/src/screens/Pantry.tsx`

**Interfaces:**
- Produces: `TextField`'s new optional `type?: 'text' | 'date'` prop (default `'text'`). Consumed by Task 7.

- [ ] **Step 1: Add the `type` prop to `TextField`**

In `app/src/ui/Fields.tsx`, update the `TextField` function signature (currently):

```ts
export function TextField({
  value,
  onChange,
  placeholder,
  inputMode,
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
  style?: CSSProperties;
  onFocus?: () => void;
  onBlur?: () => void;
  onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void;
  ariaLabel?: string;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      inputMode={inputMode}
      onFocus={onFocus}
      onBlur={onBlur}
      onKeyDown={onKeyDown}
      aria-label={ariaLabel}
      style={{
```

to:

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
```

- [ ] **Step 2: Fix expired-item rendering in `Pantry.tsx`**

In `app/src/screens/Pantry.tsx`, find (around line 70-71):

```tsx
                          {item.expiresInDays != null
                            ? `${t.expiresIn} ${item.expiresInDays} ${t.days}`
                            : t.noDate}
```

Replace with:

```tsx
                          {item.expiresInDays == null
                            ? t.noDate
                            : item.expiresInDays < 0
                              ? t.expired
                              : `${t.expiresIn} ${item.expiresInDays} ${t.days}`}
```

- [ ] **Step 3: Typecheck**

Run: `cd app && npm run lint`
Expected: no errors.

- [ ] **Step 4: Manual verification**

Run `cd app && npm run dev`. This step alone doesn't yet let you create an expired item (Task 7 adds the date field), but confirm the existing Pantry screen still renders identically for the seeded items (no visual regression from the ternary rewrite).

- [ ] **Step 5: Commit**

```bash
cd /home/jars/Programing/Rezet
git add app/src/ui/Fields.tsx app/src/screens/Pantry.tsx
git commit -m "$(cat <<'EOF'
Add date-input support to TextField, clamp expired pantry items

daysUntil can now go negative in the UI (real dates instead of a
fixed 5-day guess) — Pantry.tsx showed a raw "-3 días" before this;
it now shows "Caducado"/"Expired".

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01KzPF5aTDAt1N9CpuoXvSzU
EOF
)"
```

---

## Task 7: Real expiry-date field on the manual add form

**Files:**
- Modify: `app/src/sheets/PantryAddSheet.tsx`

**Interfaces:**
- Consumes: `TextField`'s `type`/`min` props (Task 6), `todayKey` from `../domain/dates`, `t.expiresOnLabel` (Task 5), `Store.pantryAdd`'s `expiresOn?: string` (Task 3/4).

- [ ] **Step 1: Add the date field's state and wire it into `submit`**

In `app/src/sheets/PantryAddSheet.tsx`, add to the imports:

```ts
import { todayKey } from '../domain/dates';
```

Add a new piece of state alongside the existing ones:

```ts
  const [expiresOn, setExpiresOn] = useState('');
```

Update `submit`:

```ts
  const submit = () => {
    if (!name.trim()) return;
    pantryAdd({
      name: name.trim(),
      quantity: parseFloat(quantity.replace(',', '.')) || 1,
      unit,
      location,
      expiresOn: expiresOn || undefined,
    });
    onClose();
    onToast(t.savedPantry);
  };
```

- [ ] **Step 2: Render the date field**

In the form's JSX, add the field right after the quantity/unit row and before the location block:

```tsx
        <div>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 8 }}>{t.expiresOnLabel}</div>
          <TextField type="date" min={todayKey()} value={expiresOn} onChange={setExpiresOn} />
        </div>
```

(This goes between the existing `quantity`/`unitOptions` `<div style={{ display: 'flex', gap: 10 }}>...</div>` block and the `location` block's `<div>`.)

- [ ] **Step 3: Typecheck**

Run: `cd app && npm run lint`
Expected: no errors.

- [ ] **Step 4: Manual verification**

Run `cd app && npm run dev` in demo mode. Open Pantry → Añadir. Add an item with a date 2 days from today. Confirm it shows "caduca en 2 días" in the list. Reload the page (full browser refresh) and confirm it still says "caduca en 2 días" (not frozen, not reset) — this is the exact bug the code review caught; it must survive a reload correctly now. Then add a second item and manually edit its stored date backward by testing with a date field pre-filled to yesterday isn't possible via the `min` clamp (by design — you can't add an already-expired item through the form), so instead confirm the `min` attribute itself: try to pick a past date in the native date picker and confirm the browser blocks it.

- [ ] **Step 5: Commit**

```bash
cd /home/jars/Programing/Rezet
git add app/src/sheets/PantryAddSheet.tsx
git commit -m "$(cat <<'EOF'
Add a real expiry-date field to the manual pantry-add form

Optional date input, clamped to today or later. Closes the original
gap: users can now set/see a real expiry date instead of the app
guessing 5 days for anything in the fridge.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01KzPF5aTDAt1N9CpuoXvSzU
EOF
)"
```

---

## Task 8: Barcode add mode

**Files:**
- Create: `app/src/lib/imageCapture.ts`
- Create: `app/src/sheets/PantryBarcodeCapture.tsx`
- Modify: `app/src/sheets/PantryAddSheet.tsx`
- Modify: `app/src/ui/Icon.tsx`
- Modify: `app/package.json` (add `@zxing/browser`)

**Interfaces:**
- Consumes: `mapOpenFoodFactsProduct`, `OffApiResponse` from `../domain/pantryImport` (Task 2); `t.addManual`/`t.addBarcode`/`t.takePhoto`/`t.lookingUp`/`t.scanNotFound`/`t.scanDecodeFailed`/`t.enterBarcodeManually` (Task 5).
- Produces: `resizeImageFile(file: File, maxDim: number): Promise<{ blob: Blob; dataUrl: string }>` and `blobToBase64(blob: Blob): Promise<string>` from `lib/imageCapture.ts` — Task 10 also uses both. `PantryBarcodeCapture`'s props: `{ onResult: (item: { name: string; quantity: number; unit: Unit }) => void; onCancel: () => void }`.

- [ ] **Step 1: Add the `@zxing/browser` dependency**

Run: `cd app && npm install @zxing/browser@0.1.5`
Expected: `package.json`/`package-lock.json` gain the dependency.

- [ ] **Step 2: Create the image-resize helper**

Create `app/src/lib/imageCapture.ts`:

```ts
/**
 * Reduce una foto capturada a un lado largo máximo antes de decodificarla o
 * subirla — una foto de móvil típica (3000×4000px+) es innecesariamente
 * lenta/cara para esto; el zxing decodifica un código de barras igual de
 * bien a 1024px, y Gemini paga menos tokens por una imagen más pequeña.
 */
export async function resizeImageFile(
  file: File,
  maxDim: number,
): Promise<{ blob: Blob; dataUrl: string }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2d context unavailable');
  ctx.drawImage(bitmap, 0, 0, width, height);

  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/jpeg', 0.85),
  );
  const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
  return { blob, dataUrl };
}

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

- [ ] **Step 3: Add `camera` and `barcode` icons**

In `app/src/ui/Icon.tsx`, add to the `PATHS` object:

```ts
  camera: 'M9 4h6l1.5 2.5H19a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8.5a2 2 0 0 1 2-2h2.5Z',
  barcode: 'M4 6v12M7 6v12M9.5 6v12M12 6v12M14.5 6v12M17 6v12M20 6v12',
```

And add the lens circle alongside the existing special-cased shapes (`search`/`key`/`clock`/`sun`):

```tsx
      {name === 'camera' && <circle cx="12" cy="13" r="3.3" />}
```

- [ ] **Step 4: Create `PantryBarcodeCapture.tsx`**

Create `app/src/sheets/PantryBarcodeCapture.tsx`:

```tsx
import { useRef, useState } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { usePrefs } from '../store/prefs';
import { mapOpenFoodFactsProduct, type OffApiResponse } from '../domain/pantryImport';
import { resizeImageFile } from '../lib/imageCapture';
import { Button } from '../ui/Button';
import { Icon } from '../ui/Icon';
import { TextField } from '../ui/Fields';
import { radius } from '../ui/tokens';
import type { Unit } from '../types';

type Status = 'idle' | 'looking' | 'manualEntry' | 'notFound';

async function lookupBarcode(code: string): Promise<{ name: string; quantity: number; unit: Unit } | null> {
  const res = await fetch(
    `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=product_name,quantity,product_quantity,product_quantity_unit`,
  );
  if (!res.ok) return null;
  const json = (await res.json()) as OffApiResponse;
  return mapOpenFoodFactsProduct(json);
}

export function PantryBarcodeCapture({
  onResult,
  onCancel,
}: {
  onResult: (item: { name: string; quantity: number; unit: Unit }) => void;
  onCancel: () => void;
}) {
  const { t } = usePrefs();
  const [status, setStatus] = useState<Status>('idle');
  const [manualCode, setManualCode] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const runLookup = async (code: string) => {
    setStatus('looking');
    const item = await lookupBarcode(code);
    if (item) onResult(item);
    else setStatus('notFound');
  };

  const onFile = async (file: File) => {
    setStatus('looking');
    const { dataUrl } = await resizeImageFile(file, 1024);
    const img = new Image();
    img.src = dataUrl;
    try {
      await img.decode();
      const reader = new BrowserMultiFormatReader();
      const result = await reader.decodeFromImageElement(img);
      await runLookup(result.getText());
    } catch {
      setStatus('manualEntry');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'center', padding: '12px 0' }}>
      <div
        style={{
          width: '100%',
          height: 140,
          borderRadius: radius.card,
          background: 'var(--soft)',
          border: '1px solid var(--line)',
          display: 'grid',
          placeItems: 'center',
          color: 'var(--muted)',
        }}
      >
        <Icon name="barcode" size={32} strokeWidth={1.6} />
      </div>

      {status === 'idle' && (
        <>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void onFile(file);
            }}
          />
          <Button full onClick={() => inputRef.current?.click()}>
            {t.takePhoto}
          </Button>
        </>
      )}

      {status === 'looking' && <div style={{ color: 'var(--muted)', fontSize: 14.5 }}>{t.lookingUp}</div>}

      {status === 'manualEntry' && (
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>{t.scanDecodeFailed} — {t.enterBarcodeManually}</div>
          <TextField
            value={manualCode}
            onChange={setManualCode}
            inputMode="numeric"
            placeholder="8410000000000"
          />
          <Button full onClick={() => manualCode.trim() && void runLookup(manualCode.trim())}>
            {t.add}
          </Button>
        </div>
      )}

      {status === 'notFound' && (
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
          <div style={{ fontSize: 13, color: 'var(--warn-ink)' }}>{t.scanNotFound}</div>
          <Button full onClick={onCancel}>
            {t.addManual}
          </Button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Wire the Manual/Barcode mode chips into `PantryAddSheet.tsx`**

In `app/src/sheets/PantryAddSheet.tsx`, add imports:

```ts
import { PantryBarcodeCapture } from './PantryBarcodeCapture';
```

Add mode state near the other `useState`s:

```ts
  const [mode, setMode] = useState<'manual' | 'barcode'>('manual');
```

Add a prefill handler (place it right after `submit`, or right before it):

```ts
  const applyPrefill = (item: { name: string; quantity: number; unit: Unit }) => {
    setName(item.name);
    setQuantity(String(item.quantity));
    setUnit(item.unit);
    setMode('manual');
  };
```

At the top of the returned JSX, right after `<Sheet title={t.add} onClose={onClose}>`, add the mode chips:

```tsx
        <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
          <OptionChip label={t.addManual} active={mode === 'manual'} onClick={() => setMode('manual')} />
          <OptionChip label={t.addBarcode} active={mode === 'barcode'} onClick={() => setMode('barcode')} />
        </div>
```

Wrap the existing manual-form `<div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingBottom: 6 }}>...</div>` block in a conditional, and render the barcode capture view for the other mode:

```tsx
        {mode === 'manual' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingBottom: 6 }}>
            {/* ...unchanged existing manual form content... */}
          </div>
        )}
        {mode === 'barcode' && (
          <PantryBarcodeCapture onResult={applyPrefill} onCancel={() => setMode('manual')} />
        )}
```

- [ ] **Step 6: Typecheck**

Run: `cd app && npm run lint`
Expected: no errors.

- [ ] **Step 7: Manual verification**

Run `cd app && npm run dev`. Open Pantry → Añadir → tap "Código de barras". On desktop, "Tomar foto" opens a file picker — pick a clear photo of a real product barcode (photograph one with your phone first, or use any barcode image saved locally). Confirm: a recognized product prefills the manual form and switches back to it; an unrecognized/garbage image falls into the manual-digit-entry state, and typing a valid EAN there also works; typing a bogus code shows "No se encontró el producto" with a button back to the empty manual form.

- [ ] **Step 8: Commit**

```bash
cd /home/jars/Programing/Rezet
git add app/package.json app/package-lock.json app/src/lib/imageCapture.ts app/src/sheets/PantryBarcodeCapture.tsx app/src/sheets/PantryAddSheet.tsx app/src/ui/Icon.tsx
git commit -m "$(cat <<'EOF'
Add barcode-scan pantry add (Open Food Facts, client-only)

Photo capture -> zxing decode -> Open Food Facts lookup -> prefilled
manual form. Falls back to typing the barcode by hand if the decode
fails, before giving up to an empty manual form.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01KzPF5aTDAt1N9CpuoXvSzU
EOF
)"
```

---

## Task 9: `recognize-pantry-item` Edge Function

**Files:**
- Create: `app/supabase/functions/recognize-pantry-item/index.ts`

**Interfaces:**
- Produces: an HTTP endpoint, invoked as `supabase.functions.invoke('recognize-pantry-item', { body: { image: string, mimeType: string } })`, returning the raw JSON object Gemini produced (validated client-side by `mapGeminiRecognition`, Task 2). Consumed by Task 10.

- [ ] **Step 1: Write the function**

Create `app/supabase/functions/recognize-pantry-item/index.ts`:

```ts
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

/**
 * Recibe una foto (base64) de un producto y devuelve lo que Gemini cree
 * ver: nombre, cantidad, unidad y fecha de caducidad si está impresa. El
 * cliente valida el JSON con `domain/pantryImport.ts::mapGeminiRecognition`
 * antes de tocarlo — esta función no valida más allá de "es JSON".
 *
 * Requiere sesión válida (a diferencia de `send-timer-notifications`, que
 * es cron-only): la llama directamente un usuario logueado.
 */
const GEMINI_MODEL = "gemini-2.0-flash";

const PROMPT = `Analiza la foto de un producto de alimentación y devuelve SOLO un JSON con esta forma exacta, sin texto adicional ni backticks:
{"name": string | null, "quantity": number | null, "unit": "g" | "ml" | "ud" | null, "expiresOn": string | null}
- "name": el nombre del producto tal como aparece en el envase.
- "quantity" y "unit": el contenido neto si se lee en el envase (usa "g" para peso, "ml" para volumen, "ud" si es una unidad suelta sin peso claro).
- "expiresOn": SOLO si ves una fecha de caducidad impresa, en formato "YYYY-MM-DD". Si no la ves, null. No la inventes.
Si no reconoces el producto, devuelve todos los campos como null.`;

Deno.serve(async (req) => {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userError } = await callerClient.auth.getUser();
  if (userError || !userData.user) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  }

  let body: { image?: string; mimeType?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid body" }), { status: 400 });
  }
  if (!body.image || !body.mimeType) {
    return new Response(JSON.stringify({ error: "missing image or mimeType" }), { status: 400 });
  }

  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const serviceClient = createClient(supabaseUrl, serviceKey);
  const { data: secretRows, error: secretError } = await serviceClient
    .from("app_secret")
    .select("value")
    .eq("key", "GEMINI_API_KEY");
  if (secretError || !secretRows?.[0]) {
    return new Response(JSON.stringify({ error: "missing GEMINI_API_KEY secret" }), { status: 500 });
  }
  const geminiKey = secretRows[0].value as string;

  const geminiRes = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": geminiKey },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: PROMPT }, { inline_data: { mime_type: body.mimeType, data: body.image } }],
          },
        ],
        generationConfig: { responseMimeType: "application/json" },
      }),
    },
  );
  if (!geminiRes.ok) {
    return new Response(JSON.stringify({ error: "gemini request failed" }), { status: 502 });
  }

  const geminiJson = await geminiRes.json();
  const text = geminiJson.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== "string") {
    return new Response(JSON.stringify({ error: "empty gemini response" }), { status: 502 });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return new Response(JSON.stringify({ error: "gemini returned invalid json" }), { status: 502 });
  }

  return new Response(JSON.stringify(parsed), { headers: { "Content-Type": "application/json" } });
});
```

- [ ] **Step 2: Deploy the function**

Run: `cd app && npx supabase functions deploy recognize-pantry-item`
Expected: deploy succeeds (this repo is already linked to its Supabase project per [[external_service_ids]] memory — same project `raepigwmunhguzkmzukd`).

- [ ] **Step 3: Insert the Gemini API key (manual, one-time — this is the user's key to provide)**

This step needs a real `GEMINI_API_KEY` the user has — **do not fabricate one**. Ask the user for their Gemini API key (from Google AI Studio), then insert it via the Supabase MCP `execute_sql` tool (never as a migration file, matching how `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` were inserted):

```sql
insert into app_secret (key, value) values ('GEMINI_API_KEY', '<the user''s real key>')
on conflict (key) do update set value = excluded.value;
```

If the user doesn't have a key yet or isn't ready to provide one, skip this step for now and note it as a follow-up — the function will exist and deploy fine, it'll just 500 with "missing GEMINI_API_KEY secret" until the row is inserted. Task 10's photo-recognition flow can't be end-to-end tested until this row exists.

- [ ] **Step 4: Commit**

```bash
cd /home/jars/Programing/Rezet
git add app/supabase/functions/recognize-pantry-item/index.ts
git commit -m "$(cat <<'EOF'
Add recognize-pantry-item Edge Function (Gemini vision)

Auth-gated (rejects requests with no valid session), reads
GEMINI_API_KEY from app_secret like the existing VAPID keys, returns
Gemini's raw JSON for the client to validate. No image is stored.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01KzPF5aTDAt1N9CpuoXvSzU
EOF
)"
```

---

## Task 10: Photo add mode

**Files:**
- Create: `app/src/sheets/PantryPhotoCapture.tsx`
- Modify: `app/src/sheets/PantryAddSheet.tsx`
- Modify: `app/src/App.tsx`

**Interfaces:**
- Consumes: `resizeImageFile`, `blobToBase64` from `../lib/imageCapture` (Task 8); `mapGeminiRecognition`, `RecognizedPantryItem` from `../domain/pantryImport` (Task 2); `supabase` from `../data/supabaseClient`; `t.addPhoto`/`t.takePhoto`/`t.lookingUp`/`t.photoRecognizeFailed` (Task 5).
- Produces: `PantryAddSheet`'s new `allowPhoto?: boolean` prop (default effectively `false` unless passed `true`), set by `App.tsx`.

- [ ] **Step 1: Create `PantryPhotoCapture.tsx`**

Create `app/src/sheets/PantryPhotoCapture.tsx`:

```tsx
import { useRef, useState } from 'react';
import { usePrefs } from '../store/prefs';
import { supabase } from '../data/supabaseClient';
import { mapGeminiRecognition } from '../domain/pantryImport';
import { blobToBase64, resizeImageFile } from '../lib/imageCapture';
import { Button } from '../ui/Button';
import { Icon } from '../ui/Icon';
import { radius } from '../ui/tokens';
import type { Unit } from '../types';

type Status = 'idle' | 'looking' | 'failed';

export function PantryPhotoCapture({
  onResult,
  onCancel,
}: {
  onResult: (item: { name: string; quantity?: number; unit?: Unit; expiresOn?: string }) => void;
  onCancel: () => void;
}) {
  const { t } = usePrefs();
  const [status, setStatus] = useState<Status>('idle');
  const inputRef = useRef<HTMLInputElement>(null);

  const onFile = async (file: File) => {
    setStatus('looking');
    const { blob } = await resizeImageFile(file, 1024);
    const image = await blobToBase64(blob);
    const { data, error } = await supabase.functions.invoke('recognize-pantry-item', {
      body: { image, mimeType: 'image/jpeg' },
    });
    if (error) {
      setStatus('failed');
      return;
    }
    const recognized = mapGeminiRecognition(data);
    if (!recognized) {
      setStatus('failed');
      return;
    }
    onResult({
      name: recognized.name,
      quantity: recognized.quantity ?? undefined,
      unit: recognized.unit ?? undefined,
      expiresOn: recognized.expiresOn ?? undefined,
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'center', padding: '12px 0' }}>
      <div
        style={{
          width: '100%',
          height: 140,
          borderRadius: radius.card,
          background: 'var(--soft)',
          border: '1px solid var(--line)',
          display: 'grid',
          placeItems: 'center',
          color: 'var(--muted)',
        }}
      >
        <Icon name="camera" size={32} strokeWidth={1.6} />
      </div>

      {status === 'idle' && (
        <>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void onFile(file);
            }}
          />
          <Button full onClick={() => inputRef.current?.click()}>
            {t.takePhoto}
          </Button>
        </>
      )}

      {status === 'looking' && <div style={{ color: 'var(--muted)', fontSize: 14.5 }}>{t.lookingUp}</div>}

      {status === 'failed' && (
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
          <div style={{ fontSize: 13, color: 'var(--warn-ink)' }}>{t.photoRecognizeFailed}</div>
          <Button full onClick={onCancel}>
            {t.addManual}
          </Button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Wire the Foto chip into `PantryAddSheet.tsx`, gated by `allowPhoto`**

Add the import:

```ts
import { PantryPhotoCapture } from './PantryPhotoCapture';
```

Change the sheet's props to accept `allowPhoto`:

```ts
export function PantryAddSheet({
  onClose,
  onToast,
  allowPhoto = false,
}: {
  onClose: () => void;
  onToast: (message: string) => void;
  allowPhoto?: boolean;
}) {
```

Change `mode`'s type to include `'photo'`:

```ts
  const [mode, setMode] = useState<'manual' | 'barcode' | 'photo'>('manual');
```

Update `applyPrefill` to also accept an optional `expiresOn` (photo recognition can supply one; barcode's call site simply won't pass it):

```ts
  const applyPrefill = (item: { name: string; quantity?: number; unit?: Unit; expiresOn?: string }) => {
    setName(item.name);
    if (item.quantity != null) setQuantity(String(item.quantity));
    if (item.unit) setUnit(item.unit);
    if (item.expiresOn) setExpiresOn(item.expiresOn);
    setMode('manual');
  };
```

(`PantryBarcodeCapture`'s `onResult={applyPrefill}` from Task 8 still type-checks: its result object is a subset of this wider parameter type.)

Add the third chip, only when `allowPhoto` is true:

```tsx
        <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
          <OptionChip label={t.addManual} active={mode === 'manual'} onClick={() => setMode('manual')} />
          <OptionChip label={t.addBarcode} active={mode === 'barcode'} onClick={() => setMode('barcode')} />
          {allowPhoto && (
            <OptionChip label={t.addPhoto} active={mode === 'photo'} onClick={() => setMode('photo')} />
          )}
        </div>
```

Add the photo mode's view alongside the barcode one:

```tsx
        {mode === 'photo' && allowPhoto && (
          <PantryPhotoCapture onResult={applyPrefill} onCancel={() => setMode('manual')} />
        )}
```

- [ ] **Step 3: Pass `allowPhoto` from `App.tsx`**

In `app/src/App.tsx`, find:

```tsx
      {sheet?.kind === 'pantryAdd' && (
        <PantryAddSheet onClose={() => setSheet(null)} onToast={show} />
      )}
```

Replace with:

```tsx
      {sheet?.kind === 'pantryAdd' && (
        <PantryAddSheet onClose={() => setSheet(null)} onToast={show} allowPhoto={!demo} />
      )}
```

- [ ] **Step 4: Typecheck**

Run: `cd app && npm run lint`
Expected: no errors.

- [ ] **Step 5: Manual verification**

Run `cd app && npm run dev` in demo mode → confirm only Manual and Código de barras chips show (no Foto). This is as far as demo mode can verify this task — full photo-recognition needs a real account, the deployed function, and the `GEMINI_API_KEY` row from Task 9 Step 3. If those are in place, sign in with a real (non-demo) account, confirm the Foto chip appears, take a photo of a product, and confirm the form gets prefilled (name at minimum; quantity/unit/expiresOn depend on what's visible in the photo). If the key isn't set up yet, note that as a known follow-up rather than blocking the rest of this plan.

- [ ] **Step 6: Commit**

```bash
cd /home/jars/Programing/Rezet
git add app/src/sheets/PantryPhotoCapture.tsx app/src/sheets/PantryAddSheet.tsx app/src/App.tsx
git commit -m "$(cat <<'EOF'
Add photo-recognition pantry add, hidden in demo mode

Photo capture -> recognize-pantry-item Edge Function -> Gemini ->
validated prefill of the manual form. Gated behind allowPhoto (App.tsx
passes !demo), since demo mode has no Supabase project to call.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01KzPF5aTDAt1N9CpuoXvSzU
EOF
)"
```

---

## Task 11: Sync the design source of truth

**Files:**
- Modify: `README.md`
- Modify: `RezetApp.dc.html`

**Interfaces:** none (documentation only).

- [ ] **Step 1: Update `README.md`'s Despensa section**

In `README.md`, find (§4.8 Despensa, currently):

```
- Contenedor radio 18px con filas de padding `13px 14px` separadas por `1px var(--line)`: nombre 15.5px/550; subtítulo 12.5px con "caduca en N días" o "sin fecha" — y en **`var(--warn)`** cuando faltan 3 días o menos, en `var(--muted)` si no.
```

Replace with:

```
- Contenedor radio 18px con filas de padding `13px 14px` separadas por `1px var(--line)`: nombre 15.5px/550; subtítulo 12.5px con "caduca en N días", "sin fecha" o **"Caducado"** (cuando la fecha ya pasó) — y en **`var(--warn)`** cuando faltan 3 días o menos, en `var(--muted)` si no.
```

Then find:

```
Hoja **Añadir a despensa**: input de nombre 50px; fila con cantidad (`flex: 2`) y tres chips de unidad `g` / `ml` / `uds` (`flex: 3`); tres chips de ubicación; botón acento "Añadir" de 52px. Al guardar en Nevera, `exp = 5` días por defecto; en Armario, sin fecha.
```

Replace with:

```
Hoja **Añadir a despensa**: tres `OptionChip`s arriba — **Manual** / **Código de barras** / **Foto** (Foto oculto en modo demo) — que cambian el cuerpo de la hoja, sin abrir una hoja nueva.

- **Manual**: input de nombre 50px; fila con cantidad (`flex: 2`) y tres chips de unidad `g` / `ml` / `uds` (`flex: 3`); campo de fecha de caducidad (nativo, `type="date"`, `min` = hoy, opcional) justo debajo; tres chips de ubicación; botón acento "Añadir" de 52px. La fecha la escribe el usuario — no hay valor por defecto adivinado.
- **Código de barras** / **Foto**: sustituyen el formulario por una vista de captura — recuadro `var(--soft)` de 140px con un icono (`barcode` / `camera`) y un botón "Tomar foto" que abre la cámara del móvil (`<input type="file" capture="environment">`). Al reconocer algo, la hoja vuelve a **Manual** con los campos ya rellenos para revisar antes de guardar — nunca se guarda directamente desde estas dos vistas.
```

- [ ] **Step 2: Update `RezetApp.dc.html`'s inline copy dictionaries**

In `RezetApp.dc.html`, find (Spanish dictionary, currently):

```
      itemName:"Qué es", location:"Dónde está", cupboard:"Armario", fridge:"Nevera", freezer:"Congelador",
```

Replace with:

```
      itemName:"Qué es", location:"Dónde está", cupboard:"Armario", fridge:"Nevera", freezer:"Congelador",
      expiresOnLabel:"Caduca el (opcional)", addManual:"Manual", addBarcode:"Código de barras", addPhoto:"Foto", takePhoto:"Tomar foto",
```

Find (English dictionary, currently):

```
      itemName:"What is it", location:"Where", cupboard:"Cupboard", fridge:"Fridge", freezer:"Freezer",
```

Replace with:

```
      itemName:"What is it", location:"Where", cupboard:"Cupboard", fridge:"Fridge", freezer:"Freezer",
      expiresOnLabel:"Expires on (optional)", addManual:"Manual", addBarcode:"Barcode", addPhoto:"Photo", takePhoto:"Take a photo",
```

- [ ] **Step 3: Update the pantry-add sheet's markup**

In `RezetApp.dc.html`, find the whole `isSheetPantryAdd` block (currently):

```html
      <sc-if value="{{ isSheetPantryAdd }}">
      <div style="display:flex;flex-direction:column;gap:16px;padding-bottom:6px">
        <input value="{{ pform.name }}" onInput="{{ onPName }}" placeholder="{{ t.itemName }}" style="width:100%;height:50px;border:1px solid var(--line);background:var(--surface2);border-radius:14px;padding:0 14px;font-size:16.5px;outline:none" />
        <div style="display:flex;gap:10px">
          <input value="{{ pform.qty }}" onInput="{{ onPQty }}" inputmode="decimal" placeholder="500" style="flex:2;height:50px;border:1px solid var(--line);background:var(--surface2);border-radius:14px;padding:0 14px;font-size:16.5px;outline:none;font-variant-numeric:tabular-nums" />
          <div style="flex:3;display:flex;gap:6px">
            <sc-for list="{{ unitOpts }}" as="u" hint-placeholder-count="3">
              <button onClick="{{ u.onTap }}" style="flex:1;height:50px;border-radius:14px;font-size:14.5px;font-weight:600;border:1px solid {{ u.line }};background:{{ u.bg }};color:{{ u.fg }}">{{ u.label }}</button>
            </sc-for>
          </div>
        </div>
        <div>
          <div style="font-size:13px;color:var(--muted);margin-bottom:8px">{{ t.location }}</div>
          <div style="display:flex;gap:8px">
            <sc-for list="{{ locOpts }}" as="l" hint-placeholder-count="3">
              <button onClick="{{ l.onTap }}" style="flex:1;height:44px;border-radius:13px;font-size:14.5px;font-weight:600;border:1px solid {{ l.line }};background:{{ l.bg }};color:{{ l.fg }}">{{ l.label }}</button>
            </sc-for>
          </div>
        </div>
        <button onClick="{{ savePantry }}" style="height:52px;border-radius:16px;background:var(--accent);color:var(--onaccent);font-size:16px;font-weight:650" style-active="transform:scale(.98)">{{ t.add }}</button>
      </div>
      </sc-if>
```

Replace with:

```html
      <sc-if value="{{ isSheetPantryAdd }}">
      <div style="display:flex;flex-direction:column;gap:16px;padding-bottom:6px">
        <div style="display:flex;gap:8px;margin-bottom:4px">
          <sc-for list="{{ pantryModeOpts }}" as="m" hint-placeholder-count="3">
            <button onClick="{{ m.onTap }}" style="flex:1;height:44px;border-radius:13px;font-size:14.5px;font-weight:600;border:1px solid {{ m.line }};background:{{ m.bg }};color:{{ m.fg }}">{{ m.label }}</button>
          </sc-for>
        </div>

        <sc-if value="{{ pantryIsManual }}">
        <input value="{{ pform.name }}" onInput="{{ onPName }}" placeholder="{{ t.itemName }}" style="width:100%;height:50px;border:1px solid var(--line);background:var(--surface2);border-radius:14px;padding:0 14px;font-size:16.5px;outline:none" />
        <div style="display:flex;gap:10px">
          <input value="{{ pform.qty }}" onInput="{{ onPQty }}" inputmode="decimal" placeholder="500" style="flex:2;height:50px;border:1px solid var(--line);background:var(--surface2);border-radius:14px;padding:0 14px;font-size:16.5px;outline:none;font-variant-numeric:tabular-nums" />
          <div style="flex:3;display:flex;gap:6px">
            <sc-for list="{{ unitOpts }}" as="u" hint-placeholder-count="3">
              <button onClick="{{ u.onTap }}" style="flex:1;height:50px;border-radius:14px;font-size:14.5px;font-weight:600;border:1px solid {{ u.line }};background:{{ u.bg }};color:{{ u.fg }}">{{ u.label }}</button>
            </sc-for>
          </div>
        </div>
        <div>
          <div style="font-size:13px;color:var(--muted);margin-bottom:8px">{{ t.expiresOnLabel }}</div>
          <input type="date" min="{{ todayKey }}" value="{{ pform.expiresOn }}" onInput="{{ onPExpiresOn }}" style="width:100%;height:50px;border:1px solid var(--line);background:var(--surface2);border-radius:14px;padding:0 14px;font-size:16.5px;outline:none" />
        </div>
        <div>
          <div style="font-size:13px;color:var(--muted);margin-bottom:8px">{{ t.location }}</div>
          <div style="display:flex;gap:8px">
            <sc-for list="{{ locOpts }}" as="l" hint-placeholder-count="3">
              <button onClick="{{ l.onTap }}" style="flex:1;height:44px;border-radius:13px;font-size:14.5px;font-weight:600;border:1px solid {{ l.line }};background:{{ l.bg }};color:{{ l.fg }}">{{ l.label }}</button>
            </sc-for>
          </div>
        </div>
        <button onClick="{{ savePantry }}" style="height:52px;border-radius:16px;background:var(--accent);color:var(--onaccent);font-size:16px;font-weight:650" style-active="transform:scale(.98)">{{ t.add }}</button>
        </sc-if>

        <sc-if value="{{ pantryIsBarcode }}">
        <div style="display:flex;flex-direction:column;gap:16px;align-items:center;padding:12px 0">
          <div style="width:100%;height:140px;border-radius:20px;background:var(--soft);border:1px solid var(--line);display:grid;place-items:center;color:var(--muted)">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M4 6v12M7 6v12M9.5 6v12M12 6v12M14.5 6v12M17 6v12M20 6v12"></path></svg>
          </div>
          <button style="width:100%;height:52px;border-radius:16px;background:var(--accent);color:var(--onaccent);font-size:16px;font-weight:650">{{ t.takePhoto }}</button>
        </div>
        </sc-if>

        <sc-if value="{{ pantryIsPhoto }}">
        <div style="display:flex;flex-direction:column;gap:16px;align-items:center;padding:12px 0">
          <div style="width:100%;height:140px;border-radius:20px;background:var(--soft);border:1px solid var(--line);display:grid;place-items:center;color:var(--muted)">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M9 4h6l1.5 2.5H19a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8.5a2 2 0 0 1 2-2h2.5Z"></path><circle cx="12" cy="13" r="3.3"></circle></svg>
          </div>
          <button style="width:100%;height:52px;border-radius:16px;background:var(--accent);color:var(--onaccent);font-size:16px;font-weight:650">{{ t.takePhoto }}</button>
        </div>
        </sc-if>
      </div>
      </sc-if>
```

- [ ] **Step 4: Wire the new bindings and update `savePantry`**

Find (currently):

```js
    openPantryAdd: () => this.setState({ sheet:"pantryAdd", pform:{ name:"", qty:"", unit:"g", loc:"cupboard" } }),
```

Replace with:

```js
    openPantryAdd: () => this.setState({ sheet:"pantryAdd", pform:{ name:"", qty:"", unit:"g", loc:"cupboard", expiresOn:"", mode:"manual" } }),
```

Find (currently):

```js
    v.pform = s.pform;
    v.onPName = e => this.setState({ pform:{ ...s.pform, name:e.target.value } });
    v.onPQty = e => this.setState({ pform:{ ...s.pform, qty:e.target.value } });
    v.unitOpts = [["g","g"], ["ml","ml"], ["ud", s.lang === "es" ? "uds" : "pcs"]].map(([id, label]) => ({ key:id, label, ...chip(s.pform.unit === id), onTap: () => this.setState({ pform:{ ...s.pform, unit:id } }) }));
    v.locOpts = locs.map(([id, label]) => ({ key:id, label, ...chip(s.pform.loc === id), onTap: () => this.setState({ pform:{ ...s.pform, loc:id } }) }));
    v.savePantry = () => {
      const f = s.pform;
      if (!f.name.trim()) return;
      this.setState({
        pantry:[...s.pantry, { id:"p"+Math.random().toString(36).slice(2,7), n:{ es:f.name, en:f.name }, q: parseFloat(f.qty.replace(",", ".")) || 1, u:f.unit, loc:f.loc, exp: f.loc === "fridge" ? 5 : null }],
        sheet:null
      });
```

Replace with:

```js
    v.pform = s.pform;
    v.onPName = e => this.setState({ pform:{ ...s.pform, name:e.target.value } });
    v.onPQty = e => this.setState({ pform:{ ...s.pform, qty:e.target.value } });
    v.onPExpiresOn = e => this.setState({ pform:{ ...s.pform, expiresOn:e.target.value } });
    v.unitOpts = [["g","g"], ["ml","ml"], ["ud", s.lang === "es" ? "uds" : "pcs"]].map(([id, label]) => ({ key:id, label, ...chip(s.pform.unit === id), onTap: () => this.setState({ pform:{ ...s.pform, unit:id } }) }));
    v.locOpts = locs.map(([id, label]) => ({ key:id, label, ...chip(s.pform.loc === id), onTap: () => this.setState({ pform:{ ...s.pform, loc:id } }) }));
    v.pantryModeOpts = [["manual", t.addManual], ["barcode", t.addBarcode], ["photo", t.addPhoto]].map(([id, label]) => ({ key:id, label, ...chip((s.pform.mode || "manual") === id), onTap: () => this.setState({ pform:{ ...s.pform, mode:id } }) }));
    v.pantryIsManual = (s.pform.mode || "manual") === "manual";
    v.pantryIsBarcode = s.pform.mode === "barcode";
    v.pantryIsPhoto = s.pform.mode === "photo";
    v.savePantry = () => {
      const f = s.pform;
      if (!f.name.trim()) return;
      this.setState({
        pantry:[...s.pantry, { id:"p"+Math.random().toString(36).slice(2,7), n:{ es:f.name, en:f.name }, q: parseFloat(f.qty.replace(",", ".")) || 1, u:f.unit, loc:f.loc, expOn: f.expiresOn || null }],
        sheet:null
      });
```

(`exp` — a day-count — becomes `expOn` — a real date string or `null` — matching the shipped app's shift away from baking a derived number. This prototype has no `todayKey` binding yet, so also add, next to the other `v.*` assignments in this same block: `v.todayKey = new Date().toISOString().slice(0,10);` — that's what Step 3's `min="{{ todayKey }}"` reads.)

- [ ] **Step 4: Commit**

```bash
cd /home/jars/Programing/Rezet
git add README.md RezetApp.dc.html
git commit -m "$(cat <<'EOF'
Document the pantry-add expiry date field and barcode/photo modes

Keeps RezetApp.dc.html and README in sync with PantryAddSheet.tsx, per
CLAUDE.md's rule that visual/behavior disputes resolve against these
two before implementer judgment.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01KzPF5aTDAt1N9CpuoXvSzU
EOF
)"
```

---

## Task 12: Final verification pass

**Files:** none (verification only; fix forward in the relevant file if something's broken).

- [ ] **Step 1: Full test suite**

Run: `cd app && npm test`
Expected: all tests pass, including the new `dates.test.ts` and `pantryImport.test.ts`.

- [ ] **Step 2: Typecheck + build**

Run: `cd app && npm run lint && npm run build`
Expected: both succeed with no errors.

- [ ] **Step 3: Full manual browser walkthrough**

Run `cd app && npm run dev`. In demo mode:
1. Pantry → Añadir → Manual → add an item with a future date → confirm it shows correctly, reload the page, confirm it's still correct (not frozen).
2. Pantry → Añadir → Código de barras → run through a real barcode photo (success path) and a bogus one (manual-entry fallback, then not-found fallback).
3. Confirm no "Foto" chip appears in demo mode.
4. Confirm an existing seeded item that would be "expired" under today's date (temporarily verify by checking `Pantry.tsx`'s rendering logic mentally against the seed's `expiresInDays` values — none of the current seed values are negative, so this specific check may need a manually-added past-adjacent item to observe; the `min={todayKey()}` clamp prevents creating one through the UI by design, so this is a code-reading check against Task 6's ternary, not a live repro) shows `t.expired` and never a raw negative number.

- [ ] **Step 4: Report to the user**

Summarize what was verified live vs. what still needs the user's `GEMINI_API_KEY` (Task 9 Step 3) to exercise end-to-end, and hand back the plan file path for reference.
