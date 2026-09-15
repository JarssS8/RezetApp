# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

A design-and-implementation package for **Rezet**, a household recipe/meal-plan/pantry app. Root holds the design spec (`README.md`, `tokens.css`, `motion.js`, `RezetApp.dc.html` — the visual source of truth), a from-scratch build guide (`BUILD_FROM_ZERO.md`), and `app/` — a **complete, working app with a real backend**: Supabase (Postgres + Auth + RLS + Storage + Edge Functions), deployed as a Cloudflare Worker. A local-only demo mode (`localStorage`, no account) still exists side by side with the real one — see "Two data providers" below.

`INDEX.md` is the map of these five pieces; read it first when unsure which doc answers a question.

## Commands (run from `app/`)

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # vitest run — domain rule tests
npm run test:watch
npm run build     # tsc -b && vite build
npm run lint      # tsc --noEmit
```

Single test file: `npx vitest run src/domain/__tests__/domain.test.ts`

Needs `app/.env` (see `app/.env.example`): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_VAPID_PUBLIC_KEY`. Without it the real (non-demo) login path throws on boot. The "Demo" button on the login screen skips all of this (local `DataProvider`, no network, no account).

Deploy: **pushing to `main` on GitHub (`JarssS8/RezetApp`) deploys to production** via `.github/workflows/deploy.yml`, only what changed — Supabase migrations first (`supabase db push`), then Edge Functions, the `rezet` Worker (`app/`, `rezet.jarsss8.es`) and the `rezet-mcp` Worker (`mcp/` or `app/src/domain/`). Never push to `main` without the `deploying-to-main` skill: a PreToolUse hook (`.claude/hooks/guard-push-main.mjs`) blocks it until the user runs the confirmation for that exact commit. CI needs repo secrets `CLOUDFLARE_API_TOKEN`, `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_VAPID_PUBLIC_KEY` and variables `CLOUDFLARE_ACCOUNT_ID`, `SUPABASE_PROJECT_REF`. A manual `npm run build && npx wrangler deploy` from `app/` still works for emergencies, but it bypasses the report and the next push to `main` will overwrite it.

Migrations: a migration file's version prefix must equal the version recorded in production (`mcp__supabase__list_migrations`). `apply_migration` records the time it ran, not your file name — rename the file to that version right after applying, or CI's `supabase db push` will try to apply it again.

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
  migrations/  Schema + RLS + the transactional RPCs (applied via Supabase CLI/dashboard, not tracked by app tests)
  functions/   recognize-pantry-item (Gemini vision for pantry photo add), send-timer-notifications (pg_cron → Web Push)
```

### Two data providers, one contract

`src/data/storeContext.ts` defines the `Store` interface — the contract both data layers implement, so screens call `useData()` without knowing which is mounted:

- **`store.tsx`** — demo mode. `localStorage`, seeded from `seed.ts`, no account. Reached via the "Demo" button on Login.
- **`supabaseStore.tsx`** — real mode. Supabase (Postgres + RLS scoped by `household_id`, Storage for recipe photos, realtime on pantry). Mounted once `auth.tsx` (`useAuth()`) has a session **and** a household (`profile.householdId`); `App.tsx` picks the provider.

`saveRecipe`, `pantryAdd`, `buyChecked`, and `finishCook` are `Promise`-returning in both (the real one does a network round-trip; the demo one resolves immediately) — screens `await`/`void` them the same way either way.

Auth: Google, Apple, and Passkey sign-in via Supabase Auth (`auth.tsx`). A signed-in user without a `profile` row lands on `CreateOrJoinHousehold` (create a household or redeem an invite code) before reaching the app — see `household`/`household_invite`/`redeem_invite` in the schema.

Three actions are transactional server RPCs (contract in `BUILD_FROM_ZERO.md` §5) because they touch multiple tables — implemented in `supabase/migrations/20260905132555_rezet_transactional_rpcs.sql` and later fix-up migrations:

| Store action | Server RPC | Does |
|---|---|---|
| `finishCook` | `rpc/finish_cook` | Subtracts scaled quantities from pantry, increments `cookedCount`, marks/creates the plan entry, returns `shortages` |
| `buyChecked` | `rpc/buy_checked` | Adds checked shopping items to pantry, clears checks |
| `saveRecipe` | `rpc/save_recipe` | Upserts recipe + ingredients + steps + tags atomically, resolving/creating ingredients by name |
| `pantryAdd` | `rpc/pantry_add` | Adds/merges one pantry item (manual or "Foto" add) |
| — | `rpc/create_household`, `rpc/redeem_invite` | Household bootstrap / invite-code join, called from `auth.tsx`, not from `Store` |

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

- **Business rules live in `domain/` only.** They're pure and tested. Never re-implement scaling/coverage/shopping math inline in a screen — four screens (recipe detail, cook mode, shopping list, pantry deduction) call the same `scaleQuantity`/`isCovered` functions and must agree.
- **Ingredient scaling exponent (0.55) for `sensitive` ingredients (salt, spices, yeast) is fixed** in `domain/scaling.ts` — doubling servings must not linearly double salt. Not per-recipe configurable.
- **Cook timers store an absolute end instant (`endsAt`, epoch ms), never remaining seconds** — this is what keeps them correct across screen-off/reload. See `CookTimer` in `src/types.ts`.
- **Color tokens only, no stray hex in components.** `--accent`/`--warn` are *fills*; text on a light/tinted background uses `--accent-ink`/`--warn-ink`; text on an accent-filled background uses `--onaccent`. Mixing these breaks 4.5:1 contrast app-wide.
- **No themed component libraries** (Material, Ant, Chakra, Bootstrap, shadcn as-is). They bring their own radii/heights/shadows that fight the design tokens. All primitives are hand-written in `src/ui/`.
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

Already done, despite what older docs in this repo say: real Supabase backend + RLS, Google/Apple/Passkey auth with multi-user households + invites, PWA (`vite-plugin-pwa`, installable), background timer notifications via real Web Push (Edge Function + `pg_cron`, not local notifications), "Foto" pantry add via `recognize-pantry-item` (`GEMINI_API_KEY` is set in `app_secret`; model `gemini-3.6-flash` — `gemini-2.0-flash` is shut down, so don't revert to it), and deployed live at `rezet.jarsss8.es`.
