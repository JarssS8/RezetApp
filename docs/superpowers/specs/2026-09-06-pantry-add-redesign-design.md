# Pantry-add sheet redesign

Date: 2026-09-06
Status: approved, revised after independent review (see "Review fixes" and "Rulings" throughout)

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
primitive, two small new `domain/` functions, and — because "smart default
location" only works if new ingredients get a real food group instead of a
hardcoded one, and because batch-adding an item you already have must not
silently corrupt your pantry — real fixes to ingredient creation and
`pantryAdd`'s conflict handling in **both** data stores.

Out of scope (explicitly deferred): a "flip camera" / torch control;
genuine cross-session memory of "the last location this exact ingredient
was put in" (this redesign uses the ingredient's food group as the signal,
not a new persisted per-ingredient preference); recipe-side quantity-input
parsing (this only touches the pantry-add field); native camera via
Capacitor (still not installed, still browser `getUserMedia`).

## Rulings from independent review

An independent review (fresh context, verified every claim against the
actual repo before this revision) found 5 Critical bugs, 10 Important gaps,
and 3 genuinely open product questions in the first draft of this spec. All
are fixed below. The three open questions needed a product decision before
implementation could proceed; rather than round-trip again, here are the
rulings, each with its reasoning, so implementation isn't blocked:

1. **Adding an item you already have (same ingredient+unit+location) sums
   into the existing row**, matching `buyChecked`'s existing precedent
   (`store.tsx:257`, `existing.quantity += need.quantity`) rather than
   creating a duplicate or refusing. This is the only option that makes
   the redesign's own motivating scenario (a 15-item shopping trip) work —
   see "pantryAdd conflict handling" below for the exact mechanics,
   including what happens to `expiresOn` on merge.
2. **The camera is a mode you enter and leave, not a permanent panel.**
   The sheet opens directly in scan mode (live camera); a successful
   scan/photo-recognition or tapping "Escribirlo a mano" switches to the
   Manual form. After an add from Manual, the sheet stays in Manual (does
   **not** silently reopen the camera and re-prompt for permission) — an
   explicit "Escanear otro" link lets the user return to scan mode for the
   next item. See "Sheet layout" below.
3. **Nothing carries over between batch adds except the resolved
   location once the user has touched it themselves.** Name, the quantity
   input, and expiry all reset to empty after each add, and
   `locationTouched` also resets — so the smart-location inference fires
   fresh for the next item (this is the only option under which the
   food-group inference actually does anything useful across a batch of
   different products). See "Batch add" below.

## New primitive: `SegmentedControl`

`app/src/ui/SegmentedControl.tsx` — a real Apple-style segmented control:
one sunken track (`background: var(--surface2)`, `border-radius:
radius.chip`, padding 3px), and a sliding pill (`background: var(--surface)`,
`box-shadow: var(--shadow-s)`, same corner radius minus the padding) that
animates its `left`/`width` to the active segment with `transition: left
.22s var(--ease), width .22s var(--ease)` (reuse `EASE` from
`motion/motion.ts`, `cubic-bezier(.2,.7,.2,1)`). New token
`height.segment: 38` in `ui/tokens.ts` (that file exists specifically so
components don't carry bare numbers — `tokens.ts:2-3`) — `38 + 3 + 3 = 44 =
height.touch`, so it lines up with the app's existing touch-target rhythm.

**Review fix — pill measurement was off-by-one after the first render.**
The original draft measured `track.children[index]`, but the pill `<div>`
itself is the first child of that same container — so after the first
render, `children[0]` is the pill, not the first button, and every
selection after the very first one slides the pill to the wrong segment.
Fixed by measuring buttons specifically (`querySelectorAll('button')`, not
positional `children`), and by using `Pressable` (which already supports
`role`/`ariaChecked`, `Pressable.tsx:31-33`) instead of a bare `<button>`
so the control gets the app's standard press-scale feedback and is
`role="radiogroup"`/`role="radio"` accessible for free (README §8):

```tsx
import { useLayoutEffect, useRef, useState } from 'react';
import { Pressable } from './Pressable';
import { EASE } from '../motion/motion';
import { height, radius } from './tokens';

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

This replaces the `OptionChip` row for **location** (the only remaining
"pick one of N" control in the redesigned sheet — mode is now a two-state
scan/manual toggle handled by the sheet itself, not a chip row, and unit is
folded into the quantity field). Generic over string literal unions so
it's reusable elsewhere later without redesign.

## Shared ingredient lookup (new)

**Review fix.** The original draft said "the matched ingredient" for both
the quantity field's unit fallback and the location default, citing
`IngredientNameField`'s suggestion list as "the same lookup" — but that
list is a **substring** filter (`IngredientNameField.tsx:37`,
`.filter((i) => loc(i.name).toLowerCase().includes(q))`), meant for showing
multiple suggestions as you type, not for resolving a single canonical
match. Typing "le" would match whichever of "Leche"/"Lentejas" the array
happens to list first, and the resolved unit/location would flicker
between them as you keep typing. The actual exact-match lookup already
exists, duplicated slightly differently in each store
(`store.tsx:136-138`, `.toLowerCase() ===`; `supabaseStore.tsx:427-433`,
`.ilike()`), and isn't exported for reuse.

Add to `domain/recipeText.ts` (same file already houses per-name
inference helpers — see `inferFoodGroup` below):

```ts
/** Coincidencia exacta (insensible a mayúsculas) por nombre ES o EN — no sustituye a las sugerencias de IngredientNameField, que buscan por subcadena. */
export function findIngredientByName(list: Ingredient[], name: string): Ingredient | undefined {
  const q = name.trim().toLowerCase();
  return list.find((i) => i.name.es.toLowerCase() === q || i.name.en.toLowerCase() === q);
}
```

Both the sheet's quantity-fallback-unit resolution and its location default
use this function against the current `ingredients` list — never the
substring suggestion list. (`resolveIngredient`/`resolveIngredientId` in
both stores keep their own copies for now — refactoring those to call this
shared function too is a nice-to-have, not required by this redesign, since
neither is being touched for any other reason here.)

## Ingredient food-group inference (needed for smart location default)

**Review-relevant discovery**: `resolveIngredient` (`data/store.tsx:130`,
hardcoded value at `:143`) and `resolveIngredientId`
(`data/supabaseStore.tsx:425`, insert payload at `:438-444`) both hardcode
`group: 'seco'` / omit `food_group` entirely (relying on the DB column's
`default 'seco'`, `supabase/migrations/20260905131217_rezet_core_schema.sql:39`)
for any newly-created ingredient. "Leche" isn't even in the seed catalog.
Without fixing this, "smart default location by food group" would default
every new ingredient to Armario, including milk — the exact case
motivating this feature.

Add to `domain/recipeText.ts`, right next to the existing `SENSITIVE_RE`
(same file already houses "guess a property of an ingredient from its
name" regexes, and is already imported by both stores for exactly that):

**Review fix — the first draft's regex was Spanish-only**, unlike its
sibling `SENSITIVE_RE` (`recipeText.ts:4`,
`/sal|salt|especia|spice|pimienta|pepper|levadura|yeast|curry/i`), which is
deliberately bilingual because `Ingredient.name` is `Localized {es, en}`
and the app ships an English locale. An English user typing "Milk" would
have gotten `seco` → Armario — the spec's own motivating example failing
in half the app. Also word-boundaried the tinned pattern so "Botella"
(bottle) doesn't match "bote" (can/jar) as a substring:

```ts
const FRESH_RE = /leche|milk|yogur|yogurt|carne|meat|pollo|chicken|pescado|fish|marisco|seafood|huevo|egg|queso|cheese|fruta|fruit|verdura|vegetable|ensalada|salad|nata|cream|mantequilla|butter|tofu/i;
const TINNED_RE = /\b(lata|conserva|bote|enlatad\w*|tinned?|canned?|jarred?)\b/i;

/** Adivina el grupo de un ingrediente nuevo por su nombre — mismo criterio que SENSITIVE_RE: heurística barata, bilingüe, el usuario corrige si hace falta. */
export function inferFoodGroup(name: string): FoodGroup {
  if (FRESH_RE.test(name)) return 'fresco';
  if (TINNED_RE.test(name)) return 'conserva';
  return 'seco';
}

/** fresco → nevera, seco/conserva → armario. Única fuente de esta regla — antes vivía duplicada en store.tsx y supabaseStore.tsx. */
export function defaultLocationFor(group: FoodGroup): PantryLoc {
  return group === 'fresco' ? 'fridge' : 'cupboard';
}
```

(`FoodGroup`/`PantryLoc` imports added alongside the existing `Unit` import
in that file.)

- `data/store.tsx`'s `resolveIngredient`: replace the hardcoded `group:
  'seco'` with `group: inferFoodGroup(name)`.
- `data/supabaseStore.tsx`'s `resolveIngredientId`: add `food_group:
  inferFoodGroup(name)` to the insert payload (currently omitted entirely,
  relying on the DB default).
- **Review fix (Important) — this exact mapping already existed, duplicated,
  and this redesign was about to add a third copy.** `store.tsx:264`
  (`buyChecked`) and `supabaseStore.tsx:501` (its Supabase counterpart)
  both already inline `n.group === 'fresco' ? 'fridge' : 'cupboard'` — the
  precise rule CLAUDE.md's "four screens must agree" language exists to
  prevent duplicating. Refactor both call sites to use
  `defaultLocationFor(group)` instead of re-inlining the ternary a third
  time.

This is a real behavior change beyond this sheet — it also makes the
existing shopping-list fresco/seco/conserva grouping more accurate for any
newly-typed ingredient anywhere in the app (recipe ingredients included),
which is a genuine improvement, not scope creep: the field already exists
and is already used for exactly this purpose.

## Combined quantity + unit input

One `TextField` where the user types `"500 g"`, `"2 kg"`, `"3"`, etc.
New pure function in `domain/units.ts` (natural home — it's the parse-side
counterpart to the existing `formatQuantity`):

**Review fix (Important) — the original regex anchored at `$`, so ANY
trailing text it didn't recognize (`"3 pcs"`, `"500 gramos"`, `"2 Kg."`,
even a trailing space typo) made the whole match fail and silently
discarded the user's typed number down to `1`.** This isn't hypothetical:
`PantryAddSheet.tsx:36` has been showing English users the unit label
`'pcs'` all along (`locale === 'es' ? 'uds' : 'pcs'`), and
`parseIngredientLines` (`recipeText.ts:90`) already accepts `pcs` as a
sibling parser — the new one didn't. Fixed by accepting `pcs`, and by
extracting the leading number as a fallback instead of discarding it when
the unit suffix is unrecognized:

```ts
const QUANTITY_INPUT_RE = /^([\d.,]+)\s*(g|kg|ml|l|ud|uds|pcs)?\s*$/i;
const LEADING_NUMBER_RE = /^([\d.,]+)/;

function toNumber(raw: string | undefined): number {
  const n = parseFloat((raw ?? '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : 1;
}

/**
 * Parsea "500 g" / "2 kg" / "3" en cantidad + unidad. Sin unidad escrita, o
 * con un sufijo que no reconoce, usa `fallbackUnit` (el `defaultUnit` del
 * ingrediente si `findIngredientByName` lo resuelve, o 'ud' si es nuevo) —
 * pero SIEMPRE conserva el número que escribió el usuario, nunca lo
 * descarta a 1 solo porque la unidad no se entendió. kg/l se normalizan a
 * g/ml. Nunca lanza.
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

In the sheet: one `TextField` bound to a raw string state (`quantityInput`,
e.g. `"500 g"`), a small `Pill` (existing component, `ui/Chip.tsx`) to the
right showing the *resolved* unit as a live-updating suffix (parsed on
every keystroke, not just on submit) so the user sees what will actually be
saved. `fallbackUnit` is `findIngredientByName(ingredients, name)?.defaultUnit
?? 'ud'` (the shared exact-match lookup above, not the suggestion
substring filter).

## Location: segmented control + smart default

Replace the 3-`OptionChip` row with `<SegmentedControl>` (Armario/Nevera/
Congelador). Default value: `defaultLocationFor(findIngredientByName(ingredients,
name)?.group ?? inferFoodGroup(name))` — i.e. use the matched ingredient's
real group if it already exists in the catalog, otherwise infer one from
the raw typed text live (same `inferFoodGroup` used at actual creation
time). This recomputes on every keystroke of the name field (cheap, pure,
entirely client-side — no network involved, so it works offline same as
everything else in this sheet) — as soon as the user finishes typing
"Leche", the segmented control's pill has already slid to Nevera. **The
user's explicit tap on the control always wins** — once they've touched it,
stop auto-updating it for the rest of *that single add* (track a local
`locationTouched` boolean, reset to `false` after each successful add —
see "Batch add").

## Expiry: relative chips instead of a bare date picker

Four `OptionChip`s. **Review fix (Minor) — renamed the i18n keys** from
`expiresIn3Days`/`expiresIn1Week`/`expiresIn1Month` to
`relative3Days`/`relative1Week`/`relative1Month`, since the existing
`expiresIn` key (`es.ts:145`, `'caduca en'`) is a sentence *fragment*
("caduca en 3 días" is built by concatenation elsewhere) and the new keys
are standalone chip labels — the shared prefix invited confusing the two:

- `relative3Days` (es: "3 días", en: "3 days")
- `relative1Week` (es: "1 semana", en: "1 week")
- `relative1Month` (es: "1 mes", en: "1 month")
- `dateOption` (es: "Fecha", en: "Date")

**Review fix (Minor) — use the existing `offsetKey` helper.** `domain/dates.ts:36`
already has `offsetKey(days: number): string`, doing precisely `dateKey(addDays(new
Date(), days))` — the original draft said to "compute via `addDays`/`dateKey`",
re-deriving what already exists. The three relative chips call
`offsetKey(3)`, `offsetKey(7)`, `offsetKey(30)` respectively and store the
result in the same `expiresOn` state as before; no new domain function
needed for this part.

"Fecha" reveals the existing native `<input type="date"
min={todayKey()}>` below the chip row (unchanged from the current
implementation) for a specific date. Selecting one of the three relative
chips hides the native picker again; tapping "Fecha" a second time toggles
it closed.

**Review fix (Important) — a Gemini-provided date was invisible.**
`mapGeminiRecognition` can return `expiresOn` (`pantryImport.ts:67-68`),
and `applyPrefill` sets it directly — but with no chip lit by default and
the native picker hidden until "Fecha" is tapped, a date that came back
from photo recognition would sit in state with zero visible confirmation.
Fix: when `applyPrefill` receives a non-empty `expiresOn`, compare it
against `offsetKey(3)`/`offsetKey(7)`/`offsetKey(30)` — if it matches one,
select that chip; otherwise select "Fecha" and open the native picker
already populated with that date. Only when `expiresOn` is empty does the
row start with nothing selected (expiry stays fully optional, matching
today's behavior).

## Sheet layout (new section — this was missing entirely from the first draft)

**Review finding (Important) — the original draft never described the
sheet's own top-level structure**, leaving "mode is gone" (which turned out
to be wrong — see Ruling 2 above) next to code that clearly still branches
on *some* mode (`PantryScanCapture` takes an `onManual` callback; the name
field's autofocus effect mentions switching back to it "from the scan
flow"). Two implementers would have built two different apps from that
draft. Here is the actual structure:

`PantryAddSheet.tsx` holds `const [mode, setMode] = useState<'scan' | 'manual'>('scan')`.

- **`mode === 'scan'`**: renders `<PantryScanCapture allowPhoto={allowPhoto} onResult={applyPrefill} onManual={() => setMode('manual')} />` (see below). This is the sheet's default/opening state.
- **`mode === 'manual'`**: renders the form (name, quantity, location, expiry, submit) plus, once at least one item has been added this session, the batch list with undo (see "Batch add"). Reached by: tapping "Escribirlo a mano" inside scan mode, or a successful scan/photo-recognition (`applyPrefill` sets `mode` to `'manual'` as its last step, same as today).
- Once in `mode === 'manual'`, a small "Escanear otro" link above the form (visible any time, not just after an add) calls `setMode('scan')` to go back — this is the answer to "how do you scan the second item of your 15": you choose to, explicitly, rather than the camera silently relighting itself and re-prompting for permission on every add.
- The sheet does **not** run the camera and the form at the same time — only one of the two is mounted, matching how `PantryScanCapture`'s `useEffect` already acquires/releases the camera stream on mount/unmount.

## Unified capture: live camera, not a file picker

Replaces `PantryBarcodeCapture.tsx` and `PantryPhotoCapture.tsx` with one
component, `PantryScanCapture.tsx`. This is a real platform capability
change: today's flow uses `<input type="file" capture="environment">`,
which hands off to the phone's native camera app for a single still photo.
This redesign opens a **live camera preview inside the sheet** and
continuously attempts a barcode decode on the video stream — verified
against the actually-installed `@zxing/browser@0.2.1` package before
writing this (an independent review re-verified all of the following
directly against the installed package a second time and confirmed each
point):

- `BrowserMultiFormatReader` (already used) inherits
  `decodeFromConstraints(constraints: MediaStreamConstraints, previewElem: string | HTMLVideoElement | undefined, callbackFn: DecodeContinuouslyCallback): Promise<IScannerControls>`
  from its base `BrowserCodeReader` class.
- `DecodeContinuouslyCallback` is
  `(result: Result | undefined, error: Exception | undefined, controls: IScannerControls) => void` —
  called repeatedly as the library keeps decoding frames; `result` is only
  set on a successful read, most calls will have `error` set to a benign
  `NotFoundException` (same "no code in this frame yet" noise already seen
  and ignored in this codebase's console during a prior plan's live
  testing).
- `IScannerControls.stop(): void` — call this on unmount/cancel to release
  the camera. This is the actual cleanup mechanism; there's no separate
  "stop stream" call needed once you have `controls`.
- Requesting the **rear** camera specifically: pass
  `{ video: { facingMode: { ideal: 'environment' } } }` as the
  `constraints` argument.
- `IScannerControls` is re-exported from the package's root index, so
  `import type { IScannerControls } from '@zxing/browser'` resolves.

```tsx
import { useEffect, useRef, useState, useCallback } from 'react';
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

  const runLookup = useCallback(async (code: string, cancelledRef: { current: boolean }) => {
    setStatus('looking');
    const item = await lookupBarcode(code);
    if (cancelledRef.current) return;
    if (item) onResult(item);
    else setStatus('notFound');
  }, [onResult]);

  useEffect(() => {
    const cancelledRef = { current: false };
    const video = videoRef.current;
    if (video) video.muted = true; // review fix: JSX `muted` prop is unreliable on iOS, set it imperatively
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
    const cancelledRef = { current: false };
    setStatus('looking');
    controlsRef.current?.stop();
    try {
      // No resizeImageFile here: this draws straight from the live <video>
      // element, not a File — and it's the Gemini path, where downscaling
      // is safe (unlike the barcode-decode path, which this redesign no
      // longer has, since it decodes live video frames directly).
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
      if (cancelledRef.current) return;
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
      if (!cancelledRef.current) setStatus('photoFailed');
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

**Review fixes applied inline above, summarized:**
- **(Critical) Removed the `manualEntry` status entirely.** The first draft
  declared it and rendered a full "type the barcode digits" UI for it, but
  nothing ever transitioned into it — with live continuous scanning there's
  no discrete "decode failed" event the way a single still photo has one.
  Typing the barcode by hand duplicates what the full Manual form already
  covers (`onManual`), so this redesign doesn't need a second, narrower
  manual-entry path — deleting it removes dead code instead of trying to
  invent a new trigger for it. `enterBarcodeManually` is dropped from the
  i18n key list as a result (see below).
- **(Critical) No dead end on failure.** `notFound`/`photoFailed` now show
  a `t.scanAgain` button that bumps `attempt`, which the effect depends on
  — re-running `decodeFromConstraints` fresh. `noCamera` doesn't offer
  "scan again" (permission/hardware isn't going to change by retrying) but
  `onManual` is rendered unconditionally at the bottom regardless of
  `status`, so there's always a way forward.
- **(Minor) `<video muted>` set imperatively**, not as a JSX prop — React's
  handling of the `muted` property vs. attribute is unreliable, and iOS
  Safari's autoplay silently fails when it doesn't stick.
- **(Minor) Guarded against `setState` after unmount/cancel** — both
  `runLookup` and `captureFrameForGemini` check a `cancelledRef` (the same
  pattern the mount effect already needed for its own cleanup) before
  touching state, so tapping "Escribirlo a mano" while a lookup or a Gemini
  call is still in flight can't call `onResult`/`setStatus` on a component
  that's already moved to the Manual view.
- **(Minor) `runLookup` is a stable `useCallback`**, not a function
  declared after its first use and closed over once by a `[]`-dep effect.

`allowPhoto` (already threaded from `App.tsx` as `!demo`) gates whether the
"Reconocer por foto" button ever renders — demo mode still gets live
barcode scanning (client-only, no backend needed) but never the Gemini
button.

**Deleted**: `app/src/sheets/PantryBarcodeCapture.tsx`,
`app/src/sheets/PantryPhotoCapture.tsx` (superseded by
`PantryScanCapture.tsx`). **Review fix (Minor)** — also now dead and safe
to remove: `resizeImageFile` in `app/src/lib/imageCapture.ts` (no
remaining callers — the Gemini path above draws from a `<video>` element
directly via canvas, not from a `File`, so it can't reuse that
File-oriented helper; `blobToBase64` in the same file is still used and
stays) and the `camera`/`barcode` icon paths in `app/src/ui/Icon.tsx`
(confirmed via grep: used nowhere outside the two deleted files). Keep
`imageCapture.ts`'s existing doc comment about resize-breaks-barcode-decode
as a comment near `captureFrameForGemini` instead of losing that written
lesson — it's folded into the comment already shown in the code sample
above.

## `pantryAdd` conflict handling and contract change

Two things change on `pantryAdd`, together, in **both** stores.

**1. Batch-adding a duplicate must merge, not silently fail or duplicate.**
**Review finding (Critical).** `pantry_item` has a real unique index —
`create unique index pantry_item_uq on pantry_item (household_id,
ingredient_id, unit, location);` (`20260905131217_rezet_core_schema.sql:107`).
Today's Supabase `pantryAdd` (`supabaseStore.tsx:453-472`) hits this
constraint on every re-add of an existing ingredient+unit+location and
silently does nothing (`if (!error) { invalidate }` — the error branch is a
no-op). The demo store has no such constraint and just pushes a duplicate
row (`store.tsx:221-236`), so the two implementations already disagree
today, and this redesign's whole point — batch-adding ~15 items from a
shopping trip — makes hitting this the *common* case, not an edge case,
per Ruling 1 above (sum into the existing row, matching `buyChecked`'s
existing precedent at `store.tsx:257`).

- **Supabase**: add a new RPC, `rpc/pantry_add`, mirroring `buy_checked`'s
  existing `on conflict ... do update` shape
  (`supabase/migrations/20260905132555_rezet_transactional_rpcs.sql:146-152`)
  but for a single item and returning what changed:

  ```sql
  create or replace function public.pantry_add(
    p_ingredient_id uuid, p_quantity numeric, p_unit public.unit,
    p_location public.pantry_loc, p_expires_on date
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
      -- Fusiona cantidad; conserva la fecha de caducidad que ya había si
      -- tenía una (mismo criterio que buy_checked ya usa: no se puede
      -- representar "dos lotes con dos fechas" en una fila, así que se
      -- prioriza no perder una fecha real por una nueva o por null).
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

  `supabaseStore.tsx`'s `pantryAdd` calls this RPC (after
  `resolveIngredientId`, same as today) instead of a raw `.insert()`, and
  returns `{ id, merged, addedQuantity }` from the RPC's single row.

- **Demo store**: `store.tsx`'s `pantryAdd` gains the same merge check
  against `d.pantry` before pushing: if a row with the same
  `ingredientId`/`unit`/`location` exists, bump its `quantity` and apply
  the same `expiresOn` rule (keep the existing one if it had one); else
  push a new row. Return the same `{ id, merged, addedQuantity }` shape.

**2. The `Store.pantryAdd` contract changes to report what happened, for
undo's sake.**
**Review finding (Critical).** "Deshacer genuinely reverses the add" is
only true if undo knows whether the add created a new row or merged into
an existing one, and by how much — otherwise `pantryDelete(id)` on a
merged row would destroy the *entire* pre-existing quantity, not just what
this add contributed (e.g. merging 500g of rice into an existing 2kg,
then "undo" deleting all 2.5kg). New signature in `storeContext.ts`:

```ts
pantryAdd: (input: {
  name: string;
  quantity: number;
  unit: Unit;
  location: PantryLoc;
  expiresOn?: string;
}) => Promise<{ id: string; merged: boolean; addedQuantity: number }>;
```

Undo (in the sheet's batch list, see below) does `pantryBump(id,
-addedQuantity)` when `merged` is true (verified both stores' existing
`pantryBump` already clamps at 0 and removes the row if it hits zero —
`store.tsx:205-213`, `supabaseStore.tsx:391-406` — so this is safe even if
`addedQuantity` happens to equal the row's entire quantity), or
`pantryDelete(id)` when `merged` is false.

**Review fix (Critical) — the demo store's id-hoisting claim in the first
draft was wrong.** The original text said "`item.id = uid('p')` is already
computed before the `setData` call — return that directly," but
`uid('p')` is actually generated **inside** the `setData` updater
(`store.tsx:226`). Under `<StrictMode>` (confirmed active,
`src/main.tsx:1,15,23`), React double-invokes updater functions in
development — so the id closed over by the caller and the id React
actually keeps could be two different random strings, making undo target a
row that doesn't exist, silently, only in dev. Fix: hoist `const id =
uid('p');` above the `setData` call, use that same `id` inside the
updater, and return it — the updater must be a pure function of its
already-known inputs, not a place that mints new random state as a side
effect of being called (possibly twice).

**Review fix (Important) — the async round-trip needs a pending state, a
failure path, and (ideally) optimism.** The Supabase version goes from
today's fire-and-forget `void (async () => {...})()` (`supabaseStore.tsx:455`)
to a real `async` function the caller `await`s — `resolveIngredientId`
alone is two sequential queries, then the RPC call is a third round trip,
so submit now visibly blocks for a moment. In `PantryAddSheet.tsx`:
- The submit button shows a busy state (existing `Button` component — check
  whether it already has a loading/disabled-while-pending pattern elsewhere
  in the app, e.g. `RecipeForm.tsx`'s photo upload button using
  `disabled={photoBusy}`, and reuse that exact pattern rather than
  inventing a new one) and is disabled for the duration of the `await`, so
  an impatient double-tap can't fire two concurrent inserts.
- `submit` wraps the `await pantryAdd(...)` in try/catch; a rejection (note
  `resolveIngredientId` already does `if (error) throw error`,
  `supabaseStore.tsx:447` — today that throw is swallowed by the
  fire-and-forget wrapper, but removing that wrapper without adding a catch
  at the call site would turn it into an unhandled promise rejection)
  surfaces as a toast (existing `onToast` prop) rather than being silently
  eaten or crashing.
- No new optimistic-update plumbing is required beyond what already
  exists: the pantry screen behind the sheet already refetches via
  `queryClient.invalidateQueries` after a successful `pantryAdd`
  (unchanged from today), so it updates once the round trip completes —
  same latency behavior as today, just now also visible to the user as a
  brief busy state on the button instead of an instant, unconfirmed close.

## Batch add: stay open, list + undo

Per Ruling 2 (sheet layout) and Ruling 3 (nothing carries over) above:

- On successful `pantryAdd`, push `{ id, name, quantitySummary, merged,
  addedQuantity }` onto a local `addedItems` array (sheet-local `useState`
  — this is "what did I add in this sheet session," not persisted store
  state).
- Clear `name`, `quantityInput`, and `expiresOn`; reset `locationTouched`
  to `false` (so the next item's name re-triggers smart location
  inference from a clean slate — necessary for a batch of *different*
  products, which is the actual use case: milk then rice then eggs, not
  fifteen identical items). Focus returns to the name field.
- **Review fix (Important) — dropped the "unit stays as it was" claim.**
  The first draft said quantity/expiry clear but "the resolved unit stays"
  — but the resolved unit is *derived* from `quantityInput`
  (`parseQuantityInput`), which the same sentence says gets cleared. These
  contradicted each other. Resolution: everything derived from the
  cleared fields simply re-derives fresh next time (falls back to `'ud'`
  or the next name's matched `defaultUnit`) — no artificial stickiness to
  maintain or explain.
- **Review fix (Minor) — no per-item toast.** `onToast(t.savedPantry)`
  fires today on every successful add and immediate close. With the sheet
  now staying open and showing a running, visible list of what's been
  added (with undo right there), a toast per item is redundant noise
  across a 15-item batch — the list itself is the confirmation. Drop the
  toast call from this sheet's `submit` entirely.
- Does **not** call `onClose()` on success anymore — the sheet stays open.
  `onClose` is only reachable via `Sheet`'s own existing chrome (×,
  swipe-down, Escape, backdrop tap) — no new "cerrar" button.

Below the form, when `addedItems.length > 0`, render the list: each row is
name + quantity summary + a small "Deshacer" text button
(`border: 0, background: transparent, padding: 0` — **review fix (Minor)**,
the first draft's inline style omitted these and would have rendered with
default browser button chrome, same issue as the "Escribirlo a mano" link
above) that calls `pantryBump(id, -addedQuantity)` or `pantryDelete(id)`
per the `merged` flag captured when that row was added, and removes that
entry from the local `addedItems` array. This is a real mutation against
the real store — undo genuinely reverses exactly what that add did, not a
client-side-only illusion.

## Name field: leads visually, autofocus

`IngredientNameField` (unchanged component otherwise) gets a `ref`
forwarded to its inner `TextField`. Verified `TextField` (`ui/Fields.tsx:112`)
is currently a plain function component with no `forwardRef` — add
`forwardRef` to it (additive; no existing caller among `TextField`'s 10
call sites passes a `ref` today, so nothing breaks) and thread that ref
through `IngredientNameField` to its own `TextField`.

**Review fix (Important) — focus must be triggered from a user gesture,
not a `useEffect`.** The first draft called `.focus()` in a `useEffect` "so
the keyboard is already up." iOS Safari (and to a lesser extent Android
Chrome) won't raise the soft keyboard for a `.focus()` call that isn't
inside a synchronous user-gesture handler — the focus itself still lands
(caret visible, ring shown) but the actual stated benefit (keyboard already
open) won't happen on the primary platform for a mobile-first app. Fix:
call `.focus()` synchronously inside the tap handlers that are themselves
gestures — `onManual`'s `onClick` (switching from scan to manual) and the
post-submit reset in batch add — rather than in a `useEffect` keyed on
`mode`.

(Focus ordering with `Sheet` needs no special handling: `Sheet` is the
parent and calls `panel.current?.focus()` on mount, `Sheet.tsx:29`, which
runs before any child effect — the name field's own focus call, wherever
it's triggered from, wins the final focus. Worth a one-line comment in the
implementation so nobody "fixes" this non-issue later.)

Visually: increase the name field's font size to match `T.cardTitle`
(16.5px/600, already defined in `ui/tokens.ts`) instead of the default
`TextField` size, so it reads as the primary field; the quantity/date/
location rows stay at their current smaller weight.

## Submit button: disabled until valid

`<Button disabled={!name.trim() || submitting} ...>` — verified `Button`
(`ui/Button.tsx:32,44,54,68`) already accepts `disabled?: boolean`, applies
it to the underlying element via `Pressable`, and dims it to `opacity:
0.55` — use it as-is. `submitting` is the pending-state boolean from the
async `pantryAdd` await (see above), so a tap can't double-fire mid-flight.

## New i18n keys

Grepped `es.ts`/`en.ts` for every one of these before listing them — none
collide with an existing key:

- `recognizeByPhoto` (es: "Reconocer por foto", en: "Recognize by photo")
- `enterManually` (es: "Escribirlo a mano", en: "Enter it by hand") — a
  new, distinct key from the old `addManual` ("Manual", now unused/removed)
- `cameraUnavailable` (es: "No se pudo acceder a la cámara", en: "Couldn't access the camera")
- `scanAgain` (es: "Escanear otro", en: "Scan another")
- `undo` (es: "Deshacer", en: "Undo")
- `relative3Days` / `relative1Week` / `relative1Month` (es: "3 días" /
  "1 semana" / "1 mes", en: "3 days" / "1 week" / "1 month")
- `dateOption` (es: "Fecha", en: "Date")

**Keys removed** (confirmed via grep to be used only in the files this
redesign deletes/rewrites): `addManual`, `addBarcode`, `addPhotoMode`,
`takePhoto`, `enterBarcodeManually`, `scanDecodeFailed` (the last two are
gone along with the deleted `manualEntry` status — see "Unified capture"
above). `scanNotFound` and `photoRecognizeFailed` are kept — both states
still exist in `PantryScanCapture`.

## Testing

- New pure logic gets domain tests, same convention as every prior task in
  this project: `inferFoodGroup` and `defaultLocationFor`
  (`recipeText.ts`) and `parseQuantityInput` (`units.ts`) each get test
  coverage — specifically including, per this review: `inferFoodGroup`
  tested in **both** Spanish and English for the fresh/tinned/default
  branches (e.g. `"Leche"` and `"Milk"` both → `fresco`; `"Botella de
  agua"` does NOT match tinned); `parseQuantityInput` tested for `pcs`,
  for an unrecognized-suffix input preserving its leading number (e.g.
  `"500 gramos"` → `{500, fallbackUnit}`, not `{1, fallbackUnit}`), and for
  a pathological input like `"1.2.3"` still returning a sane number instead
  of `NaN` leaking through.
- No jsdom/RTL in this repo — `SegmentedControl`, the live-camera flow, and
  the batch-add list are all verified manually in the browser, same
  convention as every prior UI task. The live camera specifically needs a
  real browser with camera access (or a permission-denial path exercised
  by denying it) — this cannot be meaningfully faked with a static test
  image the way the old file-input flow could.
- Manual verification checklist for implementation: scanning a real
  barcode successfully prefills and switches to Manual; denying camera
  permission (or testing in an environment with no camera) reaches
  `noCamera` and "Escribirlo a mano" still works; "Reconocer por foto"
  only appears in real (non-demo) accounts; a failed lookup or recognition
  offers "Escanear otro" and it actually restarts the camera; typing
  "Leche" in the name field visibly slides the location pill to Nevera
  before you've touched it yourself, and stops updating once you tap a
  location manually; adding three items in a row keeps the sheet open,
  shows all three in the undo list, and "Deshacer" on the middle one
  removes only that one from both the list and the real pantry; adding an
  ingredient+unit+location combination that already exists in the pantry
  merges the quantity into the existing row (check the pantry screen
  count) instead of creating a duplicate or silently no-op'ing, and
  undoing that merge subtracts only what was just added, not the whole row.
