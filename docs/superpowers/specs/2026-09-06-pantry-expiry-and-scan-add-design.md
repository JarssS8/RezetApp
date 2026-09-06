# Pantry: real expiry dates + barcode/photo add

Date: 2026-09-06
Status: approved, pending implementation
Revised: 2026-09-06 after code review (see "Review fixes" callouts below)

## Problem

Two gaps in `app/src/sheets/PantryAddSheet.tsx`:

1. `PantryItem.expiresInDays` is never a real date — `pantryAdd` (both
   `data/store.tsx` and `data/supabaseStore.tsx`) fakes it as "5 days from
   now if fridge, else never" (`store.tsx:208`, `supabaseStore.tsx:469`).
   Users can't set or correct an actual expiry date.
2. Adding a pantry item is manual-typing only. The user wants two faster
   entry paths: scan the product's barcode, or take a photo of the product
   and have it recognized.

## Scope

In scope: a real expiry-date field on manual add; barcode-photo → Open Food
Facts lookup; product-photo → Gemini recognition via a new Supabase Edge
Function. All three write into the exact same `pantryAdd` call — scanning
and photo are prefill shortcuts for the same form, never a silent auto-add.

Out of scope (explicitly deferred, not because they're hard, but because
they weren't asked for): live continuous video barcode scanning (still-photo
decode instead), native camera via Capacitor (not installed in this repo
yet), receipt/ticket OCR for bulk import, editing expiry date on existing
pantry rows (today's `pantryBump`/`pantryDelete` UI doesn't get a new "edit
date" action — only the add flow gets a date field. Follow-up if wanted.).

## Data model

`PantryItem.expiresInDays` (types.ts:63) stays exactly as-is — it's a
derived, read-side value already consumed by `Pantry.tsx` and the coverage
domain functions. Nothing there changes.

What changes is the write side. `pantryAdd`'s input gains one optional
field:

```ts
pantryAdd: (input: {
  name: string;
  quantity: number;
  unit: Unit;
  location: PantryLoc;
  expiresOn?: string; // ISO yyyy-mm-dd, from the date <input>
}) => void;
```

- `domain/dates.ts` gains an exported `daysUntil(dateStr: string): number` — hoisted from `supabaseStore.tsx`'s current private copy (`supabaseStore.tsx:36`), byte-identical logic. Both stores import it from there.
- `data/supabaseStore.tsx`: the `pantry_item` insert's `expires_on` becomes `input.expiresOn ?? null` — drop the hardcoded `+5 days` `Date.now()` computation entirely.
- `data/storeContext.ts`: update the `Store.pantryAdd` type to match.
- `buyChecked`'s own fresh-group 5-day guess (`store.tsx:242`) stays behaviorally unchanged (still guesses +5 days for `fresco` items with no explicit date) — but see the review fix below, its *write* changes shape even though its behavior doesn't.

**Review fix — demo store must recompute `expiresInDays`, not bake it.**
`data/store.tsx`'s internal `Data.pantry` is typed and persisted as
`PantryItem[]` directly (store.tsx:33), and exposed to context verbatim
(no transform). `usePersistentState` (hooks/usePersistentState.ts) is a
raw localStorage mirror with no read-time logic. So today's
`expiresInDays: input.location === 'fridge' ? 5 : null` gets written once
and never ages — mostly invisible while it was already a fake number, but
with a real date it means "caduca en 6 días" stays frozen forever across
reloads, unlike `supabaseStore.tsx` which recomputes via `daysUntil` on
every fetch (`supabaseStore.tsx:130`).

Fix: give the demo store's *internal* persisted shape a sibling type that
stores the real date instead of the derived number —

```ts
type StoredPantryItem = Omit<PantryItem, 'expiresInDays'> & { expiresOn: string | null };
```

`Data.pantry` becomes `StoredPantryItem[]`; `pantryAdd` and `buyChecked`
write `expiresOn` (respectively: the form's date, or
`dateKey(addDays(new Date(), 5))` for the `fresco` guess — both already
exported by `domain/dates.ts`) instead of a number. Wherever `data.pantry` is
exposed to the context value, map it: `pantry: data.pantry.map((p) => ({ ...p, expiresInDays: p.expiresOn ? daysUntil(p.expiresOn) : null }))` — same recompute-on-read shape `mapPantryItem` already does for the real backend. `PantryItem` itself (the public/exposed type) is untouched.

## PantryAddSheet redesign

Three `OptionChip`s at the top of the sheet, same visual pattern as the
existing location chips: **Manual** (default) / **Código de barras** /
**Foto**. Selecting a mode is local `useState`, not a new sheet.

**Manual** — the existing form, plus one new field: a date input
(`expiresOn`, optional) placed after the quantity/unit row, before the
location chips. Implemented as `<TextField type="date" .../>` — `TextField`
(`ui/Fields.tsx`) gets a new optional `type?: 'text' | 'date'` prop
(default `'text'`), passed straight through to the native `<input>`, so the
box styling stays identical to every other field. No new component.
The input gets `min={todayKey()}` (already exported by `domain/dates.ts`,
already the exact `YYYY-MM-DD` shape `min` needs) — a pantry item can't be
added already expired.

**Review fix — expired items render "-3 días".** `daysUntil` can return
negative (an existing item just never crossed zero before real dates
existed). `Pantry.tsx:70-71` interpolates `expiresInDays` raw with no
clamp. Add a branch: when `expiresInDays < 0`, render `t.expired` instead
of the `"{t.expiresIn} {n} {t.days}"` string — new `expired` i18n key (es:
"Caducado", en: "Expired").

**Código de barras / Foto** — selecting either chip swaps the sheet body
for a capture view:

```
[ preview area — placeholder icon until a photo is taken ]
[ "Tomar foto" button → <input type="file" accept="image/*" capture="environment"> ]
```

`capture="environment"` opens the phone's back camera directly in
supported mobile browsers; on desktop it's a plain file picker — no custom
camera/video code, no getUserMedia permission flow to build or debug.

Once a photo is selected, the sheet runs the mode-specific lookup (below),
shows a small inline spinner over the preview, then **switches back to the
Manual form** with whatever fields the lookup returned pre-filled. The user
still has to review and press "Añadir" — a failed or wrong recognition
never blocks manual correction, and nothing is written to the pantry before
that tap.

## Barcode flow (client-only, no backend)

New dependency: `@zxing/browser` (MIT, no license/key, works fully
client-side against a decoded `<img>`).

1. `BrowserMultiFormatReader.decodeFromImageElement(imgEl)` on the captured
   photo, restricted to EAN-13/EAN-8/UPC-A formats.
2. On success, `fetch('https://world.openfoodfacts.org/api/v2/product/{code}.json?fields=product_name,quantity,product_quantity,product_quantity_unit')` — public API, no key, CORS-open.
3. Map the response to `{ name: product_name, quantity, unit }`.

   **Review fix — never pass Open Food Facts' raw unit string into `Unit`.**
   `Unit` is the closed union `'g' | 'ml' | 'ud'` (types.ts:1), matched
   exactly by `pantryStep` and by the pantry/shopping quantity-matching in
   `store.tsx` (`p.unit === need.unit`). OFF's `product_quantity_unit`
   is free text (`kg`, `l`, `cl`, `oz`, empty…) — passing it through
   uncast fails typecheck, and casting it through anyway would make an
   ingredient's stock silently split across two never-matching unit
   strings (e.g. some rows `g`, one row `kg`), undercounting coverage and
   shopping totals with no error. Normalize explicitly: `kg → g × 1000`,
   `l → ml × 1000`, `cl → ml × 10`; anything else unrecognized (or a bare
   product with no OFF unit at all) → `unit: 'ud'`, quantity `1`, and the
   user corrects it by hand if that's wrong — never forward OFF's string
   as-is.

   Open Food Facts almost never carries an expiry date — that field is
   left blank for the user to fill in if they want one.
4. Failure at either step (no barcode decoded, or `status: 0` / product not
   found) → **review fix**: instead of dropping straight to an empty
   Manual form, show a small numeric fallback input ("¿No se leyó bien?
   Escribe el código") to type the barcode's digits by hand and retry step
   2 with that value — cheaper than losing the whole "I was scanning
   something" context. Only after *that* also fails (or the user skips it)
   does it fall back to an empty Manual form.

**Review fix — downscale the captured photo before the Gemini upload only.**
A phone photo is typically 3000×4000px+. Before the Gemini upload, draw it
to an offscreen `<canvas>` capped at ~1024px on the long edge and re-encode
to JPEG — faster upload, cheaper Gemini request.

**Correction (post-Task-8-verification):** the original version of this
fix said zxing "decodes barcodes fine at that resolution" — untested when
written, and wrong. Verified directly: a barcode image that zxing decodes
correctly at full resolution reliably **fails** to decode after exactly
this resize-to-1024px-then-JPEG-0.85 transform — the softened edges from
bilinear scaling plus lossy JPEG compression are enough to break a 1D
barcode reader, which needs sharp bar/space transitions far more than a
vision model reading a product label does. The barcode path must decode
from the original captured file (e.g. `URL.createObjectURL(file)` straight
into `<img>`), never through this resize step. The resize only applies to
the photo-recognition (Gemini) path, where it's genuinely safe and useful.

## Photo-recognition flow (needs the new Edge Function)

New Edge Function `app/supabase/functions/recognize-pantry-item/index.ts`,
same shape as the existing `send-timer-notifications` function:

- Auth: this one is invoked directly by a logged-in user (not by cron), so
  it must check the caller's session — create the Supabase client with the
  forwarded `Authorization` header and call `auth.getUser()`; reject with
  401 if that fails. (`send-timer-notifications` skips this because it's
  cron-only and already uses the service-role key for a different reason —
  this function still needs service-role separately, to read the secret
  below, since anon/authenticated has no grant on `app_secret`.)
- Reads `GEMINI_API_KEY` from the `app_secret` table (`key`/`value`, same
  table and convention as the existing `VAPID_PUBLIC_KEY` /
  `VAPID_PRIVATE_KEY` rows) via the service-role client — never a raw
  `Deno.env` secret, to match the existing convention in this repo.
- Calls Gemini (`gemini-2.0-flash` `generateContent`, REST, inline base64
  image + a prompt demanding strict JSON) asking for
  `{ name: string | null, quantity: number | null, unit: "g"|"ml"|"ud"|null, expiresOn: string | null }`
  — `expiresOn` only filled if a printed date is actually visible in the
  photo, `null` otherwise (no guessing a shelf-life).
- Returns that JSON straight to the client. The image itself is never
  persisted anywhere (no Storage bucket involved) — it's base64 in the
  request body and Gemini's own request only.

Client side: `supabase.functions.invoke('recognize-pantry-item', { body: { image: base64, mimeType } })`, then same prefill-and-confirm behavior as the barcode path.

**Demo mode**: `data/store.tsx` (the `localStorage`-only demo) has no
Supabase project to call this function on. The "Foto" chip is hidden in
demo mode — same gating pattern `App.tsx` already uses for invites
(`demo || !onInvite ? undefined : ...`). "Código de barras" stays available
in demo mode since it's client-only.

## New UI bits

- Two icons in `ui/Icon.tsx`: `camera`, `barcode` — same stroke-path
  convention as the existing set (1.8–2.6 stroke width, `currentColor`).
- `TextField`'s new `type` prop (above).
- New copy keys in `i18n/es.ts` + `en.ts`: chip labels for the three modes,
  capture button text, "no se encontró el producto" / "no se pudo leer la
  foto" error toasts, expiry-date field label/placeholder, `expired`.

**Review fix — document the new sheet layout in the design source of
truth.** CLAUDE.md is explicit that visual/behavior disputes resolve
against `RezetApp.dc.html` then `README.md` before implementer judgment;
right now neither documents this sheet at all beyond the existing manual
fields. Since this is genuinely new UI (not a documented screen being
contradicted), the obligation runs the other way: build it from the
existing `OptionChip`/`TextField` patterns already specified for this
sheet, then add the three-mode layout to both `RezetApp.dc.html` and
README's PantryAdd section as part of this work — same as was done for
the onboarding hero diagrams — instead of leaving the docs silently out of
sync.

## Testing

- No domain-layer changes (scaling/coverage/shopping math untouched), so no
  new `domain/__tests__` cases are required by this work.
- Manual verification in the browser (same approach as the onboarding
  work): demo mode → add an item with a date → confirm "caduca en N días"
  shows correctly in `Pantry.tsx`; **then reload the page and confirm the
  count is still consistent with the stored date, not frozen** (this is
  exactly the case the original spec's test plan missed — it only checked
  right after add); an item dated in the past shows "Caducado", not a
  negative number; barcode-photo capture against a real product barcode
  photo, including the manual-digit fallback when decode fails.
- The Gemini photo-recognition path needs a real `GEMINI_API_KEY` inserted
  into `app_secret` (manually, via `execute_sql`, per the existing
  convention — not committed to a migration) and the function deployed
  before it can be exercised end-to-end; that row is the user's to add.
