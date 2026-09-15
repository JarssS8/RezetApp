---
name: deploying-to-main
description: Use when about to push or merge anything to main in the Rezet repo, when the user asks to deploy, publish, "subir a main", "desplegar" or overwrite the GitHub repo, or when a git push to main is blocked by the guard hook.
---

# Deploying to main

## Overview

A push to `main` deploys to production on its own (`.github/workflows/deploy.yml`): Supabase migrations first, then Edge Functions, the `rezet` web Worker and the `rezet-mcp` Worker — only the parts that changed. The user decides with a complete report in front of them.

A PreToolUse hook (`.claude/hooks/guard-push-main.mjs`) blocks every Claude push to `main` until **the user** runs the confirmation for that exact commit. You cannot confirm for them: running the confirmation script or writing its file is blocked too.

## Steps

1. **Local checks** — run and keep the results: in `app/`, `npm run lint && npm test && npm run build`; in `mcp/` (if `mcp/` or `app/src/domain/` changes), `npm run types:worker && npm run lint && npm test`.
2. **Facts** — `node .claude/skills/deploying-to-main/deploy-report.mjs`.
3. **Production state** — `mcp__supabase__list_migrations`; every production version must exist locally with the same version prefix. Local-only versions are what CI will apply.
4. **Read** every pending migration in full, every flagged line, and the diff of anything the MCP server exposes (`mcp/src/tools/`, tool names and arguments).
5. **Write the report** below.
6. **Ask** with AskUserQuestion: "Desplegar" / "No desplegar".
7. **If yes**, ask the user to type `! node .claude/skills/deploying-to-main/confirm.mjs` (add ` --force` only when the mode says SOBRESCRIBIR or DIVERGENTE) and wait until they have.
8. **Push.** For a force push, first push GitHub's current `main` to a backup branch (the report prints the command). Then `gh run watch` the "Deploy production" run and report each job and a live check of each deployed target.

## Report — every section, in this order, even when the answer is "nada"

**Informe de despliegue — `<sha>` "<asunto>"**

1. **Veredicto** — `Riesgo: bajo/medio/alto · Pérdida de datos: no/posible/sí` and one sentence why.
2. **Qué se sube** — push mode, commits; on force push, what GitHub loses and the backup branch.
3. **Qué se despliega** — each of the four targets: what changes for users, or "no se toca".
4. **Base de datos** — each pending migration in plain words; for each flagged statement, which data it touches and whether it can fail on existing rows; any production/local mismatch.
5. **Qué puede fallar** — for this push specifically: missing CI secrets or variables, renamed/removed MCP tools or arguments (breaks connected AI clients), new `VITE_*` variables, `app_secret` keys a function needs, installed PWA users on a cached old version.
6. **Cómo se revierte** — per deployed target: Workers `npx wrangler rollback` (from `app/` or `mcp/`); Edge Functions redeploy the previous commit; migrations have no automatic undo (say whether a backup is needed first); force push restores from the backup branch.
7. **Comprobaciones locales** — lint/test/build results, and uncommitted changes that will not be pushed.

## Recommend NOT deploying when

- Production has a migration version missing locally, or a version differs for the same migration name.
- An already-applied migration was edited.
- Lint, tests or build fail.
- "Pérdida de datos: sí" and the user has not accepted a backup plan.

## Common mistakes

- Reporting only the SQL and skipping app, MCP and function effects.
- Reading "no pending migrations" as "no data risk" while RLS-dependent code or functions change.
- Retrying a rejected push with the old confirmation: each confirmation is single-use and tied to one commit.
