# Pantry-add sheet redesign

Date: 2026-09-06
Status: approved, pending implementation

## Problem

The pantry-add sheet (`app/src/sheets/PantryAddSheet.tsx`, plus its two capture
sidekicks `PantryBarcodeCapture.tsx`/`PantryPhotoCapture.tsx`) shipped
functionally correct but reads as three stacked forms, not one focused
action. Concretely:

1. **Barcode and Foto are the same empty screen with the same "Tomar foto"
   button.** Two tabs for one job, and the fast path (scan) carries the same
   visual weight as the slow one (manual).
2. **Three groups of equal-width buttons stacked** (mode / unit / location)
   use the same `OptionChip` treatment three times, so the sheet reads as a
   form to fill in, not an action to take. None of them is a real segmented
   control (a single control with a sunken track and a sliding pill) —
   they're three buttons of equal visual weight.
3. **The name field doesn't lead.** It's the only required field and it
   weighs the same as the optional expiry date.
4. **The native date `<input>` breaks the aesthetic** the moment it opens,
   and users think in "in a week", not in calendar dates, for pantry expiry.
5. **"Añadir" is always enabled**, even with an empty name.
6. **No batch entry.** Filling a pantry from a shopping trip is ~15 items;
   today that's 15 sheet-opens.

## Scope

In scope: replace the 3-mode chip row with camera-first capture (barcode
decode + Gemini recognition merged into one live-camera flow); a real
segmented-control primitive; a combined quantity+unit input with parsing; a
smarter default location; relative expiry chips; a disabled-until-valid
submit button; and a stay-open batch-add flow with undo. This touches the
pantry-add sheet, its two capture components (merged into one), a new UI
primitive, and — because "smart default location" only works if new
ingredients get a real food group instead of a hardcoded one — a small but
real fix to ingredient creation in **both** data stores.

Out of scope (explicitly deferred): a "flip camera" / torch control;
genuine cross-session memory of "the last location this exact ingredient
was put in" (this redesign uses the ingredient's food group as the signal,
not a new persisted per-ingredient preference — see the Location section);
recipe-side quantity-input parsing (this only touches the pantry-add
field); native camera via Capacitor (still not installed, still browser
`getUserMedia`).

## New primitive: `SegmentedControl`

`app/src/ui/SegmentedControl.tsx` — a real Apple-style segmented control:
one sunken track (`background: var(--surface2)`, `border-radius:
radius.chip`, padding 3px), and a sliding pill (`background: var(--surface)`,
`box-shadow: var(--shadow-s)`, same corner radius minus the padding) that
animates its `left`/`width` to the active segment with `transition: left
.22s var(--ease), width .22s var(--ease)` (reuse `EASE` from
`motion/motion.ts`, `cubic-bezier(.2,.7,.2,1)`). Segment buttons sit on top
with `background: transparent`, transparent to the pill sliding underneath;
active segment's text uses `var(--text)` at full opacity, inactive ones
`var(--muted)`.

```tsx
import { useLayoutEffect, useRef, useState } from 'react';
import { EASE } from '../motion/motion';
import { radius } from './tokens';

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
    const btn = track.children[index] as HTMLElement | undefined;
    if (!btn) return;
    setPill({ left: btn.offsetLeft, width: btn.offsetWidth });
  }, [index, options.length]);

  return (
    <div
      ref={trackRef}
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
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          style={{
            position: 'relative',
            flex: 1,
            height: 38,
            border: 0,
            background: 'transparent',
            borderRadius: radius.chip - 3,
            fontSize: 14,
            fontWeight: 600,
            color: o.value === value ? 'var(--text)' : 'var(--muted)',
            transition: `color .18s ${EASE}`,
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
```

This replaces the `OptionChip` row for **location** (the only remaining
"pick one of N" control in the redesigned sheet — mode is gone, unit is
folded into the quantity field). Generic over string literal unions so it's
reusable elsewhere later without redesign.

## Ingredient food-group inference (needed for smart location default)

**Review-relevant discovery**: `resolveIngredient` (`data/store.tsx:140`)
and `resolveIngredientId` (`data/supabaseStore.tsx:436`) both hardcode
`group: 'seco'` / rely on the DB column's `default 'seco'`
(`supabase/migrations/20260905131217_rezet_core_schema.sql:39`) for any
newly-created ingredient. "Leche" isn't even in the seed catalog. Without
fixing this, "smart default location by food group" would default every
new ingredient to Armario, including milk — the exact case motivating this
feature.

Add to `domain/recipeText.ts`, right next to the existing `SENSITIVE_RE`
(same file already houses "guess a property of an ingredient from its
name" regexes, and is already imported by both stores for exactly that):

```ts
/** Adivina el grupo de un ingrediente nuevo por su nombre — mismo criterio que SENSITIVE_RE: heurística barata, el usuario corrige si hace falta. */
const FRESH_RE = /leche|yogur|yogurt|carne|pollo|pescado|marisco|huevo|queso|fruta|verdura|ensalada|nata|mantequilla|tofu/i;
const TINNED_RE = /lata|conserva|bote|enlatad/i;

export function inferFoodGroup(name: string): FoodGroup {
  if (FRESH_RE.test(name)) return 'fresco';
  if (TINNED_RE.test(name)) return 'conserva';
  return 'seco';
}
```

(`FoodGroup` import already needed in that file or added alongside `Unit`.)

- `data/store.tsx`'s `resolveIngredient`: replace the hardcoded `group:
  'seco'` with `group: inferFoodGroup(name)`.
- `data/supabaseStore.tsx`'s `resolveIngredientId`: add `food_group:
  inferFoodGroup(name)` to the insert payload (currently omitted entirely,
  relying on the DB default).

This is a real behavior change beyond this sheet — it also makes the
existing shopping-list fresco/seco/conserva grouping more accurate for any
newly-typed ingredient anywhere in the app (recipe ingredients included),
which is a genuine improvement, not scope creep: the field already exists
and is already used for exactly this purpose.

## Combined quantity + unit input

One `TextField` where the user types `"500 g"`, `"2 kg"`, `"3"`, etc.
New pure function in `domain/units.ts` (natural home — it's the parse-side
counterpart to the existing `formatQuantity`):

```ts
const QUANTITY_INPUT_RE = /^([\d.,]+)\s*(g|kg|ml|l|ud|uds)?\s*$/i;

/**
 * Parsea "500 g" / "2 kg" / "3" en cantidad + unidad. Sin unidad escrita,
 * usa `fallbackUnit` (normalmente el `defaultUnit` del ingrediente si ya
 * existe en el catálogo, o 'ud' si es nuevo). kg/l se normalizan a g/ml.
 * Nunca lanza: una entrada irreconocible cae a `{ quantity: 1, unit: fallbackUnit }`.
 */
export function parseQuantityInput(input: string, fallbackUnit: Unit): { quantity: number; unit: Unit } {
  const m = input.trim().match(QUANTITY_INPUT_RE);
  if (!m) return { quantity: 1, unit: fallbackUnit };
  let quantity = parseFloat((m[1] ?? '1').replace(',', '.'));
  if (!Number.isFinite(quantity) || quantity <= 0) quantity = 1;
  const rawUnit = (m[2] ?? '').toLowerCase();
  if (rawUnit === 'kg') return { quantity: quantity * 1000, unit: 'g' };
  if (rawUnit === 'l') return { quantity: quantity * 1000, unit: 'ml' };
  if (rawUnit === 'g' || rawUnit === 'ml') return { quantity, unit: rawUnit };
  if (rawUnit === 'ud' || rawUnit === 'uds') return { quantity, unit: 'ud' };
  return { quantity, unit: fallbackUnit };
}
```

In the sheet: one `TextField` bound to a raw string state (`quantityInput`,
e.g. `"500 g"`), a small `Pill` (existing component, `ui/Chip.tsx`) to the
right showing the *resolved* unit as a live-updating suffix (parsed on
every keystroke, not just on submit) so the user sees what will actually be
saved. `fallbackUnit` is the matched ingredient's `defaultUnit` if the
typed name matches an existing ingredient (same lookup `IngredientNameField`
already does for its suggestions), else `'ud'`.

## Location: segmented control + smart default

Replace the 3-`OptionChip` row with `<SegmentedControl>` (Armario/Nevera/
Congelador). Default value: when the typed name resolves to an existing
ingredient, use that ingredient's `group` (`fresco` → `fridge`, `seco`/
`conserva` → `cupboard`); for a name that doesn't match anything yet, run
`inferFoodGroup(name)` on the raw typed text live (same function used at
actual creation time) and map the same way. This recomputes on every
keystroke of the name field (cheap, pure, no debounce needed) — as soon as
the user finishes typing "Leche", the segmented control's pill has already
slid to Nevera. **The user's explicit tap on the control always wins** —
once they've touched it, stop auto-updating it for the rest of that add
(track a local `locationTouched` boolean).

## Expiry: relative chips instead of a bare date picker

Four `OptionChip`s: **3 días · 1 semana · 1 mes · Fecha**. The first three
compute an absolute date immediately via the existing `addDays`/`dateKey`
(`domain/dates.ts`) — 3, 7, and 30 days respectively — and store it in the
same `expiresOn` state as before; no new domain function needed. "Fecha"
reveals the existing native `<input type="date" min={todayKey()}>` below
the chip row (unchanged from the current implementation) for a specific
date. Selecting one of the three relative chips hides the native picker
again; tapping "Fecha" a second time toggles it closed. None is selected by
default (expiry stays optional, matching today's behavior) — the whole
row can be skipped.

## Unified capture: live camera, not a file picker

Replaces `PantryBarcodeCapture.tsx` and `PantryPhotoCapture.tsx` with one
component, `PantryScanCapture.tsx`. This is a real platform capability
change: today's flow uses `<input type="file" capture="environment">`,
which hands off to the phone's native camera app for a single still photo.
This redesign opens a **live camera preview inside the sheet** and
continuously attempts a barcode decode on the video stream — verified
against the actually-installed `@zxing/browser@0.2.1` package before
writing this:

- `BrowserMultiFormatReader` (already used) inherits
  `decodeFromConstraints(constraints: MediaStreamConstraints, previewElem: string | HTMLVideoElement, callbackFn: DecodeContinuouslyCallback): Promise<IScannerControls>`
  from its base `BrowserCodeReader` class (confirmed in
  `node_modules/@zxing/browser/esm/readers/BrowserCodeReader.d.ts`).
- `DecodeContinuouslyCallback` is
  `(result: Result | undefined, error: Exception | undefined, controls: IScannerControls) => void` —
  called repeatedly as the library keeps decoding frames; `result` is only
  set on a successful read, most calls will have `error` set to a benign
  `NotFoundException` (same "no code in this frame yet" noise already seen
  and ignored in this codebase's console during Task 8's live testing).
- `IScannerControls.stop(): void` — call this on unmount/cancel to release
  the camera. This is the actual cleanup mechanism; there's no separate
  "stop stream" call needed once you have `controls`.
- Requesting the **rear** camera specifically: pass
  `{ video: { facingMode: { ideal: 'environment' } } }` as the
  `constraints` argument — this is the standard `getUserMedia` constraint
  `decodeFromConstraints` forwards internally, not something zxing
  reinvents.

```tsx
import { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import type { IScannerControls } from '@zxing/browser';
import { usePrefs } from '../store/prefs';
import { supabase } from '../data/supabaseClient';
import { mapGeminiRecognition, mapOpenFoodFactsProduct, type OffApiResponse } from '../domain/pantryImport';
import { blobToBase64 } from '../lib/imageCapture';
import { Button } from '../ui/Button';
import { TextField } from '../ui/Fields';
import type { Unit } from '../types';

type Status = 'starting' | 'scanning' | 'looking' | 'manualEntry' | 'notFound' | 'photoFailed' | 'noCamera';

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
  const [manualCode, setManualCode] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);

  useEffect(() => {
    let cancelled = false;
    const reader = new BrowserMultiFormatReader();
    reader
      .decodeFromConstraints(
        { video: { facingMode: { ideal: 'environment' } } },
        videoRef.current ?? undefined,
        (result) => {
          if (cancelled || !result) return;
          controlsRef.current?.stop();
          void runLookup(result.getText());
        },
      )
      .then((controls) => {
        if (cancelled) {
          controls.stop();
          return;
        }
        controlsRef.current = controls;
        setStatus('scanning');
      })
      .catch(() => {
        if (!cancelled) setStatus('noCamera');
      });
    return () => {
      cancelled = true;
      controlsRef.current?.stop();
    };
  }, []);

  const runLookup = async (code: string) => {
    setStatus('looking');
    const item = await lookupBarcode(code);
    if (item) onResult(item);
    else setStatus('notFound');
  };

  const captureFrameForGemini = async () => {
    const video = videoRef.current;
    if (!video) return;
    setStatus('looking');
    controlsRef.current?.stop();
    try {
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
      setStatus('photoFailed');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'center', padding: '4px 0' }}>
      {(status === 'starting' || status === 'scanning' || status === 'looking') && (
        <video
          ref={videoRef}
          muted
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

      {(status === 'noCamera' || status === 'manualEntry' || status === 'notFound' || status === 'photoFailed') && (
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {status === 'noCamera' && <div style={{ fontSize: 13, color: 'var(--warn-ink)' }}>{t.cameraUnavailable}</div>}
          {status === 'notFound' && <div style={{ fontSize: 13, color: 'var(--warn-ink)' }}>{t.scanNotFound}</div>}
          {status === 'photoFailed' && <div style={{ fontSize: 13, color: 'var(--warn-ink)' }}>{t.photoRecognizeFailed}</div>}
          {status === 'manualEntry' && (
            <>
              <div style={{ fontSize: 13, color: 'var(--muted)' }}>{t.enterBarcodeManually}</div>
              <TextField value={manualCode} onChange={setManualCode} inputMode="numeric" placeholder="8410000000000" />
              <Button full onClick={() => manualCode.trim() && void runLookup(manualCode.trim())}>{t.add}</Button>
            </>
          )}
        </div>
      )}

      <button type="button" onClick={onManual} style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--accent-ink)' }}>
        {t.enterManually}
      </button>
    </div>
  );
}
```

**Review-anticipated points, addressed inline above:**
- Camera permission denied / no camera / insecure context (getUserMedia
  needs HTTPS, which `rezet.jarsss8.es` already is) → the `.catch()` on
  `decodeFromConstraints` lands on `'noCamera'`, which shows the same
  "Escribirlo a mano" affordance as every other dead end — never a stuck
  spinner (the lesson from the last plan's Task 10 finding).
  `t.enterManually` (the plain-text link under the video, always visible
  once `starting` has resolved either way) is the one way out that's
  reachable even from `noCamera` — it's rendered unconditionally at the
  bottom, not gated per status.
- `lookupBarcode` keeps the same try/catch this plan's final review added
  to the old component — that fix carries forward unchanged.
- The Gemini fallback is a manual button (`t.recognizeByPhoto`), never
  automatic — confirmed with the user: automatic-after-N-seconds would
  burn a real Gemini call every time a product simply has no barcode,
  which is common (loose produce, homemade leftovers).
- `allowPhoto` (already threaded from `App.tsx` as `!demo`) gates whether
  the "Reconocer por foto" button ever renders — demo mode still gets live
  barcode scanning (client-only, no backend needed) but never the Gemini
  button, same gating logic as today, just checked in one merged component
  instead of by which of two sibling components got mounted.

**Deleted**: `app/src/sheets/PantryBarcodeCapture.tsx`,
`app/src/sheets/PantryPhotoCapture.tsx` (superseded by `PantryScanCapture.tsx`).

## Batch add: stay open, list + undo

`pantryAdd`'s contract changes in **both** stores to return the created
row's id (confirmed with the user — this is a deliberate, explicit contract
change, not a workaround):

```ts
pantryAdd: (input: { name: string; quantity: number; unit: Unit; location: PantryLoc; expiresOn?: string }) => Promise<string>;
```

- `data/store.tsx`: `pantryAdd` currently does `setData((d) => ({ ...d, pantry: [...d.pantry, item] }))` where `item.id = uid('p')` is already computed before the `setData` call — return that same `item.id` directly (the function doesn't need to become `async` for the demo store; wrap the return in `Promise.resolve(item.id)` so the type matches the real store's genuinely-async version, or make it `async` trivially — either is fine, prefer keeping it `async () => { ...; return item.id; }` so both stores share the same call-site shape (`await pantryAdd(...)`), even though the demo one resolves synchronously underneath).
- `data/supabaseStore.tsx`: currently a fire-and-forget `void (async () => {...})()` wrapper — change to a real `async` function that `return`s the function itself (drop the `void (...)()` wrapper), add `.select('id').single()` to the insert, and `return created.id as string;`.
- `data/storeContext.ts`: update `Store.pantryAdd`'s type to match.

In `PantryAddSheet.tsx`: `submit` becomes `async`, calls `await pantryAdd(...)`, and on success:
- Pushes `{ id, name, quantitySummary }` onto a local `addedItems` array
  (sheet-local `useState`, not store state — this is just "what did I add
  in this session of having the sheet open", not persisted).
- Clears `name`/`quantityInput`/`expiresOn` (location and the resolved
  unit stay as they were — likely still correct for the next item from the
  same shopping trip) and returns focus to the name field
  (`nameInputRef.current?.focus()`).
- Does **not** call `onClose()` anymore on success — the sheet stays open.
  `onClose` is now only reachable via the `Sheet` component's own existing
  chrome (×, swipe-down, Escape, backdrop tap) — no new "cerrar" button.

Below the form, when `addedItems.length > 0`, render the list: each row is
name + a small "deshacer" (undo) text button that calls
`pantryDelete(id)` and removes that entry from the local `addedItems`
array. This is a real delete against the real store — undo genuinely
reverses the add, not a client-side-only illusion.

## Name field: leads visually, autofocus

`IngredientNameField` (unchanged component) gets a `ref` forwarded to its
inner `TextField`. Verified `TextField` (`ui/Fields.tsx:112`) is currently
a plain function component with no `forwardRef` — add `forwardRef` to it
(small, additive change; no existing caller passes a `ref` today, so
nothing breaks) and thread that ref through `IngredientNameField` to its
own `TextField`. The sheet calls `.focus()` on it in a `useEffect` when
switching into manual mode (both on first open in manual mode, and every
time `onManual`/`applyPrefill` switches back to it from the scan flow) so
the keyboard is already up. Visually: increase the name field's font size
to match `T.cardTitle` (16.5px/600, already defined in `ui/tokens.ts`)
instead of the default `TextField` size (16.5px/400) — same size, but
weighted so it reads as the primary field; the quantity/date/location
rows stay at their current smaller weight.

## Submit button: disabled until valid

`<Button disabled={!name.trim()} ...>` — verified `Button` (`ui/Button.tsx:32,44,54,68`) already accepts `disabled?: boolean`, applies it to the underlying element, and dims it to `opacity: 0.55` — use it as-is, no new visual treatment needed.

## New i18n keys

- `recognizeByPhoto` (es: "Reconocer por foto", en: "Recognize by photo")
- `enterManually` (es: "Escribirlo a mano", en: "Enter it by hand") — this
  is a **new, distinct** key from the existing `addManual`
  ("Manual", the old tab label, now unused/removable) and
  `enterBarcodeManually` ("Escribe el código a mano", specific to typing a
  barcode digit string) — don't collide with either.
- `cameraUnavailable` (es: "No se pudo acceder a la cámara", en: "Couldn't access the camera")
- `undo` (es: "Deshacer", en: "Undo") — grepped both `es.ts`/`en.ts`, confirmed no existing key with this name or meaning.
- `expiresIn3Days` / `expiresIn1Week` / `expiresIn1Month` (es: "3 días" /
  "1 semana" / "1 mes", en: "3 days" / "1 week" / "1 month") for the three
  relative-expiry chip labels.
- `dateOption` (es: "Fecha", en: "Date") for the fourth chip.

**Keys that become unused after this redesign** (safe to remove, confirm
no other screen references them first via grep — `addManual` in particular
was ONLY ever used by the mode-chip row this redesign deletes):
`addManual`, `addBarcode`, `addPhotoMode`, `takePhoto`, `scanDecodeFailed`
(folded into the single `noCamera`/`notFound`/`manualEntry` states above —
check whether the exact old copy is worth preserving under the new
`manualEntry` state or if `enterBarcodeManually` alone reads fine without
a preceding "no se pudo leer el código" line; author's call at
implementation time, not worth a spec section).

## Testing

- New pure logic gets domain tests, same convention as every prior task in
  this project: `inferFoodGroup` (recipeText.ts) and `parseQuantityInput`
  (units.ts) each get a test file/additions covering their branches (fresh
  keyword match, tinned keyword match, default-to-seco; g/kg/ml/l
  normalization, bare number with a fallback unit, unparseable input
  falling back cleanly).
- No jsdom/RTL in this repo — `SegmentedControl`, the live-camera flow, and
  the batch-add list are all verified manually in the browser, same
  convention as every prior UI task. The live camera specifically needs a
  real browser with camera access (or a permission-denial path exercised
  by denying it) — this cannot be meaningfully faked with a static test
  image the way the old file-input flow could.
- Manual verification checklist for implementation: scanning a real
  barcode successfully prefills and switches to manual; denying camera
  permission (or testing in an environment with no camera) reaches
  `noCamera` and "Escribirlo a mano" still works; "Reconocer por foto"
  only appears in real (non-demo) accounts; typing "Leche" in the name
  field visibly slides the location pill to Nevera before you've touched
  it yourself, and stops updating once you tap a location manually; adding
  three items in a row keeps the sheet open, shows all three in the undo
  list, and "deshacer" on the middle one removes only that one from both
  the list and the real pantry.
