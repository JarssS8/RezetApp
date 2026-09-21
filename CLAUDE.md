# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

A design-and-implementation package for **Rezet**, a household recipe/meal-plan/pantry app. Root holds the design spec (`README.md`, `tokens.css`, `motion.js`, `RezetApp.dc.html` — the visual source of truth), a from-scratch build guide (`BUILD_FROM_ZERO.md`), and `app/` — a **complete, working app with a real backend**: Supabase (Postgres + Auth + RLS + Storage + Edge Functions), deployed as a Cloudflare Worker. A local-only demo mode (`localStorage`, no account) still exists side by side with the real one — see "Two data providers" below.

`INDEX.md` is the map of these five pieces; read it first when unsure which doc answers a question.

## Commands (run from `app/`)

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # vitest run — domain rule tests + migration test bank (PGlite, ~25 s)
npm run test:watch
npm run build     # tsc -b && vite build
npm run lint      # tsc --noEmit
```

Single test file: `npx vitest run src/domain/__tests__/domain.test.ts`
Migration bank only: `npx vitest run supabase/tests/migrations.test.ts`
Edge Functions (outside every `tsc`): `npx --yes deno@2 check --node-modules-dir=none supabase/functions/<fn>/index.ts`

Needs `app/.env` (see `app/.env.example`): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_VAPID_PUBLIC_KEY`. Without it the real (non-demo) login path throws on boot. The "Demo" button on the login screen skips all of this (local `DataProvider`, no network, no account).

Deploy: **pushing to `main` on GitHub (`JarssS8/RezetApp`) deploys to production** via `.github/workflows/deploy.yml`, only what changed — a `test` job first (app lint + tests incl. the migration bank, `deno check` of every Edge Function, MCP types/lint/tests; nothing deploys or gets tagged unless it passes), then Supabase migrations (`supabase db push`), then Edge Functions, the `rezet` Worker (`app/`, `rezet.jarsss8.es`) and the `rezet-mcp` Worker (`mcp/` or `app/src/domain/`). Never push to `main` without the `deploying-to-main` skill: a PreToolUse hook (`.claude/hooks/guard-push-main.mjs`) blocks it until the user runs the confirmation for that exact commit. CI needs repo secrets `CLOUDFLARE_API_TOKEN`, `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_VAPID_PUBLIC_KEY` and variables `CLOUDFLARE_ACCOUNT_ID`, `SUPABASE_PROJECT_REF`. A manual `npm run build && npx wrangler deploy` from `app/` still works for emergencies, but it bypasses the report and the next push to `main` will overwrite it.

Migrations: a migration file's version prefix must equal the version recorded in production (`mcp__supabase__list_migrations`). `apply_migration` records the time it ran, not your file name — rename the file to that version right after applying, or CI's `supabase db push` will try to apply it again.

**Test SQL in the migration bank, never against production.** `app/supabase/tests/harness.ts` replays every migration on PGlite (real Postgres, WASM, no Docker) with stubs for Supabase-only objects (`auth.uid()` reads the `rezet.test_uid` setting). `asUser(db, uid, sql)` runs as `authenticated` so RLS applies; anything else runs as superuser and bypasses RLS, so RLS assertions must go through `asUser`. Every new migration must apply cleanly there and come with a test in `migrations.test.ts`. It caught two production-breaking bugs during the security fixes. It is Postgres 18 while production is not, so a green bank proves SQL and logic, not production parity.

Versions: Rezet has one SemVer version — `app/package.json`, mirrored in `mcp/package.json` and reported by the MCP server. Every deploy that changes something users run gets a new version through the `releasing-versions` skill (`node tools/release/bump-version.mjs <major|minor|patch>` plus a bilingual `CHANGELOG.md` entry, committed as `Release X.Y.Z`). Once every deploy job succeeds, CI tags `vX.Y.Z` and publishes the GitHub Release from that CHANGELOG section. The build bakes `__APP_VERSION__`/`__APP_COMMIT__` (shown at the bottom of Settings), and `app/UpdatePrompt.tsx` offers installed PWAs an "Actualizar" prompt when a new service worker is waiting (never during Cook mode). Release script tests: `node --test tools/release/version.test.mjs`.

Capacitor (native shells): `app/capacitor.config.ts` is already scaffolded (`appId: com.jars.rezet`), but the packages aren't installed and there's no `ios/`/`android/` directory yet:
```bash
npm i @capacitor/core && npm i -D @capacitor/cli && npx cap init
npm i @capacitor/ios @capacitor/android && npx cap add ios && npx cap add android
npm run cap:ios      # build + sync + open Xcode
npm run cap:android
```

## Architecture

The product is a closed loop, not three separate features: **weekly plan − pantry = shopping list**, and **cooking a recipe subtracts from the pantry**. Any change that breaks this chain (plan → cook → pantry) breaks the point of the app.

```
src/
  domain/    Pure business rules, no React/network, with tests (scaling, coverage, shopping, units, dates, recipeText)
  data/      storeContext.ts (shared Store contract) + store.tsx (demo/localStorage) + supabaseStore.tsx (real) +
             supabaseClient.ts + auth.tsx (Google/Apple/Passkey + household session) + push.ts + seed.ts (demo data)
  store/     prefs.tsx: theme, accent, locale, unit system
  motion/    Spring physics, momentum projection, sheet-drag / recipe-drag-to-plan (ported from motion.js)
  ui/        Hand-written primitives only: Button, Chip, Card, Stepper, CheckRow, Sheet, Icon, Fields, Pressable
  screens/   Login, CreateOrJoinHousehold, Onboarding, Today, Recipes, RecipeDetail, RecipeForm, Plan, Pantry, Cook
  sheets/    Settings, Shopping, PantryAdd, RecipePicker, CookFinish, Invite
  app/       AppShell — sidebar at ≥900px, bottom tab bar below
  i18n/      es.ts, en.ts
  styles/    tokens.css — the full color system
  sw.ts      Service worker (vite-plugin-pwa, injectManifest) — precaches the shell, listens for `push` (timer
             notifications); Supabase data itself is never cached, always fetched over the network
supabase/
  migrations/  Schema + RLS + the transactional RPCs (applied by CI's `supabase db push`)
  tests/       PGlite migration test bank — `harness.ts` + `migrations.test.ts`, run by `npm test`
  functions/   recognize-pantry-item (Gemini vision for pantry photo add; household + size/type check, 50/day quota),
               send-timer-notifications (pg_cron → Web Push; host allowlist, per-run cap),
               cleanup-orphan-photos (daily pg_cron; sweeps both `recipe-photos` and `avatars`, deleting
               unreferenced objects >24 h; `?dryRun=1` counts only — only `recipe-photos` aborts with 500 on an
               empty reference set against a non-empty bucket, since an orphaned avatar with no member pointing
               at it is normal, not a failure)
```

### Two data providers, one contract

`src/data/storeContext.ts` defines the `Store` interface — the contract both data layers implement, so screens call `useData()` without knowing which is mounted:

- **`store.tsx`** — demo mode. `localStorage`, seeded from `seed.ts`, no account. Reached via the "Demo" button on Login.
- **`supabaseStore.tsx`** — real mode. Supabase (Postgres + RLS scoped by `household_id`, Storage for recipe photos, realtime on pantry). Mounted once `auth.tsx` (`useAuth()`) has a session **and** a household (`profile.householdId`); `App.tsx` picks the provider.

`saveRecipe`, `pantryAdd`, `buyChecked`, and `finishCook` are `Promise`-returning in both (the real one does a network round-trip; the demo one resolves immediately) — screens `await`/`void` them the same way either way.

Auth: Google, Apple, and Passkey sign-in via Supabase Auth (`auth.tsx`), PKCE flow (`flowType: 'pkce'` in `supabaseClient.ts`; auth-js defaults to implicit, which returns tokens in the URL fragment). A signed-in user without a `profile` row lands on `CreateOrJoinHousehold` (create a household or redeem an invite code) before reaching the app — see `household`/`household_invite`/`redeem_invite` in the schema. Only household admins can create or revoke invites (`profile.isAdmin`, loaded by `auth.tsx`); creating one expires the previous pending one. Plain sign-out is `scope: 'local'` (the auth-js default `'global'` signs the account out of every device, MCP included); "Sign out on all devices" in Account & household is the explicit `'global'` path and the only non-destructive way to revoke a connected AI assistant (`data/signOut.ts`).

`member` is the household's product identity, not `profile`: one row per person in the household (with or without an account), holding display name, color, avatar and a per-person `kcal_target` (a database `check (kcal_target between 1000 and 5000)` — a client-side range that disagrees raises a raw, untranslated Postgres error). **Everything personal points at `member_id`, never at `profile.id`.** A member with an account has `auth_user_id` set to its `profile.id`; a "ward" (`is_ward = true` — a child, a guest) has none and is managed by the household's account holders, who can all see its data. `is_ward` is explicit in the schema, never inferred from `auth_user_id is null`, precisely so that a person who leaves the household (which deletes their `profile` row) can never be mistaken for a ward whose data the rest of the household can still see. Two more schema-level invariants: `color` is checked against the seven `ACCENTS` values, and a `before delete on profile` trigger marks a member's `deleted_at` even if the account is deleted outside the lifecycle RPCs (Supabase dashboard, Admin API) — see `supabase/migrations/20260920090500_rezet_member_schema_invariants.sql`.

In SQL, `p_member_id` means two different things depending on the RPC, and that is intentional: in the three RPCs that predate `member` (`remove_member`, `promote_admin`, `demote_admin`) it is a `profile.id`; in the newer member-lifecycle RPCs it is a `member.id`. They couldn't be unified — Postgres rejects two functions that differ only in a parameter's name, and renaming would have broken `remove_member`/`promote_admin`/`demote_admin` calls from already-cached PWAs, which this schema has already committed to never doing. The distinction is recorded with `comment on function` directly on the three legacy RPCs in `supabase/migrations/20260920090300_rezet_profile_id_params.sql`, and enforced client-side with the branded `ProfileId`/`MemberId` types.

Three actions are transactional server RPCs (contract in `BUILD_FROM_ZERO.md` §5) because they touch multiple tables — implemented in `supabase/migrations/20260905132555_rezet_transactional_rpcs.sql` and later fix-up migrations:

| Store action | Server RPC | Does |
|---|---|---|
| `finishCook` | `rpc/finish_cook` | Subtracts scaled quantities from pantry, increments `cookedCount`, marks/creates the plan entry, returns `shortages`. This RPC is now a thin wrapper around `rpc/finish_cook_v2` (`supabase/migrations/20260921090200_rezet_finish_cook_v2.sql`), kept only because its return shape (an array) can't change under already-cached PWAs; `finish_cook_v2` returns an object and also writes each member's serving of the meal in the same transaction. New callers should target `finish_cook_v2`. |
| `buyChecked` | `rpc/buy_checked` | Adds checked shopping items to pantry, clears checks |
| `saveRecipe` | `rpc/save_recipe` | Upserts recipe + ingredients + steps + tags atomically, resolving/creating ingredients by name |
| `pantryAdd` | `rpc/pantry_add` | Adds/merges one pantry item (manual or "Foto" add) |
| — | `rpc/create_household`, `rpc/redeem_invite` | Household bootstrap / invite-code join, called from `auth.tsx`, not from `Store` |
| — | `rpc/create_invite`, `rpc/revoke_invite` | Admin-only; server generates the code and 7-day expiry. Called from `InviteSheet.tsx`, not from `Store` |
| `removeMember` / `demoteAdmin` | `rpc/remove_member`, `rpc/demote_admin` | Admin-only, same household, never on oneself; an admin must be demoted before removal. `redeem_invite` only honours invites whose creator is still an admin |

Stack per `BUILD_FROM_ZERO.md` §2: Supabase (Postgres + Auth + RLS + Storage) + TanStack Query (`supabaseStore.tsx` uses it for every query/mutation) — swappable for any backend that honors the §5 API contract, but the tokens, type scale, motion constants, nav architecture, and domain rules are **not** negotiable. React Router is also named in `BUILD_FROM_ZERO.md` §2 as target stack, but the app has no router — navigation is plain tab/sheet state in `App.tsx` — a gap between that doc and the code, not yet reconciled.

### `mcp/` — MCP server for AI assistants

`mcp/` is a separate Node package (not part of the Vite build) with **two entrypoints sharing one tool
surface** — same tool files, same reuse of `app/src/domain/*` by relative import. Never edit
`app/src/data/*` to support either of them; they're a third client of the same backend, not a third data
layer.

- **`src/index.ts`** — the original stdio server, personal and single-account. Session token at
  `~/.config/rezet-mcp/session.json` (`npm run login`); one running instance is one signed-in user's
  household, no multi-tenant. Not registered in this repo's `.mcp.json` by default (removed to avoid
  clutter once the remote server below covers day-to-day use) — add it back yourself
  (`claude mcp add rezet -s local -- <path>/mcp/node_modules/.bin/tsx <path>/mcp/src/index.ts`) when you
  need to iterate on tool code without a deploy.
- **`src/worker/index.ts`** — a Cloudflare Worker, deployed at `https://rezet-mcp.jarsss8.es/mcp`
  (registered in this repo's `.mcp.json` as `rezet-remote`), that fronts the same tools with a real
  multi-user OAuth 2.1 handshake, so any Rezet user with a household can connect their own AI client and
  sign in with Google or Apple, relayed
  through Supabase Auth. Built on `agents`' `createMcpHandler` + `@cloudflare/workers-oauth-provider`, not
  the deprecated `McpAgent`. Each connected user's Supabase session (access + refresh token) lives only
  inside that user's OAuth grant `props`, AES-GCM-encrypted at rest, and is refreshed **only** inside the
  OAuth provider's `tokenExchangeCallback` — **never refresh Supabase inside a tool call.** Supabase
  refresh tokens are single-use; refreshing mid-request would rotate the token with no way to persist the
  new one, silently breaking the next refresh. Deploy: automatic on push to `main` (the `mcp` job in
  `.github/workflows/deploy.yml`, also triggered by `app/src/domain/` changes); `cd mcp && npx wrangler deploy` only for emergencies.

The only file outside `mcp/` either entrypoint touches is `app/src/domain/dates.ts`'s `setClock` — Workers
run in UTC, so the Worker uses it once per isolate to make "today"/week boundaries/timers read Madrid
wall-clock instead. Both entrypoints are on **MCP SDK v2** (`@modelcontextprotocol/server`), not the v1
`@modelcontextprotocol/sdk`. See `mcp/README.md` for setup, connecting from Claude.ai/Desktop/Code, and
troubleshooting.

### Non-negotiable rules (enforced across the codebase)

- **Business rules live in `domain/` only.** They're pure and tested. Never re-implement scaling/coverage/shopping math inline in a screen — four screens (recipe detail, cook mode, shopping list, pantry deduction) call the same `scaleQuantity`/`isCovered` functions and must agree. `domain/nutrition.ts` (the Mifflin-St Jeor calorie-target estimate) and `domain/intake.ts` (a day/week's worth eaten, from cooked plan servings plus logged extras) are the **only** sources of calorie arithmetic — the server RPCs receive the already-computed numbers rather than recalculating them, precisely to avoid a second copy of the formula that could drift from this one.
- **Ingredient scaling exponent (0.55) for `sensitive` ingredients (salt, spices, yeast) is fixed** in `domain/scaling.ts` — doubling servings must not linearly double salt. Not per-recipe configurable.
- **Cook timers store an absolute end instant (`endsAt`, epoch ms), never remaining seconds** — this is what keeps them correct across screen-off/reload. See `CookTimer` in `src/types.ts`.
- **Color tokens only, no stray hex in components.** `--accent`/`--warn` are *fills*; text on a light/tinted background uses `--accent-ink`/`--warn-ink`; text on an accent-filled background uses `--onaccent`. Mixing these breaks 4.5:1 contrast app-wide.
- **No themed component libraries** (Material, Ant, Chakra, Bootstrap, shadcn as-is). They bring their own radii/heights/shadows that fight the design tokens. All primitives are hand-written in `src/ui/`.
- **Household membership and the admin flag are only ever written by `SECURITY DEFINER` RPCs** (`create_household`, `redeem_invite`, `promote_admin`). Clients hold no INSERT on `profile`, and `profile`/`household` UPDATE is granted column by column. Never re-grant table-level INSERT/UPDATE on them: that is exactly the hole the security audit found (any signed-in user could join any household as admin).
- **`revoke update (col) … ` alone does nothing** while a table-level UPDATE grant exists: revoke the table grant and re-grant the columns that should stay writable. This repo got it wrong once (`20260917070714` → fixed in `20260917070845`). A new user-editable column needs an explicit column grant.
- **The CSP in `app/public/_headers` blocks every origin not listed there, silently.** Adding a `fetch`, image host, font or websocket to a new origin requires adding it to the right directive, or the feature fails with no visible error (barcode lookup to `world.openfoodfacts.org` and the demo photos on `*.wikimedia.org` are why those are listed).
- Ingredients are referenced by id everywhere (pantry, recipes) — never by free-text name; `resolveIngredient` in `store.tsx` (demo) / the `save_recipe`/`pantry_add` RPCs (real) are the only places names get matched/created.
- Step→ingredient linkage (`RecipeStep.ingredientIds`) is inferred from step text as a heuristic (`domain/recipeText.ts::stepIngredientMap`) in **both** data layers today. The `recipe_step_ingredient` join table already exists in the schema and `supabaseStore.tsx` already reads it into `ingredientIds` when present — but the `save_recipe` RPC never writes rows there, so it's always empty and the heuristic is still the live path. Populating it (from `RecipeForm`'s structured per-step rows, which already know per-step text) is the way to retire the heuristic for real recipes; don't assume it's already exact just because the table exists.

### Where to look before implementing UI/visual behavior

Design and behavior disputes are resolved in this order: **`RezetApp.dc.html` (working prototype) > `README.md` (spec: screens, tokens, typography, motion, copy) > implementer intuition.** Don't invent values or "improve" the design unilaterally — if code and design disagree, that's a stop-and-ask situation, not a judgment call.

`README.md` section map: §3 design tokens, §4 per-screen behavior, §5 business rules, §6 motion (springs/keyframes/haptics), §7 i18n copy keys, §8 accessibility.

### Known gaps before shipping

`app/README.md` §"Qué falta" is stale (still says no backend/auth/PWA — all wrong, see below); trust this section instead:

- **`recipe_step_ingredient` is never populated** (see the non-negotiable-rules note above) — step→ingredient linkage is still heuristic everywhere.
- **Capacitor isn't installed** — only `capacitor.config.ts` is scaffolded; no native shells yet.
- Real dish photos exist for the 8 demo recipes; user-created recipes support photo upload to Storage (`recipe-photos` bucket) but nothing enforces it — a recipe can still be saved with no photo.
- No router (`BUILD_FROM_ZERO.md` §2 names React Router; the app doesn't have one).
- **Security "Fase B" is done** (`20260918214500_rezet_phase_b_revoke_invite_insert.sql`). Invites are server-only: no role holds INSERT on `household_invite` — `anon`, `authenticated` **and `service_role`** were revoked, along with the leftover UPDATE/DELETE/TRUNCATE grants, and the insert policy, the compatibility trigger `household_invite_server_mint_trg` and `private.force_server_minted_invite()` are gone. `create_invite()`/`revoke_invite()` are the only way in, and they set `created_by`/`expires_at` themselves. A PWA cached from before 1.6.0 still tries the direct insert: its "invite" button now fails, silently on those versions (error handling landed in 1.7.2) — accepted risk, fixed by opening the app and taking the update. The same migration revokes EXECUTE on `public.rls_auto_enable()` (a Supabase linter warning; the function lives only in production, hence the guard). Plan: `docs/superpowers/plans/2026-09-17-security-fixes.md`, section "Fase B".
- Edge Function secrets `TIMER_CRON_SECRET` (must equal the Vault secret `timer_cron_secret`) and `APP_ORIGIN` are set in the dashboard, not in the repo. Both `send-timer-notifications` and `cleanup-orphan-photos` refuse to run without it (503) since 1.8.1.
- **`supabaseStore.tsx` is only half split up.** The row mappers and the query keys were pulled out to `src/data/supabaseStore/` (`rows.ts`, `keys.ts`, plus `useMembers.ts`), but the rest of the store — every other query and mutation — is still in the monolith.
- **`app/src/ui/Sheet.tsx` tracks which sheet answers Escape with a stack that assumes the last one mounted is the top one.** That holds as long as nested sheets only open from user interaction, but if a child sheet is ever mounted in the same commit as its parent, React runs the child's effect first and the order comes out reversed. It doesn't happen today; whoever adds a new nesting needs to know it.
- **No React test infrastructure exists in this repo** (vitest only, no jsdom, no Testing Library), so `app/src/app/PrefsBridge.tsx` — which syncs settings between the device and the account, and whose effect ordering already had a race-condition bug once (see the comments in that file) — has no test pinning that ordering down. Whoever touches it next should know that.

Security audit reports live outside the repo in `~/security-audit-skill/Rezet/run-{1,2}/` (`REPORT.md` first); the fixes design is `docs/superpowers/specs/2026-09-17-security-audit-fixes-design.md`.

Already done, despite what older docs in this repo say: real Supabase backend + RLS, Google/Apple/Passkey auth with multi-user households + invites, PWA (`vite-plugin-pwa`, installable), background timer notifications via real Web Push (Edge Function + `pg_cron`, not local notifications), "Foto" pantry add via `recognize-pantry-item` (`GEMINI_API_KEY` is set in `app_secret`; model `gemini-3.6-flash` — `gemini-2.0-flash` is shut down, so don't revert to it), and deployed live at `rezet.jarsss8.es`.
