# Planes de implementación — índice de oleadas

Spec: `docs/superpowers/specs/2026-08-26-rezetapp-design.md` (§17 define las
oleadas). Cada oleada tiene su plan; **se escribe al arrancar la oleada**,
cuando el código del que depende ya existe y se pueden citar rutas y firmas
reales. Escribir W2+ antes de W1 produciría planes inventados.

| Oleada | Plan | Estado | Paralelismo |
|---|---|---|---|
| W0 | `2026-08-26-w0-esqueleto.md` | hecho (mergeado 2026-08-26) | 1 agente, secuencial (8 tareas) |
| W1 | `2026-08-26-w1-contratos.md` | hecho (mergeado 2026-08-26) | 4 ramas ∥: schema+seed · domain · auth+hogar · validation+eventos |
| W2 | `2026-08-26-w2-modulos.md` | hecho (mergeado 2026-08-27) | 8 ramas ∥ (40 tareas + fix wave) |
| W3 | `2026-08-27-w3-bucle.md` | hecho (mergeado 2026-08-27) | (a) primero, luego 3 ramas ∥ (30 tareas + fix wave) |
| W4 | `2026-08-27-w4-extras.md` | hecho (mergeado 2026-08-27) | (a) primero, luego 5 ramas ∥ (36 tareas) |
| W5 | `2026-08-28-w5-remate.md` | hecho (mergeado 2026-08-28) | 3 ramas ∥ (15 tareas) |
| W6 | `2026-08-28-w6-identidad.md` | hecho (mergeado 2026-08-28) | 3 ramas ∥ (15 tareas) |

## Reglas de ejecución (todas las oleadas)

- Una rama/worktree por tarea paralela: `w<N>-<letra>-<slug>` desde `main`.
- Cada tarea termina con `pnpm check` verde, e2e si toca UI, y revisión por
  un agente revisor antes de merge. Merge a `main` en el orden que indique el
  plan; quien mergea resuelve conflictos y repite `pnpm check`.
- **Contratos congelados tras W1** (§17 del spec): `db/schema/*`,
  `lib/domain/types.ts` y firmas §5, `lib/validation/*`, nombres de
  `components/icons`, claves de `messages/*` (se añaden, no se renombran),
  rutas de `settings/*`. Cambiarlos exige una tarea explícita aprobada.
- Cada tarea añade sus claves i18n en su namespace y en ambos idiomas.
- Commits en español, imperativo, sin trailers; autor `JarssS8
  <adriancgs@gmail.com>`; `git grep -ilE 'c[l]aude'` vacío antes de cada commit.
- Si una tarea descubre un hueco en el spec, para, lo anota en el plan de la
  oleada bajo «Decisiones tomadas» y sigue con la opción más simple
  coherente con las siete reglas de `AGENTS.md`.

## Esbozo de W2–W5 (para dimensionar; se detalla en su momento)

### W2 · Módulos (8 ∥) — depende de W1 completa
| Rama | Entrega | Ficheros clave |
|---|---|---|
| (a) recipes | `lib/services/recipes.ts` (create/update/softDelete/get/search/importFromUrl/importFromText/exportAll), páginas `recipes/*`, editor con parser en vivo, `POST /api/v1/uploads` + `lib/uploads` | `components/recipes/*`, `lib/services/recipes*.ts`, `lib/uploads/*` |
| (b) foods | `lib/services/foods.ts` (resolve cascada, search trigram, upsertFromOff, correctManual), `lib/integrations/open-food-facts.ts`, `settings/foods` no existe: la gestión de alimentos vive en `recipes` (corrección inline) y `pantry` | `lib/services/foods.ts`, `lib/integrations/open-food-facts.ts` |
| (c) plan | `lib/services/plan.ts` (upsertEntries batch, move, skip, createLeftover, rangeWithNutrition, proposals create/approve/reject), calendario dnd-kit, panel de propuestas | `components/plan/*`, `app/(app)/plan/*` |
| (d) pantry | `lib/services/pantry.ts` (list, upsert, adjust atómico, expiring, lookupBarcode), UI por ubicación, escáner | `components/pantry/*`, `app/(app)/pantry/*` |
| (e) ai | `lib/ai/{provider,budget,models}.ts`, `tasks/*`, `settings/ai` con "probar" | `lib/ai/*`, `app/(app)/settings/ai/*` |
| (f) shoplist | `lib/integrations/shoplist.ts`, `lib/services/shopping.ts` (generate, push), `settings/shoplist` | `lib/integrations/shoplist.ts`, `lib/services/shopping.ts` |
| (g) settings | tokens API (crear/revocar, scopes, perfil MCP), apariencia (escribe `users.*` y cookie `rz_prefs`), miembros, hogar, passkeys | `lib/services/api-tokens.ts`, `app/(app)/settings/{tokens,appearance,members,household,passkeys}/*` |
| (h) mcp-min | `app/mcp/route.ts` con `WebStandardStreamableHTTPServerTransport`, auth Bearer, `get_household_context`, `search_recipes`, `get_recipe`; test `tools/list` | `app/mcp/route.ts`, `lib/mcp/{server,auth,tools/*}.ts` |

Orden de merge sugerido: (b) → (a) → (d) → (c) → (e) → (f) → (g) → (h).

### W3 · El bucle (4 ∥) — depende de W2
| Rama | Entrega |
|---|---|
| (a) cooking | `lib/services/cooking.ts` (`logCooked` transaccional §9.5 con `FOR UPDATE` + `GREATEST`, test de concurrencia), modo cocina `cook/[entryId]` y `cook/recipe/[id]`, wake lock, sobras |
| (b) today | página Hoy completa, anillo kcal, caducidades, `useHouseholdEvents` en Hoy/Plan/Despensa |
| (c) rest | todos los recursos §11, `openapi.json` desde zod, Swagger UI en `/api/docs` |
| (d) mcp-full | 12 tools basic + 6 full, prompts, recurso `household://context`, `set_meal_plan` → propuesta, docs de conexión, test opcional con servidor local |

### W4 · Extras (6 ∥) — depende de W3
(a) `plan-rules` en dominio + autorrelleno → propuesta `source='rules'`, evitar repetición · (b) temporizadores en pasos, voz, modo pared · (c) importar foto/PDF (visión), `scripts/import-mealie.ts`, `import-tandoor.ts`, `settings/data` · (d) etiquetas jerárquicas, colecciones, fusionar alimentos · (e) alérgenos por miembro en propuestas, estadísticas plan vs realidad · (f) PWA (manifest, SW shell), push VAPID en `app_settings`, `settings/notifications`.

### W5 · Remate (3 ∥) — depende de W4
(a) pulido: una sola lista desplegable (`components/ui/native-select.tsx`),
`components/ui/select.tsx` borrado, objetivo táctil de 44 px en campos y
desplegables con su contrato en `tests/contracts/ui-controls.test.ts`, campo de
presupuesto de tiempo · (b) deuda: migración repetible y con aislamiento de
fallos, el reexport de `db` fuera de `lib/services/push.ts`, el test del atajo
de alérgenos, prompts MCP por idioma · (c) integración: `e2e/loop.spec.ts` con
el bucle completo, `e2e/a11y.spec.ts` con axe en cinco pantallas × dos temas,
README es/en, `AGENTS.md`, roadmap y docs sin contradicciones con el código.
