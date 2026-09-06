# Rezet design system — conventions

## Setup

No provider or root wrapper needed. Theme lives entirely in CSS custom properties set on `<html data-theme="dark">` or `<html data-theme="light">` (default is light — `:root` alone). Components read `var(--*)` directly; nothing needs a React context to be styled correctly. Switching the accent color at runtime is one line: `document.documentElement.style.setProperty('--accent', '<oklch or hex>')` — every derived token (`--soft`, `--soft2`, `--onaccent`, `--accent-ink`) recalculates from it via `color-mix`, so never hardcode a derived value per theme.

## Styling idiom — CSS custom properties, not utility classes

Style with inline `style={{ background: 'var(--surface)' }}` or plain CSS referencing these tokens — there is no class-name vocabulary (no `bg-surface-1`-style utilities). Real token names, both light/dark aware:

| Token | Role |
|---|---|
| `--bg`, `--bg2` | page backgrounds |
| `--surface`, `--surface2` | card/control backgrounds |
| `--text`, `--muted` | primary / secondary text |
| `--line` | hairline borders |
| `--accent` | **fill only** (buttons, active ring, checked state) |
| `--warn` | **fill only** (destructive fill) |
| `--onaccent` | text/icon color ON an `--accent`-filled surface (white) |
| `--accent-ink` | accent-colored **text** on a light/tinted background — never `--accent` itself for text |
| `--warn-ink` | destructive-colored text on a light/tinted background |
| `--soft`, `--soft2`, `--warnsoft` | tinted (not filled) backgrounds derived from accent/warn |
| `--glass`, `--shadow-s/m/l` | glass surfaces, elevation |

**The one rule that matters:** `--accent`/`--warn` are fills. Text on a light or tinted background uses `--accent-ink`/`--warn-ink`. Text on an accent-filled background uses `--onaccent`. Mixing these drops below 4.5:1 contrast — see `Button`'s variant table (`primary`: `background: var(--accent)` + `color: var(--onaccent)`; `danger`: `background: var(--warnsoft)` + `color: var(--warn-ink)`) as the canonical pattern to copy for any new filled vs. tinted surface.

No themed component library underneath any of this (no Material/Ant/Chakra/Bootstrap/shadcn) — every primitive here is hand-rolled against these tokens; don't reach for another library's radius/height/shadow scale alongside them.

## Where the truth lives

- `styles.css` (root of this bundle) — the full token set, `@import`s the compiled component CSS. Read it before inventing a new color.
- `components/<group>/<Name>/<Name>.prompt.md` — per-component usage reference.
- `components/<group>/<Name>/<Name>.d.ts` — the exact prop contract.

## Build snippet (idiomatic)

```tsx
import { Button } from 'rezet';

<Button variant="primary" size="cta" full onClick={handleSave}>
  Guardar
</Button>

<Button variant="danger" size="secondary" onClick={handleDelete}>
  Eliminar
</Button>
```

`variant` picks the fill/tint/ink pairing above — never override `color`/`background` inline on a stock variant; add a new variant to the source table instead if a new pairing is needed.
