# Exportar lista de la compra de Rezet a komprapp — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a Rezet user copy a link that, opened in komprapp (the `ShoppingList` repo, `https://shop.jarsss8.es`), imports the shopping items they picked in Rezet into whatever list they currently have open there.

**Architecture:** Rezet builds a versioned JSON payload (`{v:1, items:[{name,quantity,unit}]}`) from the checked `ShoppingNeed`s, base64url-encodes it into a URL fragment (`https://shop.jarsss8.es/#/import/<payload>`), and copies that link to the clipboard — no network call, no shared credentials, no schema coupling. komprapp already runs its own signed-in instance; it decodes the same fragment on load, shows a confirm sheet with checkboxes, and adds each item via its own existing `addItem()` action — the same code path as adding a product by hand, so import gets the same Supabase sync and auto-categorization for free.

**Tech Stack:** Rezet: TypeScript, React, Vitest. komprapp: plain `<script type="text/babel">` files (no bundler), Node's built-in test runner (`node --test`) for pure `*-core.js` modules.

**Spec:** `docs/superpowers/specs/2026-09-16-komprapp-shopping-export-design.md`

**Review note (Fable, 2026-09-16):** an independent review of this plan found it faithful to the real code in both repos and executable as-is, with the corrections already folded into the tasks below (rounding, a shared golden fixture, a dead fallback branch, a broken verification command, an unnecessary render-phase `setState`, and session-relative commit attribution). See each task for what changed.

## Known limitations (accepted for v1)

- **Native app (Capacitor) doesn't handle this deep link.** `appUrlOpen` in the native shell only handles the OAuth custom scheme — an `https://shop.jarsss8.es/#/import/...` link opened on a phone with the app installed will open in the browser, not the installed app (same pre-existing limitation as the `#/s/<token>` join link). Task 5's manual test only covers the browser/PWA path.
- **`setSheet('import')` (Task 5, Step 1) can overwrite whatever sheet is already open**, and can race with the first-launch `OnboardingOverlay` (500ms). Acceptable for v1 — the user can just reopen the link/sheet.

## Global Constraints

- No new Supabase migration, table, column, RPC, or environment variable in either repo.
- Rezet never calls komprapp's Supabase project and never includes komprapp's anon key.
- The import URL must use a path/fragment segment that does **not** match komprapp's existing join-by-token regex `/\/(?:s|shared)\/([^/?#&\s]+)/i` (used by `JoinSheet` and the cold-start deep-link join in `core.jsx`) — use `/import/` as the segment, never `/s/` or `/shared/`.
- komprapp's `addItem(name, qty, cat, extra)` must be called with `cat` falsy so it auto-infers category via `autoCategoryFor` — never guess/map a category from Rezet's food groups.
- Payload is versioned (`v: 1`) from day one so the format can change later without breaking old links silently — an unknown `v` must be rejected (return `null`), never partially imported.
- Rezet business-rule code (the unit-mapping/payload-building logic) lives in `app/src/domain/`, per this repo's non-negotiable "business rules live in domain/ only" rule — it must be pure and covered by a Vitest test, no React/network in that file.
- Every commit message in this plan ends with `EOF` and no attribution footer on purpose — append whatever attribution *your own* current session's system-reminder specifies (it names the exact model and session line to use) before the closing `EOF`. Don't hardcode a model name here: whichever session executes this plan may not be the one that wrote it.

---

## Task 1: Rezet — pure export module (`domain/komprappExport.ts`)

**Files:**
- Create: `app/src/domain/komprappExport.ts`
- Test: `app/src/domain/__tests__/komprappExport.test.ts`

**Interfaces:**
- Consumes: `ShoppingNeed` from `app/src/types.ts` (fields used: `name: string`, `quantity: number`, `unit: 'g'|'ml'|'ud'|'tbsp'`).
- Produces (used by Task 2):
  - `export interface KomprappExportItem { name: string; quantity: number | null; unit: 'g' | 'ml' | 'paq' | null }`
  - `export function toKomprappItem(need: { name: string; quantity: number; unit: string }): KomprappExportItem`
  - `export function buildKomprappImportUrl(needs: { name: string; quantity: number; unit: string }[], baseUrl: string): string`
  - `export const KOMPRAPP_BASE_URL = 'https://shop.jarsss8.es'`

- [ ] **Step 1: Write the failing test**

Create `app/src/domain/__tests__/komprappExport.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildKomprappImportUrl, KOMPRAPP_BASE_URL, toKomprappItem } from '../komprappExport';

describe('toKomprappItem', () => {
  it('mapea gramos y mililitros redondeando hacia arriba (nunca comprar de menos)', () => {
    expect(toKomprappItem({ name: 'Tomate', quantity: 500, unit: 'g' })).toEqual({
      name: 'Tomate',
      quantity: 500,
      unit: 'g',
    });
    expect(toKomprappItem({ name: 'Leche', quantity: 200, unit: 'ml' })).toEqual({
      name: 'Leche',
      quantity: 200,
      unit: 'ml',
    });
    // shoppingNeeds() no redondea el gap (escalado con exponente 0.55 +
    // resta de despensa) — 333.3 g debe llegar a komprapp como 334, no 333.
    expect(toKomprappItem({ name: 'Harina', quantity: 333.3, unit: 'g' })).toEqual({
      name: 'Harina',
      quantity: 334,
      unit: 'g',
    });
  });

  it('mapea unidad suelta (ud) a paq redondeando hacia arriba', () => {
    expect(toKomprappItem({ name: 'Huevos', quantity: 6, unit: 'ud' })).toEqual({
      name: 'Huevos',
      quantity: 6,
      unit: 'paq',
    });
    // 0.7 ud sin redondear llegaría a komprapp como 0 (su normalizeQty hace
    // Math.floor y convierte <=0 en cadena vacía) — el item desaparecería
    // en silencio. Redondeado hacia arriba a 1 antes de mandarlo.
    expect(toKomprappItem({ name: 'Aguacate', quantity: 0.7, unit: 'ud' })).toEqual({
      name: 'Aguacate',
      quantity: 1,
      unit: 'paq',
    });
  });

  it('funde tbsp en el nombre porque komprapp no tiene esa unidad, redondeado hacia arriba', () => {
    expect(toKomprappItem({ name: 'Sal', quantity: 2, unit: 'tbsp' })).toEqual({
      name: 'Sal (2 cucharadas)',
      quantity: null,
      unit: null,
    });
    expect(toKomprappItem({ name: 'Aceite', quantity: 1.4, unit: 'tbsp' })).toEqual({
      name: 'Aceite (2 cucharadas)',
      quantity: null,
      unit: null,
    });
  });

  it('usa singular "cucharada" cuando la cantidad redondeada es 1', () => {
    expect(toKomprappItem({ name: 'Aceite', quantity: 1, unit: 'tbsp' })).toEqual({
      name: 'Aceite (1 cucharada)',
      quantity: null,
      unit: null,
    });
  });
});

describe('buildKomprappImportUrl', () => {
  it('construye una URL con el payload en base64url bajo /#/import/', () => {
    const url = buildKomprappImportUrl([{ name: 'Tomate', quantity: 500, unit: 'g' }], KOMPRAPP_BASE_URL);
    expect(url.startsWith(`${KOMPRAPP_BASE_URL}/#/import/`)).toBe(true);
    const payload = url.split('/#/import/')[1];
    // base64url: sin '+', '/' ni '=' de relleno
    expect(payload).not.toMatch(/[+/=]/);
    const json = JSON.parse(
      Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'),
    );
    expect(json).toEqual({ v: 1, items: [{ name: 'Tomate', quantity: 500, unit: 'g' }] });
  });

  // Fixture dorado: el mismo objeto y el mismo base64url están hardcodeados
  // también en el test de `import-core.js` (komprapp, Task 3). Si algún día
  // cambia el formato del payload en un lado y no en el otro, este test (o
  // su gemelo del otro repo) lo detecta.
  it('produce exactamente el payload del fixture dorado compartido con komprapp', () => {
    const url = buildKomprappImportUrl([{ name: 'Piña', quantity: 1, unit: 'ud' }], KOMPRAPP_BASE_URL);
    const payload = url.split('/#/import/')[1];
    expect(payload).toBe('eyJ2IjoxLCJpdGVtcyI6W3sibmFtZSI6IlBpw7FhIiwicXVhbnRpdHkiOjEsInVuaXQiOiJwYXEifV19');
  });

  it('soporta nombres con acentos/eñes sin corromper el UTF-8', () => {
    const url = buildKomprappImportUrl([{ name: 'Piña colada', quantity: 1, unit: 'ud' }], KOMPRAPP_BASE_URL);
    const payload = url.split('/#/import/')[1];
    const json = JSON.parse(
      Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'),
    );
    expect(json.items[0].name).toBe('Piña colada');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app && npx vitest run src/domain/__tests__/komprappExport.test.ts`
Expected: FAIL — `Cannot find module '../komprappExport'`

- [ ] **Step 3: Write the implementation**

Create `app/src/domain/komprappExport.ts`:

```ts
/**
 * Exporta items de la lista de la compra de Rezet a komprapp (repo
 * `ShoppingList`, https://shop.jarsss8.es) sin llamar a su base de datos:
 * el payload viaja codificado en la URL y komprapp lo decodifica él mismo
 * al abrirla. Ver docs/superpowers/specs/2026-09-16-komprapp-shopping-export-design.md.
 */

export const KOMPRAPP_BASE_URL = 'https://shop.jarsss8.es';

export type KomprappUnit = 'g' | 'ml' | 'paq';

export interface KomprappExportItem {
  name: string;
  quantity: number | null;
  unit: KomprappUnit | null;
}

interface ExportableNeed {
  name: string;
  quantity: number;
  unit: string;
}

const UNIT_MAP: Record<string, KomprappUnit> = { g: 'g', ml: 'ml', ud: 'paq' };

/**
 * `shoppingNeeds()` no redondea su `gap` (resta de despensa sobre una
 * cantidad ya escalada con el exponente 0.55) — puede llegar como 333.3 o
 * 0.7. komprapp trunca hacia abajo (`Math.floor`) para g/ml/paq y convierte
 * cualquier resultado <= 0 en cadena vacía (item sin cantidad, silencioso).
 * Redondeamos hacia arriba aquí para no comprar de menos ni perder el dato.
 */
function roundUp(quantity: number): number {
  return Math.ceil(quantity);
}

/** komprapp no tiene unidad "cucharada": se funde en el nombre como texto. */
export function toKomprappItem(need: ExportableNeed): KomprappExportItem {
  if (need.unit === 'tbsp') {
    const count = roundUp(need.quantity);
    const label = count === 1 ? 'cucharada' : 'cucharadas';
    return { name: `${need.name} (${count} ${label})`, quantity: null, unit: null };
  }
  return { name: need.name, quantity: roundUp(need.quantity), unit: UNIT_MAP[need.unit] ?? null };
}

function toBase64Url(json: string): string {
  const bytes = new TextEncoder().encode(json);
  let binary = '';
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function buildKomprappImportUrl(needs: ExportableNeed[], baseUrl: string): string {
  const items = needs.map(toKomprappItem);
  const payload = toBase64Url(JSON.stringify({ v: 1, items }));
  return `${baseUrl}/#/import/${payload}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app && npx vitest run src/domain/__tests__/komprappExport.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add app/src/domain/komprappExport.ts app/src/domain/__tests__/komprappExport.test.ts
git commit -m "$(cat <<'EOF'
feat(shopping): add pure komprapp export payload builder

EOF
)"
```

---

## Task 2: Rezet — "Compartir con komprapp" button in `ShoppingSheet`

**Files:**
- Modify: `app/src/sheets/ShoppingSheet.tsx`
- Modify: `app/src/i18n/es.ts`
- Modify: `app/src/i18n/en.ts`

**Interfaces:**
- Consumes: `buildKomprappImportUrl`, `KOMPRAPP_BASE_URL` from `../domain/komprappExport` (Task 1); existing `shoppingChecked: Record<string, boolean>` and `needs: ShoppingNeed[]` already in scope in `ShoppingSheet`; existing `t.copiedLink` i18n key (reused for the toast — same "link copied" message already used by `InviteSheet`).
- Produces: nothing consumed by later tasks (this is the Rezet-side leaf of the feature).

- [ ] **Step 1: Add the two new i18n keys**

In `app/src/i18n/es.ts`, right after the `moveToPantry`/`boughtOk` lines (around line 357-358):

```ts
  moveToPantry: 'Pasar lo marcado a la despensa',
  boughtOk: 'Pasado a la despensa',
  shareToKomprapp: 'Compartir con komprapp',
```

In `app/src/i18n/en.ts`, in the matching spot:

```ts
  moveToPantry: 'Move checked to pantry',
  boughtOk: 'Moved to pantry',
  shareToKomprapp: 'Share with komprapp',
```

(Match whatever the exact neighboring lines say in each file — insert `shareToKomprapp` as a new key right after `boughtOk`/its English equivalent, don't reformat surrounding lines.)

- [ ] **Step 2: Wire the button in `ShoppingSheet.tsx`**

In `app/src/sheets/ShoppingSheet.tsx`, add the import:

```ts
import { buildKomprappImportUrl, KOMPRAPP_BASE_URL } from '../domain/komprappExport';
```

Add a handler function inside the component, above the `return`:

```ts
  const shareWithKomprapp = async () => {
    const selected = needs.filter((n) => shoppingChecked[n.key]);
    const url = buildKomprappImportUrl(selected, KOMPRAPP_BASE_URL);
    try {
      await navigator.clipboard.writeText(url);
      onToast(t.copiedLink);
    } catch {
      /* portapapeles no disponible en este navegador */
    }
  };
```

Add the button right after the existing "Pasar lo marcado a la despensa" `<Button>` block (after its closing `</Button>` inside the `<div style={{ marginTop: 18 }}>`, i.e. as a sibling button in that same wrapper):

```tsx
            <div style={{ marginTop: 18 }}>
              <Button
                full
                size="primary"
                disabled={!anyChecked}
                onClick={() => {
                  buyChecked(needs);
                  onClose();
                  onToast(t.boughtOk);
                }}
                style={{ borderRadius: radius.button }}
              >
                {t.moveToPantry}
              </Button>
              <div style={{ marginTop: 10 }}>
                <Button
                  full
                  variant="secondary"
                  disabled={!anyChecked}
                  onClick={() => void shareWithKomprapp()}
                  style={{ borderRadius: radius.button }}
                >
                  {t.shareToKomprapp}
                </Button>
              </div>
            </div>
```

- [ ] **Step 3: Typecheck**

Run: `cd app && npm run lint`
Expected: no new TypeScript errors.

- [ ] **Step 4: Manual smoke test**

Run: `cd app && npm run dev`, open the app in "Demo" mode, add something to the week plan so the shopping list has items, open the Shopping sheet, check one item, tap "Compartir con komprapp", confirm a toast "Enlace copiado" appears. Paste the clipboard content somewhere (e.g. a text field) and confirm it looks like `https://shop.jarsss8.es/#/import/<long base64url string>`.

- [ ] **Step 5: Commit**

```bash
git add app/src/sheets/ShoppingSheet.tsx app/src/i18n/es.ts app/src/i18n/en.ts
git commit -m "$(cat <<'EOF'
feat(shopping): add share-to-komprapp button to the shopping sheet

EOF
)"
```

---

## Task 3: komprapp — pure payload decoder (`src/import-core.js`)

**Files:**
- Create: `/home/jars/Programing/ShoppingList/src/import-core.js`
- Test: `/home/jars/Programing/ShoppingList/tests/unit/import-core.test.mjs`
- Modify: `/home/jars/Programing/ShoppingList/index.html`

**Interfaces:**
- Consumes: nothing (pure, no dependency on other `-core.js` files).
- Produces (used by Task 4): `window.parseImportHash(hash: string): { v: 1, items: { name: string, quantity: number | null, unit: string | null }[] } | null` — extracts the `/import/<payload>` segment from a `location.hash`-shaped string and decodes it; `null` if the segment isn't there or the payload is malformed/unversioned/empty after filtering. Also exports `window.decodeImportPayload(raw: string)` (same return shape, skips the hash-matching step) for direct unit testing.

This repo has no bundler — `-core.js` files are plain UMD-style scripts loaded directly by `index.html` and shared via `window.*`, tested with Node's built-in test runner via `require()` (see `src/qty-core.js` / `tests/unit/qty-core.test.mjs` for the exact pattern this mirrors).

- [ ] **Step 1: Write the failing test**

Create `/home/jars/Programing/ShoppingList/tests/unit/import-core.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { decodeImportPayload, parseImportHash } = require('../../src/import-core.js');

function encode(obj) {
  return Buffer.from(JSON.stringify(obj), 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

test('decodifica un payload válido', () => {
  const raw = encode({ v: 1, items: [{ name: 'Tomate', quantity: 500, unit: 'g' }] });
  assert.deepEqual(decodeImportPayload(raw), {
    v: 1,
    items: [{ name: 'Tomate', quantity: 500, unit: 'g' }],
  });
});

test('decodifica UTF-8 (acentos/eñes) correctamente', () => {
  const raw = encode({ v: 1, items: [{ name: 'Piña colada', quantity: 1, unit: 'paq' }] });
  const decoded = decodeImportPayload(raw);
  assert.equal(decoded.items[0].name, 'Piña colada');
});

// Fixture dorado: el mismo objeto y el mismo base64url están hardcodeados
// también en komprappExport.test.ts (Rezet, Task 1). Si el formato del
// payload diverge entre los dos repos, este test (o su gemelo) lo detecta.
test('decodifica el fixture dorado compartido con Rezet', () => {
  const raw = 'eyJ2IjoxLCJpdGVtcyI6W3sibmFtZSI6IlBpw7FhIiwicXVhbnRpdHkiOjEsInVuaXQiOiJwYXEifV19';
  assert.deepEqual(decodeImportPayload(raw), {
    v: 1,
    items: [{ name: 'Piña', quantity: 1, unit: 'paq' }],
  });
});

test('rechaza versión desconocida', () => {
  const raw = encode({ v: 2, items: [{ name: 'Tomate', quantity: 1, unit: 'g' }] });
  assert.equal(decodeImportPayload(raw), null);
});

test('rechaza JSON inválido / base64 corrupto', () => {
  assert.equal(decodeImportPayload('not-valid-base64!!'), null);
});

test('rechaza payload vacío/nulo', () => {
  assert.equal(decodeImportPayload(''), null);
  assert.equal(decodeImportPayload(null), null);
});

test('filtra items sin nombre y cae a null si no queda ninguno', () => {
  const raw = encode({ v: 1, items: [{ name: '  ', quantity: 1, unit: 'g' }] });
  assert.equal(decodeImportPayload(raw), null);
});

test('normaliza quantity/unit ausentes o inválidos a null', () => {
  const raw = encode({ v: 1, items: [{ name: 'Sal (2 cucharadas)' }] });
  assert.deepEqual(decodeImportPayload(raw), {
    v: 1,
    items: [{ name: 'Sal (2 cucharadas)', quantity: null, unit: null }],
  });
});

test('parseImportHash extrae el segmento /import/ de un hash de verdad', () => {
  const raw = encode({ v: 1, items: [{ name: 'Tomate', quantity: 1, unit: 'g' }] });
  assert.deepEqual(parseImportHash(`#/import/${raw}`), {
    v: 1,
    items: [{ name: 'Tomate', quantity: 1, unit: 'g' }],
  });
});

test('parseImportHash devuelve null si el hash no trae /import/', () => {
  assert.equal(parseImportHash('#/s/some-token'), null);
  assert.equal(parseImportHash(''), null);
});

test('parseImportHash devuelve null si el payload dentro del hash es inválido', () => {
  assert.equal(parseImportHash('#/import/not-valid-base64!!'), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/jars/Programing/ShoppingList && node --test tests/unit/import-core.test.mjs`
Expected: FAIL — `Cannot find module '../../src/import-core.js'`

- [ ] **Step 3: Write the implementation**

Create `/home/jars/Programing/ShoppingList/src/import-core.js`:

```js
// Decodifica el payload de importación que otras apps (p. ej. Rezet) meten
// en la URL como #/import/<base64url(JSON)> — ver JoinSheet/extractToken en
// smart-input.jsx para el mecanismo hermano de unirse a una lista por token,
// que usa /s/ o /shared/ como segmento (este usa /import/ para no chocar).
// Pura: sin dependencias del DOM, se prueba en Node
// (tests/unit/import-core.test.mjs) y se comparte vía `window.parseImportHash`
// / `window.decodeImportPayload`, igual que qty-core.js / outbox-core.js.
// `atob`/`TextDecoder` son globales tanto en navegadores como en Node 16+
// (el runtime de `node --test` incluido) — sin fallback a `Buffer` aquí,
// sería una rama nunca probada.
(function (root) {
  function base64UrlToUtf8(str) {
    const pad = str.length % 4 === 0 ? '' : '='.repeat(4 - (str.length % 4));
    const base64 = str.replace(/-/g, '+').replace(/_/g, '/') + pad;
    const binary = atob(base64);
    const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }

  function decodeImportPayload(raw) {
    if (!raw || typeof raw !== 'string') return null;
    let json;
    try {
      json = JSON.parse(base64UrlToUtf8(raw));
    } catch (_) {
      return null;
    }
    if (!json || json.v !== 1 || !Array.isArray(json.items)) return null;
    const items = json.items
      .filter((it) => it && typeof it.name === 'string' && it.name.trim())
      .map((it) => ({
        name: it.name.trim(),
        quantity: typeof it.quantity === 'number' && it.quantity > 0 ? it.quantity : null,
        unit: typeof it.unit === 'string' && it.unit ? it.unit : null,
      }));
    if (items.length === 0) return null;
    return { v: 1, items };
  }

  function parseImportHash(hash) {
    if (!hash || typeof hash !== 'string') return null;
    const m = hash.match(/\/import\/([^/?#&\s]+)/i);
    if (!m) return null;
    return decodeImportPayload(m[1]);
  }

  const api = { decodeImportPayload, parseImportHash };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.decodeImportPayload = decodeImportPayload;
  root.parseImportHash = parseImportHash;
})(typeof window !== 'undefined' ? window : globalThis);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /home/jars/Programing/ShoppingList && node --test tests/unit/import-core.test.mjs`
Expected: PASS (12 tests)

- [ ] **Step 5: Register the script in `index.html`**

In `/home/jars/Programing/ShoppingList/index.html`, add a new line right after the existing `<script src="src/qty-core.js"></script>` (line 56) and before `data.jsx`:

```html
  <script src="src/qty-core.js"></script>
  <script src="src/import-core.js"></script>
```

- [ ] **Step 6: Run the full unit suite to make sure nothing else broke**

Run: `cd /home/jars/Programing/ShoppingList && npm run test:unit`
Expected: PASS (all suites, including the new one)

- [ ] **Step 7: Commit**

```bash
cd /home/jars/Programing/ShoppingList
git add src/import-core.js tests/unit/import-core.test.mjs index.html
git commit -m "$(cat <<'EOF'
feat(import): add pure decoder for #/import/ deep-link payloads

EOF
)"
```

---

## Task 4: komprapp — cold-start deep-link detection in `useAppState`

**Files:**
- Modify: `/home/jars/Programing/ShoppingList/src/core.jsx`

**Interfaces:**
- Consumes: `window.parseImportHash` (Task 3); existing `React.useState`/`React.useEffect` already imported at the top of `core.jsx`; existing `currentListId` state already in `useAppState`.
- Produces (used by Task 5): two new fields on the object `useAppState()` returns (the `ret` object, `src/core.jsx` around line 869): `pendingImport: { v: 1, items: {...}[] } | null` and `clearPendingImport: () => void`.

- [ ] **Step 1: Add the state and the two effects**

In `/home/jars/Programing/ShoppingList/src/core.jsx`, right after the existing deep-link join effect that ends at line 645 (`}, [authReady]);`) and before the `// Persistir cambios` comment at line 647, insert:

```js
  // Deep-link import: si la URL trae #/import/<payload> (ver import-core.js),
  // decodificamos una sola vez al arrancar y esperamos a que haya una lista
  // activa antes de exponerlo — igual que el deep-link de "unirse" espera a
  // authReady, este espera a currentListId porque el import añade productos
  // a la lista actualmente abierta, no crea ni une ninguna.
  const [pendingImport, setPendingImport] = React.useState(null);
  const importRef = React.useRef(null);
  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    if (importRef.current !== null) return; // ya capturado
    if (!/\/import\//i.test(window.location.hash)) {
      importRef.current = false;
      return;
    }
    const decoded = window.parseImportHash ? window.parseImportHash(window.location.hash) : null;
    importRef.current = decoded || false;
    // Limpia la URL para que recargas no re-disparen el import.
    window.history.replaceState({}, '', '/');
  }, []);

  React.useEffect(() => {
    if (!importRef.current) return;
    if (!currentListId) return;
    setPendingImport(importRef.current);
    importRef.current = false; // procesa una sola vez
  }, [currentListId]);

  const clearPendingImport = React.useCallback(() => setPendingImport(null), []);
```

- [ ] **Step 2: Expose the two new fields**

In the `ret` object (around line 869-896), add `pendingImport, clearPendingImport,` next to the other top-level fields — e.g. right after the `mercadona, setMercadona,` line:

```js
    mercadona, setMercadona,
    pendingImport, clearPendingImport,
```

- [ ] **Step 3: Manual verification (no automated test — this touches `window.location`/React state timing, covered end-to-end in Task 5's manual test)**

Run: `cd /home/jars/Programing/ShoppingList && npm run dev`, then in the browser console after the app loads, run:

```js
window.history.pushState({}, '', '/#/import/eyJ2IjoxLCJpdGVtcyI6W3sibmFtZSI6IlRlc3QiLCJxdWFudGl0eSI6MSwidW5pdCI6InBhcSJ9XX0');
```

(this base64url is `{"v":1,"items":[{"name":"Test","quantity":1,"unit":"paq"}]}`), then reload the page and confirm no console errors — `pendingImport` isn't rendered yet (that's Task 5), just confirm the app still loads normally with an open list.

- [ ] **Step 4: Commit**

```bash
cd /home/jars/Programing/ShoppingList
git add src/core.jsx
git commit -m "$(cat <<'EOF'
feat(import): detect #/import/ deep link and expose pendingImport

EOF
)"
```

---

## Task 5: komprapp — import confirmation sheet

**Files:**
- Modify: `/home/jars/Programing/ShoppingList/src/smart-input.jsx`
- Modify: `/home/jars/Programing/ShoppingList/src/app.jsx`

**Interfaces:**
- Consumes: `app.pendingImport`, `app.clearPendingImport()` (Task 4); `app.addItem(name, qty, cat, extra)` (existing, `src/core.jsx:738`); existing `Sheet`/`Btn`/`Icon` components and `sheet`/`setSheet` state already threaded through `AppSheets`.
- Produces: nothing consumed by later tasks — this is the last task.

- [ ] **Step 1: Open the sheet automatically when a pending import appears**

In `/home/jars/Programing/ShoppingList/src/app.jsx`, inside `function ShopApp()` (near the other `useEffect`s, e.g. right after the one ending at line 36), add:

```js
  React.useEffect(() => {
    if (app.pendingImport) setSheet('import');
  }, [app.pendingImport]);
```

(`useEffect` is already destructured from `React` at the top of this file — reuse the existing import, don't add a new one.)

- [ ] **Step 2: Add the `ImportSheet` component**

In `/home/jars/Programing/ShoppingList/src/smart-input.jsx`, add this new function near `JoinSheet` (e.g. right after it, before `AppSheets`):

```jsx
// Confirma e importa los items de un enlace #/import/ (ver import-core.js +
// core.jsx pendingImport). Mismo patrón visual que el resto de sheets de
// confirmación: checkboxes todos marcados por defecto, el usuario desmarca
// lo que no quiera antes de confirmar.
function ImportSheet({ app, theme, onClose }) {
  const c = theme.c;
  const t = app.t;
  const items = app.pendingImport?.items || [];
  const [checked, setChecked] = React.useState(() => items.map(() => true));

  React.useEffect(() => {
    setChecked(items.map(() => true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app.pendingImport]);

  function toggle(i) {
    setChecked((prev) => prev.map((v, idx) => (idx === i ? !v : v)));
  }

  function confirm() {
    items.forEach((item, i) => {
      if (!checked[i]) return;
      app.addItem(item.name, item.quantity, null, item.unit ? { unit: item.unit } : undefined);
    });
    app.clearPendingImport();
    onClose();
  }

  const anyChecked = checked.some(Boolean);
  const title = app.lang === 'es' ? 'Importar lista de la compra' : 'Import shopping list';
  const importLabel = app.lang === 'es' ? 'Importar' : 'Import';

  return (
    <Sheet theme={theme} mode={app.isDesktop ? 'dialog' : 'sheet'} open onClose={() => { app.clearPendingImport(); onClose(); }} title={title}>
      <div style={{ display: 'flex', flexDirection: 'column', marginBottom: 16, maxHeight: '50vh', overflowY: 'auto' }}>
        {items.map((item, i) => (
          <label
            key={`${item.name}-${i}`}
            style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '12px 4px', borderBottom: `1px solid ${c.border}`, cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={checked[i]}
              onChange={() => toggle(i)}
              style={{ width: 20, height: 20, flexShrink: 0 }}
            />
            <div style={{ flex: 1, fontSize: 15, fontWeight: 600, color: c.ink }}>{item.name}</div>
            {item.quantity != null && (
              <div style={{ fontSize: 13, color: c.inkSub, fontFamily: theme.fontMono }}>
                {item.quantity}{item.unit ? ` ${item.unit}` : ''}
              </div>
            )}
          </label>
        ))}
      </div>
      <Btn theme={theme} variant="solid" size="md" full icon="check" disabled={!anyChecked} onClick={confirm}>
        {importLabel}
      </Btn>
    </Sheet>
  );
}
```

- [ ] **Step 3: Wire the `'import'` case into `AppSheets`**

In `/home/jars/Programing/ShoppingList/src/smart-input.jsx`, add a new case right after the existing `if (sheet === 'join') { ... }` block (around line 1648).

**Don't** copy the existing `'share'` case's pattern of calling `setSheet(null)` directly in the render body when a precondition is missing (line ~1653: `if (!app.list) { setSheet(null); return null; }`) — that updates the parent's state mid-render and triggers React's "Cannot update a component while rendering a different component" warning. It's pre-existing debt in the `'share'` case; don't add a second copy of it:

```jsx
  if (sheet === 'import') {
    if (!app.pendingImport) return null;
    return <ImportSheet app={app} theme={theme} onClose={() => setSheet(null)} />;
  }
```

`ImportSheet` itself always calls `app.clearPendingImport()` before `onClose()` (both confirm and the sheet's own close button), so `sheet === 'import'` never lingers with a null `pendingImport` from a user-driven close — the guard above is only a defensive no-op render for any other path that might clear `pendingImport` first.

- [ ] **Step 4: Export the new component on `window`**

At the bottom of `smart-input.jsx`, find the line `window.AppSheets = AppSheets;` and add the new component next to it:

```js
window.ImportSheet = ImportSheet;
window.AppSheets = AppSheets;
```

- [ ] **Step 5: Manual end-to-end test**

Run: `cd /home/jars/Programing/ShoppingList && npm run dev`. In another terminal, run Rezet (`cd app && npm run dev`), open its Shopping sheet in Demo mode, check an item, tap "Compartir con komprapp", and read the copied URL back (paste it into a scratch text field, or log it — `console.log` temporarily in `shareWithKomprapp` if clipboard read-back is inconvenient in your browser). Open that URL directly in the browser tab running komprapp's dev server (`http://localhost:8765/#/import/<payload>` — same fragment, just on the local origin instead of `shop.jarsss8.es`, since the fragment is all that matters). Confirm: the import sheet opens automatically listing the item(s), unchecking one and confirming only imports the checked ones, and the item(s) appear in komprapp's current list with the right name/quantity/unit and a sensible auto-inferred category. Reload the page after importing and confirm the sheet does **not** reopen (hash was cleared).

- [ ] **Step 6: Run the full komprapp check before committing**

Run: `cd /home/jars/Programing/ShoppingList && npm run test:unit`
Expected: PASS (all suites)

- [ ] **Step 7: Commit**

```bash
cd /home/jars/Programing/ShoppingList
git add src/smart-input.jsx src/app.jsx
git commit -m "$(cat <<'EOF'
feat(import): add confirmation sheet for #/import/ deep links

EOF
)"
```

---

## Deploy note (not part of this plan's tasks — do separately, with the user's confirmation)

Rezet's changes (Tasks 1-2) go live through the normal `deploying-to-main` skill flow (push to `main` → GitHub Actions). komprapp deploys separately (its own Vercel project, not covered by Rezet's `CLAUDE.md`/skills) — follow whatever the user's existing komprapp release process is; this plan doesn't assume or automate it.
