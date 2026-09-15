---
name: releasing-versions
description: Use when preparing a Rezet deploy that changes the app, the MCP server, Edge Functions or migrations, when the deploy report warns that the version is already released, or when the user asks for a new version, release notes or the changelog.
---

# Releasing versions

## Overview

Rezet has one SemVer version for everything, in `app/package.json` (mirrored in `mcp/` and reported to connected AI clients). Every deploy that changes something users run gets a new version and a `CHANGELOG.md` entry. CI tags `vX.Y.Z` and publishes the GitHub Release only after every deploy job succeeds; the app shows the version in Settings and prompts installed users to update.

## Steps

1. **Last release** — `git fetch --tags origin && git tag -l 'v*' --sort=-v:refname | head -1`; commits since: `git log --format='%h %s' <tag>..HEAD`. Read the diff when a subject doesn't say what users notice.
2. **Keep only what users notice.** Drop docs, skills, `tools/`, CI, tests and refactors without behavior change. If nothing is left, there is no release — stop.
3. **Level** — the highest that applies:

   | Level | When |
   |---|---|
   | major | something users or connected AI assistants relied on stops working as before: data removed or transformed, an MCP tool or argument removed/renamed, a feature removed |
   | minor | a new capability users can see or use |
   | patch | fixes, copy, performance, visual polish |

4. **Bump** — `node tools/release/bump-version.mjs <major|minor|patch>` (never edit versions by hand: it keeps `app/` and `mcp/` and both lockfiles in step).
5. **Changelog** — add the entry at the top of `CHANGELOG.md`, below the intro, using the template. Commit both as `Release X.Y.Z`.
6. **Back to deploying-to-main** — its report must show the version, the level with the reason, and these notes.

## Entry template

Exactly this shape. Spanish block first, then English with the same items in the same order. Leave out a heading that has no items.

```markdown
## [X.Y.Z] - YYYY-MM-DD

### Español

**Importante**
- Qué deja de funcionar como antes y qué tiene que hacer el usuario.

**Nuevo**
- …

**Mejorado**
- …

**Arreglado**
- …

### English

**Important**
- …

**New**
- …

**Improved**
- …

**Fixed**
- …
```

## Writing the notes

- Readers are the household members who use the app. One line per item: what they can now do, or what stopped going wrong.
- Use the app's own words: Despensa/Pantry, Cocinar/Cook, Plan, "tu asistente de IA"/"your AI assistant". Never MCP, RLS, migration, NOT NULL, Worker, service worker, commit hashes or file names.
- A database change appears only through its effect on users — under Importante when their data is removed or changed; purely internal ones don't appear.
- No emoji.

## Common mistakes

- Releasing when only docs, skills or tools changed.
- Copying commit subjects instead of writing what users notice.
- Editing an already published section: published versions are history — fix it in the next version.
