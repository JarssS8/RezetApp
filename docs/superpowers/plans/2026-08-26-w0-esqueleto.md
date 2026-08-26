# W0 · Esqueleto — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dejar un repo Next 16 que arranca, construye, pasa `pnpm check`, tiene el tema «Mercado / Noche suave» aplicado, i18n con `es`/`en`, la barra de cinco pestañas con iconos propios, el shell de ajustes y `docker compose up` funcionando — sin ninguna funcionalidad de dominio todavía.

**Architecture:** App Router con Server Components por defecto. Tema por tokens CSS (`design-tokens.css`) mapeados a shadcn en `app/globals.css`; preferencias pintadas en SSR desde la cookie `rz_prefs`. i18n con `next-intl` sin enrutado por locale (un fichero por namespace y locale). Lint de fronteras entre capas desde el primer commit. Docker multi-stage con `output: 'standalone'` y scripts de migración/seed empaquetados con esbuild.

**Tech Stack:** Next 16.3.3 · React 19.2.8 · TypeScript 5.9.3 · Tailwind 4.3.3 · shadcn CLI 4.19 · next-intl 4.13.7 · drizzle-orm 0.45.2 + drizzle-kit 0.31.10 + pg 8.23 · vitest 4.1.11 · @playwright/test 1.62.1 · eslint 10 + eslint-plugin-boundaries 7.2 · esbuild · pnpm 11 · Node 24 (imagen) / 26 (local) · Postgres 17.

**Spec:** `docs/superpowers/specs/2026-08-26-rezetapp-design.md` (§3, §7, §15, §16, §17 W0, Apéndice A).

## Global Constraints

- Identificadores en **inglés**; comentarios y docs en **español**. Nada de `any`.
- Ningún texto de interfaz hardcodeado: todo vía `next-intl` (`messages/<locale>/<ns>.json`), locales `es` (default) y `en` con las mismas claves.
- Todo color sale de un token de `design-tokens.css`. Ningún literal de color en componentes. Iconos SVG propios con `currentColor`, `stroke-width` 1.85, `stroke-linecap="round"`. **Nunca lucide** ni otra librería de iconos.
- Radios: `--radius-sm/md/lg/xl` mapeados explícitamente a `--r-sm/--r-md/--r-lg/--r-lg`.
- Server Components por defecto; `'use client'` solo con interacción.
- Commits en español, imperativo, cortos, **sin trailers** de ningún tipo. Autor `JarssS8 <adriancgs@gmail.com>` (ya en `git config --global`).
- Antes de cada commit: `git grep -ilE 'c[l]aude'` debe devolver vacío.
- Versiones exactas en `package.json` (sin `^`).
- Estructura de directorios de §3 del spec; no crear carpetas fuera de ella.

---

## Mapa de ficheros de W0

| Fichero | Responsabilidad |
|---|---|
| `package.json`, `pnpm-lock.yaml`, `.npmrc` | Dependencias pinadas, scripts |
| `tsconfig.json` | strict, alias `@/*` → raíz |
| `next.config.ts` | `output: 'standalone'`, plugin next-intl |
| `postcss.config.mjs` | Tailwind 4 |
| `app/globals.css` | Tailwind + tokens + mapeo shadcn |
| `app/layout.tsx` | fuentes, `data-theme`/`data-accent`/`lang` desde `rz_prefs`, `NextIntlClientProvider` |
| `lib/prefs.ts` | leer/escribir cookie `rz_prefs` |
| `lib/i18n/request.ts`, `lib/i18n/config.ts` | next-intl: locale y fusión de namespaces |
| `messages/es/*.json`, `messages/en/*.json` | cadenas por namespace |
| `scripts/check-i18n-keys.ts` | compara claves entre locales |
| `eslint.config.mjs` | next + boundaries + no-literals + no-explicit-any |
| `vitest.config.ts`, `playwright.config.ts` | tests |
| `components/ui/*` | shadcn re-estilizados |
| `components/icons/*.tsx` | iconos propios |
| `components/nav/bottom-bar.tsx` | barra inferior |
| `app/(app)/layout.tsx` + 5 páginas | shell de la app |
| `app/(auth)/layout.tsx` | shell de auth (vacío) |
| `app/(app)/settings/layout.tsx` + 9 rutas | shell de ajustes |
| `db/index.ts` | cliente Drizzle |
| `scripts/migrate.ts`, `scripts/seed.ts` | migrar/sembrar (W0: funcionan con cero migraciones) |
| `docker/Dockerfile`, `docker/entrypoint.sh`, `docker-compose.yml`, `.env.example`, `.dockerignore` | despliegue |
| `README.md`, `README.en.md` | instalación, cero telemetría, licencias |
| `AGENTS.md`, `docs/*.md` | Apéndice A del spec |

---

### Task 1: Proyecto Next 16 con pnpm, TypeScript strict y versiones pinadas

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `.npmrc`, `app/layout.tsx`, `app/page.tsx`, `next-env.d.ts` (generado)
- Modify: `.gitignore`

**Interfaces:**
- Produces: scripts `pnpm dev`, `pnpm build`, `pnpm start`, `pnpm typecheck`; alias `@/*`.

- [ ] **Step 1: Scaffold en un directorio temporal y mover a la raíz**

El repo ya tiene ficheros; `create-next-app` exige carpeta vacía. Se genera aparte y se copia lo que interesa.

```bash
cd /home/jars/Programing
pnpm dlx create-next-app@16.3.3 rezetapp-tmp --ts --tailwind --eslint --app --no-src-dir --import-alias "@/*" --use-pnpm --no-git --yes
cd rezetapp-tmp
# Solo interesan los generados; el resto se escribe a mano abajo.
cp package.json pnpm-lock.yaml tsconfig.json next.config.ts postcss.config.mjs eslint.config.mjs next-env.d.ts ../RezetApp/
mkdir -p ../RezetApp/app ../RezetApp/public
cp app/layout.tsx app/page.tsx app/globals.css ../RezetApp/app/
cd .. && rm -rf rezetapp-tmp && cd RezetApp
```

- [ ] **Step 2: Pinar versiones y scripts en `package.json`**

Sustituir el contenido completo por:

```json
{
  "name": "rezetapp",
  "version": "0.1.0",
  "private": true,
  "packageManager": "pnpm@11.4.0",
  "engines": { "node": ">=24" },
  "type": "module",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "build:scripts": "esbuild scripts/migrate.ts scripts/seed.ts --bundle --platform=node --format=esm --target=node24 --outdir=dist/scripts --external:pg-native --banner:js=\"import { createRequire } from 'module'; const require = createRequire(import.meta.url);\"",
    "start": "next start",
    "typecheck": "tsc --noEmit",
    "lint": "eslint .",
    "i18n:check": "tsx scripts/check-i18n-keys.ts",
    "test": "vitest run",
    "test:watch": "vitest",
    "e2e": "playwright test",
    "check": "pnpm typecheck && pnpm lint && pnpm i18n:check && pnpm test",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "tsx scripts/migrate.ts",
    "db:seed": "tsx scripts/seed.ts",
    "db:studio": "drizzle-kit studio"
  },
  "dependencies": {
    "drizzle-orm": "0.45.2",
    "next": "16.3.3",
    "next-intl": "4.13.7",
    "pg": "8.23.0",
    "react": "19.2.8",
    "react-dom": "19.2.8",
    "zod": "4.4.3"
  },
  "devDependencies": {
    "@playwright/test": "1.62.1",
    "@tailwindcss/postcss": "4.3.3",
    "@types/node": "24.10.1",
    "@types/pg": "8.15.6",
    "@types/react": "19.2.14",
    "@types/react-dom": "19.2.3",
    "drizzle-kit": "0.31.10",
    "esbuild": "0.25.12",
    "eslint": "10.9.1",
    "eslint-config-next": "16.3.3",
    "eslint-plugin-boundaries": "7.2.0",
    "tailwindcss": "4.3.3",
    "tsx": "4.20.6",
    "typescript": "5.9.3",
    "vitest": "4.1.11"
  }
}
```

Si alguna versión de `@types/*`, `esbuild` o `tsx` no existe en el registro, usar la última publicada (`npm view <pkg> version`) y anotarla aquí en el mismo commit.

- [ ] **Step 3: Instalar y fijar `.npmrc`**

```bash
printf 'save-exact=true\nengine-strict=true\n' > .npmrc
pnpm install
```

- [ ] **Step 4: `tsconfig.json` estricto**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "exactOptionalPropertyTypes": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules", "dist", ".next"]
}
```

- [ ] **Step 5: `next.config.ts`**

```ts
import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'

const withNextIntl = createNextIntlPlugin('./lib/i18n/request.ts')

const nextConfig: NextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  // Sin telemetría de Next en la imagen: se fija también NEXT_TELEMETRY_DISABLED=1 en el Dockerfile.
}

export default withNextIntl(nextConfig)
```

`lib/i18n/request.ts` se crea en Task 4; hasta entonces `pnpm build` fallará. Para verificar esta tarea usar solo `pnpm typecheck`.

- [ ] **Step 6: `.gitignore`** — añadir al existente:

```
# next
next-env.d.ts
.next/
# tests
test-results/
playwright-report/
```

- [ ] **Step 7: Verificar**

Run: `pnpm typecheck`
Expected: sin errores.

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "Crea el proyecto Next 16 con versiones fijadas"
```

---

### Task 2: Tema «Mercado» — Tailwind 4, tokens, shadcn re-estilizado, fuentes, `rz_prefs`

**Files:**
- Create: `app/globals.css`, `lib/prefs.ts`, `lib/prefs.test.ts`, `components.json`, `components/ui/{button,input,label,card,dialog,sheet,badge,separator,skeleton,sonner}.tsx`
- Modify: `app/layout.tsx`, `package.json`

**Interfaces:**
- Produces: `readPrefs(cookieValue: string | undefined): Prefs`, `serializePrefs(p: Prefs): string`, tipo `Prefs = { theme: 'system'|'light'|'dark'; accent: Accent; locale: 'es'|'en' }`, `ACCENTS` (tupla de los 8 nombres), `DEFAULT_PREFS`.

- [ ] **Step 1: Test de `lib/prefs.ts`**

```ts
// lib/prefs.test.ts
import { describe, expect, it } from 'vitest'
import { DEFAULT_PREFS, readPrefs, serializePrefs } from './prefs'

describe('readPrefs', () => {
  it('devuelve defaults si no hay cookie', () => {
    expect(readPrefs(undefined)).toEqual(DEFAULT_PREFS)
  })
  it('ignora JSON roto', () => {
    expect(readPrefs('{oops')).toEqual(DEFAULT_PREFS)
  })
  it('ignora valores fuera de rango y conserva los válidos', () => {
    expect(readPrefs(JSON.stringify({ theme: 'neon', accent: 'higo', locale: 'fr' }))).toEqual({
      ...DEFAULT_PREFS,
      accent: 'higo',
    })
  })
  it('serializa y vuelve a leer', () => {
    const p = { theme: 'dark', accent: 'miel', locale: 'en' } as const
    expect(readPrefs(serializePrefs(p))).toEqual(p)
  })
})
```

- [ ] **Step 2: `vitest.config.ts` mínimo (se amplía en Task 3)**

```ts
import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: { environment: 'node', include: ['**/*.test.ts'], exclude: ['node_modules', 'e2e', '.next', 'dist'] },
  resolve: { alias: { '@': path.resolve(import.meta.dirname) } },
})
```

Run: `pnpm test -- lib/prefs.test.ts`
Expected: FAIL — `Cannot find module './prefs'`.

- [ ] **Step 3: Implementar `lib/prefs.ts`**

```ts
// Preferencias visuales espejo de users.* — se leen en SSR para pintar <html> sin flash.
export const ACCENTS = ['huerta', 'miel', 'tomate', 'pistacho', 'higo', 'berenjena', 'arandano', 'canela'] as const
export const THEMES = ['system', 'light', 'dark'] as const
export const LOCALES = ['es', 'en'] as const

export type Accent = (typeof ACCENTS)[number]
export type Theme = (typeof THEMES)[number]
export type Locale = (typeof LOCALES)[number]
export type Prefs = { theme: Theme; accent: Accent; locale: Locale }

export const PREFS_COOKIE = 'rz_prefs'
export const DEFAULT_PREFS: Prefs = { theme: 'system', accent: 'huerta', locale: 'es' }

function pick<T extends readonly string[]>(allowed: T, v: unknown, fallback: T[number]): T[number] {
  return typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T[number]) : fallback
}

export function readPrefs(cookieValue: string | undefined): Prefs {
  if (!cookieValue) return DEFAULT_PREFS
  let raw: unknown
  try {
    raw = JSON.parse(cookieValue)
  } catch {
    return DEFAULT_PREFS
  }
  const o = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {}
  return {
    theme: pick(THEMES, o.theme, DEFAULT_PREFS.theme),
    accent: pick(ACCENTS, o.accent, DEFAULT_PREFS.accent),
    locale: pick(LOCALES, o.locale, DEFAULT_PREFS.locale),
  }
}

export function serializePrefs(p: Prefs): string {
  return JSON.stringify(p)
}
```

Run: `pnpm test -- lib/prefs.test.ts`
Expected: 4 passed.

- [ ] **Step 4: Inicializar shadcn y añadir componentes**

```bash
pnpm dlx shadcn@4.19.0 init --yes --defaults --base-color neutral --css-variables
pnpm dlx shadcn@4.19.0 add --yes --overwrite button input label card dialog sheet badge separator skeleton sonner
```

Esto escribe `components.json`, `lib/utils.ts` (`cn`), `components/ui/*` y sobrescribe `app/globals.css` con el tema por defecto. Si la CLI añade `lucide-react` a `package.json`, **quitarlo** (`pnpm remove lucide-react`) y sustituir cada import de lucide en `components/ui/*` por iconos de Task 5 (por ahora, `XIcon` de `components/icons` — crear ese fichero aquí si hace falta con el SVG de Task 5). Si la CLI instala dependencias con `^`, `save-exact` ya lo evita.

- [ ] **Step 5: Reescribir `app/globals.css`**

Sustituir todo por (contiene íntegro `design-tokens.css`; el fichero de la raíz se conserva como referencia documental):

```css
@import "tailwindcss";
@import "tw-animate-css";

@custom-variant dark (&:where([data-theme="dark"], [data-theme="dark"] *));

/* ---------- Tokens · dirección «Mercado» ---------- */
:root {
  --acc: #2F9E6B;
  --bg: #FBFBFC;
  --surf: #FFFFFF;
  --surf-2: #F2F5F3;
  --line: #EAEEEC;
  --text: #161C1A;
  --text-2: #485450;
  --muted: #8A9691;
  --warn: #D9803A;
  --danger: #C0392B;
  --acc-soft: color-mix(in srgb, var(--acc) 13%, #FFFFFF);
  --acc-ink: color-mix(in srgb, var(--acc) 78%, #0A2118);
  --on-acc: #FFFFFF;
  --r-lg: 22px;
  --r-md: 16px;
  --r-sm: 12px;
  --sh-card: 0 2px 10px -7px rgba(22, 28, 26, .22);
  --sh-hero: 0 3px 14px -9px rgba(22, 28, 26, .30);
  --f-display: var(--font-outfit), "Helvetica Neue", system-ui, sans-serif;
  --f-body: var(--font-dm-sans), "Segoe UI", system-ui, sans-serif;
  --f-mono: var(--font-jetbrains-mono), ui-monospace, Menlo, monospace;
}

/* «Noche suave»: carbón cálido */
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --bg: #16130F; --surf: #1F1B16; --surf-2: #2A241D; --line: #2E271F;
    --text: #F1EBE1; --text-2: #BBB0A1; --muted: #8B8175; --warn: #E8A33D; --danger: #E06555;
    --acc-soft: color-mix(in srgb, var(--acc) 17%, #16130F);
    --acc-ink: color-mix(in srgb, var(--acc) 68%, #F1EBE1);
    --on-acc: #12261C;
    --sh-card: 0 2px 10px -7px rgba(0, 0, 0, .5);
    --sh-hero: 0 3px 14px -9px rgba(0, 0, 0, .7);
  }
}
:root[data-theme="dark"] {
  --bg: #16130F; --surf: #1F1B16; --surf-2: #2A241D; --line: #2E271F;
  --text: #F1EBE1; --text-2: #BBB0A1; --muted: #8B8175; --warn: #E8A33D; --danger: #E06555;
  --acc-soft: color-mix(in srgb, var(--acc) 17%, #16130F);
  --acc-ink: color-mix(in srgb, var(--acc) 68%, #F1EBE1);
  --on-acc: #12261C;
  --sh-card: 0 2px 10px -7px rgba(0, 0, 0, .5);
  --sh-hero: 0 3px 14px -9px rgba(0, 0, 0, .7);
}

/* Acentos, todos de comida */
:root[data-accent="huerta"]    { --acc: #2F9E6B; }
:root[data-accent="miel"]      { --acc: #D99A2B; }
:root[data-accent="tomate"]    { --acc: #CE5540; }
:root[data-accent="pistacho"]  { --acc: #7FA344; }
:root[data-accent="higo"]      { --acc: #B4557A; }
:root[data-accent="berenjena"] { --acc: #8C5A9E; }
:root[data-accent="arandano"]  { --acc: #4A7FB5; }
:root[data-accent="canela"]    { --acc: #A9764A; }

/* ---------- Mapeo a las variables que usan los componentes shadcn ---------- */
:root {
  --background: var(--bg);
  --foreground: var(--text);
  --card: var(--surf);
  --card-foreground: var(--text);
  --popover: var(--surf);
  --popover-foreground: var(--text);
  --primary: var(--acc);
  --primary-foreground: var(--on-acc);
  --secondary: var(--surf-2);
  --secondary-foreground: var(--text);
  --muted: var(--surf-2);
  --muted-foreground: var(--text-2);
  --accent: var(--acc-soft);
  --accent-foreground: var(--acc-ink);
  --destructive: var(--danger);
  --border: var(--line);
  --input: var(--line);
  --ring: var(--acc);
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --color-warn: var(--warn);
  --color-warn-soft: color-mix(in srgb, var(--warn) 14%, var(--surf));
  --color-surface-2: var(--surf-2);
  --color-text-2: var(--text-2);
  --color-text-muted: var(--muted);
  --color-acc-ink: var(--acc-ink);

  /* Radios explícitos: NO derivar de --radius */
  --radius-sm: var(--r-sm);
  --radius-md: var(--r-md);
  --radius-lg: var(--r-lg);
  --radius-xl: var(--r-lg);
  --radius-pill: 999px;

  --shadow-card: var(--sh-card);
  --shadow-hero: var(--sh-hero);

  --font-display: var(--f-display);
  --font-sans: var(--f-body);
  --font-mono: var(--f-mono);
}

@layer base {
  * { @apply border-border outline-ring/50; }
  html { -webkit-tap-highlight-color: transparent; }
  body { background: var(--bg); color: var(--text); font-family: var(--f-body); }
  h1, h2, h3 { font-family: var(--f-display); font-weight: 600; letter-spacing: -0.01em; }
  .tabular { font-family: var(--f-mono); font-variant-numeric: tabular-nums; }
  :focus-visible { outline: 2px solid var(--acc); outline-offset: 2px; }
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after { animation-duration: .01ms !important; transition-duration: .01ms !important; }
  }
}
```

Si `tw-animate-css` no fue instalado por shadcn, `pnpm add -D tw-animate-css@1.4.0` (o la última).

- [ ] **Step 6: Revisar cada componente de `components/ui/*`**

Para cada fichero: (1) quitar imports de lucide; (2) sustituir clases `rounded-md`/`rounded-lg`/`rounded-xl` de shadcn por las que correspondan al rol (botones y campos `rounded-sm` = 12 px, tarjetas `rounded-lg` = 22 px, chips `rounded-pill`); (3) botones con altura mínima táctil `min-h-11` (44 px); (4) `Card` con `shadow-card`; (5) ningún color literal (`bg-white`, `text-black`, `#…`, `oklch(`). Comprobar con:

```bash
grep -nE 'lucide|#[0-9a-fA-F]{3,6}\b|oklch\(|bg-white|text-black' components/ui/*.tsx && echo "HAY LITERALES" || echo "limpio"
```

Expected: `limpio`.

- [ ] **Step 7: `app/layout.tsx` con fuentes y atributos de tema**

```tsx
import type { Metadata, Viewport } from 'next'
import { DM_Sans, JetBrains_Mono, Outfit } from 'next/font/google'
import { cookies } from 'next/headers'
import { NextIntlClientProvider } from 'next-intl'
import { getLocale, getMessages } from 'next-intl/server'
import { PREFS_COOKIE, readPrefs } from '@/lib/prefs'
import './globals.css'

const outfit = Outfit({ subsets: ['latin'], weight: ['600', '700'], variable: '--font-outfit', display: 'swap' })
const dmSans = DM_Sans({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-dm-sans', display: 'swap' })
const mono = JetBrains_Mono({ subsets: ['latin'], weight: ['500', '600'], variable: '--font-jetbrains-mono', display: 'swap' })

export const metadata: Metadata = { title: 'RezetApp', applicationName: 'RezetApp' }
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover' }

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const prefs = readPrefs((await cookies()).get(PREFS_COOKIE)?.value)
  const locale = await getLocale()
  const messages = await getMessages()
  return (
    <html
      lang={locale}
      data-accent={prefs.accent}
      {...(prefs.theme === 'system' ? {} : { 'data-theme': prefs.theme })}
      className={`${outfit.variable} ${dmSans.variable} ${mono.variable}`}
    >
      <body className="min-h-dvh antialiased">
        <NextIntlClientProvider locale={locale} messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
```

`getLocale`/`getMessages` dependen de Task 4; hasta entonces el build falla. Verificar con `pnpm typecheck` y `pnpm test`.

- [ ] **Step 8: Verificar**

Run: `pnpm typecheck && pnpm test`
Expected: 0 errores; 4 tests passed.

- [ ] **Step 9: Commit**

```bash
git add -A && git commit -m "Aplica el tema Mercado y re-estiliza shadcn con los tokens"
```

---

### Task 3: Calidad — ESLint (boundaries, no-literals, no-any), Vitest, Playwright, `pnpm check`

**Files:**
- Create: `eslint.config.mjs` (sobrescribir), `playwright.config.ts`, `e2e/smoke.spec.ts`, `lib/domain/.gitkeep`, `lib/services/.gitkeep`
- Modify: `vitest.config.ts`, `package.json`

**Interfaces:**
- Produces: `pnpm check`, `pnpm e2e`; reglas de fronteras que W1+ deben respetar.

- [ ] **Step 1: `eslint.config.mjs`**

```js
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'
import boundaries from 'eslint-plugin-boundaries'

export default [
  ...nextVitals,
  ...nextTs,
  { ignores: ['.next/**', 'dist/**', 'node_modules/**', 'playwright-report/**', 'test-results/**'] },
  {
    plugins: { boundaries },
    settings: {
      'boundaries/elements': [
        { type: 'domain', pattern: 'lib/domain/**' },
        { type: 'validation', pattern: 'lib/validation/**' },
        { type: 'db', pattern: 'db/**' },
        { type: 'ai', pattern: 'lib/ai/**' },
        { type: 'integrations', pattern: 'lib/integrations/**' },
        { type: 'auth', pattern: 'lib/auth/**' },
        { type: 'events', pattern: 'lib/events/**' },
        { type: 'services', pattern: 'lib/services/**' },
        { type: 'lib', pattern: 'lib/*' },
        { type: 'components', pattern: 'components/**' },
        { type: 'app', pattern: 'app/**' },
        { type: 'scripts', pattern: 'scripts/**' },
      ],
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      'boundaries/element-types': [
        'error',
        {
          default: 'disallow',
          rules: [
            { from: 'domain', allow: ['domain'] },
            { from: 'validation', allow: ['validation', 'domain'] },
            { from: 'db', allow: ['db'] },
            { from: 'auth', allow: ['auth', 'db', 'lib'] },
            { from: 'events', allow: ['events'] },
            { from: 'ai', allow: ['ai', 'domain', 'validation', 'db', 'lib'] },
            { from: 'integrations', allow: ['integrations', 'domain', 'lib'] },
            { from: 'services', allow: ['services', 'domain', 'validation', 'db', 'ai', 'integrations', 'auth', 'events', 'lib'] },
            { from: 'lib', allow: ['lib', 'domain'] },
            { from: 'components', allow: ['components', 'domain', 'validation', 'lib', 'events'] },
            { from: 'app', allow: ['app', 'components', 'services', 'domain', 'validation', 'auth', 'events', 'lib'] },
            { from: 'scripts', allow: ['scripts', 'db', 'domain', 'lib'] },
          ],
        },
      ],
    },
  },
  {
    files: ['app/**/*.tsx', 'components/**/*.tsx'],
    rules: {
      'react/jsx-no-literals': [
        'error',
        { noStrings: true, ignoreProps: true, allowedStrings: ['·', '—', '–', '×', '%', '/', '(', ')', ':', '+', '−', '·', '…', '&nbsp;'] },
      ],
    },
  },
]
```

- [ ] **Step 2: Comprobar que la regla de fronteras muerde**

Crear temporalmente `lib/domain/bad.ts` con `import { db } from '@/db'` (el fichero `db/index.ts` aún no existe; el import basta para la regla), ejecutar `pnpm lint` y comprobar que falla con `boundaries/element-types`. Borrar `lib/domain/bad.ts`.

- [ ] **Step 3: `playwright.config.ts` y smoke**

```ts
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  use: { baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000', trace: 'retain-on-failure' },
  projects: [{ name: 'mobile', use: { ...devices['Pixel 7'] } }],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: 'pnpm dev', url: 'http://localhost:3000', reuseExistingServer: true, timeout: 120_000 },
})
```

```ts
// e2e/smoke.spec.ts
import { expect, test } from '@playwright/test'

test('la raíz responde y pinta el tema', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('html')).toHaveAttribute('data-accent', 'huerta')
})
```

```bash
pnpm exec playwright install chromium
```

- [ ] **Step 4: Verificar**

Run: `pnpm lint && pnpm test`
Expected: lint sin errores (los `.gitkeep` no cuentan); tests passed. `pnpm e2e` se ejecuta al final de Task 5 cuando exista `/`.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "Añade lint de fronteras, vitest y playwright"
```

---

### Task 4: i18n con next-intl — namespaces por fichero, locale desde `rz_prefs`, comprobación de claves

**Files:**
- Create: `lib/i18n/config.ts`, `lib/i18n/request.ts`, `lib/i18n/messages.ts`, `lib/i18n/messages.test.ts`, `messages/es/{common,auth,today,cook,plan,pantry,recipes,settings,errors}.json`, `messages/en/…` (mismos 9), `scripts/check-i18n-keys.ts`, `global.d.ts`

**Interfaces:**
- Produces: `NAMESPACES` (tupla), `loadMessages(locale): Promise<Messages>`, `resolveLocale(prefsLocale, acceptLanguage): Locale`; convención: `useTranslations('recipes')` / `getTranslations('recipes')` con claves definidas en `messages/<locale>/recipes.json`.

- [ ] **Step 1: Test de resolución de locale y fusión**

```ts
// lib/i18n/messages.test.ts
import { describe, expect, it } from 'vitest'
import { loadMessages, resolveLocale } from './messages'

describe('resolveLocale', () => {
  it('prefiere la cookie', () => expect(resolveLocale('en', 'es-ES,es;q=0.9')).toBe('en'))
  it('cae a Accept-Language', () => expect(resolveLocale(undefined, 'en-GB,en;q=0.8')).toBe('en'))
  it('cae a es', () => expect(resolveLocale(undefined, 'fr-FR')).toBe('es'))
})

describe('loadMessages', () => {
  it('fusiona todos los namespaces', async () => {
    const m = await loadMessages('es')
    expect(Object.keys(m).sort()).toEqual(['auth', 'common', 'cook', 'errors', 'pantry', 'plan', 'recipes', 'settings', 'today'])
    expect(m.common.appName).toBe('RezetApp')
  })
})
```

Run: `pnpm test -- lib/i18n`
Expected: FAIL — módulo no encontrado.

- [ ] **Step 2: Implementar**

```ts
// lib/i18n/config.ts
export const NAMESPACES = ['common', 'auth', 'today', 'cook', 'plan', 'pantry', 'recipes', 'settings', 'errors'] as const
export type Namespace = (typeof NAMESPACES)[number]
export { LOCALES, DEFAULT_PREFS } from '@/lib/prefs'
export type { Locale } from '@/lib/prefs'
```

```ts
// lib/i18n/messages.ts
import { LOCALES, type Locale } from '@/lib/prefs'
import { NAMESPACES, type Namespace } from './config'

export type Messages = Record<Namespace, Record<string, unknown>>

export function resolveLocale(prefsLocale: string | undefined, acceptLanguage: string | null | undefined): Locale {
  if (prefsLocale && (LOCALES as readonly string[]).includes(prefsLocale)) return prefsLocale as Locale
  const first = (acceptLanguage ?? '')
    .split(',')
    .map((p) => p.trim().split(';')[0]?.slice(0, 2).toLowerCase() ?? '')
    .find((l) => (LOCALES as readonly string[]).includes(l))
  return (first as Locale | undefined) ?? 'es'
}

export async function loadMessages(locale: Locale): Promise<Messages> {
  const entries = await Promise.all(
    NAMESPACES.map(async (ns) => {
      const mod = (await import(`@/messages/${locale}/${ns}.json`)) as { default: Record<string, unknown> }
      return [ns, mod.default] as const
    }),
  )
  return Object.fromEntries(entries) as Messages
}
```

```ts
// lib/i18n/request.ts
import { cookies, headers } from 'next/headers'
import { getRequestConfig } from 'next-intl/server'
import { PREFS_COOKIE, readPrefs } from '@/lib/prefs'
import { loadMessages, resolveLocale } from './messages'

export default getRequestConfig(async () => {
  const jar = await cookies()
  const hasCookie = jar.has(PREFS_COOKIE)
  const prefs = readPrefs(jar.get(PREFS_COOKIE)?.value)
  const locale = resolveLocale(hasCookie ? prefs.locale : undefined, (await headers()).get('accept-language'))
  return { locale, messages: await loadMessages(locale), timeZone: 'Europe/Madrid' }
})
```

`global.d.ts` (tipado de claves para autocompletar y detectar claves inexistentes en compilación):

```ts
import type { Messages } from '@/lib/i18n/messages'
import type es from '@/messages/es/common.json'

declare module 'next-intl' {
  interface AppConfig {
    Locale: 'es' | 'en'
    Messages: Messages & { common: typeof es }
  }
}
```

- [ ] **Step 3: Mensajes iniciales** — crear los 18 ficheros. `messages/es/common.json`:

```json
{
  "appName": "RezetApp",
  "nav": { "today": "Hoy", "cook": "Cocinar", "plan": "Plan", "pantry": "Despensa", "recipes": "Recetas" },
  "actions": { "save": "Guardar", "cancel": "Cancelar", "close": "Cerrar", "back": "Atrás", "delete": "Eliminar", "confirm": "Confirmar" },
  "state": { "loading": "Cargando…", "empty": "Nada por aquí todavía", "comingSoon": "Pronto" }
}
```

`messages/en/common.json`:

```json
{
  "appName": "RezetApp",
  "nav": { "today": "Today", "cook": "Cook", "plan": "Plan", "pantry": "Pantry", "recipes": "Recipes" },
  "actions": { "save": "Save", "cancel": "Cancel", "close": "Close", "back": "Back", "delete": "Delete", "confirm": "Confirm" },
  "state": { "loading": "Loading…", "empty": "Nothing here yet", "comingSoon": "Coming soon" }
}
```

`settings.json` (es):

```json
{
  "title": "Ajustes",
  "sections": {
    "household": "Hogar", "members": "Miembros", "ai": "Inteligencia artificial", "shoplist": "ShopList",
    "tokens": "Tokens de API", "appearance": "Apariencia", "passkeys": "Passkeys", "data": "Datos", "notifications": "Notificaciones"
  }
}
```

`settings.json` (en): `"title": "Settings"`, secciones `Household, Members, Artificial intelligence, ShopList, API tokens, Appearance, Passkeys, Data, Notifications`.

`today.json`, `cook.json`, `plan.json`, `pantry.json`, `recipes.json` en ambos idiomas: `{ "title": "<Hoy|Cocinar|Plan|Despensa|Recetas>" }` / `{ "title": "<Today|Cook|Plan|Pantry|Recipes>" }`. `auth.json`: `{ "title": "Entrar" }` / `{ "title": "Sign in" }`. `errors.json`: `{ "generic": "Algo ha fallado. Inténtalo de nuevo." }` / `{ "generic": "Something went wrong. Try again." }`.

- [ ] **Step 4: `scripts/check-i18n-keys.ts`**

```ts
// Falla si es/ y en/ no tienen exactamente las mismas claves (recursivo).
import { readFileSync } from 'node:fs'
import { NAMESPACES } from '../lib/i18n/config'

type Tree = { [k: string]: string | Tree }

function keys(t: Tree, prefix = ''): string[] {
  return Object.entries(t).flatMap(([k, v]) => (typeof v === 'string' ? [prefix + k] : keys(v, `${prefix}${k}.`)))
}

let failed = false
for (const ns of NAMESPACES) {
  const es = keys(JSON.parse(readFileSync(`messages/es/${ns}.json`, 'utf8')) as Tree).sort()
  const en = keys(JSON.parse(readFileSync(`messages/en/${ns}.json`, 'utf8')) as Tree).sort()
  const onlyEs = es.filter((k) => !en.includes(k))
  const onlyEn = en.filter((k) => !es.includes(k))
  if (onlyEs.length || onlyEn.length) {
    failed = true
    console.error(`[${ns}] solo en es: ${onlyEs.join(', ') || '-'} | solo en en: ${onlyEn.join(', ') || '-'}`)
  }
}
if (failed) process.exit(1)
console.log('i18n: claves iguales en es y en')
```

- [ ] **Step 5: Verificar**

Run: `pnpm test -- lib/i18n && pnpm i18n:check && pnpm typecheck`
Expected: tests passed; `i18n: claves iguales en es y en`; typecheck limpio. Romper una clave en `en/common.json`, comprobar que `pnpm i18n:check` falla, restaurar.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "Configura next-intl con namespaces por fichero y comprobación de claves"
```

---

### Task 5: Iconos propios, barra inferior, shell de las cinco pantallas y de auth

**Files:**
- Create: `components/icons/{index,today,cook,plan,pantry,recipes,plus,minus,close,check,chevron-left,chevron-right,search,settings,warning,clock,link,photo,trash,edit,user,logout,drag,send,copy,leftovers,estimated,fridge,freezer,cupboard,barcode,flame}.tsx`, `components/icons/icon.tsx`, `components/nav/bottom-bar.tsx`, `components/nav/bottom-bar.test.tsx`, `app/(app)/layout.tsx`, `app/(app)/today/page.tsx`, `app/(app)/cook/page.tsx`, `app/(app)/plan/page.tsx`, `app/(app)/pantry/page.tsx`, `app/(app)/recipes/page.tsx`, `app/(auth)/layout.tsx`, `app/(auth)/login/page.tsx`, `app/(auth)/register/page.tsx`
- Modify: `app/page.tsx` (redirige a `/today`), `vitest.config.ts` (proyecto jsdom para componentes), `package.json`

**Interfaces:**
- Produces: `IconProps = { size?: number; className?: string; title?: string }`; cada icono es `export function XIcon(props: IconProps)`; `NAV_ITEMS` con `{ href, labelKey, Icon }` para las cinco pestañas.

- [ ] **Step 1: Base de icono**

```tsx
// components/icons/icon.tsx
import type { ReactNode } from 'react'

export type IconProps = { size?: number; className?: string; title?: string }

// Todos los iconos comparten trazo 1.85, extremos redondos y currentColor.
export function Icon({ size = 24, className, title, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.85}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      className={className}
    >
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  )
}
```

- [ ] **Step 2: Los cinco de la barra** (dibujados a mano; trazos simples y reconocibles a 24 px)

```tsx
// components/icons/today.tsx — sol sobre plato
import { Icon, type IconProps } from './icon'
export function TodayIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <circle cx="12" cy="9" r="3.2" />
      <path d="M12 2.5v1.6M17.3 4.7l-1.1 1.1M6.7 4.7l1.1 1.1M20 9h-1.6M5.6 9H4" />
      <path d="M3.5 16.5h17M6 16.5c0 2.2 2.7 3.5 6 3.5s6-1.3 6-3.5" />
    </Icon>
  )
}
```

```tsx
// components/icons/cook.tsx — sartén
import { Icon, type IconProps } from './icon'
export function CookIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <ellipse cx="10" cy="13" rx="7" ry="4.2" />
      <path d="M3.3 14.5c.6 2.4 3.4 4 6.7 4s6.1-1.6 6.7-4" />
      <path d="M17 12.2l4.2-2.4" />
      <path d="M8.5 7.5c0-1 .8-1.3.8-2.3S8.5 4 8.5 3M11.5 7.5c0-1 .8-1.3.8-2.3S11.5 4 11.5 3" />
    </Icon>
  )
}
```

```tsx
// components/icons/plan.tsx — calendario
import { Icon, type IconProps } from './icon'
export function PlanIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <rect x="3.5" y="5" width="17" height="15.5" rx="3" />
      <path d="M3.5 9.8h17M8 3v3.5M16 3v3.5" />
      <path d="M8 14h2.5M13.5 14H16M8 17.2h2.5" />
    </Icon>
  )
}
```

```tsx
// components/icons/pantry.tsx — alacena
import { Icon, type IconProps } from './icon'
export function PantryIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <rect x="4" y="3.5" width="16" height="17" rx="2.5" />
      <path d="M12 3.5v17M4 12h16" />
      <path d="M9.5 7.5v1.5M14.5 7.5v1.5M9.5 15.5v1.5M14.5 15.5v1.5" />
    </Icon>
  )
}
```

```tsx
// components/icons/recipes.tsx — libro abierto
import { Icon, type IconProps } from './icon'
export function RecipesIcon(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M12 6.5c-1.6-1.5-4.2-2-8-1.8v13.8c3.8-.2 6.4.3 8 1.8 1.6-1.5 4.2-2 8-1.8V4.7c-3.8-.2-6.4.3-8 1.8Z" />
      <path d="M12 6.5v13.8" />
      <path d="M7 9.5h2.2M7 12.5h2.2M14.8 9.5H17M14.8 12.5H17" />
    </Icon>
  )
}
```

- [ ] **Step 3: Iconos de interfaz** — mismo patrón, un fichero cada uno. Paths:

| Fichero | Nombre | `<path d>` (dentro de `<Icon>`) |
|---|---|---|
| plus | `PlusIcon` | `M12 5v14M5 12h14` |
| minus | `MinusIcon` | `M5 12h14` |
| close | `CloseIcon` | `M6 6l12 12M18 6L6 18` |
| check | `CheckIcon` | `M5 12.5l4.5 4.5L19 7` |
| chevron-left | `ChevronLeftIcon` | `M14.5 5.5L8 12l6.5 6.5` |
| chevron-right | `ChevronRightIcon` | `M9.5 5.5L16 12l-6.5 6.5` |
| search | `SearchIcon` | `<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>` |
| settings | `SettingsIcon` | `<circle cx="12" cy="12" r="3"/><path d="M12 3.5v2M12 18.5v2M3.5 12h2M18.5 12h2M6 6l1.4 1.4M16.6 16.6L18 18M6 18l1.4-1.4M16.6 7.4L18 6"/>` |
| warning | `WarningIcon` | `M12 4.5L2.8 19.5h18.4L12 4.5ZM12 10v4.2M12 17.2v.2` |
| clock | `ClockIcon` | `<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>` |
| link | `LinkIcon` | `M10 14l4-4M8.5 16.5l-1.2 1.2a3.2 3.2 0 0 1-4.5-4.5l3-3M15.5 7.5l1.2-1.2a3.2 3.2 0 0 1 4.5 4.5l-3 3` |
| photo | `PhotoIcon` | `<rect x="3.5" y="5" width="17" height="14" rx="3"/><circle cx="9" cy="10" r="1.6"/><path d="M20.5 15.5l-4.5-4.5-7 7"/>` |
| trash | `TrashIcon` | `M5 7h14M9.5 7V4.8h5V7M7 7l.8 12.2h8.4L17 7M10 10.5v6M14 10.5v6` |
| edit | `EditIcon` | `M4 20h4.5L19 9.5l-4.5-4.5L4 15.5V20ZM13 6.5l4.5 4.5` |
| user | `UserIcon` | `<circle cx="12" cy="8.5" r="4"/><path d="M4.5 20c.8-3.6 3.9-5.5 7.5-5.5s6.7 1.9 7.5 5.5"/>` |
| logout | `LogoutIcon` | `M10 4H6.5A2.5 2.5 0 0 0 4 6.5v11A2.5 2.5 0 0 0 6.5 20H10M15 8l4 4-4 4M9 12h10` |
| drag | `DragIcon` | `M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01` |
| send | `SendIcon` | `M4 12l16-8-4.5 16L12 13.5 4 12ZM12 13.5L20 4` |
| copy | `CopyIcon` | `<rect x="9" y="9" width="11" height="11" rx="2.5"/><path d="M15 9V6.5A2.5 2.5 0 0 0 12.5 4h-6A2.5 2.5 0 0 0 4 6.5v6A2.5 2.5 0 0 0 6.5 15H9"/>` |
| leftovers | `LeftoversIcon` | `<rect x="3.5" y="9" width="17" height="10" rx="3"/><path d="M3.5 13h17M9 5.5c0 1.5 1.5 1.5 1.5 3M13.5 5.5c0 1.5 1.5 1.5 1.5 3"/>` |
| estimated | `EstimatedIcon` | `<circle cx="12" cy="12" r="8.5" strokeDasharray="3 3"/><path d="M12 8v4.5M12 16v.2"/>` |
| fridge | `FridgeIcon` | `<rect x="5.5" y="3" width="13" height="18" rx="2.5"/><path d="M5.5 10h13M9 6.5v1.5M9 13v2.5"/>` |
| freezer | `FreezerIcon` | `M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9M12 3l-2.5 2.5M12 3l2.5 2.5M12 21l-2.5-2.5M12 21l2.5-2.5` |
| cupboard | `CupboardIcon` | `<rect x="4" y="3.5" width="16" height="17" rx="2.5"/><path d="M4 9h16M4 14.5h16M8 6v.2M8 11.5v.2M8 17v.2"/>` |
| barcode | `BarcodeIcon` | `M4 6v12M8 6v12M11 6v12M14.5 6v12M17 6v12M20 6v12` |
| flame | `FlameIcon` | `M12 3c1 3 4.5 4.5 4.5 9a4.5 4.5 0 0 1-9 0c0-1.5.5-2.5 1.2-3.3.3 1.3 1 2 2 2.3-.2-3 .3-5.5 1.3-8Z` |

`components/icons/index.ts` re-exporta todos.

- [ ] **Step 4: Test de la barra (jsdom)**

Añadir proyecto jsdom en `vitest.config.ts`:

```ts
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname) } },
  test: {
    exclude: ['node_modules', 'e2e', '.next', 'dist'],
    projects: [
      { extends: true, test: { name: 'unit', environment: 'node', include: ['**/*.test.ts'] } },
      { extends: true, test: { name: 'ui', environment: 'jsdom', include: ['**/*.test.tsx'], setupFiles: ['./vitest.setup.ts'] } },
    ],
  },
})
```

```bash
pnpm add -D @vitejs/plugin-react@5.1.2 jsdom@27.1.0 @testing-library/react@16.3.0 @testing-library/jest-dom@6.9.1
printf "import '@testing-library/jest-dom/vitest'\n" > vitest.setup.ts
```

```tsx
// components/nav/bottom-bar.test.tsx
import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { describe, expect, it, vi } from 'vitest'
import common from '@/messages/es/common.json'
import { BottomBar } from './bottom-bar'

vi.mock('next/navigation', () => ({ usePathname: () => '/plan' }))

describe('BottomBar', () => {
  it('pinta cinco pestañas y marca la activa', () => {
    render(
      <NextIntlClientProvider locale="es" messages={{ common }}>
        <BottomBar />
      </NextIntlClientProvider>,
    )
    const links = screen.getAllByRole('link')
    expect(links).toHaveLength(5)
    expect(screen.getByRole('link', { name: 'Plan' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Hoy' })).not.toHaveAttribute('aria-current')
  })
})
```

Run: `pnpm test -- components/nav`
Expected: FAIL — `bottom-bar` no existe.

- [ ] **Step 5: Implementar la barra**

```tsx
// components/nav/bottom-bar.tsx
'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { CookIcon, PantryIcon, PlanIcon, RecipesIcon, TodayIcon } from '@/components/icons'
import { cn } from '@/lib/utils'

export const NAV_ITEMS = [
  { href: '/today', labelKey: 'today', Icon: TodayIcon },
  { href: '/cook', labelKey: 'cook', Icon: CookIcon },
  { href: '/plan', labelKey: 'plan', Icon: PlanIcon },
  { href: '/pantry', labelKey: 'pantry', Icon: PantryIcon },
  { href: '/recipes', labelKey: 'recipes', Icon: RecipesIcon },
] as const

export function BottomBar() {
  const t = useTranslations('common')
  const pathname = usePathname()
  return (
    <nav
      aria-label={t('navLabel')}
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 backdrop-blur pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="mx-auto grid max-w-xl grid-cols-5">
        {NAV_ITEMS.map(({ href, labelKey, Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`)
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium',
                  active ? 'text-primary' : 'text-text-2',
                )}
              >
                <Icon size={24} />
                <span>{t(`nav.${labelKey}`)}</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
```

Añadir `"navLabel": "Navegación principal"` / `"Main navigation"` a `common.json` en ambos idiomas (la usa el `aria-label` de `<nav>`).

- [ ] **Step 6: Layouts y páginas**

```tsx
// app/(app)/layout.tsx
import { BottomBar } from '@/components/nav/bottom-bar'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto min-h-dvh max-w-xl px-4 pb-24 pt-[max(1rem,env(safe-area-inset-top))]">
      {children}
      <BottomBar />
    </div>
  )
}
```

Cada página (`today`, `cook`, `plan`, `pantry`, `recipes`) — ejemplo para `today`, los demás cambian el namespace:

```tsx
// app/(app)/today/page.tsx
import { getTranslations } from 'next-intl/server'

export default async function TodayPage() {
  const t = await getTranslations('today')
  const c = await getTranslations('common')
  return (
    <main>
      <h1 className="text-2xl">{t('title')}</h1>
      <p className="mt-2 text-text-2">{c('state.comingSoon')}</p>
    </main>
  )
}
```

```tsx
// app/page.tsx
import { redirect } from 'next/navigation'
export default function Home() {
  redirect('/today')
}
```

```tsx
// app/(auth)/layout.tsx
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6">{children}</div>
}
```

`app/(auth)/login/page.tsx` y `register/page.tsx`: un `<h1>{t('title')}</h1>` con `getTranslations('auth')` (añadir `"registerTitle": "Crear cuenta"` / `"Create account"` a `auth.json` y usarla en `register`). W1(c) los completa.

Ajustar el smoke e2e: `page.goto('/')` debe acabar en `/today`: `await expect(page).toHaveURL(/\/today$/)`.

- [ ] **Step 7: Verificar**

Run: `pnpm check && pnpm build && pnpm e2e`
Expected: check verde; build OK; e2e 1 passed. Abrir `http://localhost:3000/today` con `pnpm dev` y comprobar a ojo, en claro y en oscuro (DevTools → emular `prefers-color-scheme`), que fondo/acento/tipografías son los del tema y la barra muestra cinco iconos.

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "Añade iconos propios, barra inferior y shell de pantallas"
```

---

### Task 6: Shell de ajustes — una ruta por sección

**Files:**
- Create: `app/(app)/settings/layout.tsx`, `app/(app)/settings/page.tsx`, `app/(app)/settings/{household,members,ai,shoplist,tokens,appearance,passkeys,data,notifications}/page.tsx`, `components/settings/settings-nav.tsx`, `components/settings/settings-nav.test.tsx`
- Modify: `messages/*/settings.json` (ya tiene `sections.*`)

**Interfaces:**
- Produces: `SETTINGS_SECTIONS: readonly { slug, labelKey }[]`; W2 rellena cada `page.tsx` sin tocar `layout.tsx` ni los de al lado.

- [ ] **Step 1: Test**

```tsx
// components/settings/settings-nav.test.tsx
import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { describe, expect, it, vi } from 'vitest'
import settings from '@/messages/es/settings.json'
import { SETTINGS_SECTIONS, SettingsNav } from './settings-nav'

vi.mock('next/navigation', () => ({ usePathname: () => '/settings/ai' }))

describe('SettingsNav', () => {
  it('lista las nueve secciones y marca la activa', () => {
    render(
      <NextIntlClientProvider locale="es" messages={{ settings }}>
        <SettingsNav />
      </NextIntlClientProvider>,
    )
    expect(SETTINGS_SECTIONS).toHaveLength(9)
    expect(screen.getAllByRole('link')).toHaveLength(9)
    expect(screen.getByRole('link', { name: 'Inteligencia artificial' })).toHaveAttribute('aria-current', 'page')
  })
})
```

Run: `pnpm test -- components/settings` → FAIL.

- [ ] **Step 2: Implementar**

```tsx
// components/settings/settings-nav.tsx
'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'

export const SETTINGS_SECTIONS = [
  { slug: 'household', labelKey: 'household' },
  { slug: 'members', labelKey: 'members' },
  { slug: 'ai', labelKey: 'ai' },
  { slug: 'shoplist', labelKey: 'shoplist' },
  { slug: 'tokens', labelKey: 'tokens' },
  { slug: 'appearance', labelKey: 'appearance' },
  { slug: 'passkeys', labelKey: 'passkeys' },
  { slug: 'data', labelKey: 'data' },
  { slug: 'notifications', labelKey: 'notifications' },
] as const

export function SettingsNav() {
  const t = useTranslations('settings')
  const pathname = usePathname()
  return (
    <ul className="flex gap-2 overflow-x-auto py-2">
      {SETTINGS_SECTIONS.map(({ slug, labelKey }) => {
        const href = `/settings/${slug}`
        const active = pathname === href
        return (
          <li key={slug} className="shrink-0">
            <Link
              href={href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'inline-flex min-h-10 items-center rounded-pill border px-3.5 text-sm font-medium',
                active ? 'border-primary bg-accent text-accent-foreground' : 'border-border bg-card text-text-2',
              )}
            >
              {t(`sections.${labelKey}`)}
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
```

```tsx
// app/(app)/settings/layout.tsx
import { getTranslations } from 'next-intl/server'
import { SettingsNav } from '@/components/settings/settings-nav'

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations('settings')
  return (
    <main>
      <h1 className="text-2xl">{t('title')}</h1>
      <SettingsNav />
      <section className="mt-4">{children}</section>
    </main>
  )
}
```

`app/(app)/settings/page.tsx`: `redirect('/settings/household')`. Cada `<slug>/page.tsx`:

```tsx
import { getTranslations } from 'next-intl/server'
export default async function Page() {
  const t = await getTranslations('settings')
  const c = await getTranslations('common')
  return (
    <div>
      <h2 className="text-lg">{t('sections.household')}</h2>
      <p className="mt-1 text-text-2">{c('state.comingSoon')}</p>
    </div>
  )
}
```

(con la clave de sección correspondiente en cada uno).

Enlace a ajustes: en `app/(app)/recipes/page.tsx` añadir junto al título un `<Link href="/settings" aria-label={c('settings')}><SettingsIcon /></Link>` — añadir `"settings": "Ajustes"` / `"Settings"` a `common.json` en ambos idiomas.

- [ ] **Step 3: Verificar y commit**

Run: `pnpm check && pnpm build`
Expected: verde.

```bash
git add -A && git commit -m "Añade el shell de ajustes con una ruta por sección"
```

---

### Task 7: Base de datos y Docker — `db/index.ts`, migrate/seed empaquetados, Dockerfile, compose, README

**Files:**
- Create: `db/index.ts`, `db/schema/index.ts`, `drizzle.config.ts`, `scripts/migrate.ts`, `scripts/seed.ts`, `docker/Dockerfile`, `docker/entrypoint.sh`, `docker-compose.yml`, `.dockerignore`, `.env.example`, `README.md`, `README.en.md`, `app/api/health/route.ts`, `e2e/health.spec.ts`

**Interfaces:**
- Produces: `db` (Drizzle sobre `pg.Pool`), `env.DATABASE_URL`; `GET /api/health` → `{ ok: true, db: true }`; contenedor que migra y siembra al arrancar.

- [ ] **Step 1: Cliente Drizzle y esquema vacío**

```ts
// db/schema/index.ts
// W1(a) añade aquí `export * from './households'` etc. Vacío a propósito en W0.
export {}
```

```ts
// db/index.ts
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from './schema'

const url = process.env.DATABASE_URL
if (!url) throw new Error('DATABASE_URL no está definida')

// Un solo pool por proceso; en dev Next recarga módulos, así que se cuelga de globalThis.
const g = globalThis as unknown as { __rzPool?: Pool }
export const pool = g.__rzPool ?? new Pool({ connectionString: url, max: 10 })
if (process.env.NODE_ENV !== 'production') g.__rzPool = pool

export const db = drizzle(pool, { schema })
// El tipo `Db` (conexión o transacción) lo define W1 en `db/types.ts`; no exportarlo aquí.
```

```ts
// drizzle.config.ts
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'postgresql',
  schema: './db/schema/index.ts',
  out: './db/migrations',
  dbCredentials: { url: process.env.DATABASE_URL ?? 'postgres://rezetapp:rezetapp@localhost:5432/rezetapp' },
  strict: true,
  verbose: true,
})
```

- [ ] **Step 2: Scripts de migración y seed**

```ts
// scripts/migrate.ts — se ejecuta al arrancar el contenedor; sin drizzle-kit en runtime.
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { Pool } from 'pg'

const url = process.env.DATABASE_URL
if (!url) throw new Error('DATABASE_URL no está definida')
const pool = new Pool({ connectionString: url })
const db = drizzle(pool)
await migrate(db, { migrationsFolder: process.env.MIGRATIONS_DIR ?? './db/migrations' })
await pool.end()
console.log('migraciones aplicadas')
```

```ts
// scripts/seed.ts — idempotente. W1(a) añade unit_aliases, tags y foods.
import { Pool } from 'pg'

const url = process.env.DATABASE_URL
if (!url) throw new Error('DATABASE_URL no está definida')
const pool = new Pool({ connectionString: url })
await pool.query('select 1')
await pool.end()
console.log('seed: nada que sembrar todavía')
```

`drizzle-kit migrate` exige que exista `db/migrations/meta/_journal.json`; con cero migraciones `migrate()` de drizzle-orm falla al no encontrar el journal. Crear el journal vacío:

```bash
mkdir -p db/migrations/meta
cat > db/migrations/meta/_journal.json <<'EOF'
{ "version": "7", "dialect": "postgresql", "entries": [] }
EOF
```

- [ ] **Step 3: Health endpoint**

```ts
// app/api/health/route.ts
import { sql } from 'drizzle-orm'
import { db } from '@/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    await db.execute(sql`select 1`)
    return Response.json({ ok: true, db: true })
  } catch {
    return Response.json({ ok: false, db: false }, { status: 503 })
  }
}
```

```ts
// e2e/health.spec.ts
import { expect, test } from '@playwright/test'
test('health responde con db', async ({ request }) => {
  const res = await request.get('/api/health')
  expect(res.status()).toBe(200)
  expect(await res.json()).toEqual({ ok: true, db: true })
})
```

- [ ] **Step 4: Docker**

```dockerfile
# docker/Dockerfile
FROM node:24-alpine AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NEXT_TELEMETRY_DISABLED=1
RUN corepack enable && apk add --no-cache libc6-compat
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml .npmrc ./
RUN pnpm install --frozen-lockfile

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build && pnpm build:scripts

FROM node:24-alpine AS runner
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0 MIGRATIONS_DIR=/app/db/migrations
RUN apk add --no-cache libc6-compat && addgroup -S app && adduser -S app -G app
WORKDIR /app
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
COPY --from=build --chown=app:app /app/public ./public
COPY --from=build --chown=app:app /app/dist/scripts ./scripts
COPY --from=build --chown=app:app /app/db/migrations ./db/migrations
COPY --chown=app:app docker/entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh && mkdir -p /app/data/uploads && chown app:app /app/data/uploads
USER app
EXPOSE 3000
ENTRYPOINT ["./entrypoint.sh"]
```

```sh
#!/bin/sh
# docker/entrypoint.sh — espera a Postgres, migra, siembra, arranca.
set -e
node scripts/migrate.js
node scripts/seed.js
exec node server.js
```

La espera a Postgres la hace `depends_on: condition: service_healthy` en compose; `migrate.js` falla rápido si no hay DB, y el `restart: unless-stopped` reintenta.

```yaml
# docker-compose.yml
services:
  app:
    build: { context: ., dockerfile: docker/Dockerfile }
    ports: ["3000:3000"]
    env_file: .env
    environment:
      DATABASE_URL: postgres://rezetapp:${POSTGRES_PASSWORD:-rezetapp}@db:5432/rezetapp
    volumes:
      - ./data/uploads:/app/data/uploads
    depends_on:
      db: { condition: service_healthy }
    restart: unless-stopped
  db:
    image: postgres:17-alpine
    environment:
      POSTGRES_USER: rezetapp
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-rezetapp}
      POSTGRES_DB: rezetapp
    ports: ["5432:5432"]
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U rezetapp -d rezetapp"]
      interval: 5s
      timeout: 3s
      retries: 20
    restart: unless-stopped
volumes:
  pgdata:
```

```
# .env.example
APP_URL=http://localhost:3000
# 32+ bytes aleatorios: openssl rand -base64 48
APP_SECRET=cambia-esto
POSTGRES_PASSWORD=rezetapp
# Solo para desarrollo local fuera de Docker:
DATABASE_URL=postgres://rezetapp:rezetapp@localhost:5432/rezetapp
DATABASE_URL_TEST=postgres://rezetapp:rezetapp@localhost:5432/rezetapp_test
# IA (opcional; también configurable por hogar en Ajustes)
AI_ANTHROPIC_API_KEY=
AI_OPENAI_API_KEY=
# Servidor local OpenAI-compatible (llama-server, Ollama /v1, LM Studio…)
AI_LOCAL_BASE_URL=
AI_LOCAL_MODEL=
# ShopList (opcional)
SHOPLIST_FN_URL=
SHOPLIST_IMPORT_SECRET=
SHOPLIST_LIST_TOKEN=
```

```
# .dockerignore
node_modules
.next
dist
data
.git
e2e
test-results
playwright-report
docs
*.md
.env*
```

- [ ] **Step 5: README**

`README.md` (es) con secciones: qué es (3 líneas), instalación (`cp .env.example .env`, editar `APP_SECRET`, `docker compose up -d`, abrir `http://localhost:3000`), requisitos (passkeys necesitan HTTPS o `localhost`; sin SMTP, sin S3), desarrollo (`pnpm install`, `docker compose up -d db`, `cp .env.example .env`, `pnpm db:migrate`, `pnpm dev`; `pnpm check`; `pnpm test -- <ruta>`; `pnpm e2e`), **Privacidad: cero telemetría** (la app no envía nada a ningún sitio; las únicas conexiones salientes son las que el usuario configura: proveedor de IA, Open Food Facts al escanear, ShopList), **Licencias de datos**: USDA FoodData Central (dominio público) y Open Food Facts (ODbL — enlace `https://world.openfoodfacts.org` y aviso de licencia), integración con ShopList (enlace a `docs/06-SHOPLIST.md`), MCP (enlace a `docs/05-MCP.md`; W3 completa). `README.en.md`: misma estructura en inglés. Sin menciones a herramientas de IA usadas para desarrollar.

- [ ] **Step 6: Verificar en local y en Docker**

```bash
cp .env.example .env
docker compose up -d db
pnpm db:migrate        # "migraciones aplicadas" (cero migraciones)
pnpm db:seed
pnpm check && pnpm build && pnpm build:scripts
ls dist/scripts        # migrate.js seed.js
pnpm e2e               # smoke + health
docker compose build app && docker compose up -d app
sleep 5 && curl -s localhost:3000/api/health   # {"ok":true,"db":true}
docker compose logs app | grep -E 'migraciones|seed'
docker compose down
```

Expected: todo verde; `curl` devuelve `{"ok":true,"db":true}`.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "Añade Drizzle, scripts de migración y despliegue con Docker Compose"
```

---

### Task 8: Docs al día — Apéndice A del spec y sección Comandos

**Files:**
- Modify: `AGENTS.md` (sección "Comandos" y "Estado del proyecto"), `docs/02-DISENO.md`, `docs/03-DOMINIO.md`, `docs/04-DATOS.md`, `docs/05-MCP.md`, `docs/06-SHOPLIST.md`, `docs/07-ROADMAP.md`

- [ ] **Step 1: `AGENTS.md` → Comandos**

Sustituir la sección `## Comandos` por:

```markdown
## Comandos

- `pnpm dev` — desarrollo (necesita Postgres: `docker compose up -d db`)
- `pnpm build` · `pnpm start` — producción local
- `pnpm check` — typecheck + lint + i18n + tests unitarios (lo que debe estar verde antes de cada commit)
- `pnpm test` · `pnpm test -- lib/domain/scaling.test.ts` — todos / uno
- `pnpm e2e` — Playwright (levanta `pnpm dev` si no hay `E2E_BASE_URL`)
- `pnpm db:generate` — genera migración desde `db/schema/`
- `pnpm db:migrate` · `pnpm db:seed` — aplicar migraciones / sembrar (idempotente)
- `docker compose up -d` — app + Postgres; la app migra y siembra al arrancar
```

Y en "Estado del proyecto": "Fase 0 (W0) hecha: esqueleto, tema, i18n, shell y Docker. Sin dominio todavía."

- [ ] **Step 2: Docs de dominio y datos** — aplicar exactamente la tabla del Apéndice A del spec:
  - `docs/02-DISENO.md`: en "Escala de radios" añadir "En Tailwind se mapean explícitamente `--radius-sm/md/lg/xl` → `--r-sm/--r-md/--r-lg/--r-lg`; no se usa `--radius`." En "Fila de despensa": "ámbar si < 7 días (fijo, visual); la alerta de Hoy usa `expiry_alert_days` del hogar."
  - `docs/03-DOMINIO.md` §6: renombrar a `location` (`fridge | freezer | pantry`) y `expires_at`; añadir "El descuento saca primero de lo que antes caduca (FIFO por `expires_at`, nulos al final, luego `added_at`) y se aplica con `GREATEST(0, quantity − x)` atómico por fila; el aviso sale de lo realmente descontado." §7: añadir "Se excluyen las entradas ya cocinadas o saltadas (además de las sobras). Líneas sin `food_id` se agrupan por nombre y no restan despensa; líneas sin unidad base salen con cantidad vacía."
  - `docs/04-DATOS.md`: añadir las tablas `sessions`, `webauthn_challenges`, `plan_proposals`, `app_settings`, `unit_aliases`, `collections`, `push_subscriptions`; en `households` quitar `ai_spent_this_month_cents` y añadir `default_servings`, `expiry_alert_days`, `ai_model`, `ai_base_url`, `ai_api_key_enc`, `shoplist_fn_url`, `shoplist_secret_enc`, `plan_rules`; `meal_plan_entries.skipped_at`; `recipe_ingredients.quantity/unit` nullables + `display_quantity/display_unit`; `api_tokens.mcp_profile` y scope `cooking:write`; `foods.search_name_es/en`, `density_g_per_ml`, `grams_per_unit`, `merged_into_id`; `cooking_log.pantry_deductions/warnings`. Referenciar §4 del spec como detalle.
  - `docs/05-MCP.md`: añadir "Transporte: `WebStandardStreamableHTTPServerTransport` del SDK oficial sobre la route handler. Auth: Bearer `rz_…`; los conectores que exigen OAuth no pueden conectarse directamente (usar un cliente de escritorio o `mcp-remote --header`); OAuth queda como trabajo futuro. `set_meal_plan` crea una propuesta (`plan_proposals`) y nunca escribe el plan. El perfil (`basic`/`full`) lo fija cada token. Un MCP mínimo (contexto, buscar, receta) llega en la oleada W2."
  - `docs/06-SHOPLIST.md`: nota al inicio del bloque de código: "Los identificadores reales van en inglés: `ShoppingLine`, `toShopListItem`, `pushToShopList`. La configuración vive por hogar (cifrada) con fallback a las variables de entorno."
  - `docs/07-ROADMAP.md`: añadir al inicio "Se ejecuta en oleadas paralelas (ver spec §17). El MCP mínimo se adelanta a W2 para conservar el feedback temprano."

- [ ] **Step 3: Verificar y commit**

```bash
git grep -ilE 'c[l]aude' && echo "PARAR: hay menciones" || echo ok
git add -A && git commit -m "Actualiza los docs con las decisiones del spec y los comandos"
```

---

## Criterio de «W0 hecha»

- `pnpm check`, `pnpm build`, `pnpm e2e` verdes en local.
- `docker compose up -d` desde cero → `curl localhost:3000/api/health` = `{"ok":true,"db":true}`.
- `/today` muestra el tema en claro y oscuro con la barra de cinco iconos; `/settings/ai` muestra las nueve secciones.
- `git grep -ilE 'c[l]aude'` vacío; `git log --format=%b` sin trailers.
