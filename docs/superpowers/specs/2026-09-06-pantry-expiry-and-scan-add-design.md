# Pantry: real expiry dates + barcode/photo add

Date: 2026-09-06
Status: approved, pending implementation

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

- `data/store.tsx`: replace `expiresInDays: input.location === 'fridge' ? 5 : null` with a real computation from `input.expiresOn` using the same `daysUntil` used in `supabaseStore.tsx` (hoist it to a shared spot — `domain/dates.ts` already exists and is the natural home; both stores import it from there instead of `supabaseStore.tsx` having its own private copy).
- `data/supabaseStore.tsx`: the `pantry_item` insert's `expires_on` becomes `input.expiresOn ?? null` — drop the hardcoded `+5 days` `Date.now()` computation entirely.
- `data/storeContext.ts`: update the `Store.pantryAdd` type to match.
- `buyChecked`'s own fresh-group 5-day guess (`store.tsx:242`) is a separate code path (shopping list → pantry) not touched by this work — out of scope per the earlier scoping conversation.

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
3. Map the response to `{ name: product_name, quantity, unit }` best-effort
   (Open Food Facts almost never carries an expiry date — that field is
   left blank for the user to fill in if they want one).
4. Failure at either step (no barcode decoded, or `status: 0` / product not
   found) → toast (`t.scanNotFound` or similar) and drop back to an *empty*
   Manual form — never blocks, never guesses a name.

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
  foto" error toasts, expiry-date field label/placeholder.

## Testing

- No domain-layer changes (scaling/coverage/shopping math untouched), so no
  new `domain/__tests__` cases are required by this work.
- Manual verification in the browser (same approach as the onboarding
  work): demo mode → add an item with a date → confirm "caduca en N días"
  shows correctly in `Pantry.tsx`; barcode-photo capture against a real
  product barcode photo.
- The Gemini photo-recognition path needs a real `GEMINI_API_KEY` inserted
  into `app_secret` (manually, via `execute_sql`, per the existing
  convention — not committed to a migration) and the function deployed
  before it can be exercised end-to-end; that row is the user's to add.
