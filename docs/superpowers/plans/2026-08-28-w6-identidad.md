# W6 · Identidad — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que RezetApp deje de parecer una plantilla de shadcn. El informe de identidad (`.superpowers/sdd/w6-inputs/informe-identidad.md`) diagnostica lo mismo desde cinco ángulos: la app se dibuja con **líneas grises en vez de superficies** (31 `border border-border` frente a 7 sombras, ninguna en una pantalla), el **verde huerta no existe fuera de los botones** (4 usos de `--acc-soft` en toda la app), doce pantallas comparten **la misma cabecera desnuda** (`<h1 className="text-2xl">`), las kcal —el dato estrella— se pintan con **dos tipografías según la pantalla**, los ocho vacíos son **párrafos grises**, la sesión de cocina **no es a pantalla completa** aunque el doc lo pida, y la primera pantalla que ve un usuario **no tiene ni logo ni color**. Además hay dos fallos de contraste reales (3,4:1 en los chips de «cocinado», 2,97:1 en el ámbar pequeño) y una clase muerta (`cn-toast`). El informe de animaciones (`.superpowers/sdd/w6-inputs/informe-animaciones.md`) añade cinco movimientos aceptados con valores exactos y **cinco rechazados que este plan no construye**. Al terminar, las cinco pantallas se distinguen entre sí de un vistazo, todo par de colores nuevo cumple AA en los dos temas y en los ocho acentos, y `docs/02-DISENO.md` describe lo que hay.

**Architecture:** Tres pistas sobre el código terminado de W0–W5. (a) **cimientos** no toca ni una pantalla: añade los tokens que faltan (superficie de dos capas, `--acc-line`, `--acc-soft-2`, `--surf-sunken`, `--line-2`, `--warn-ink`, escala tipográfica, duraciones y curvas), recalibra `--acc-ink` en tema claro porque hoy **incumple AA en tres de los ocho acentos**, escribe el contrato que calcula los ratios en un test, publica las utilidades (`.title-screen`, `.title-content`, `.num-hero`, `.pill-selected`, `.cn-toast`), da `strokeWidth` al icono compartido y estrena `<EmptyState>`. (b) **pantallas** consume todo eso: la píldora de seleccionado en los ocho sitios donde hoy hay gris sobre gris, el hero de Hoy con fecha, el plan sin punteado, el placeholder de receta con degradado por hash de id, la despensa diferenciada, la puerta de entrada con marca, y el barrido final de cabeceras y ámbar con su contrato. (c) **cocina y movimiento** saca la sesión de cocina del contenedor de la app con un `data-fullscreen` y `:has()` —sin layout paralelo, sin duplicar `requireSession()`—, añade las dos animaciones que viven en sus ficheros y cierra la oleada con las puertas completas (`check`, `build`, `e2e` con axe en los dos temas) y la documentación. **Las otras tres animaciones aceptadas viajan con la pantalla que tocan**, no con la pista (c): así ningún fichero lo escriben dos pistas.

**Tech Stack:** Next 16.3.3 (App Router) · React 19.2.8 · TS 5.9.3 strict (`exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`) · **Tailwind 4.3.3** (variantes `has-*`, `group-has-*` y la forma corta `(--var)` para valores arbitrarios, ya usada en `card.tsx` con `gap-(--card-spacing)`) + shadcn sobre Base UI 1.7.0 · `tw-animate-css` · `@dnd-kit/core` · sonner · next-intl 4.13.7 · vitest 4.1.11 (proyectos `unit`/`ui`/`db`) · Playwright 1.62.1 + `@axe-core/playwright` 4.13.0 · fuentes autoalojadas por `next/font/google` (**Outfit 600/700**, DM Sans 400/500/600/700, JetBrains Mono 500/600). **Cero dependencias nuevas en W6**: no entra ninguna librería de animación, ninguna fuente y ningún icono de terceros.

**Spec:** `docs/superpowers/specs/2026-08-26-rezetapp-design.md` §7 (accesibilidad: AA en ambos temas, foco visible, `prefers-reduced-motion`), §8 (modo cocina «pantalla completa, un paso»), §16 (axe en las cinco pantallas, claro y oscuro), §17 W5 (revisión de diseño contra `02-DISENO.md`, que W6 continúa). Documentos de diseño: `docs/02-DISENO.md` (dirección «Mercado», radios, tipografía, componentes que hay que resolver bien), `design-tokens.css` y `app/globals.css`. Informes de entrada, **vinculantes**: `.superpowers/sdd/w6-inputs/informe-identidad.md` (los cinco movimientos y la lista «Lo que NO tocar») y `.superpowers/sdd/w6-inputs/informe-animaciones.md` (las cinco animaciones aceptadas con sus valores y las cinco rechazadas).

## Global Constraints

Copiadas de W5 y ajustadas a esta oleada. **Los requisitos de cada tarea incluyen implícitamente esta sección.**

- Identificadores en **inglés**; comentarios, documentación y textos de usuario en **español** (y su par en inglés en `messages/en/*`). Nada de `any`. `exactOptionalPropertyTypes` y `noUncheckedIndexedAccess` **congelados**: nunca asignar `undefined` a una propiedad opcional; construir objetos y props condicionalmente (`description ? { description } : {}` al llamar a `<EmptyState>`).
- **Cero cambios de i18n.** `git diff main -- messages/` tiene que quedar **vacío** al cerrar la oleada, y `pnpm i18n:check` verde sin tocar nada. Ninguna tarea añade, renombra ni borra una clave: todas las superficies nuevas (vacíos, hero, marca de auth) reutilizan claves existentes (`today.emptyPlanLink`, `pantry.empty`, `cook.empty`, `recipes.empty`, `plan.empty`, `plan.proposals.empty`, `plan.shopping.empty`, `cook.noSteps`, `common.appName`). La fecha del hero se formatea con `Intl.DateTimeFormat`, que no es una clave. Si una tarea cree necesitar una clave, **para y lo pide**.
- **Contratos congelados**, sin excepción en W6:
  - `db/schema/**`, `db/migrations/**`, `db/seed/**`: **no se tocan**. Ninguna tarea ejecuta `pnpm db:generate`. W6 no lee ni escribe una sola columna nueva.
  - `lib/domain/**`: **no se toca**. W6 es estilo; ni una regla de escalado, nutrición o consolidación cambia. `pnpm test:domain-coverage` sigue al 100 % sin esfuerzo. El hash del placeholder de receta **no** es dominio (es presentación determinista) y vive en `components/recipes/recipe-placeholder.tsx` con su test.
  - `lib/validation/**`, `lib/services/**`, `lib/actions/**`, `app/api/**`, `lib/mcp/**`: **no se tocan**. W6 no cambia una firma de servidor. Si una tarea de interfaz cree necesitar un dato nuevo del servidor, para y lo pide.
  - `eslint.config.mjs`, `vitest.config.ts`, `global.d.ts`, `drizzle.config.ts`, `tsconfig.json`, `package.json`, `pnpm-lock.yaml`: **no se tocan**. Cero dependencias nuevas.
  - Nombres de `components/icons`: se pueden **añadir**, no renombrar ni borrar. W6 **no añade ninguno** (el informe es explícito: los iconos están bien, solo les falta estado y tamaño) y **no redibuja ninguno**: la Tarea 3 añade una prop `strokeWidth` a `components/icons/icon.tsx` con el 1.85 de siempre por defecto.
  - `SETTINGS_SECTIONS` y las nueve rutas de `app/(app)/settings/*`: intactas. La barra inferior sigue con **cinco** pestañas y `NAV_ITEMS` no cambia.
- **Lista «Lo que NO tocar» del informe de identidad, vinculante.** No se toca: el set de iconos (`components/icons/*`, salvo la prop `strokeWidth` de `icon.tsx`); **el bloque `--on-acc` por acento** de `app/globals.css:70-77` y su gemelo de `design-tokens.css` (frágil ante cambios de cascada y bien razonado: todo lo nuevo usa `--acc-ink`, nunca `--on-acc`); el patrón `--warn-soft` + `WarningIcon` del aviso de escalado no lineal (solo se le cambia el **color del texto** a `--warn-ink`, ni el fondo ni el icono ni la regla); `components/settings/settings-nav.tsx` (es el patrón que se copia, no el que se cambia — incluido su `min-h-10`, ver «Decisiones tomadas» 10); `components/recipes/recipe-card.tsx` en lo que ya funciona (radio 22, imagen a sangre, sombra al hover: solo cambian el placeholder y los tags); el mapeo explícito de radios de `globals.css:145-149` y su comentario; la carga de fuentes de `app/layout.tsx:8-10`; `.tabular` y todos los `min-h-11`/`min-w-11`/`min-h-14`.
- **Tokens primero, sin literales.** Todo color, sombra, degradado, tamaño tipográfico, duración y curva nuevo se declara como token **en los dos ficheros**: `design-tokens.css` (el documento) y `app/globals.css` (el que compila). Los dos tienen que decir lo mismo, y `tests/contracts/design-tokens.test.ts` (Tarea 1) falla si divergen. En los componentes solo se usan utilidades de token (`bg-acc-soft`, `text-acc-ink`, `text-warn-ink`, `border-acc-line`, `bg-surface-sunken`, `shadow-card`, `shadow-raised`, `shadow-hero`, `rounded-sm|md|lg|pill`, `duration-(--dur-2)`, `ease-(--ease-out)`) o clases de `@layer components`. Ni un hexadecimal ni una utilidad de la paleta cruda de Tailwind en JSX: `tests/contracts/ui-controls.test.ts` ya lo comprueba y **todo lo nuevo tiene que pasarlo tal cual está**.
- **AA ≥ 4,5:1 para texto, verificado con ratios calculados, en los dos temas y en los ocho acentos.** Es la restricción más dura de la oleada y la que más trabajo dirige: el `--acc-ink` actual (claro) da 3,60:1 con «miel» y 4,16:1 con «pistacho» sobre blanco —ya incumple AA hoy— y 3,24:1 sobre `--acc-soft`, que es justo el par que estrena la píldora de seleccionado. La Tarea 1 lo recalibra y deja los ratios anotados junto al token, igual que hace el bloque `--on-acc`. Ningún par nuevo entra sin su número en el plan y en el comentario del CSS.
- **`min-h-11` / `min-h-14` congelados**: la píldora, la franja de acento y el punto de ubicación viven *dentro* del área táctil; ninguna la reduce. `components/ui/{input,button,native-select}.tsx` siguen con `min-h-11` y `tests/contracts/ui-controls.test.ts` sigue verde.
- **Movimiento: solo las cinco filas aceptadas, con sus valores exactos.** Las cinco rechazadas del informe **no se construyen en W6 ni se «mejoran» de paso**: nada de animación en la barra inferior (`components/nav/bottom-bar.tsx`), en el stepper de raciones (`components/recipes/servings-stepper.tsx`), en la lista de comprobación de ingredientes (`components/cook/ingredient-checklist.tsx`), en el intercambio de propuesta aprobada/rechazada (`components/plan/proposal-card.tsx`) ni en la parrilla de recetas (`components/recipes/recipe-card.tsx`, sin *stagger*). `tests/contracts/motion.test.ts` (Tarea 14) lo fija por contrato. **`prefers-reduced-motion` ya está resuelto globalmente** en `app/globals.css:166-168` (`animation-duration`/`transition-duration: .01ms !important` sobre `*`): las cinco animaciones se apoyan en ese interruptor y **ninguna tarea escribe una media query de reduced-motion propia**.
- **UI**: Server Components por defecto; `'use client'` solo con interacción. `<EmptyState>` es un componente **sin estado y sin `'use client'`**, para que lo puedan usar tanto las páginas de servidor (`cook/page.tsx`, `recipes/page.tsx`, `proposals/page.tsx`) como las de cliente (`today-view`, `week-view`, `pantry-list`, `shopping-summary`). Cero literales JSX (`react/jsx-no-literals`).
- **Los e2e tienen que seguir verdes sin reescribirlos.** Los anclajes que **ninguna tarea puede romper** (con el spec que los usa entre paréntesis):
  - `data-testid="today-column"` en la cabecera del día de hoy, y esa cabecera tiene que seguir siendo **hija directa** del `<div>` de la columna: `e2e/loop.spec.ts:50` y `e2e/today.spec.ts:14` navegan con `locator('xpath=..')`.
  - `data-status` en las filas de Hoy y en los chips del plan (`e2e/loop.spec.ts:86`).
  - El `role="img"` del anillo con `aria-label` = `today.ringLabel` (`e2e/today.spec.ts:8`).
  - `data-testid="kcal-per-serving"` (`e2e/loop.spec.ts:32`) y `data-testid="cook-step"` con **`text-4xl` en modo pared** (`e2e/cook.spec.ts:70` y `components/cook/cook-session.test.tsx:89`).
  - La barra inferior sigue siendo un `<nav aria-label>` **visible en las cinco pestañas** (`e2e/a11y.spec.ts:26`) y **fuera de `<main>`** (`e2e/today.spec.ts:25` y `e2e/cook.spec.ts:40` acotan a `main` precisamente por eso).
  - El vacío de Hoy sigue exponiendo un **enlace** cuyo nombre accesible es `today.emptyPlanLink` (`e2e/today.spec.ts:9`).
  Donde una tarea cambia estructura, **la propia tarea enumera la actualización del spec** (solo la Tarea 13 lo necesita, y es una línea).
- **Tests**: `pnpm check` = `typecheck` + `lint` (0 avisos) + `i18n:check` + `vitest` + `test:domain-coverage`. Los componentes con estado van al proyecto `ui` (`*.test.tsx`); los contratos, a `tests/contracts/*.test.ts` (proyecto `unit`). **Ninguna tarea de W6 necesita Postgres**: no hay tests nuevos en el proyecto `db`.
- **E2E con Playwright**: `export LD_LIBRARY_PATH=$HOME/.local/chromium-deps/usr/lib/x86_64-linux-gnu` (ver `e2e/README.md`); sesión por autenticador virtual (`e2e/helpers/session.ts`). Sin `E2E_BASE_URL`, Playwright levanta `pnpm dev` contra la base de **desarrollo**, que necesita `pnpm db:migrate && pnpm db:seed`. Un solo proyecto, `mobile` (Pixel 7).
- **Cero telemetría y cero red externa nueva**: ni CDN, ni fuentes remotas, ni analítica, ni una imagen de terceros. El degradado del placeholder es CSS; el wordmark es tipografía.
- **Commits**: español, imperativo, cortos, **sin trailers** ni mención alguna a herramientas de IA en ficheros o mensajes. Antes de cada commit: `git grep -ilE 'c[l]aude'` vacío. Autor ya configurado (`JarssS8 <adriancgs@gmail.com>`).

---

## Fuera de alcance en W6, dicho de antemano

- **Las cinco animaciones rechazadas.** Están razonadas una a una en la Parte 2 del informe de animaciones y la razón es siempre la misma familia: frecuencia de uso (la barra inferior, 100+ al día) o función (el stepper y la lista de comprobación se tocan con prisa y con las manos mojadas: cualquier retardo es una regresión). No se construyen y el contrato de la Tarea 14 impide que se cuelen.
- **Un layout paralelo para la sesión de cocina.** El propio informe lo desaconseja («conviene hacerlo con un `data-` en el layout existente y no con un layout paralelo, para no duplicar `requireSession()`»). La Tarea 13 usa `:has()` sobre el layout que ya existe.
- **Fuentes, iconos o librerías nuevas.** El informe es explícito: «no hace falta ninguna fuente nueva — el problema no es qué fuentes hay, es que solo se usan a un tamaño». Y no hay librería de animación: cinco transiciones CSS no la justifican.
- **Rediseñar `docs/02-DISENO.md`.** La Tarea 15 lo **pone al día** (la regla tipográfica de las cifras, el patrón de seleccionado, la jerarquía superficie-sobre-línea, la sección de movimiento y el nuevo `--warn-ink`); no lo reescribe ni cambia la dirección «Mercado».
- **Tocar el bloque `--on-acc`.** Ver Global Constraints. Cualquier tentación de «arreglar el contraste ahí» es señal de que la tarea está usando el token equivocado: el correcto es `--acc-ink`.

---

## Orden de ejecución y merge

```
main (84c3923, W5 completa)
  ├─ w6-a-cimientos      (Tareas 1–4)     ← primero, sola
  ├─ w6-b-pantallas      (Tareas 5–11)    ← arranca cuando (a) está en main
  └─ w6-c-cocina-motion  (Tareas 12–15)   ← arranca ya; git merge main antes de T14
```

Orden de merge a `main`: **(a) → (b) → (c)**. Cada merge: `pnpm check` verde en `main`; `pnpm e2e` verde tras (b) y tras (c). Quien mergea resuelve conflictos y repite `pnpm check`.

**Por qué (a) va sola y primero.** Es la única pista que escribe en `design-tokens.css` y `app/globals.css`, y (b) y (c) consumen sus tokens y sus utilidades en casi todas sus tareas. Si (b) empezara en paralelo pintaría con clases que aún no existen y el *typecheck* no lo notaría (Tailwind no falla por una clase desconocida: simplemente no pinta nada). **Ruling W6-R1**: (b) **no arranca** hasta que (a) esté en `main` con `pnpm check` verde. Es la única dependencia dura de secuencia de la oleada, y a cambio (a) son cuatro tareas cortas de un solo fichero cada una.

**Por qué (c) puede arrancar a la vez que (b).** No comparten un solo fichero (ver la matriz de más abajo): (c) vive en `app/(app)/layout.tsx`, las dos rutas de `app/(app)/cook/**`, `components/cook/{cook-session,finish-dialog}.tsx`, `e2e/**` y los documentos. Pero (c) **sí depende de (a)** para `.title-content`, `<EmptyState>` y los tokens de movimiento: sus Tareas 12 y 13 se escriben contra la interfaz que (a) publica, así que (c) también espera a que (a) esté en `main`.

**Ruling W6-R2 (precedente W5-R1, W4-R1, W3-R1): (c) hace `git merge main` antes de la Tarea 14.** La Tarea 14 escribe `tests/contracts/motion.test.ts`, que recorre ficheros de (b) (`kcal-ring.tsx`, `pantry-list.tsx`, `day-column.tsx`, `bottom-bar.tsx`, `servings-stepper.tsx`, `ingredient-checklist.tsx`, `recipe-card.tsx`) para comprobar que las tres animaciones que viajan con (b) están y que las cinco rechazadas no. Y la Tarea 15 corre las puertas completas sobre la interfaz definitiva: si axe corriera antes de (b), auditaría pantallas que van a cambiar debajo.

**Las animaciones viajan con la pantalla, no con la pista.** El informe de animaciones lista cinco filas; tres de ellas viven en ficheros que reescribe (b) y dos en ficheros que reescribe (c):

| Fila del informe | Fichero | Pista | Tarea |
|---|---|---|---|
| #1 anillo de kcal | `components/today/kcal-ring.tsx` | (b) | 6 |
| #2 salida de fila de despensa | `components/pantry/{pantry-row,pantry-list}.tsx` | (b) | 9 |
| #3 asentado del chip y celda destino | `components/plan/day-column.tsx` | (b) | 7 |
| #4 cambio de paso | `components/cook/cook-session.tsx` | (c) | 14 |
| #5 bloque de sobras | `components/cook/finish-dialog.tsx` | (c) | 14 |

Repartirlas así es lo que hace que la matriz de solapes salga limpia: si (c) se quedara las cinco, tres ficheros los escribirían dos pistas a la vez.

Preparación de cada worktree (lo hace el orquestador):

```bash
git worktree add -b w6-<letra>-<slug> .worktrees/w6-<letra>-<slug> main
cp .env .worktrees/w6-<letra>-<slug>/.env
# y en ese .env: DATABASE_URL_TEST=…/rezetapp_test_<letra>
docker exec -i w1-a-schema-db-1 psql -U rezetapp -d rezetapp -c 'CREATE DATABASE rezetapp_test_<letra>'
cd .worktrees/w6-<letra>-<slug> && pnpm install --frozen-lockfile --offline
```

Bases de test: `rezetapp_test_a`, `_b`, `_c` (ya existen de oleadas anteriores; `CREATE DATABASE` fallará con «already exists» y eso está bien). **Las tres instalaciones son `--offline`**: W6 no añade dependencias. Docker crea `data/` como root dentro del worktree: antes de `git worktree remove`, `docker run --rm -v <dir>:/w alpine rm -rf /w/data`.

Los fragmentos que este plan cita están tomados de `84c3923`. **Si al abrir un worktree un fragmento ha cambiado de forma pero no de estructura, adapta y sigue; si ha cambiado la estructura (un componente partido en dos, un `data-testid` movido), para y avisa.**

## Pre-flight · ficheros e interfaces compartidos

| Fichero / interfaz | Pistas que lo tocan | Resolución en este plan |
|---|---|---|
| `db/**`, `lib/domain/**`, `lib/validation/**`, `lib/services/**`, `lib/actions/**`, `app/api/**`, `lib/mcp/**` | **ninguna** | W6 es interfaz. Ver Global Constraints. |
| `eslint.config.mjs`, `vitest.config.ts`, `package.json`, `pnpm-lock.yaml`, `global.d.ts` | **ninguna** | Cero dependencias y cero configuración nueva. |
| `messages/**` | **ninguna** | Cero claves. `git diff main -- messages/` vacío al cerrar. |
| `components/icons/**` | (a) T3 (solo `icon.tsx`, añade `strokeWidth`) | Ningún icono se redibuja, renombra ni borra. |
| `design-tokens.css`, `app/globals.css` | **(a) T1, T2, T4** | **Solo (a)**, y secuencial dentro de la pista. Ni (b) ni (c) escriben una línea de CSS global: si necesitan un token, es que falta una tarea en (a) — para y pide. |
| `tests/contracts/design-tokens.test.ts` | (a) T1 lo crea, T2 lo amplía | Fichero nuevo, solo (a). |
| `components/ui/{card,sheet,sonner}.tsx` | (a) T4 | Solo (a). |
| `components/ui/empty-state.tsx` | (a) T3 lo crea; (b) T6/T8/T9 y (c) T13 lo consumen | Se crea antes de que arranquen (b) y (c) (Ruling W6-R1): nadie más lo escribe. |
| `components/nav/bottom-bar.tsx` | (b) T5 | Solo (b). (c) lo **lee** desde el contrato de movimiento (T14) tras `git merge main`. |
| `components/recipes/{tag-filter,recipe-filters,collection-bar,recipe-card}.tsx` | (b) T5 y T8 | Misma pista, T8 después de T5. |
| `components/recipes/recipe-detail.tsx` | (b) T5 (numeración de pasos) y T8 (superficies) | Misma pista, secuencial. |
| `components/recipes/recipe-placeholder.tsx` | (b) T8 lo crea | Fichero nuevo, solo (b). |
| `components/today/{today-view,kcal-ring}.tsx` | (b) T5 (chip «cocinado») y T6 (hero + animación #1) | **Solo (b)**. La animación #1 viaja con T6, no con (c). |
| `components/plan/{day-column,entry-chip,week-view,proposal-card}.tsx` | (b) T5 (chip) y T7 (superficies + animación #3) | **Solo (b)**. La animación #3 viaja con T7. |
| `components/pantry/{pantry-list,pantry-row,expiring-panel}.tsx` | (b) T5 (cabeceras de ubicación) y T9 (filas + animación #2) | **Solo (b)**. La animación #2 viaja con T9. |
| `components/warn-panel.tsx` | (b) T6 lo crea; T9 lo consume | Fichero nuevo, solo (b). Une el panel de aviso duplicado palabra por palabra entre `today-view.tsx:89` y `expiring-panel.tsx:20`. |
| `app/(auth)/{layout,login/page,register/page,invite/[token]/page}.tsx` | (b) T10 | Solo (b). |
| `components/settings/settings-nav.tsx` | **ninguna** | Lista «NO tocar». Es el patrón que (b) T5 copia. |
| Las 21 cabeceras `<h1>` de `app/**` y `components/**` | (b) T11, **salvo `components/cook/cook-session.tsx`** | (b) barre veinte; la de la sesión de cocina la pone (c) T13, que reescribe ese fichero entero. |
| `tests/contracts/ui-controls.test.ts` | **(b) T10 y T11 lo amplían; (c) T13 borra una línea** | Dentro de (b) es secuencial. El solape entre pistas está declarado y es mínimo: T11 deja una lista de excepción de **un** elemento (`components/cook/cook-session.tsx`) con su comentario, y T13 la vacía. (c) mergea la última, así que el conflicto, si lo hay, es de una línea. |
| `app/(app)/layout.tsx`, `app/(app)/cook/**`, `components/cook/{cook-session,finish-dialog}.tsx` | (c) T12, T13, T14 | Solo (c). |
| `components/cook/ingredient-checklist.tsx` | (b) T11 (solo `text-warn` → `text-warn-ink`) | Solo (b). (c) **no** lo toca: su animación está rechazada. |
| `tests/contracts/motion.test.ts` | (c) T14 lo crea | Fichero nuevo. Recorre ficheros de (b): por eso T14 va después de `git merge main`. |
| `e2e/**` | (c) T13 (una línea de `cook.spec.ts`) y T15 (axe) | Solo (c). (b) no toca e2e: los anclajes de Global Constraints son su contrato. |
| `docs/02-DISENO.md`, `AGENTS.md`, `docs/superpowers/plans/README.md` | (c) T15 | Solo (c), y la última. |

---

## Contrato de la pista (a) que consumen (b) y (c)

Lo que (a) publica y las otras dos pistas consumen **sin volver a definirlo**. Si algo de aquí no existe al abrir un worktree de (b) o (c), es que (a) no está mergeada: para y avisa.

### Tokens nuevos (Tarea 1)

| Token | Claro | Oscuro | Para qué |
|---|---|---|---|
| `--acc-ink` (**recalibrado**) | `color-mix(in srgb, var(--acc) 60%, #0A2118)` | sin cambio (`68%`, `#F1EBE1`) | Texto de acento. AA en los ocho acentos sobre `--surf`, `--bg`, `--surf-2` y `--acc-soft`. |
| `--acc-line` | `color-mix(in srgb, var(--acc) 32%, var(--line))` | ídem | Borde teñido del estado seleccionado. Decorativo. |
| `--acc-soft-2` | `color-mix(in srgb, var(--acc) 20%, var(--surf))` | `color-mix(in srgb, var(--acc) 24%, var(--surf))` | Hover del estado seleccionado. |
| `--surf-sunken` | `var(--surf-2)` | `var(--surf-2)` | Fondo semántico de **agrupador hundido** (hueco vacío del plan, caja de vacío). Separa el tercer uso de `--surf-2`. |
| `--line-2` | `color-mix(in srgb, var(--line) 55%, var(--surf))` | `var(--line)` | Borde de tarjeta: casi invisible en claro (la sombra hace el trabajo), intacto en oscuro (donde la sombra no se ve). |
| `--warn-ink` | `color-mix(in srgb, var(--warn) 65%, #0A2118)` | `color-mix(in srgb, var(--warn) 85%, #F1EBE1)` | Texto de aviso pequeño. Arregla el 2,97:1 sobre blanco y el 2,58:1 sobre `--warn-soft`. |
| `--sh-card` (**reforzado**) | dos capas, ver T1 | dos capas | Tarjeta en reposo. |
| `--sh-raised` | dos capas | dos capas | Hover / elemento levantado / toast. |
| `--sh-hero` (**reforzado**) | dos capas | dos capas | Hero de Hoy, hoja inferior, tarjeta de auth. |
| `--grad-food` | `linear-gradient(var(--grad-food-angle, 135deg), var(--acc-soft), var(--surf-2))` | ídem | Placeholder de receta sin foto. |
| `--fs-title` / `--fs-hero` / `--fs-num` | `1.875rem` / `2.75rem` / `2rem` | ídem | Cabecera de pantalla / número del anillo / cifra destacada. |
| `--dur-1` / `--dur-2` / `--dur-3` | `140ms` / `200ms` / `500ms` | ídem | Cambio de paso / asentado y salida / anillo. |
| `--ease-out` / `--ease-in` | `cubic-bezier(.23,1,.32,1)` / `cubic-bezier(.4,0,1,1)` | ídem | Curvas del informe de animaciones. |

Utilidades de Tailwind que quedan disponibles (por `@theme inline`): `bg-acc-soft`, `bg-acc-soft-2`, `border-acc-line`, `text-warn-ink`, `bg-surface-sunken`, `border-line-2`, `shadow-raised`, `bg-(image:--grad-food)`. Las duraciones y curvas se escriben con la forma corta de Tailwind 4: `duration-(--dur-2)`, `ease-(--ease-out)`.

### Clases de `@layer components` (Tarea 2)

```css
.title-screen   /* cabecera de pantalla: Outfit 700, --fs-title, -0.02em, 1.05, balance */
.title-content  /* título de contenido: Outfit 600, 1.5rem, -0.01em, 1.15, balance */
.num-hero       /* cifra protagonista: Outfit 600, --fs-hero, tabular-nums, 1, -0.02em */
.num-lead       /* cifra destacada en contenido: Outfit 600, --fs-num, tabular-nums */
.pill-selected  /* fondo --acc-soft, texto --acc-ink, borde --acc-line, hover --acc-soft-2 */
.cn-toast       /* el toast con las superficies del proyecto (hoy la clase está muerta) */
```

Regla de uso de `.pill-selected`, la misma en los ocho sitios: el elemento lleva **siempre** `border` y `rounded-pill` (o `rounded-sm` donde ya lo tuviera) y el ternario elige entre `'pill-selected'` y las clases de reposo; **y siempre acompaña un `aria-current="page"` o un `aria-pressed`**, porque el color nunca es la única señal.

### `<EmptyState>` (Tarea 3)

```tsx
export interface EmptyStateProps {
  icon: ComponentType<IconProps>
  title: string
  description?: string
  action?: ReactNode
}
export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps)
```

Sin `'use client'`, sin estado: sirve igual en una página de servidor y dentro de un componente de cliente. Con `exactOptionalPropertyTypes`, los consumidores **no pasan `undefined`**: o pasan la prop o no la pasan.

---

### Task 1: Los tokens que faltan, y el `--acc-ink` que ya incumplía AA

El vocabulario de profundidad del proyecto existe y no se usa: `--sh-card` y `--sh-hero` aparecen **siete veces en todo el repositorio y ninguna en una pantalla**. Y donde sí se usan casi no se ven, porque son de una sola capa y muy abiertas (`0 2px 10px -7px` con 22 % de opacidad) mientras `--bg` y `--surf` se separan un 2 %. El resultado es el que describe el informe: una «tarjeta» es un rectángulo con una raya `#EAEEEC`.

Pero el hallazgo que manda en esta tarea no está en el informe, y salió al calcular los ratios del par que estrena el movimiento 1: **`--acc-ink` incumple AA hoy, en tema claro, en tres de los ocho acentos**. Con la mezcla actual (78 % del acento sobre `#0A2118`):

| Acento | `--acc-ink` sobre `--surf` | sobre `--acc-soft` |
|---|---|---|
| huerta | 4,72:1 ✓ | **4,10:1** ✗ |
| miel | **3,60:1** ✗ | **3,24:1** ✗ |
| tomate | 5,87:1 ✓ | 4,98:1 ✓ |
| pistacho | **4,16:1** ✗ | **3,69:1** ✗ |
| higo | 6,34:1 ✓ | 5,36:1 ✓ |
| berenjena | 6,84:1 ✓ | 5,77:1 ✓ |
| arándano | 5,70:1 ✓ | 4,89:1 ✓ |
| canela | 5,41:1 ✓ | 4,67:1 ✓ |

La pasada de axe de W5 no lo vio porque solo recorre el acento por defecto, y con huerta sobre blanco el 4,72:1 pasa por los pelos. Con la píldora de seleccionado, `--acc-ink` sobre `--acc-soft` pasa a ser el par más repetido de la app: hay que arreglarlo antes de usarlo. Bajando la mezcla al **60 %** el peor caso (miel) sube a **4,62:1 sobre `--acc-soft`, 5,14:1 sobre `--surf` y 4,68:1 sobre `--surf-2`**; en oscuro el token ya cumplía holgadamente (peor caso berenjena, 5,25:1 sobre `--acc-soft`) y **no se toca**.

El ámbar tiene el mismo problema y el informe sí lo señala: `text-warn` sobre blanco es 2,97:1 y sobre `--warn-soft` —el fondo con el que casi siempre convive— **2,58:1**. `--warn-ink` al 65 % da 5,44:1 sobre `--surf`, 5,26:1 sobre `--bg`, 4,95:1 sobre `--surf-2` y **4,74:1 sobre `--warn-soft`**.

**Files:**
- Modify: `design-tokens.css`, `app/globals.css`
- Create: `tests/contracts/design-tokens.test.ts`

**Interfaces:**
- Consumes: nada. Es CSS y un test que lee CSS.
- Produces: los tokens y las utilidades de la tabla del «Contrato de la pista (a)».

- [ ] **Step 1: Escribir el test que falla** — `tests/contracts/design-tokens.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Contrato de tokens. Hace dos cosas que ningún otro test hace:
//
// 1) Paridad. `design-tokens.css` es el documento y `app/globals.css` es lo que
//    compila; AGENTS.md exige que digan lo mismo. Aquí se comprueba token a
//    token, no de oídas.
// 2) Contraste. Las mezclas de color viven en CSS (`color-mix`), donde nadie
//    puede medirlas. Este test las reproduce en TypeScript y calcula el ratio
//    WCAG de cada par que la interfaz pinta de verdad, para los OCHO acentos y
//    los DOS temas. Si alguien retoca un porcentaje "porque se ve mejor", el
//    test dice exactamente qué acento se quedó por debajo de 4,5:1.
//
// La aritmética de `color-mix(in srgb, A p%, B)` es una interpolación lineal en
// sRGB sin premultiplicar (los dos colores son opacos): mix(a, b, p) = a*p + b*(1-p).
const ROOT = join(import.meta.dirname, '..', '..')
const DOC = readFileSync(join(ROOT, 'design-tokens.css'), 'utf8')
const COMPILED = readFileSync(join(ROOT, 'app/globals.css'), 'utf8')

type Rgb = readonly [number, number, number]

function hex(value: string): Rgb {
  const h = value.replace('#', '')
  const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h
  return [0, 2, 4].map((i) => Number.parseInt(full.slice(i, i + 2), 16)) as unknown as Rgb
}

function mix(a: string, b: string, ratioA: number): Rgb {
  const [ar, ag, ab] = hex(a)
  const [br, bg, bb] = hex(b)
  return [ar * ratioA + br * (1 - ratioA), ag * ratioA + bg * (1 - ratioA), ab * ratioA + bb * (1 - ratioA)]
}

function luminance(c: Rgb): number {
  const [r, g, b] = c.map((v) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }) as unknown as Rgb
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function ratio(a: Rgb, b: Rgb): number {
  const [x, y] = [luminance(a) + 0.05, luminance(b) + 0.05]
  return Math.max(x, y) / Math.min(x, y)
}

// Los ocho acentos de docs/02-DISENO.md. Duplicarlos aquí es deliberado: si
// alguien cambia uno en el CSS sin actualizar esta lista, el primer test falla.
const ACCENTS = {
  huerta: '#2F9E6B',
  miel: '#D99A2B',
  tomate: '#CE5540',
  pistacho: '#7FA344',
  higo: '#B4557A',
  berenjena: '#8C5A9E',
  arandano: '#4A7FB5',
  canela: '#A9764A',
} as const

const LIGHT = { surf: '#FFFFFF', bg: '#FBFBFC', surf2: '#F2F5F3', text: '#161C1A', text2: '#485450', warn: '#D9803A' }
const DARK = { surf: '#1F1B16', bg: '#16130F', surf2: '#2A241D', text: '#F1EBE1', text2: '#BBB0A1', warn: '#E8A33D' }

// Mezclas espejo de las del CSS. Cambiar una aquí sin cambiarla allí hace
// fallar el test de paridad de abajo, que busca la cadena literal.
const accSoft = (acc: string, dark: boolean) => (dark ? mix(acc, DARK.bg, 0.17) : mix(acc, LIGHT.surf, 0.13))
const accInk = (acc: string, dark: boolean) => (dark ? mix(acc, DARK.text, 0.68) : mix(acc, '#0A2118', 0.6))
const warnInk = (dark: boolean) => (dark ? mix(DARK.warn, DARK.text, 0.85) : mix(LIGHT.warn, '#0A2118', 0.65))
const warnSoft = (dark: boolean) => (dark ? mix(DARK.warn, DARK.surf, 0.14) : mix(LIGHT.warn, LIGHT.surf, 0.14))

describe('tokens de diseño', () => {
  it('el documento y la hoja que compila declaran los mismos tokens de W6', () => {
    const shared = [
      '--acc-ink: color-mix(in srgb, var(--acc) 60%, #0A2118)',
      '--acc-line: color-mix(in srgb, var(--acc) 32%, var(--line))',
      '--acc-soft-2: color-mix(in srgb, var(--acc) 20%, var(--surf))',
      '--warn-ink: color-mix(in srgb, var(--warn) 65%, #0A2118)',
      '--surf-sunken: var(--surf-2)',
      '--line-2: color-mix(in srgb, var(--line) 55%, var(--surf))',
      '--fs-title: 1.875rem',
      '--fs-hero: 2.75rem',
      '--fs-num: 2rem',
      '--dur-1: 140ms',
      '--dur-2: 200ms',
      '--dur-3: 500ms',
      '--ease-out: cubic-bezier(.23, 1, .32, 1)',
      '--ease-in: cubic-bezier(.4, 0, 1, 1)',
      '--grad-food: linear-gradient(var(--grad-food-angle, 135deg), var(--acc-soft), var(--surf-2))',
    ]
    for (const token of shared) {
      expect(DOC, `design-tokens.css debe declarar ${token}`).toContain(token)
      expect(COMPILED, `app/globals.css debe declarar ${token}`).toContain(token)
    }
  })

  it('los tokens de tema oscuro se declaran dos veces en la hoja que compila', () => {
    // La media query y el [data-theme="dark"] explícito: el patrón que ya usan
    // todos los tokens de tema desde W0. Contar ocurrencias evita el fallo
    // clásico de arreglar solo una de las dos ramas.
    for (const token of ['--warn-ink: color-mix(in srgb, var(--warn) 85%, #F1EBE1)', '--line-2: var(--line)', '--acc-soft-2: color-mix(in srgb, var(--acc) 24%, var(--surf))']) {
      expect(COMPILED.split(token).length - 1, token).toBe(2)
    }
  })

  it('--acc-ink cumple AA sobre superficie, fondo, hundido y acento suave en los ocho acentos y los dos temas', () => {
    const failures: string[] = []
    for (const [name, acc] of Object.entries(ACCENTS)) {
      for (const dark of [false, true]) {
        const theme = dark ? DARK : LIGHT
        const ink = accInk(acc, dark)
        const pairs = {
          surf: hex(theme.surf),
          bg: hex(theme.bg),
          'surf-2': hex(theme.surf2),
          'acc-soft': accSoft(acc, dark),
        }
        for (const [where, bgColor] of Object.entries(pairs)) {
          const r = ratio(ink, bgColor)
          if (r < 4.5) failures.push(`${name}/${dark ? 'oscuro' : 'claro'} acc-ink sobre ${where}: ${r.toFixed(2)}:1`)
        }
      }
    }
    expect(failures).toEqual([])
  })

  it('--warn-ink cumple AA sobre superficie, fondo, hundido y el ámbar tenue en los dos temas', () => {
    const failures: string[] = []
    for (const dark of [false, true]) {
      const theme = dark ? DARK : LIGHT
      const ink = warnInk(dark)
      const pairs = { surf: hex(theme.surf), bg: hex(theme.bg), 'surf-2': hex(theme.surf2), 'warn-soft': warnSoft(dark) }
      for (const [where, bgColor] of Object.entries(pairs)) {
        const r = ratio(ink, bgColor)
        if (r < 4.5) failures.push(`${dark ? 'oscuro' : 'claro'} warn-ink sobre ${where}: ${r.toFixed(2)}:1`)
      }
    }
    expect(failures).toEqual([])
  })

  it('el texto corriente sigue siendo legible sobre el acento suave del hero', () => {
    for (const [name, acc] of Object.entries(ACCENTS)) {
      for (const dark of [false, true]) {
        const theme = dark ? DARK : LIGHT
        const soft = accSoft(acc, dark)
        expect(ratio(hex(theme.text), soft), `${name} texto/acc-soft`).toBeGreaterThanOrEqual(4.5)
        expect(ratio(hex(theme.text2), soft), `${name} texto-2/acc-soft`).toBeGreaterThanOrEqual(4.5)
      }
    }
  })

  it('el bloque --on-acc por acento sigue intacto en los dos ficheros', () => {
    // Lista "NO tocar" del informe de identidad: --on-acc depende del acento,
    // no del tema, y su cascada es frágil. Este test es el seguro.
    for (const line of [
      '[data-accent="huerta"]    { --acc: #2F9E6B; --on-acc: #12261C; }',
      '[data-accent="higo"]      { --acc: #B4557A; --on-acc: #FFFFFF; }',
      '[data-accent="canela"]    { --acc: #A9764A; --on-acc: #0A100D; }',
    ]) {
      expect(DOC).toContain(line)
      expect(COMPILED).toContain(line)
    }
  })
})
```

- [ ] **Step 2: Ejecutar y ver el fallo**

Run: `pnpm exec vitest run --project unit tests/contracts/design-tokens.test.ts`
Expected: FAIL. El primer caso falla en `--acc-ink: color-mix(in srgb, var(--acc) 60%, #0A2118)` (hoy dice `78%`), y el tercero enumera **seis** pares por debajo de 4,5:1 (huerta, miel y pistacho sobre `--acc-soft`, más miel y pistacho sobre `--surf` y `--surf-2`). Es exactamente el fallo que describe la introducción de la tarea: el test se escribe **antes** para que quede escrito que el token estaba mal, no solo que se cambió.

- [ ] **Step 3: Implementar en `app/globals.css`** — en el bloque `:root` de tokens (el que empieza en `--acc: #2F9E6B`), sustituir la línea de `--acc-ink` y añadir los tokens nuevos justo detrás de `--on-acc`:

```css
  --acc-soft: color-mix(in srgb, var(--acc) 13%, #FFFFFF);
  /* Tinta de acento para TEXTO. Bajó del 78% al 60% en W6: al 78% el ratio
     sobre --surf era 3,60:1 con "miel" y 4,16:1 con "pistacho" (por debajo de
     AA), y sobre --acc-soft -el par que estrena la píldora de seleccionado-
     bajaba a 3,24:1. Al 60% el peor de los ocho (miel) da 5,14:1 sobre --surf,
     4,68:1 sobre --surf-2 y 4,62:1 sobre --acc-soft. NO subir sin volver a
     pasar tests/contracts/design-tokens.test.ts. */
  --acc-ink: color-mix(in srgb, var(--acc) 60%, #0A2118);
  /* Borde teñido del estado seleccionado. Decorativo: la píldora nunca dice el
     estado solo con el borde (lleva fondo, tinta y aria-current/aria-pressed). */
  --acc-line: color-mix(in srgb, var(--acc) 32%, var(--line));
  --acc-soft-2: color-mix(in srgb, var(--acc) 20%, var(--surf));
  --on-acc: #12261C; /* por defecto (huerta): tinta oscura, 4.7:1 (AA) */
  /* Ámbar para texto pequeño. El --warn crudo es 2,97:1 sobre blanco y 2,58:1
     sobre --warn-soft: sirve para bordes, iconos y fondos, no para leer. Al 65%
     da 5,44:1 sobre --surf, 4,95:1 sobre --surf-2 y 4,74:1 sobre --warn-soft. */
  --warn-ink: color-mix(in srgb, var(--warn) 65%, #0A2118);
  /* Fondo semántico del agrupador hundido (hueco vacío del plan, caja de
     vacío). Hasta W6 --surf-2 hacía tres trabajos distintos; este alias separa
     uno para que se pueda mover sin arrastrar los otros dos. */
  --surf-sunken: var(--surf-2);
  /* Borde de tarjeta. En claro casi desaparece y manda la sombra; en oscuro la
     sombra no se ve, así que se queda el borde entero (ver el bloque oscuro). */
  --line-2: color-mix(in srgb, var(--line) 55%, var(--surf));
  --r-lg: 22px;
  --r-md: 16px;
  --r-sm: 12px;
  /* Sombras de dos capas: un filo corto que dibuja el canto y una difusa que
     apoya la pieza. De una sola capa (lo de W0) una tarjeta sobre un fondo que
     se separa un 2% de la superficie no se lee como tarjeta. */
  --sh-card: 0 1px 2px -1px rgba(22, 28, 26, .10), 0 4px 12px -6px rgba(22, 28, 26, .18);
  --sh-raised: 0 2px 4px -2px rgba(22, 28, 26, .12), 0 10px 24px -12px rgba(22, 28, 26, .22);
  --sh-hero: 0 2px 6px -3px rgba(22, 28, 26, .12), 0 14px 32px -18px rgba(22, 28, 26, .26);
  /* Degradado del placeholder de receta. El ángulo lo fija quien lo pinta con
     --grad-food-angle (hash del id: recipe-placeholder.tsx); sin él, 135deg. */
  --grad-food: linear-gradient(var(--grad-food-angle, 135deg), var(--acc-soft), var(--surf-2));
  /* Escala tipográfica. Hasta W6 la app entera vivía entre text-2xl y text-xs. */
  --fs-title: 1.875rem;
  --fs-hero: 2.75rem;
  --fs-num: 2rem;
  /* Movimiento. Los tres presupuestos del informe de animaciones: 140ms para el
     cambio de paso (se toca decenas de veces por sesión), 200ms para asentados y
     salidas, 500ms para el anillo. prefers-reduced-motion ya los anula abajo. */
  --dur-1: 140ms;
  --dur-2: 200ms;
  --dur-3: 500ms;
  --ease-out: cubic-bezier(.23, 1, .32, 1);
  --ease-in: cubic-bezier(.4, 0, 1, 1);
```

- [ ] **Step 4: Implementar las dos ramas del tema oscuro en `app/globals.css`** — en `@media (prefers-color-scheme: dark) :root:not([data-theme="light"])` **y** en `:root[data-theme="dark"]`, añadir detrás de `--acc-ink` (que **no cambia** en oscuro):

```css
    --acc-line: color-mix(in srgb, var(--acc) 32%, var(--line));
    --acc-soft-2: color-mix(in srgb, var(--acc) 24%, var(--surf));
    --warn-ink: color-mix(in srgb, var(--warn) 85%, #F1EBE1);
    --surf-sunken: var(--surf-2);
    /* En "Noche suave" la sombra apenas se lee: el borde entero se queda, y el
       escalón --surf (#1F1B16) sobre --bg (#16130F) hace el resto. */
    --line-2: var(--line);
    --sh-card: 0 1px 2px -1px rgba(0, 0, 0, .55), 0 4px 12px -6px rgba(0, 0, 0, .65);
    --sh-raised: 0 2px 4px -2px rgba(0, 0, 0, .60), 0 10px 24px -12px rgba(0, 0, 0, .70);
    --sh-hero: 0 2px 6px -3px rgba(0, 0, 0, .60), 0 14px 32px -18px rgba(0, 0, 0, .75);
```

(Las líneas viejas de `--sh-card` y `--sh-hero` de esos dos bloques se sustituyen; `--grad-food`, `--fs-*`, `--dur-*` y `--ease-*` **no se repiten** en oscuro porque no dependen del tema.)

- [ ] **Step 5: Publicar las utilidades en `@theme inline`** — en `app/globals.css`, junto a `--color-warn-soft` y `--color-surface-2`:

```css
  --color-acc-soft: var(--acc-soft);
  --color-acc-soft-2: var(--acc-soft-2);
  --color-acc-line: var(--acc-line);
  --color-warn-ink: var(--warn-ink);
  --color-surface-sunken: var(--surf-sunken);
  --color-line-2: var(--line-2);
  --shadow-raised: var(--sh-raised);
```

`--shadow-card` y `--shadow-hero` ya estaban mapeados y no cambian de nombre: al reforzar el token, `shadow-card` y `shadow-hero` mejoran en los siete sitios que ya los usan sin tocar un componente.

- [ ] **Step 6: Espejar el documento en `design-tokens.css`** — el mismo juego de tokens, con la misma agrupación y los mismos comentarios abreviados. `design-tokens.css` no tiene `@theme` ni `--danger`/`--overlay`: **solo se copian los tokens**, no el mapeo de Tailwind. Los tres bloques a tocar son `:root`, la media query oscura y `:root[data-theme="dark"]`, exactamente como en la hoja que compila.

- [ ] **Step 7: Ejecutar**

Run: `pnpm exec vitest run --project unit tests/contracts/design-tokens.test.ts && pnpm exec vitest run --project unit tests/contracts/ui-controls.test.ts`
Expected: PASS los seis casos del contrato de tokens y los tres del de controles.

- [ ] **Step 8: Comprobar a ojo que la app sigue compilando y pintando**

Run: `pnpm build`
Expected: build verde. Tailwind no falla por clases inexistentes, así que esto solo confirma que el CSS es válido; el trabajo de verdad lo hacen los ratios del paso 7.

- [ ] **Step 9: Commit**

```bash
pnpm exec tsc --noEmit && pnpm lint
git add design-tokens.css app/globals.css tests/contracts/design-tokens.test.ts
git commit -m "Añade los tokens de superficie, acento y aviso, y sube la tinta de acento a AA"
```

---

### Task 2: Las utilidades de título, cifra, seleccionado y toast

Doce pantallas comparten `<h1 className="text-2xl">` y la app no tiene un solo tratamiento *display*: la escala real es `2xl / lg / base / sm / xs`. Y el dato más característico del producto se pinta con dos tipografías distintas según dónde caiga: `today/kcal-ring.tsx:41` usa `.tabular` (JetBrains Mono) y `recipes/nutrition-row.tsx:21` usa `font-display` (Outfit), porque la utilidad gana a la clase de `@layer base`.

**Esa tensión se resuelve aquí y en una sola dirección: Outfit para la cifra protagonista, JetBrains Mono para las cifras en columna.** El informe la deja abierta con una recomendación; este plan la cierra (ver «Decisiones tomadas» 1) y la Tarea 15 lo escribe en `docs/02-DISENO.md`, porque hoy el documento dice «Datos: cantidades, kcal, fechas» a secas y esa frase es la que produjo las dos tipografías.

De paso se define `.cn-toast`, la clase que `components/ui/sonner.tsx:21` aplica desde W0 y que **no existe en ningún fichero del proyecto** (ver «Decisiones tomadas» 6: se define, no se borra).

**Files:**
- Modify: `app/globals.css`, `design-tokens.css`, `tests/contracts/design-tokens.test.ts`

**Interfaces:**
- Consumes: los tokens de la Tarea 1.
- Produces: `.title-screen`, `.title-content`, `.num-hero`, `.num-lead`, `.pill-selected`, `.cn-toast`.

- [ ] **Step 1: Ampliar el test que falla** — en `tests/contracts/design-tokens.test.ts`, añadir un `describe` nuevo al final:

```ts
describe('utilidades de composición', () => {
  it('la hoja que compila define las seis clases de W6 en @layer components', () => {
    for (const cls of ['.title-screen', '.title-content', '.num-hero', '.num-lead', '.pill-selected', '.cn-toast']) {
      expect(COMPILED, `falta ${cls}`).toContain(`${cls} {`)
    }
  })

  it('las cifras protagonistas se pintan con la familia display, no con la monoespaciada', () => {
    // La incoherencia que W6 cierra: kcal-ring usaba .tabular (JetBrains Mono)
    // y nutrition-row font-display (Outfit) para el MISMO dato. La regla queda
    // escrita aquí y en docs/02-DISENO.md: Outfit para la cifra protagonista,
    // JetBrains Mono (.tabular) para las cifras en columna.
    const heroBlock = COMPILED.slice(COMPILED.indexOf('.num-hero {'), COMPILED.indexOf('.num-hero {') + 260)
    expect(heroBlock).toContain('var(--f-display)')
    expect(heroBlock).toContain('tabular-nums')
    expect(heroBlock).not.toContain('var(--f-mono)')
  })

  it('el toast tiene estilo propio: la clase que aplica sonner existe', () => {
    // components/ui/sonner.tsx:21 aplica `cn-toast` desde W0 y la clase no
    // estaba definida en ningún sitio: los toasts salían con el aspecto por
    // defecto de la librería, sombra dura incluida.
    expect(readFileSync(join(ROOT, 'components/ui/sonner.tsx'), 'utf8')).toContain('cn-toast')
    expect(COMPILED).toContain('.cn-toast {')
  })
})
```

- [ ] **Step 2: Ejecutar y ver el fallo**

Run: `pnpm exec vitest run --project unit tests/contracts/design-tokens.test.ts`
Expected: FAIL — los tres casos nuevos: no existe ninguna de las seis clases.

- [ ] **Step 3: Implementar** — en `app/globals.css`, dentro del `@layer components` que ya existe (el de `.accent-swatch`), añadir:

```css
  /* Cabecera de pantalla. Las doce pantallas la comparten: es lo que hace que
     "dónde estoy" se lea sin leer. Outfit 700 es el peso más alto que carga
     app/layout.tsx; no se pide ninguno nuevo. `text-wrap: balance` en vez de
     `truncate` porque los títulos en inglés y los nombres de receta largos
     tienen que caber en dos líneas, no cortarse. */
  .title-screen {
    font-family: var(--f-display);
    font-weight: 700;
    font-size: var(--fs-title);
    line-height: 1.05;
    letter-spacing: -0.02em;
    text-wrap: balance;
  }

  /* Título de contenido dentro de una pantalla: el nombre de la receta, el de
     la sesión de cocina, el de la puerta de entrada. Un escalón por debajo de
     .title-screen para que no compitan cuando salen juntos. */
  .title-content {
    font-family: var(--f-display);
    font-weight: 600;
    font-size: 1.5rem;
    line-height: 1.15;
    letter-spacing: -0.01em;
    text-wrap: balance;
  }

  /* La cifra protagonista (kcal cocinadas del anillo). Outfit, no mono: un
     número hero monoespaciado se lee como panel de control, justo lo que la
     dirección "Mercado" evita (docs/02-DISENO, "Qué evitar"). `tabular-nums`
     se queda porque el número cambia en vivo y no debe bailar de ancho. */
  .num-hero {
    font-family: var(--f-display);
    font-weight: 600;
    font-size: var(--fs-hero);
    line-height: 1;
    letter-spacing: -0.02em;
    font-variant-numeric: tabular-nums;
  }

  /* Misma voz, un escalón menos: las kcal por ración de la ficha de receta. */
  .num-lead {
    font-family: var(--f-display);
    font-weight: 600;
    font-size: var(--fs-num);
    line-height: 1.05;
    letter-spacing: -0.02em;
    font-variant-numeric: tabular-nums;
  }

  /* EL estado seleccionado de la app. Hasta W6 solo lo tenía settings-nav.tsx
     y el resto se conformaba con gris sobre gris (los filtros de recetas) o
     con un cambio de color de texto (la barra inferior). Nunca es la única
     señal: quien lo use pone además aria-current o aria-pressed. */
  .pill-selected {
    background: var(--acc-soft);
    color: var(--acc-ink);
    border-color: var(--acc-line);
  }
  .pill-selected:hover {
    background: var(--acc-soft-2);
  }

  /* La clase que sonner aplica desde W0 (components/ui/sonner.tsx:21) y que no
     existía: el toast salía con la sombra dura de la librería. */
  .cn-toast {
    border-radius: var(--r-md);
    box-shadow: var(--sh-raised);
    font-family: var(--f-body);
  }
```

- [ ] **Step 4: Espejar en `design-tokens.css`** — el documento no tiene `@layer components` (es CSS plano para pegar). Se añade al final, detrás del bloque `body`, con una nota:

```css
/* Utilidades de composición. En la app viven en el @layer components de
   app/globals.css; aquí van planas para que este fichero siga siendo pegable
   tal cual. Las dos hojas tienen que decir lo mismo (contrato en
   tests/contracts/design-tokens.test.ts). */
.title-screen { font-family: var(--f-display); font-weight: 700; font-size: var(--fs-title); line-height: 1.05; letter-spacing: -0.02em; text-wrap: balance; }
.title-content { font-family: var(--f-display); font-weight: 600; font-size: 1.5rem; line-height: 1.15; letter-spacing: -0.01em; text-wrap: balance; }
.num-hero { font-family: var(--f-display); font-weight: 600; font-size: var(--fs-hero); line-height: 1; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
.num-lead { font-family: var(--f-display); font-weight: 600; font-size: var(--fs-num); line-height: 1.05; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
.pill-selected { background: var(--acc-soft); color: var(--acc-ink); border-color: var(--acc-line); }
.pill-selected:hover { background: var(--acc-soft-2); }
.cn-toast { border-radius: var(--r-md); box-shadow: var(--sh-raised); font-family: var(--f-body); }
```

- [ ] **Step 5: Ejecutar**

Run: `pnpm exec vitest run --project unit tests/contracts/design-tokens.test.ts && pnpm build`
Expected: PASS los nueve casos y build verde.

- [ ] **Step 6: Commit**

```bash
pnpm exec tsc --noEmit && pnpm lint
git add app/globals.css design-tokens.css tests/contracts/design-tokens.test.ts
git commit -m "Define las utilidades de título, cifra y estado seleccionado"
```

---

### Task 3: El icono gana estados y la app estrena un vacío con cara

Los sesenta y pico iconos a medida son, dice el informe, «exactamente lo que pide `docs/02-DISENO.md` y lo que separa esto de una plantilla». No se redibuja ninguno: les falta **estado**. Hoy `components/icons/icon.tsx` fija `strokeWidth={1.85}` y no hay forma de engordar el trazo cuando el elemento está activo, que es la mitad de lo que hace que una barra de navegación se lea de un vistazo.

Y los ocho vacíos de la app son ocho párrafos grises: `week-view.tsx:214`, `pantry-list.tsx:51`, `cook/page.tsx:22`, `recipes/page.tsx:72`, `proposals/page.tsx:32`, `shopping-summary.tsx:76`, `today-view.tsx:54` y `cook-session.tsx:150`. Un componente los resuelve todos **sin una sola clave nueva**: cada consumidor pasa la cadena que ya tenía.

**Files:**
- Modify: `components/icons/icon.tsx`
- Create: `components/ui/empty-state.tsx`, `components/ui/empty-state.test.tsx`, `components/icons/icon.test.tsx`

**Interfaces:**
- Consumes: `IconProps` de `components/icons`, `cn` de `lib/utils`, `.title-content` de la Tarea 2.
- Produces: `IconProps.strokeWidth?: number` y `EmptyState`/`EmptyStateProps` tal y como aparecen en «Contrato de la pista (a)».

- [ ] **Step 1: Escribir los tests que fallan** — `components/icons/icon.test.tsx`:

```tsx
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TodayIcon } from './index'

describe('Icon', () => {
  it('mantiene el trazo 1.85 del set por defecto', () => {
    const { container } = render(<TodayIcon />)
    expect(container.querySelector('svg')?.getAttribute('stroke-width')).toBe('1.85')
  })

  it('acepta un trazo más grueso para el estado activo sin redibujar el icono', () => {
    const { container } = render(<TodayIcon strokeWidth={2.2} />)
    expect(container.querySelector('svg')?.getAttribute('stroke-width')).toBe('2.2')
  })
})
```

`components/ui/empty-state.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PantryIcon } from '@/components/icons'
import { EmptyState } from './empty-state'

describe('EmptyState', () => {
  it('pinta el título con voz de display y el icono decorativo oculto al lector', () => {
    const { container } = render(<EmptyState icon={PantryIcon} title="La despensa está vacía" />)
    expect(screen.getByText('La despensa está vacía')).toHaveClass('title-content')
    // El icono es decoración: el texto ya dice lo que pasa.
    expect(container.querySelector('[aria-hidden="true"]')).not.toBeNull()
    expect(container.querySelector('svg')).not.toBeNull()
  })

  it('la descripción y la acción son opcionales y no dejan huecos si no van', () => {
    const { container, rerender } = render(<EmptyState icon={PantryIcon} title="Vacío" />)
    expect(container.querySelectorAll('p')).toHaveLength(1)
    rerender(
      <EmptyState icon={PantryIcon} title="Vacío" description="Añade algo" action={<button type="button">Añadir</button>} />,
    )
    expect(container.querySelectorAll('p')).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'Añadir' })).toBeInTheDocument()
  })

  it('se apoya en tokens: acento suave en el círculo y superficie hundida de fondo', () => {
    const { container } = render(<EmptyState icon={PantryIcon} title="Vacío" />)
    const box = container.firstElementChild
    expect(box?.className).toContain('bg-surface-sunken')
    expect(container.querySelector('[aria-hidden="true"]')?.className).toContain('bg-acc-soft')
    expect(box?.className).not.toMatch(/\b(bg|text|border)-(gray|slate|zinc|neutral|red|green|blue)-\d/)
  })
})
```

- [ ] **Step 2: Ejecutar y ver el fallo**

Run: `pnpm exec vitest run --project ui components/icons/icon.test.tsx components/ui/empty-state.test.tsx`
Expected: FAIL — `icon.test.tsx` falla en el segundo caso (`strokeWidth` no es una prop: TypeScript lo señala y el atributo sigue siendo `1.85`) y `empty-state.test.tsx` no resuelve el import `./empty-state`.

- [ ] **Step 3: Implementar el trazo** — `components/icons/icon.tsx` queda así (dos líneas cambian; **el `1.85` por defecto no se mueve**, que es lo que protege a los sesenta iconos):

```tsx
import type { ReactNode } from 'react'

export type IconProps = { size?: number; className?: string; title?: string; strokeWidth?: number }

// Todos los iconos comparten trazo 1.85, extremos redondos y currentColor. El
// trazo se puede engordar (2.2 es el valor que usa la barra inferior en la
// pestaña activa) sin redibujar nada: es la única forma de que un icono a
// medida tenga estado sin duplicar el fichero.
export function Icon({ size = 24, className, title, strokeWidth = 1.85, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
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

Los sesenta ficheros de icono ya reenvían sus props al `Icon` compartido (`{...props}`), así que **no hay que tocar ninguno**. Comprobarlo antes de seguir:

Run: `grep -rLn '{...props}' components/icons/*.tsx | grep -v 'icon.tsx'`
Expected: sin salida. Si algún icono no reenvía props, se le añade `{...props}` en esta misma tarea (es una línea) y se anota.

- [ ] **Step 4: Implementar `components/ui/empty-state.tsx`**:

```tsx
import type { ComponentType, ReactNode } from 'react'
import type { IconProps } from '@/components/icons'

export interface EmptyStateProps {
  icon: ComponentType<IconProps>
  title: string
  description?: string
  action?: ReactNode
}

// El vacío deja de ser un párrafo gris. Ocho pantallas lo comparten, así que la
// forma vive aquí y no en cada una: caja hundida, icono a medida a 40 px dentro
// de un círculo de acento suave, título en display y, si hace falta, una frase
// y una acción.
//
// Sin 'use client' y sin estado: lo usan páginas de servidor (cook, recipes,
// proposals) y componentes de cliente (today-view, week-view, pantry-list).
//
// El icono es decorativo (aria-hidden): el título ya dice lo que pasa, y un
// lector de pantalla que anunciara "icono de despensa" antes del texto solo
// añadiría ruido.
export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg bg-surface-sunken px-6 py-10 text-center">
      <span aria-hidden="true" className="flex size-20 items-center justify-center rounded-pill bg-acc-soft text-acc-ink">
        <Icon size={40} />
      </span>
      <p className="title-content">{title}</p>
      {description ? <p className="max-w-[38ch] text-sm text-text-2">{description}</p> : null}
      {action}
    </div>
  )
}
```

- [ ] **Step 5: Ejecutar**

Run: `pnpm exec vitest run --project ui components/icons/icon.test.tsx components/ui/empty-state.test.tsx`
Expected: PASS los cinco casos.

- [ ] **Step 6: Commit**

```bash
pnpm exec tsc --noEmit && pnpm lint
git add components/icons/icon.tsx components/icons/icon.test.tsx components/ui/empty-state.tsx components/ui/empty-state.test.tsx
git commit -m "Da estados al icono compartido y estrena el componente de vacío"
```

---

### Task 4: Las tarjetas se definen por superficie, no por línea

Con los tokens de la Tarea 1 puestos, esta tarea cambia **tres componentes base** y con eso cambia media app sin tocar una sola pantalla: `Card` (que usan la ficha de receta, las tarjetas de ajustes y las dos pantallas de auth), `Sheet` (que sale por abajo con las esquinas superiores **rectas**, justo lo contrario de «esquinas generosas») y el pie de `Card`/`Dialog`, que hoy es `bg-muted/50`: shadcn de catálogo.

**Files:**
- Modify: `components/ui/card.tsx`, `components/ui/sheet.tsx`, `components/ui/dialog.tsx`
- Create: `components/ui/card.test.tsx`

**Interfaces:**
- Consumes: `--line-2`, `--sh-card`, `--sh-raised`, `--surf-sunken` (Tarea 1).
- Produces: nada nuevo. Cambia el aspecto de tres primitivas ya publicadas.

- [ ] **Step 1: Escribir el test que falla** — `components/ui/card.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Card, CardFooter } from './card'

describe('Card', () => {
  it('se define por superficie: sombra de tarjeta y borde suave, no borde duro', () => {
    render(<Card data-testid="c">contenido</Card>)
    const card = screen.getByTestId('c')
    expect(card.className).toContain('shadow-card')
    expect(card.className).toContain('border-line-2')
    expect(card.className).not.toMatch(/\bborder-border\b/)
  })

  it('el pie usa la superficie hundida del proyecto, no el gris de catálogo', () => {
    render(<CardFooter data-testid="f">pie</CardFooter>)
    expect(screen.getByTestId('f').className).toContain('bg-surface-sunken')
    expect(screen.getByTestId('f').className).not.toContain('bg-muted/50')
  })
})
```

Y en el mismo fichero, el caso de la hoja inferior:

```tsx
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('Sheet', () => {
  it('la hoja inferior redondea las esquinas de arriba', () => {
    // Se lee el fuente en vez de montar la hoja: Sheet es un portal de Base UI
    // con estado de apertura, y lo que se protege aquí es una clase de la
    // variante `data-[side=bottom]`, no un comportamiento.
    const source = readFileSync(join(import.meta.dirname, 'sheet.tsx'), 'utf8')
    const bottom = source.slice(source.indexOf('data-[side=bottom]'))
    expect(bottom).toContain('rounded-t-lg')
  })
})
```

- [ ] **Step 2: Ejecutar y ver el fallo**

Run: `pnpm exec vitest run --project ui components/ui/card.test.tsx`
Expected: FAIL los tres casos: `Card` lleva `border-border` y no `border-line-2`, `CardFooter` lleva `bg-muted/50`, y la variante `data-[side=bottom]` de `sheet.tsx` no menciona `rounded-t-lg`.

- [ ] **Step 3: Implementar** — en `components/ui/card.tsx`, en la cadena de clases de `Card` (línea 15), sustituir `border border-border` por `border border-line-2` y añadir el hover levantado; y en `CardFooter` (línea 87) sustituir `bg-muted/50`:

```tsx
        "group/card flex flex-col gap-(--card-spacing) overflow-hidden rounded-lg border border-line-2 bg-card py-(--card-spacing) text-sm text-card-foreground shadow-card [--card-spacing:--spacing(4)] has-data-[slot=card-footer]:pb-0 has-[>img:first-child]:pt-0 data-[size=sm]:[--card-spacing:--spacing(3)] data-[size=sm]:has-data-[slot=card-footer]:pb-0 *:[img:first-child]:rounded-t-lg *:[img:last-child]:rounded-b-lg",
```

```tsx
        "flex items-center rounded-b-lg border-t border-line-2 bg-surface-sunken p-(--card-spacing)",
```

- [ ] **Step 4: Redondear la hoja inferior** — en `components/ui/sheet.tsx`, en la variante `data-[side=bottom]` de la línea 60, añadir `data-[side=bottom]:rounded-t-lg` (y su simétrica `data-[side=top]:rounded-b-lg`). El `shadow-hero` que ya tiene se queda: con el token reforzado de la Tarea 1 ahora se ve.

- [ ] **Step 5: El pie del diálogo, igual que el de la tarjeta** — en `components/ui/dialog.tsx:110`, sustituir `border-t bg-muted/50` por `border-t border-line-2 bg-surface-sunken`.

- [ ] **Step 6: Ejecutar**

Run: `pnpm exec vitest run --project ui && pnpm exec vitest run --project unit tests/contracts/ui-controls.test.ts`
Expected: PASS todo el proyecto `ui` (las tarjetas de ajustes, la ficha de receta y los diálogos siguen montando igual: solo cambian clases de color) y los tres contratos de controles.

- [ ] **Step 7: Commit**

```bash
pnpm exec tsc --noEmit && pnpm lint
git add components/ui/card.tsx components/ui/card.test.tsx components/ui/sheet.tsx components/ui/dialog.tsx
git commit -m "Pinta las tarjetas con superficie en vez de línea y redondea la hoja inferior"
```

---

### Task 5: Un solo patrón de «seleccionado», en los ocho sitios donde falta

Es el movimiento de máxima palanca del informe y el más barato: el elemento más visto de la app —la barra inferior— marca la pestaña activa **solo con un color de texto** (`bottom-bar.tsx:34`), sin píldora, sin cambio de icono, sin indicador; y los filtros de recetas usan `variant="secondary"`, que es **gris sobre gris**: no se ve qué está filtrado. Mientras tanto `settings-nav.tsx:34` (`border-primary bg-accent text-accent-foreground`) tiene el patrón correcto, enterrado en Ajustes. Esta tarea lo saca de ahí y lo convierte en el patrón de toda la app.

De paso arregla el fallo de contraste que el informe mide: `text-primary` sobre `bg-primary/10` en `today-view.tsx:73` y `entry-chip.tsx:63` es **3,03:1 con el acento por defecto** (el informe dice ~3,4:1; el cálculo exacto con `--acc` al 10 % sobre blanco da 3,03:1, todavía peor). Con `.pill-selected` pasa a `--acc-ink` sobre `--acc-soft`: **5,52:1** con huerta y 4,62:1 en el peor de los ocho acentos.

`components/settings/settings-nav.tsx` **no se toca** (lista «NO tocar»): es la referencia, y su `border-primary bg-accent text-accent-foreground` resuelve a los mismos tres colores que `.pill-selected`.

**Files:**
- Modify: `components/nav/bottom-bar.tsx`, `components/nav/bottom-bar.test.tsx`, `components/recipes/tag-filter.tsx`, `components/recipes/recipe-filters.tsx`, `components/recipes/collection-bar.tsx`, `components/recipes/recipe-card.tsx`, `components/recipes/recipe-detail.tsx`, `components/today/today-view.tsx`, `components/plan/entry-chip.tsx`, `components/plan/entry-chip.test.tsx`, `components/pantry/pantry-list.tsx`

**Interfaces:**
- Consumes: `.pill-selected` (Tarea 2), `IconProps.strokeWidth` (Tarea 3).
- Produces: nada nuevo.

- [ ] **Step 1: Escribir los tests que fallan** — en `components/nav/bottom-bar.test.tsx`, añadir al `describe` existente:

```tsx
  it('la pestaña activa lleva la píldora de acento y el icono a trazo grueso', () => {
    render(
      <NextIntlClientProvider locale="es" messages={{ common }}>
        <BottomBar />
      </NextIntlClientProvider>,
    )
    const active = screen.getByRole('link', { name: 'Plan' })
    // La píldora vive DENTRO del área táctil: el enlace sigue midiendo 56 px.
    expect(active.className).toContain('min-h-14')
    const pill = active.querySelector('.pill-selected')
    expect(pill).not.toBeNull()
    expect(pill?.querySelector('svg')?.getAttribute('stroke-width')).toBe('2.2')

    const idle = screen.getByRole('link', { name: 'Hoy' })
    expect(idle.querySelector('.pill-selected')).toBeNull()
    expect(idle.querySelector('svg')?.getAttribute('stroke-width')).toBe('1.85')
  })

  it('el texto de la barra vuelve a la escala tipográfica de la app', () => {
    const { container } = render(
      <NextIntlClientProvider locale="es" messages={{ common }}>
        <BottomBar />
      </NextIntlClientProvider>,
    )
    // text-[11px] era el único tamaño fuera de escala del repositorio.
    expect(container.innerHTML).not.toContain('text-[11px]')
  })
```

Y en `components/plan/entry-chip.test.tsx`, añadir:

```tsx
  it('el chip de cocinado usa la píldora de acento, no el primario al 10 %', () => {
    const { container } = renderChip({ ...baseEntry, status: 'cooked' })
    const cooked = screen.getByText(/cocinad/i)
    expect(cooked.className).toContain('pill-selected')
    // bg-primary/10 con text-primary daba 3,03:1 con el acento por defecto.
    expect(container.innerHTML).not.toContain('bg-primary/10')
  })
```

(`renderChip` y `baseEntry` ya existen en ese fichero; si los nombres difieren, se usan los que haya — la aserción es lo que importa.)

- [ ] **Step 2: Ejecutar y ver el fallo**

Run: `pnpm exec vitest run --project ui components/nav/bottom-bar.test.tsx components/plan/entry-chip.test.tsx`
Expected: FAIL — no hay ningún `.pill-selected` en la barra, el trazo activo sigue siendo `1.85`, `text-[11px]` sigue ahí y el chip sigue con `bg-primary/10`.

- [ ] **Step 3: Implementar la barra inferior** — `components/nav/bottom-bar.tsx`, el cuerpo del `map` (líneas 25-42):

```tsx
        {NAV_ITEMS.map(({ href, labelKey, Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`)
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs font-medium',
                  active ? 'text-acc-ink' : 'text-text-2',
                )}
              >
                {/* La píldora vive dentro del área táctil de 56 px: el objetivo
                    no se toca (AGENTS.md), solo se pinta lo que hay dentro. El
                    trazo del icono engorda a 2.2 en la pestaña activa: es la
                    segunda señal, además del fondo, y la que se lee de reojo. */}
                <span className={cn('flex items-center justify-center rounded-pill border border-transparent px-4 py-0.5', active && 'pill-selected')}>
                  <Icon size={24} strokeWidth={active ? 2.2 : 1.85} />
                </span>
                <span>{t(`nav.${labelKey}`)}</span>
              </Link>
            </li>
          )
        })}
```

Y la `<nav>` (línea 22) pasa a apoyarse en la superficie en vez de en la raya: `border-t border-line-2 bg-card/95 backdrop-blur`.

**Prohibido aquí**: cualquier `transition`, `active:` o `animate-` (candidato rechazado del informe de animaciones: navegación core, 100+ al día). El contrato de la Tarea 14 lo comprueba.

- [ ] **Step 4: Los filtros de recetas dejan de ser gris sobre gris** — en `components/recipes/tag-filter.tsx`, las dos apariciones (líneas 62 y 77) cambian el `variant` por la píldora, conservando `aria-pressed`:

```tsx
            <Button
              type="button"
              size="sm"
              variant="outline"
              aria-pressed={selected.includes(root.slug)}
              className={cn('rounded-pill', selected.includes(root.slug) && 'pill-selected')}
              onClick={() => toggle(root.slug)}
            >
```

(La misma forma en el `Button` de los hijos, con `child.slug`. `cn` ya está importado en el fichero; si no, se añade el import de `@/lib/utils`.)

En `components/recipes/recipe-filters.tsx`, líneas 60 y 71, el mismo cambio: `variant="outline"` fijo y `className={cn('rounded-pill', <activo> && 'pill-selected')}`, donde `<activo>` es `difficulty === undefined` y `difficulty === d`. **El `variant="secondary"` del botón de submit (línea 103) no se toca**: no es un estado seleccionado, es una acción.

- [ ] **Step 5: Colecciones, tags de tarjeta, numeración de pasos y cabeceras de ubicación**

`components/recipes/collection-bar.tsx:86` — la píldora de colección deja de ser un borde gris más y pasa a superficie:

```tsx
        <span key={item.id} className="inline-flex items-center gap-1 rounded-pill border border-line-2 bg-card py-0.5 pr-1 pl-3 text-sm shadow-card">
```

`components/recipes/recipe-card.tsx:53` — los tags dejan de ser grises:

```tsx
                <li key={tag} className="rounded-pill bg-acc-soft px-2 py-0.5 text-xs text-acc-ink">
```

`components/recipes/recipe-detail.tsx:158` — la numeración de pasos, que el informe llama «candidato obvio a acento»:

```tsx
                <span className="tabular flex size-7 shrink-0 items-center justify-center rounded-full bg-acc-soft text-xs font-semibold text-acc-ink">
```

(Sube de `size-6` a `size-7` para que el número respire dentro del círculo; sigue siendo decoración junto al texto del paso, no un objetivo táctil.)

`components/pantry/pantry-list.tsx:58` — las cabeceras de nevera, congelador y armario, que hoy tienen «los tres iconos más de casa del set... pintados en `text-text-2` a `text-sm`»:

```tsx
              <h2 className="mb-2 inline-flex items-center gap-2 rounded-pill bg-acc-soft px-3 py-1 text-sm font-semibold text-acc-ink">
                <Icon size={18} strokeWidth={2.2} />
                {t(`locations.${id}`)}
              </h2>
```

- [ ] **Step 6: Los dos chips de «cocinado», que además arreglan el 3,03:1**

`components/today/today-view.tsx:73`:

```tsx
                        <span className="rounded-pill border border-transparent px-2 py-0.5 text-xs font-medium pill-selected">{tp('cooked')}</span>
```

`components/plan/entry-chip.tsx:63`:

```tsx
          <span className="inline-flex items-center rounded-pill border border-transparent px-1.5 py-0.5 text-xs font-medium pill-selected">{t('cooked')}</span>
```

- [ ] **Step 7: Ejecutar**

Run: `pnpm exec vitest run --project ui && pnpm exec vitest run --project unit tests/contracts/ui-controls.test.ts`
Expected: PASS. Atención a `components/recipes/tag-filter.test.tsx` y `recipe-filters.test.tsx`: localizan por `aria-pressed`, que no cambia. Si alguno afirmara sobre `variant`, se actualiza la aserción **a `.pill-selected`** en esta misma tarea.

- [ ] **Step 8: Commit**

```bash
pnpm exec tsc --noEmit && pnpm lint
git add components/nav components/recipes/tag-filter.tsx components/recipes/recipe-filters.tsx components/recipes/collection-bar.tsx components/recipes/recipe-card.tsx components/recipes/recipe-detail.tsx components/today/today-view.tsx components/plan/entry-chip.tsx components/plan/entry-chip.test.tsx components/pantry/pantry-list.tsx
git commit -m "Pone la píldora de acento en todo lo que está seleccionado"
```

---

### Task 6: Hoy tiene un hero, una fecha y un anillo que progresa

El anillo es «el momento visual más fuerte del producto» y va **suelto sobre el fondo**: `figure className="flex items-center gap-4"`, sin superficie, sin `--sh-hero`, sin acento. A su derecha, cuatro líneas apiladas de las cuales tres son gris pequeño. Las comidas del día son `min-h-14 rounded-md border border-border bg-card px-3`: **la misma fila exacta** que la pestaña Cocinar y casi la misma que la despensa. Y el separador de hueco es un `text-sm font-semibold text-text-2`: desayuno, comida y cena son indistinguibles.

Esta tarea también trae la **animación #1** del informe (la de mayor palanca de las cinco): hoy el anillo salta al valor nuevo cuando alguien cocina o cuando llega un evento SSE, sin acuse de recibo visual. Y extrae el panel de aviso que está **duplicado palabra por palabra** entre `today-view.tsx:89` y `pantry/expiring-panel.tsx:20`.

**Files:**
- Modify: `components/today/today-view.tsx`, `components/today/kcal-ring.tsx`, `components/pantry/expiring-panel.tsx`
- Create: `components/warn-panel.tsx`, `components/today/kcal-ring.test.tsx`

**Interfaces:**
- Consumes: `.title-screen`, `.num-hero` (Tarea 2), `<EmptyState>` (Tarea 3), `--dur-3`, `--ease-out`, `--sh-hero`, `--acc-soft`.
- Produces: `WarnPanel` (`{ title: string; children: ReactNode; footer?: ReactNode }`), Server Component sin estado.

- [ ] **Step 1: Escribir el test que falla** — `components/today/kcal-ring.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { describe, expect, it } from 'vitest'
import today from '@/messages/es/today.json'
import { KcalRing } from './kcal-ring'

function renderRing(props: { plannedKcal: number; cookedKcal: number; isEstimated: boolean }) {
  return render(
    <NextIntlClientProvider locale="es" messages={{ today }}>
      <KcalRing {...props} dateLabel="jueves, 28 de agosto" />
    </NextIntlClientProvider>,
  )
}

describe('KcalRing', () => {
  it('vive dentro de un hero con fecha, acento suave y sombra', () => {
    const { container } = renderRing({ plannedKcal: 2000, cookedKcal: 800, isEstimated: false })
    const hero = container.firstElementChild
    expect(hero?.className).toContain('bg-acc-soft')
    expect(hero?.className).toContain('shadow-hero')
    expect(screen.getByText('jueves, 28 de agosto')).toBeInTheDocument()
  })

  it('la cifra protagonista se pinta con la voz display, no con la monoespaciada', () => {
    renderRing({ plannedKcal: 2000, cookedKcal: 800, isEstimated: false })
    const number = screen.getByText('800')
    expect(number.className).toContain('num-hero')
    // La incoherencia que W6 cierra: aquí el mismo dato salía en JetBrains Mono
    // y en la ficha de receta en Outfit.
    expect(number.className).not.toContain('tabular')
  })

  it('mantiene la etiqueta accesible que usan los e2e', () => {
    renderRing({ plannedKcal: 2000, cookedKcal: 800, isEstimated: false })
    expect(screen.getByRole('img', { name: '800 de 2.000 kcal cocinadas' })).toBeInTheDocument()
  })

  it('el progreso transita en vez de saltar, y solo transita el trazo', () => {
    renderRing({ plannedKcal: 2000, cookedKcal: 800, isEstimated: false })
    const progress = screen.getByTestId('kcal-ring-progress')
    expect(progress.className.baseVal ?? progress.getAttribute('class')).toContain('transition-[stroke-dashoffset]')
    // Nunca el color: el acento no parpadea al cocinar.
    expect(progress.getAttribute('class')).not.toContain('transition-colors')
  })
})
```

- [ ] **Step 2: Ejecutar y ver el fallo**

Run: `pnpm exec vitest run --project ui components/today/kcal-ring.test.tsx`
Expected: FAIL — `KcalRing` no acepta `dateLabel` (TypeScript lo señala), no hay hero, el número lleva `.tabular` y el círculo de progreso no tiene transición.

- [ ] **Step 3: Implementar `components/today/kcal-ring.tsx`**:

```tsx
import { useLocale, useTranslations } from 'next-intl'

export interface KcalRingProps {
  plannedKcal: number
  cookedKcal: number
  isEstimated: boolean
  hasUnknownKcal?: boolean
  dateLabel: string
}

const RADIUS = 46
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

// Anillo informativo: cocinado sobre planificado de HOY. Sin objetivo diario ni
// diario alimentario (respuesta 1 de AGENTS.md). Sin librería de gráficos: dos
// círculos SVG y una máscara de trazo.
//
// Desde W6 es el hero de la pantalla: superficie de acento suave, la fecha
// arriba y la cifra en la voz display (Outfit), no en la monoespaciada. Es el
// único dato de la app que se pinta así de grande; el resto de cifras siguen
// en columna con .tabular.
export function KcalRing({ plannedKcal, cookedKcal, isEstimated, hasUnknownKcal, dateLabel }: KcalRingProps) {
  const t = useTranslations('today')
  const locale = useLocale()
  const nf = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 })
  const ratio = plannedKcal > 0 ? Math.min(1, cookedKcal / plannedKcal) : 0
  const offset = CIRCUMFERENCE * (1 - ratio)

  return (
    <figure className="flex flex-col gap-3 rounded-lg bg-acc-soft p-4 shadow-hero">
      <figcaption className="text-sm font-medium text-text-2 capitalize">{dateLabel}</figcaption>
      <div className="flex items-center gap-4">
        <svg viewBox="0 0 100 100" className="size-28 shrink-0 -rotate-90" role="img" aria-label={t('ringLabel', { cooked: nf.format(cookedKcal), planned: nf.format(plannedKcal) })}>
          {/* La pista se pinta con --surf (no con --surf-2): sobre el acento
              suave del hero, el gris hundido casi no se distinguía. Es
              decoración: el valor lo dicen el aria-label y la cifra. */}
          <circle cx="50" cy="50" r={RADIUS} fill="none" stroke="var(--surf)" strokeWidth="8" />
          <circle
            data-testid="kcal-ring-progress"
            className="transition-[stroke-dashoffset] duration-(--dur-3) ease-(--ease-out)"
            cx="50"
            cy="50"
            r={RADIUS}
            fill="none"
            stroke="var(--acc)"
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={offset}
          />
        </svg>
        <div className="flex flex-col">
          {/* Animación #1 del informe: hasta W6 el anillo saltaba al valor nuevo
              al cocinar o al llegar un evento SSE. 500 ms, solo strokeDashoffset,
              nunca el color. prefers-reduced-motion ya lo anula globalmente
              (app/globals.css). */}
          <span className="num-hero">{nf.format(cookedKcal)}</span>
          <span className="tabular text-sm text-text-2">{t('ofPlanned', { planned: nf.format(plannedKcal) })}</span>
          {isEstimated ? <span className="text-xs text-text-2">{t('estimated')}</span> : null}
          {hasUnknownKcal ? <span className="text-xs text-text-2">{t('unknownKcal')}</span> : null}
        </div>
      </div>
    </figure>
  )
}
```

- [ ] **Step 4: Extraer el panel de aviso** — `components/warn-panel.tsx` (nuevo):

```tsx
import type { ReactNode } from 'react'
import { WarningIcon } from '@/components/icons'

export interface WarnPanelProps {
  title: string
  children: ReactNode
  footer?: ReactNode
}

// El aviso ámbar de "caduca pronto", que hasta W6 estaba duplicado palabra por
// palabra entre components/today/today-view.tsx y
// components/pantry/expiring-panel.tsx. El patrón --warn-soft + WarningIcon es
// de la lista "no tocar" del informe de identidad: se mueve tal cual, solo el
// texto pequeño pasa a --warn-ink (2,58:1 -> 4,74:1 sobre el ámbar tenue).
export function WarnPanel({ title, children, footer }: WarnPanelProps) {
  return (
    <section className="rounded-lg border border-warn/40 bg-warn-soft p-3 shadow-card">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-warn-ink">
        <WarningIcon size={18} />
        {title}
      </h2>
      <div className="mt-2">{children}</div>
      {footer ? <div className="mt-3">{footer}</div> : null}
    </section>
  )
}
```

`components/pantry/expiring-panel.tsx` pasa a envolver su lista con `<WarnPanel title={t('expiringTitle')} footer={<Link …>}>` y pierde su `<section>`, su `<h2>` y su `WarningIcon` (las claves i18n y el `href` no cambian). Lo mismo en `today-view.tsx` con `t('expiring')`.

- [ ] **Step 5: La pantalla Hoy** — en `components/today/today-view.tsx`: cabecera, fecha, filas diferenciadas y vacío.

```tsx
  const dateLabel = new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`))
```

(`locale` sale de `useLocale()` de `next-intl`, que hay que añadir al import ya existente. **No es una clave i18n**: `Intl` formatea con el locale del usuario.)

```tsx
      <h1 className="title-screen">{t('title')}</h1>

      <KcalRing
        plannedKcal={progress.plannedKcal}
        cookedKcal={progress.cookedKcal}
        isEstimated={progress.hasEstimates}
        hasUnknownKcal={progress.hasUnknownKcal}
        dateLabel={dateLabel}
      />

      {entries.length === 0 ? (
        // El vacío entero es la invitación: así el enlace conserva el nombre
        // accesible que ya tenía (today.emptyPlanLink) y e2e/today.spec.ts:9
        // sigue encontrándolo, sin añadir ni una clave.
        <Link href="/plan">
          <EmptyState icon={PlanIcon} title={t('emptyPlanLink')} />
        </Link>
      ) : (
```

Y la fila de comida, con la **franja de acento por hueco** que la diferencia de la de Cocinar y de la de Despensa (esa es la «diferencia deliberada por pantalla» que pide el informe):

```tsx
              <section key={slot}>
                <h2 className="mb-1 inline-flex items-center gap-2 text-sm font-semibold text-text-2">
                  <span aria-hidden="true" className="h-4 w-1 rounded-pill bg-acc-line" />
                  {tp(`slots.${slot}`)}
                </h2>
                <ul className="flex flex-col gap-2">
                  {ofSlot.map((e) => (
                    <li key={e.id} className="flex min-h-14 items-center gap-3 rounded-md border border-line-2 bg-card px-3 shadow-card" data-status={e.status}>
```

(`data-status`, `min-h-14` y el resto del contenido de la fila **no cambian**: `e2e/loop.spec.ts:86` depende de lo primero y `AGENTS.md` de lo segundo.)

- [ ] **Step 6: Ejecutar**

Run: `pnpm exec vitest run --project ui && pnpm exec vitest run --project unit`
Expected: PASS. `today-view.tsx` no tiene test propio; el de `kcal-ring` cubre el hero. Si el *typecheck* señala el `dateLabel` que falta en algún otro consumidor de `KcalRing`, es que hay uno no listado: se le pasa la misma fecha y se anota.

- [ ] **Step 7: Commit**

```bash
pnpm exec tsc --noEmit && pnpm lint
git add components/today components/warn-panel.tsx components/pantry/expiring-panel.tsx
git commit -m "Levanta el anillo de Hoy a un hero con fecha y hace que progrese"
```

---

### Task 7: El plan deja de parecer un wireframe

Veintiocho huecos `border-dashed border-border/70` en pantalla: «el punteado gris, la textura más *wireframe sin terminar* que existe». La barra de la semana son cinco enlaces idénticos donde nada indica la acción principal. La cabecera del día de hoy es `bg-acc-ink text-bg`, **un bloque de tinta oscura, no verde**. Las propuestas pendientes se anuncian con `Badge variant="destructive"`: rojo de peligro para una novedad agradable. Y `proposal-card` distingue altas de bajas solo por color de texto.

Trae además la **animación #3**: el chip se teletransporta al soltarlo (el `transform` pasa a `undefined` de golpe) y la celda destino se enciende y se apaga sin transición.

**Files:**
- Modify: `components/plan/day-column.tsx`, `components/plan/week-view.tsx`, `components/plan/proposal-card.tsx`, `components/plan/entry-chip.tsx`
- Create: `components/plan/day-column.test.tsx`

**Interfaces:**
- Consumes: `--surf-sunken`, `--acc-soft`, `--acc-line`, `--sh-card`, `--dur-2`, `--ease-out`.
- Produces: nada nuevo.

- [ ] **Step 1: Escribir el test que falla** — `components/plan/day-column.test.tsx` (nuevo; monta la columna dentro de un `DndContext`, como hace `week-view.test.tsx`):

```tsx
import { DndContext } from '@dnd-kit/core'
import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { describe, expect, it, vi } from 'vitest'
import plan from '@/messages/es/plan.json'
import { DayColumn } from './day-column'

const noop = vi.fn()
const empty = { breakfast: [], lunch: [], dinner: [], snack: [] }

function renderColumn(isToday: boolean) {
  return render(
    <NextIntlClientProvider locale="es" messages={{ plan }}>
      <DndContext>
        <DayColumn
          date="2026-08-28"
          isToday={isToday}
          kcal={null}
          defaultServings={2}
          days={['2026-08-28']}
          entriesBySlot={empty}
          onAdd={noop}
          onServingsChange={noop}
          onSkip={noop}
          onRemove={noop}
          onMove={noop}
        />
      </DndContext>
    </NextIntlClientProvider>,
  )
}

describe('DayColumn', () => {
  it('los huecos vacíos son superficie hundida, no punteado gris', () => {
    const { container } = renderColumn(false)
    expect(container.innerHTML).not.toContain('border-dashed')
    expect(container.innerHTML).toContain('bg-surface-sunken')
  })

  it('la cabecera de hoy es verde de acento, no un bloque de tinta', () => {
    renderColumn(true)
    const header = screen.getByTestId('today-column')
    expect(header.className).toContain('pill-selected')
    expect(header.className).not.toContain('bg-acc-ink')
    // e2e/loop.spec.ts:50 y e2e/today.spec.ts:14 navegan con xpath=..: la
    // cabecera tiene que seguir siendo hija directa de la columna.
    expect(header.parentElement?.className).toContain('flex-col')
  })

  it('la celda destino transita el resaltado en vez de encenderse de golpe', () => {
    const { container } = renderColumn(false)
    const cell = container.querySelector('[class*="min-h-"]')
    expect(cell?.className).toContain('transition-colors')
  })
})
```

- [ ] **Step 2: Ejecutar y ver el fallo**

Run: `pnpm exec vitest run --project ui components/plan/day-column.test.tsx`
Expected: FAIL los tres casos: `border-dashed` sigue ahí, la cabecera de hoy lleva `bg-acc-ink text-bg` y la celda no tiene transición.

- [ ] **Step 3: Implementar los huecos y la celda destino** — `components/plan/day-column.tsx`, `SlotCell` (línea 72):

```tsx
    <div
      ref={setNodeRef}
      className={cn(
        // Superficie hundida en vez de punteado: veintiocho de estos en
        // pantalla, y el punteado gris es lo que hacía que el plan pareciera un
        // wireframe sin terminar.
        'flex min-h-[4.5rem] flex-col gap-1.5 rounded-md border border-transparent bg-surface-sunken p-1.5',
        // Animación #3 (informe de animaciones): el resaltado del destino se
        // enciende en 150 ms en vez de saltar. Solo colores.
        'transition-colors duration-150 ease-out',
        isOver && 'border-acc-line bg-acc-soft',
      )}
    >
```

Y el chip arrastrable (línea 46), la otra mitad de la animación #3:

```tsx
  // Mientras se arrastra, el chip sigue al dedo 1:1 (sin transición: cualquier
  // suavizado se siente como retardo). Al soltar, `transform` pasa a undefined
  // y hasta W6 el chip se teletransportaba; ahora asienta en 200 ms.
  const style = transform
    ? { transform: CSS.Translate.toString(transform) }
    : { transition: 'transform var(--dur-2) var(--ease-out)' }
```

- [ ] **Step 4: La cabecera del día** — `day-column.tsx`, líneas 96-103. El `<div>` exterior de la columna **no cambia** (sigue siendo `flex flex-col gap-2`, y la cabecera sigue siendo su primer hijo: eso es lo que buscan los dos e2e con `xpath=..`):

```tsx
      <div
        data-testid={isToday ? 'today-column' : undefined}
        className={cn('flex items-center justify-between rounded-sm border border-transparent px-1.5 py-1', isToday && 'pill-selected')}
      >
        <span className="text-sm font-medium capitalize">{label}</span>
        {isToday ? <span className="text-xs font-semibold">{t('today')}</span> : null}
      </div>
```

- [ ] **Step 5: La barra de la semana** — `components/plan/week-view.tsx:171-211`. Cinco enlaces idénticos pasan a tener jerarquía: **la compra es la acción principal** de esa barra (es la que saca trabajo de la pantalla), el resto son navegación.

- Los cuatro enlaces de navegación (`today`, `month`, `proposals`, `stats`) cambian `border border-border` por `border border-line-2 bg-card shadow-card`.
- El de la compra pasa a `bg-primary text-primary-foreground` (contraste garantizado por el bloque `--on-acc`, que no se toca) y conserva `min-h-11`.
- El aviso de propuestas pendientes deja de ser rojo de peligro: `<Badge variant="destructive">` → `<Badge variant="default">`.

- [ ] **Step 6: Altas y bajas de una propuesta, con marcador además de color** — `components/plan/proposal-card.tsx`, líneas 116 y 130. El color sigue, pero deja de ser la única señal (y el ámbar sube a `--warn-ink`):

```tsx
                <li key={`${group.date}-add-${i}`} className="flex items-start gap-1.5 text-sm text-acc-ink">
                  <PlusIcon size={14} className="mt-0.5 shrink-0" />
                  <span>{addLine(item)}</span>
```

```tsx
                <li key={item.id} className="flex items-start gap-1.5 text-sm text-warn-ink">
                  <MinusIcon size={14} className="mt-0.5 shrink-0" />
                  <span>{removeLine(item)}</span>
```

(`PlusIcon` y `MinusIcon` ya existen en `components/icons`. `components/plan/proposal-card.test.tsx:84` afirma `toHaveClass('text-warn')`: se actualiza a `text-warn-ink` **en esta tarea**, y el `<li>` sigue siendo el elemento que la lleva.)

Y la tarjeta entera pasa a superficie: `flex flex-col gap-2 rounded-md border border-line-2 bg-card p-3 shadow-card`.

**Prohibido aquí**: animar el cambio de botones a `Badge` al aprobar o rechazar (candidato rechazado: llega por `router.refresh()`, sin identidad de elemento estable).

- [ ] **Step 7: El chip del plan, con superficie** — `components/plan/entry-chip.tsx:38`: `rounded-md border border-line-2 bg-card p-2 text-sm shadow-card`.

- [ ] **Step 8: Ejecutar**

Run: `pnpm exec vitest run --project ui components/plan && pnpm exec vitest run --project unit tests/contracts/ui-controls.test.ts`
Expected: PASS, incluidos `week-view.test.tsx`, `entry-chip.test.tsx` y `proposal-card.test.tsx` con su aserción actualizada.

- [ ] **Step 9: Commit**

```bash
pnpm exec tsc --noEmit && pnpm lint
git add components/plan
git commit -m "Quita el punteado del plan y le da jerarquía a la semana"
```

---

### Task 8: El placeholder de receta deja de ser un rectángulo gris

«Con media biblioteca sin imagen, la parrilla es una rejilla de rectángulos grises iguales: el desperdicio visual más grande de la app en una app de comida.» El arreglo es un degradado de acento a superficie hundida **con el ángulo derivado del id de la receta**, para que la parrilla deje de ser una rejilla de clones. Es decorativo (`aria-hidden`), así que no tiene requisito de contraste; lo que sí tiene es un requisito duro de **determinismo**: el mismo id da el mismo ángulo en el servidor y en el cliente, o React se queja de la hidratación. Nada de `Math.random`.

`components/recipes/recipe-card.tsx` está en la lista «NO tocar» *en lo que ya funciona* (radio 22, imagen a sangre, sombra al hover): esta tarea cambia **solo** el bloque del placeholder. Los tags ya los cambió la Tarea 5.

**Files:**
- Modify: `components/recipes/recipe-card.tsx`, `components/recipes/recipe-detail.tsx`, `app/(app)/recipes/page.tsx`
- Create: `components/recipes/recipe-placeholder.tsx`, `components/recipes/recipe-placeholder.test.tsx`

**Interfaces:**
- Consumes: `--grad-food` y `--grad-food-angle` (Tarea 1), `<EmptyState>` (Tarea 3), `RecipesIcon`.
- Produces: `RecipePlaceholder` (`{ recipeId: string; className?: string }`) y `placeholderAngle(id: string): number`.

- [ ] **Step 1: Escribir el test que falla** — `components/recipes/recipe-placeholder.test.tsx`:

```tsx
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { RecipePlaceholder, placeholderAngle } from './recipe-placeholder'

describe('placeholderAngle', () => {
  it('es determinista: el mismo id da siempre el mismo ángulo', () => {
    const id = '0f6f1c2e-1111-4c3a-9d0e-3b2a1f0c7d55'
    expect(placeholderAngle(id)).toBe(placeholderAngle(id))
  })

  it('reparte los ángulos: veinte ids distintos no caen todos en el mismo', () => {
    const angles = new Set(Array.from({ length: 20 }, (_, i) => placeholderAngle(`receta-${i}`)))
    expect(angles.size).toBeGreaterThan(3)
  })

  it('nunca devuelve undefined aunque el id sea vacío', () => {
    expect(Number.isFinite(placeholderAngle(''))).toBe(true)
  })
})

describe('RecipePlaceholder', () => {
  it('pinta el degradado del token con el ángulo del id y se oculta al lector', () => {
    const { container } = render(<RecipePlaceholder recipeId="abc" />)
    const box = container.firstElementChild as HTMLElement
    expect(box.className).toContain('bg-(image:--grad-food)')
    expect(box.style.getPropertyValue('--grad-food-angle')).toBe(`${placeholderAngle('abc')}deg`)
    expect(box.getAttribute('aria-hidden')).toBe('true')
  })
})
```

- [ ] **Step 2: Ejecutar y ver el fallo**

Run: `pnpm exec vitest run --project ui components/recipes/recipe-placeholder.test.tsx`
Expected: FAIL — no se resuelve el import `./recipe-placeholder`.

- [ ] **Step 3: Implementar** — `components/recipes/recipe-placeholder.tsx`:

```tsx
import type { CSSProperties } from 'react'
import { RecipesIcon } from '@/components/icons'
import { cn } from '@/lib/utils'

// Ocho ángulos, no un valor continuo: se quiere variedad reconocible, no ruido.
const ANGLES = [120, 135, 160, 200, 225, 250, 290, 315] as const

// Hash estable (djb2 sobre los caracteres del id). Determinista a propósito: el
// mismo id tiene que dar el mismo degradado en el servidor y en el cliente, o
// React avisa de un desajuste de hidratación. Nada de Math.random.
//
// No es dominio (docs/03-DOMINIO no dice nada de placeholders): es presentación
// pura, así que vive con el componente que la usa y no en lib/domain.
export function placeholderAngle(id: string): number {
  let hash = 0
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) >>> 0
  return ANGLES[hash % ANGLES.length] ?? 135
}

export interface RecipePlaceholderProps {
  recipeId: string
  className?: string
}

// Receta sin foto. Hasta W6 era un rectángulo gris con un libro de 32 px, y con
// media biblioteca sin imagen la parrilla era una rejilla de clones.
export function RecipePlaceholder({ recipeId, className }: RecipePlaceholderProps) {
  return (
    <div
      aria-hidden="true"
      style={{ '--grad-food-angle': `${placeholderAngle(recipeId)}deg` } as CSSProperties}
      className={cn('flex aspect-video w-full items-center justify-center bg-(image:--grad-food) text-acc-ink/40', className)}
    >
      <RecipesIcon size={56} strokeWidth={1.4} />
    </div>
  )
}
```

- [ ] **Step 4: Consumirlo** — `components/recipes/recipe-card.tsx`, el `else` de la línea 29-33 pasa a `<RecipePlaceholder recipeId={recipe.id} />`; `components/recipes/recipe-detail.tsx`, el de la línea 110-112, a `<RecipePlaceholder recipeId={detail.recipe.id} className="mt-2 rounded-lg" />`. En los dos se borra el `RecipesIcon` del import si deja de usarse (ESLint lo señalará).

- [ ] **Step 5: La cabecera de Recetas y su vacío** — `app/(app)/recipes/page.tsx`. Hoy pone título y tres enlaces-icono del mismo peso: «nueva receta» no destaca sobre «ajustes». Se le da jerarquía sin tocar los `aria-label` (que es lo que localizan los e2e):

```tsx
      <div className="flex items-center justify-between gap-2">
        <h1 className="title-screen">{t('title')}</h1>
        <div className="flex items-center gap-1">
          <Link href="/recipes/import" aria-label={t('import.title')} className="inline-flex min-h-11 min-w-11 items-center justify-center text-text-2">
            <UploadIcon />
          </Link>
          <Link href="/settings" aria-label={c('settings')} className="inline-flex min-h-11 min-w-11 items-center justify-center text-text-2">
            <SettingsIcon />
          </Link>
          <Link href="/recipes/new" aria-label={t('new')} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-pill bg-primary text-primary-foreground">
            <PlusIcon />
          </Link>
        </div>
      </div>
```

(La acción principal va la última —el pulgar llega antes al borde derecho— y es la única con relleno. Los tres `aria-label` y los tres `href` no cambian.)

Y el vacío (línea 72):

```tsx
      {items.length === 0 ? (
        <div className="mt-6">
          <EmptyState icon={RecipesIcon} title={total === 0 && !query.q ? t('empty') : t('noResults')} />
        </div>
      ) : (
```

- [ ] **Step 6: La ficha de receta, con superficies** — `components/recipes/recipe-detail.tsx`. Hoy es «texto encadenado con `mt-2/mt-3/mt-6` sobre un lienzo blanco continuo». Sin reordenar nada ni tocar `data-testid="kcal-per-serving"`:

- El título (línea 115): `className="mt-3 title-content"`.
- Las kcal de `NutritionRow` pasan a `.num-lead` (fichero `components/recipes/nutrition-row.tsx`, línea 21): `className="num-lead"` en vez de `tabular font-display text-3xl` — **el mismo dato, la misma voz que el anillo de Hoy**, que es el objetivo del movimiento 3 del informe. `data-testid` intacto.
- Las tres secciones (`ingredients`, `steps`, `notes`) se envuelven en una superficie: `className="mt-6 rounded-lg border border-line-2 bg-card p-4 shadow-card"`, con su `<h2 className="font-display text-lg">` dentro sin cambios.

- [ ] **Step 7: Ejecutar**

Run: `pnpm exec vitest run --project ui components/recipes && pnpm exec vitest run --project unit tests/contracts/ui-controls.test.ts`
Expected: PASS, incluido `recipe-detail.test.tsx` («las kcal por ración no cambian al escalar» sigue localizando por `data-testid`).

- [ ] **Step 8: Commit**

```bash
pnpm exec tsc --noEmit && pnpm lint
git add components/recipes 'app/(app)/recipes/page.tsx'
git commit -m "Da cara al placeholder de receta y jerarquía a la ficha"
```

---

### Task 9: La despensa dice de un vistazo dónde está y cuándo caduca

La fila es blanca con borde y dos botones outline, y **el dato más accionable de la pantalla —la caducidad— es texto gris o ámbar sin fondo ni icono**. El botón de fusionar ocupa una fila entera él solo. El vacío es una frase gris centrada.

Trae la **animación #2**: al borrar, el id entra en `removedIds` y el `<li>` desaparece del array en el siguiente render, sin salida.

**Files:**
- Modify: `components/pantry/pantry-row.tsx`, `components/pantry/pantry-row.test.tsx`, `components/pantry/pantry-list.tsx`, `app/(app)/pantry/page.tsx`

**Interfaces:**
- Consumes: `--warn-ink`, `--surf-sunken`, `--acc-line`, `--dur-1`, `--dur-2`, `--ease-in`, `<EmptyState>`.
- Produces: nada nuevo. `PantryRow` gana un estado interno `removing` y sigue llamando a `onRemoved(id)` con la misma firma.

- [ ] **Step 1: Escribir los tests que fallan** — en `components/pantry/pantry-row.test.tsx`, cambiar las dos aserciones de ámbar y añadir la de la salida:

```tsx
    expect(expiryText).toHaveClass('text-warn-ink')
```

```tsx
    expect(expiryText).not.toHaveClass('text-warn-ink')
```

```tsx
  it('al borrar, la fila se marca como saliente antes de desaparecer', async () => {
    const onRemoved = vi.fn()
    renderRow({ onRemoved })
    await userEvent.click(screen.getByRole('button', { name: /eliminar|remove/i }))
    // La fila se marca primero (data-removing) y solo después avisa al padre:
    // sin eso, el <li> desaparecía del array en el siguiente render y no había
    // nada que animar.
    expect(screen.getByRole('listitem')).toHaveAttribute('data-removing', 'true')
    await waitFor(() => expect(onRemoved).toHaveBeenCalledWith(expect.any(String)))
  })
```

(`waitFor` se añade al import de `@testing-library/react` de ese fichero, que hoy solo trae `render` y `screen`.)

- [ ] **Step 2: Ejecutar y ver el fallo**

Run: `pnpm exec vitest run --project ui components/pantry/pantry-row.test.tsx`
Expected: FAIL — la fila sigue con `text-warn` y no existe `data-removing`.

- [ ] **Step 3: Implementar la fila** — `components/pantry/pantry-row.tsx`, líneas 92-96 y el `handleRemove`:

```tsx
  return (
    <li
      data-removing={removing ? 'true' : undefined}
      // Animación #2 del informe: dos pasos. Se marca la fila, se deja que la
      // transición corra y solo entonces se avisa al padre, que la saca del
      // array. `max-height` va con un pelín de retardo para que primero se
      // apague y luego se cierre el hueco, no las dos cosas a la vez.
      className={cn(
        'flex max-h-24 items-center gap-3 overflow-hidden rounded-md border border-line-2 bg-card px-3 py-2.5 shadow-card',
        'transition-[opacity,transform,max-height] duration-(--dur-2) ease-(--ease-in)',
        removing && 'max-h-0 scale-[.97] py-0 opacity-0',
      )}
    >
      <span aria-hidden="true" className="size-2 shrink-0 rounded-pill bg-acc-line" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{item.name}</p>
        <p className={cn('inline-flex items-center gap-1 text-xs', expiry.warn ? 'rounded-pill bg-warn-soft px-1.5 py-0.5 text-warn-ink' : 'text-text-2')}>
          {expiry.warn ? <WarningIcon size={12} /> : null}
          {expiry.label}
        </p>
      </div>
```

(El punto de ubicación es la «diferencia deliberada por pantalla» de la despensa, la que la separa de la fila de Hoy —franja de hueco— y de la de Cocinar —icono grande—. `WarningIcon` se añade al import de `components/icons`.)

El `handleRemove` deja de llamar a `onRemoved` en cuanto responde el servidor:

```tsx
      // Se marca la fila y se avisa al padre cuando termina la transición. El
      // temporizador de reserva cubre el caso en que el navegador no dispare
      // `transitionend` (pestaña en segundo plano, reduced-motion con .01ms).
      setRemoving(true)
      window.setTimeout(() => onRemoved?.(item.id), 240)
```

- [ ] **Step 4: La lista** — `components/pantry/pantry-list.tsx`: el vacío pasa a `<EmptyState icon={PantryIcon} title={t('empty')} />` y el botón de fusionar deja de ocupar una fila él solo (se mete en la cabecera de la pantalla). En `app/(app)/pantry/page.tsx`, la cabecera queda con `<h1 className="title-screen">` y tres acciones (`merge`, `scan`, `add`), con la principal (`add`) rellena, como en Recetas. `PantryList` pierde el `<div className="flex justify-end">` de las líneas 45-49 y su import de `MergeIcon`/`Button`/`Link` si quedan sin uso.

- [ ] **Step 5: Ejecutar**

Run: `pnpm exec vitest run --project ui components/pantry && pnpm exec vitest run --project unit tests/contracts/ui-controls.test.ts`
Expected: PASS. Ojo a `e2e/pantry.spec.ts`, que localiza el botón de fusionar por `aria-label`: **el `aria-label` no cambia**, solo cambia dónde vive el botón. Lo verifica la Tarea 15.

- [ ] **Step 6: Commit**

```bash
pnpm exec tsc --noEmit && pnpm lint
git add components/pantry 'app/(app)/pantry/page.tsx'
git commit -m "Diferencia las filas de la despensa y marca la caducidad"
```

---

### Task 10: La puerta de entrada tiene marca

«La primera pantalla que ve un usuario no tiene logo, ni color, ni una sola señal de RezetApp: una tarjeta blanca sobre fondo blanco. Es la superficie con más espacio libre y menos identidad de todo el repositorio.» El arreglo no necesita ningún activo nuevo: el wordmark se resuelve **tipográficamente con Outfit** y el fondo con `--acc-soft`, los dos ya en el proyecto. La clave `common.appName` («RezetApp») ya existe.

De paso, la coherencia mínima de Ajustes: `passkeys-panel`, `api-tokens-panel` y `members-panel` usan `<Card>` y `appearance-form` y `household-form` no, así que la misma pantalla habla dos idiomas.

**Files:**
- Modify: `app/(auth)/layout.tsx`, `app/(auth)/login/page.tsx`, `app/(auth)/register/page.tsx`, `app/(auth)/invite/[token]/page.tsx`, `components/settings/appearance-form.tsx`, `components/settings/household-form.tsx`

**Interfaces:**
- Consumes: `.title-content` (Tarea 2), `--acc-soft`, `--sh-hero`, `common.appName`.
- Produces: nada nuevo.

- [ ] **Step 1: Escribir el test que falla** — como las tres páginas de auth son Server Components asíncronos con `redirect()` y guardias, el contrato se comprueba leyendo el fuente, igual que hace la Tarea 4 con `sheet.tsx`. En `tests/contracts/ui-controls.test.ts`, añadir:

```ts
describe('puerta de entrada', () => {
  it('las pantallas de auth llevan marca: wordmark y lavado de acento', () => {
    const layout = readFileSync(join(ROOT, 'app/(auth)/layout.tsx'), 'utf8')
    expect(layout).toContain('bg-acc-soft')
    expect(layout).toContain('appName')
    for (const page of ['app/(auth)/login/page.tsx', 'app/(auth)/register/page.tsx']) {
      const source = readFileSync(join(ROOT, page), 'utf8')
      expect(source, page).toContain('shadow-hero')
      expect(source, page).toContain('title-content')
    }
  })
})
```

- [ ] **Step 2: Ejecutar y ver el fallo**

Run: `pnpm exec vitest run --project unit tests/contracts/ui-controls.test.ts`
Expected: FAIL — el layout de auth es «un div centrado sin fondo y sin marca».

- [ ] **Step 3: Implementar el layout** — `app/(auth)/layout.tsx`:

```tsx
import { getTranslations } from 'next-intl/server'

// La puerta de entrada. Hasta W6 era un div centrado sin fondo, sin color y sin
// una sola señal de RezetApp. El wordmark se resuelve con Outfit (la familia de
// títulos, ya cargada por app/layout.tsx): no hace falta ningún activo nuevo, y
// así el nombre cambia de acento con el hogar como todo lo demás.
export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const c = await getTranslations('common')
  return (
    <div className="min-h-dvh bg-acc-soft">
      <div className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 px-6">
        <p className="text-center font-display text-2xl font-bold tracking-tight text-acc-ink">{c('appName')}</p>
        {children}
      </div>
    </div>
  )
}
```

Contraste del wordmark: `--acc-ink` sobre `--acc-soft`, el par que la Tarea 1 dejó en **4,62:1 en el peor de los ocho acentos** (miel) y 5,52:1 con el de por defecto. AA cumplido en los dos temas.

- [ ] **Step 4: Las tres páginas** — en `login/page.tsx:12`, `register/page.tsx:16` e `invite/[token]/page.tsx:24`, la `<Card>` gana la sombra de hero y el `<h1>` la voz de contenido:

```tsx
    <Card className="mx-auto w-full max-w-sm p-6 shadow-hero">
      <h1 className="title-content">{t('login.title')}</h1>
```

(Se quita el `font-display text-2xl font-semibold` de cada `<h1>`: `.title-content` ya lo dice, y decirlo en un sitio es justo el objetivo del movimiento 3.)

- [ ] **Step 5: Coherencia de Ajustes** — `appearance-form.tsx` y `household-form.tsx` se envuelven en `<Card className="p-4">` para que las cinco secciones de Ajustes hablen el mismo idioma. **No se toca `settings-nav.tsx`** (lista «NO tocar») ni el bloque de los ocho círculos de acento de `appearance-form.tsx:113`, que el informe llama «el mejor momento de color de la app».

- [ ] **Step 6: Ejecutar**

Run: `pnpm exec vitest run --project ui components/settings && pnpm exec vitest run --project unit tests/contracts/ui-controls.test.ts && pnpm build`
Expected: PASS y build verde.

- [ ] **Step 7: Commit**

```bash
pnpm exec tsc --noEmit && pnpm lint
git add 'app/(auth)' components/settings/appearance-form.tsx components/settings/household-form.tsx tests/contracts/ui-controls.test.ts
git commit -m "Pone marca en la puerta de entrada y unifica las tarjetas de ajustes"
```

---

### Task 11: Una sola cabecera, un solo ámbar, y el contrato que lo sostiene

El barrido final de la pista. Dos cambios mecánicos y un contrato:

1. **Las cabeceras.** Veintiún `<h1>` en el repositorio, veinte de ellos con `text-2xl` desnudo o con `font-display text-2xl` repetido a mano. Pasan a `.title-screen` (cabecera de pantalla) o `.title-content` (título de contenido: la ficha de receta, el editor, la puerta de entrada, que ya lo hizo la Tarea 10). El de `components/cook/cook-session.tsx` **no se toca aquí**: lo pone la pista (c) en la Tarea 13, que reescribe ese fichero entero.
2. **El ámbar.** 56 usos de `text-warn` en 34 ficheros, a 2,97:1 sobre blanco y 2,58:1 sobre el propio `--warn-soft` con el que casi siempre convive. Todos pasan a `text-warn-ink` (5,44:1 y 4,74:1). **`bg-warn-soft`, `border-warn/40` y los `WarningIcon` no se tocan**: el patrón de aviso está en la lista «NO tocar», y lo que falla es solo el color del texto pequeño.

**Files:**
- Modify: los 20 ficheros con `<h1>` (menos `cook-session.tsx`), los 34 con `text-warn`, `tests/contracts/ui-controls.test.ts`

**Interfaces:**
- Consumes: `.title-screen`, `.title-content`, `--warn-ink`.
- Produces: dos casos nuevos en el contrato de interfaz.

- [ ] **Step 1: Escribir el test que falla** — en `tests/contracts/ui-controls.test.ts`, añadir:

```ts
describe('jerarquía y contraste de la interfaz', () => {
  // La sesión de cocina la reescribe entera la pista (c) de W6 (Tarea 13), que
  // le pone su .title-content; hasta que esa pista mergee, es la única
  // excepción de esta regla. La Tarea 13 vacía esta lista.
  const PENDING = ['components/cook/cook-session.tsx']

  it('ninguna cabecera se pinta a mano: todas usan .title-screen o .title-content', () => {
    const offenders = [...sourceFiles('components'), ...sourceFiles('app')]
      .filter((f) => !PENDING.includes(f))
      .filter((f) => {
        const source = readFileSync(join(ROOT, f), 'utf8')
        const index = source.indexOf('<h1')
        if (index === -1) return false
        const tag = source.slice(index, source.indexOf('>', index))
        return !tag.includes('title-screen') && !tag.includes('title-content')
      })
    expect(offenders).toEqual([])
  })

  it('el ámbar pequeño usa la tinta de aviso, no el ámbar crudo', () => {
    // text-warn sobre blanco es 2,97:1 y sobre --warn-soft 2,58:1: sirve para
    // bordes, iconos y fondos, no para leer. text-warn-ink da 5,44:1 y 4,74:1.
    const offenders = [...sourceFiles('components'), ...sourceFiles('app')].filter((f) =>
      /\btext-warn\b(?!-)/.test(readFileSync(join(ROOT, f), 'utf8')),
    )
    expect(offenders).toEqual([])
  })
})
```

- [ ] **Step 2: Ejecutar y ver el fallo**

Run: `pnpm exec vitest run --project unit tests/contracts/ui-controls.test.ts`
Expected: FAIL — el primer caso enumera los veinte ficheros con cabecera a mano, el segundo los treinta y cuatro con `text-warn`.

- [ ] **Step 3: Barrer las cabeceras**

Run: `grep -rn '<h1' app components | grep -v cook-session`

Cada una recibe `className="title-screen"` (las de pantalla: `today-view`, `cook/page`, `plan/page`, `plan/month`, `plan/stats`, `plan/proposals`, `plan/shopping`, `pantry/page`, `pantry/add`, `pantry/scan`, `pantry/merge`, `recipes/page`, `recipes/import`, `settings/layout`, `offline/page`) o `className="title-content"` (las de contenido: `recipe-detail`, `recipe-editor`, y las tres de auth que ya hizo la Tarea 10). Se borra el `text-2xl`/`font-display`/`font-semibold` que quede a mano; **las clases de posición (`mt-2`, `mt-3`, `truncate`) se conservan**.

- [ ] **Step 4: Barrer el ámbar**

Run: `grep -rln 'text-warn\b' components app`

Sustitución mecánica `text-warn` → `text-warn-ink` en los 34 ficheros, **sin tocar** `bg-warn-soft`, `border-warn/40`, `--color-warn` ni ningún `WarningIcon`. Tres tests de componente afirman sobre esa clase y se actualizan en el mismo commit: `components/pantry/pantry-row.test.tsx` (ya lo hizo la Tarea 9), `components/recipes/ingredient-list.test.tsx:108,113` y `components/plan/proposal-card.test.tsx:84` (ya lo hizo la Tarea 7). Comprobar que no queda ninguno:

Run: `grep -rn 'text-warn\b' components app tests | grep -v 'text-warn-ink'`
Expected: sin salida.

- [ ] **Step 5: Ejecutar**

Run: `pnpm check`
Expected: PASS entero. Es la primera vez en la pista que se corre la puerta completa: `typecheck`, `lint` sin avisos, `i18n:check` (que tiene que pasar **sin que `messages/` se haya movido**), los tres proyectos de vitest y la cobertura del dominio al 100 %.

- [ ] **Step 6: Comprobar que la pista no tocó lo que no debía**

```bash
git diff main --stat -- messages/ db/ lib/domain lib/validation lib/services lib/actions
```
Expected: sin salida. Si aparece algo, para y avisa: alguna tarea se salió del guion.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "Unifica las cabeceras de pantalla y sube el ámbar pequeño a contraste AA"
```

---

### Task 12: El layout de la app aprende a ceder la pantalla

`docs/02-DISENO.md` pide del modo cocina «pantalla completa, un paso». Lo que hay es una sesión que hereda `max-w-xl px-4 pb-24` de `app/(app)/layout.tsx:8` **con la barra inferior visible debajo**. El informe marca este movimiento como el de mayor riesgo de los cinco y dice cómo bajarlo: **un `data-` en el layout existente, no un layout paralelo**, para no duplicar `requireSession()` ni partir el árbol de rutas.

La pieza que lo hace posible sin cliente ni `usePathname` es `:has()`: el layout es un Server Component y no sabe qué ruta está pintando, pero **sí puede reaccionar a lo que pinte su hijo**. La sesión de cocina marca su `<section>` con `data-fullscreen` y el contenedor se aparta. Tailwind 4.3 trae las variantes `has-*` y `group-has-*`, y el repositorio ya usa variantes `has-data-*` en `components/ui/card.tsx:15`.

Esta tarea **solo cambia el layout**: la sesión todavía no pone el atributo, así que la app se comporta exactamente igual. Así el cambio arriesgado se mide solo.

**Files:**
- Modify: `app/(app)/layout.tsx`
- Create: `tests/contracts/app-shell.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: el contrato «un descendiente con `data-fullscreen` suprime el marco de la app». Lo consume la Tarea 13.

- [ ] **Step 1: Escribir el test que falla** — `tests/contracts/app-shell.test.ts`:

```ts
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// El marco de la app (ancho máximo, padding, barra inferior) se cede cuando un
// descendiente pide pantalla completa. Se comprueba leyendo el fuente porque el
// layout es un Server Component asíncrono con requireSession(): montarlo en
// jsdom exigiría simular la sesión entera para verificar una clase de CSS.
const ROOT = join(import.meta.dirname, '..', '..')
const LAYOUT = readFileSync(join(ROOT, 'app/(app)/layout.tsx'), 'utf8')

describe('marco de la app', () => {
  it('cede el ancho y el relleno cuando un hijo pide pantalla completa', () => {
    expect(LAYOUT).toContain('has-[[data-fullscreen]]:max-w-none')
    expect(LAYOUT).toContain('has-[[data-fullscreen]]:p-0')
  })

  it('esconde la barra inferior en pantalla completa, sin duplicar el layout', () => {
    expect(LAYOUT).toContain('group-has-[[data-fullscreen]]:hidden')
    // Una sola llamada a la guardia: el informe de identidad avisa de que un
    // layout paralelo duplicaría requireSession() y partiría el árbol de rutas.
    expect(LAYOUT.split('requireSession()').length - 1).toBe(1)
  })

  it('no hay ningún layout paralelo bajo cook', () => {
    expect(existsSync(join(ROOT, 'app/(app)/cook/[entryId]/layout.tsx'))).toBe(false)
    expect(existsSync(join(ROOT, 'app/(app)/cook/recipe/[id]/layout.tsx'))).toBe(false)
  })
})
```

- [ ] **Step 2: Ejecutar y ver el fallo**

Run: `pnpm exec vitest run --project unit tests/contracts/app-shell.test.ts`
Expected: FAIL los dos primeros casos (el layout no tiene ninguna variante `has-*`); el tercero ya pasa y es la red que impide «arreglarlo» con un layout paralelo.

- [ ] **Step 3: Implementar** — `app/(app)/layout.tsx`:

```tsx
import { BottomBar } from '@/components/nav/bottom-bar'
import { Toaster } from '@/components/ui/sonner'
import { requireSession } from '@/lib/auth/guards'

// El marco de las cinco pantallas: ancho de lectura, relleno seguro y barra
// inferior. La sesión de cocina lo cede con un `data-fullscreen` en su propia
// sección y `:has()` — no con un layout paralelo, que duplicaría
// requireSession() y partiría el árbol de rutas (informe de identidad,
// movimiento 5: "el más alto riesgo de los cinco").
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireSession()
  return (
    <div className="group mx-auto min-h-dvh max-w-xl px-4 pb-24 pt-[max(1rem,env(safe-area-inset-top))] has-[[data-fullscreen]]:max-w-none has-[[data-fullscreen]]:p-0">
      {children}
      <div className="group-has-[[data-fullscreen]]:hidden">
        <BottomBar />
      </div>
      <Toaster position="top-center" />
    </div>
  )
}
```

- [ ] **Step 4: Ejecutar y comprobar que nada se movió todavía**

Run: `pnpm exec vitest run --project unit tests/contracts/app-shell.test.ts && pnpm build`
Expected: PASS los tres casos y build verde. **Ninguna pantalla cambia**: nadie pone `data-fullscreen` aún.

- [ ] **Step 5: Commit**

```bash
pnpm exec tsc --noEmit && pnpm lint
git add 'app/(app)/layout.tsx' tests/contracts/app-shell.test.ts
git commit -m "Enseña al marco de la app a ceder la pantalla completa"
```

---

### Task 13: La sesión de cocina, a pantalla completa y con progreso

Con el marco preparado, la sesión toma la pantalla. Hoy: hereda el contenedor, el modo pared «solo sube tamaños de fuente sobre el mismo lienzo blanco con la misma barra», el progreso es un `<p className="tabular text-sm text-text-2">` que dice «paso 2 de 7» —sin barra, sin puntos, sin nada—, y anterior y siguiente son dos botones icono del mismo peso.

Lo que **no** cambia, y hay que vigilar: `data-testid="cook-step"` con `text-4xl` en modo pared (lo afirman `components/cook/cook-session.test.tsx:89` y `e2e/cook.spec.ts:70`), el gesto de deslizar con su umbral de 60 px, las teclas de flecha, `useWakeLock`, `useSpeech` y el `FinishCookingDialog`.

**Files:**
- Modify: `components/cook/cook-session.tsx`, `components/cook/cook-session.test.tsx`, `tests/contracts/ui-controls.test.ts`, `app/(app)/cook/page.tsx`

**Interfaces:**
- Consumes: `data-fullscreen` (Tarea 12), `.title-content`, `.num-lead`, `<EmptyState>`, `--surf-sunken`, `--acc-line`.
- Produces: nada nuevo. La firma de `CookSession` no cambia: las dos rutas (`cook/[entryId]/page.tsx` y `cook/recipe/[id]/page.tsx`) **no se tocan**.

- [ ] **Step 1: Escribir el test que falla** — en `components/cook/cook-session.test.tsx`, añadir:

```tsx
  it('pide la pantalla completa y enseña el progreso con puntos, no solo con texto', () => {
    const { container } = renderSession()
    const section = container.querySelector('[data-fullscreen]')
    expect(section).not.toBeNull()
    // El progreso deja de ser una frase gris: un punto por paso, el actual en
    // acento. El texto sigue ahí para el lector de pantalla.
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1')
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuemax', '2')
  })

  it('el modo pared cambia de lienzo, no solo de tamaño de letra', async () => {
    const { container } = renderSession()
    await userEvent.click(screen.getByRole('button', { name: /modo pared/i }))
    // La aserción de siempre: e2e/cook.spec.ts:70 depende de esta clase.
    expect(screen.getByTestId('cook-step')).toHaveClass('text-4xl')
    expect(container.querySelector('[data-wall="true"]')).not.toBeNull()
  })

  it('la receta sin pasos NO se lleva la pantalla: el vacío deja salir', () => {
    const { container } = renderSession({ steps: [] })
    // Sin barra inferior, un callejón sin salida. El vacío se queda dentro del
    // marco de la app a propósito.
    expect(container.querySelector('[data-fullscreen]')).toBeNull()
    expect(screen.getByText(/esta receta no tiene pasos/i)).toBeInTheDocument()
  })
```

(`renderSession` ya existe en ese fichero; si su firma no admite sobrescribir `steps`, se le añade el parámetro opcional en esta tarea.)

- [ ] **Step 2: Ejecutar y ver el fallo**

Run: `pnpm exec vitest run --project ui components/cook/cook-session.test.tsx`
Expected: FAIL los dos primeros casos: no hay `data-fullscreen`, no hay `role="progressbar"` y no hay `data-wall`. El tercero ya pasa (hoy tampoco hay `data-fullscreen` en el vacío) y es la red que impide que la Tarea lo ponga «por simetría».

- [ ] **Step 3: Implementar la sección** — `components/cook/cook-session.tsx`, líneas 156-178:

```tsx
    <section
      data-fullscreen="true"
      data-wall={wall ? 'true' : undefined}
      // Pantalla completa de verdad (docs/02-DISENO, "Modo cocina"): el marco de
      // la app se aparta al ver este data-fullscreen (app/(app)/layout.tsx), sin
      // layout paralelo. El modo pared cambia además el lienzo, no solo el
      // cuerpo de letra: fondo hundido y más aire para leer a dos metros.
      className={cn(
        'flex min-h-dvh flex-col gap-4 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]',
        wall ? 'bg-surface-sunken gap-6 px-8' : 'mx-auto w-full max-w-xl',
      )}
      tabIndex={0}
      onKeyDown={…}   /* sin cambios */
      onTouchStart={…}
      onTouchEnd={…}
    >
```

- [ ] **Step 4: La cabecera y la salida** — la sesión ya no tiene barra inferior, así que necesita una puerta de vuelta. Se usa `common.actions.close`, que ya existe:

```tsx
      <header className="flex items-center justify-between gap-2">
        <h1 className={cn('title-content truncate', wall && 'text-3xl')}>{title}</h1>
        <div className="flex items-center gap-2">
          {/* … botón de voz y de modo pared, sin cambios … */}
          <ServingsStepper value={servings} onChange={setServings} />
          <Button type="button" variant="ghost" size="icon" aria-label={c('actions.close')} render={<Link href="/cook" />}>
            <CloseIcon size={20} />
          </Button>
        </div>
      </header>
```

(`CloseIcon` ya existe en `components/icons`; `c` es `useTranslations('common')`, que se añade junto al `t` de `'cook'`.)

- [ ] **Step 5: El progreso visible** — sustituir el `<p className="tabular text-sm text-text-2">` de la línea 201:

```tsx
      {/* Un punto por paso, el actual en acento: se lee de un vistazo desde el
          otro lado de la encimera. El texto de siempre se queda como nombre
          accesible de la barra, así que ningún lector de pantalla pierde nada. */}
      <div
        role="progressbar"
        aria-valuemin={1}
        aria-valuenow={index + 1}
        aria-valuemax={steps.length}
        aria-label={t('stepOf', { current: index + 1, total: steps.length })}
        className="flex items-center gap-1.5"
      >
        {steps.map((s, i) => (
          <span
            key={s.id}
            aria-hidden="true"
            className={cn('h-1.5 flex-1 rounded-pill', i <= index ? 'bg-acc' : 'bg-surface-sunken')}
          />
        ))}
      </div>
```

Para que `bg-acc` exista, en `app/globals.css` hace falta `--color-acc: var(--acc)` en `@theme inline`. **Eso es CSS global y la pista (c) no escribe CSS global** (matriz de pre-flight): en su lugar se usa `bg-primary`, que ya está mapeado a `--acc` desde W0 y es exactamente el mismo color.

- [ ] **Step 6: El paso, los ingredientes y el vacío**

- El `<p data-testid="cook-step">` conserva `wall ? 'text-4xl' : 'text-2xl'` y gana `text-balance`.
- El bloque del paso y la lista de comprobación se apoyan en superficie: `rounded-lg border border-line-2 bg-card p-4 shadow-card` alrededor del par «paso + temporizadores».
- «Anterior» y «Siguiente» dejan de pesar lo mismo: el de avanzar se queda con `variant="default"` y el de retroceder pasa a `variant="ghost"`.
- El vacío (líneas 148-154) pasa a `<EmptyState icon={CookIcon} title={t('noSteps')} />` dentro de la `<section>` **sin `data-fullscreen`**, para que la barra inferior siga ahí y no sea un callejón sin salida.

- [ ] **Step 7: La pestaña Cocinar, a juego** — `app/(app)/cook/page.tsx` (la lista, no la sesión): `<h1 className="title-screen">`, el vacío a `<EmptyState icon={CookIcon} title={t('empty')} />` y la fila con **su** diferencia deliberada (el icono grande, que ya tiene, ahora en un círculo de acento):

```tsx
              <Link href={`/cook/${entry.id}`} className="flex min-h-14 items-center gap-3 rounded-md border border-line-2 bg-card px-3 shadow-card">
                <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-pill bg-acc-soft text-acc-ink">
                  <CookIcon size={22} />
                </span>
```

- [ ] **Step 8: Cerrar la excepción del contrato de cabeceras** — en `tests/contracts/ui-controls.test.ts`, la lista `PENDING` que dejó la Tarea 11 se vacía:

```ts
  const PENDING: string[] = []
```

- [ ] **Step 9: Ejecutar**

Run: `pnpm exec vitest run --project ui components/cook && pnpm exec vitest run --project unit`
Expected: PASS, incluidos los seis casos viejos de `cook-session.test.tsx` (el de «el modo pared agranda el paso» sigue afirmando `text-4xl`) y el contrato de cabeceras ya sin excepciones.

- [ ] **Step 10: Actualizar el único spec que lo necesita** — `e2e/cook.spec.ts:70` afirma `toHaveClass(/text-4xl/)` sobre `cook-step` y **sigue valiendo**. Lo que sí conviene añadir, porque es justo lo que esta tarea construye, es una línea en ese mismo caso:

```ts
    await page.getByRole('button', { name: /modo pared/i }).click()
    await expect(page.getByTestId('cook-step')).toHaveClass(/text-4xl/)
    // W6: la sesión se lleva la pantalla, así que la barra inferior no está.
    await expect(page.getByRole('navigation')).toHaveCount(0)
```

Ningún otro spec cambia: `e2e/loop.spec.ts` entra en la sesión por un enlace de `<main>` y sale por el diálogo de terminar, sin tocar la barra.

- [ ] **Step 11: Commit**

```bash
pnpm exec tsc --noEmit && pnpm lint
git add components/cook 'app/(app)/cook/page.tsx' tests/contracts/ui-controls.test.ts e2e/cook.spec.ts
git commit -m "Saca la sesión de cocina del contenedor y le pone progreso visible"
```

---

### Task 14: Las dos animaciones de la cocina, y el contrato que impide las cinco rechazadas

**Antes de esta tarea: `git merge main`** (Ruling W6-R2). El contrato de movimiento recorre ficheros que escribió la pista (b) y no puede escribirse contra una copia vieja.

Quedan las dos filas del informe que viven en ficheros de (c): el cambio de paso, que hoy sustituye el bloque entero de golpe **decenas de veces por sesión y con las manos mojadas** (de ahí los 140 ms y el «nunca añadir slide»), y el bloque de sobras del diálogo de terminar, que aparece de golpe y hace saltar el tamaño del diálogo.

Y se fija por contrato lo que **no** se anima, que en esta oleada importa tanto como lo que sí.

**Files:**
- Modify: `components/cook/cook-session.tsx`, `components/cook/finish-dialog.tsx`, `components/cook/finish-dialog.test.tsx`
- Create: `tests/contracts/motion.test.ts`

**Interfaces:**
- Consumes: `--dur-1`, `--dur-2`, `--ease-out`.
- Produces: el contrato de movimiento de la oleada.

- [ ] **Step 1: Escribir el test que falla** — `tests/contracts/motion.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Contrato de movimiento de W6. Vale tanto por lo que exige como por lo que
// prohíbe: el informe de animaciones aceptó cinco filas y rechazó otras cinco
// por frecuencia de uso o por función, y las rechazadas son las que más fácil
// se cuelan "de paso" en una oleada de estilo.
const ROOT = join(import.meta.dirname, '..', '..')
const read = (f: string) => readFileSync(join(ROOT, f), 'utf8')

describe('movimiento', () => {
  it('las cinco animaciones aceptadas están, con su presupuesto', () => {
    expect(read('components/today/kcal-ring.tsx')).toContain('transition-[stroke-dashoffset]')
    expect(read('components/pantry/pantry-row.tsx')).toContain('data-removing')
    expect(read('components/plan/day-column.tsx')).toContain('transition-colors')
    expect(read('components/cook/cook-session.tsx')).toContain('transition-opacity')
    expect(read('components/cook/finish-dialog.tsx')).toContain('grid-rows-[0fr]')
  })

  it('las duraciones salen de tokens, no de números sueltos', () => {
    for (const file of [
      'components/today/kcal-ring.tsx',
      'components/pantry/pantry-row.tsx',
      'components/cook/cook-session.tsx',
      'components/cook/finish-dialog.tsx',
    ]) {
      expect(read(file), file).toMatch(/duration-\(--dur-[123]\)/)
    }
  })

  it('los cinco candidatos rechazados siguen sin animar', () => {
    // Navegación core (100+/día), stepper y lista de comprobación (se tocan con
    // prisa), intercambio de propuesta (sin identidad de elemento estable) y
    // parrilla de recetas (contenido funcional, no decoración).
    const forbidden = /\b(transition|animate-in|animate-out|duration-)\S*/
    for (const file of [
      'components/nav/bottom-bar.tsx',
      'components/recipes/servings-stepper.tsx',
      'components/cook/ingredient-checklist.tsx',
    ]) {
      expect(read(file), file).not.toMatch(forbidden)
    }
    // recipe-card conserva su `transition-shadow` de W2 (hover de la tarjeta,
    // dentro de presupuesto); lo que se prohíbe es el stagger de entrada.
    expect(read('components/recipes/recipe-card.tsx')).not.toContain('animate-in')
    expect(read('components/plan/proposal-card.tsx')).not.toContain('animate-')
  })

  it('nadie escribe su propia media query de reduced-motion', () => {
    // Ya hay un interruptor global en app/globals.css: duplicarlo por componente
    // es la forma clásica de que uno se quede sin actualizar.
    const globals = read('app/globals.css')
    expect(globals).toContain('prefers-reduced-motion')
    for (const file of ['components/today/kcal-ring.tsx', 'components/cook/cook-session.tsx', 'components/cook/finish-dialog.tsx']) {
      expect(read(file), file).not.toContain('prefers-reduced-motion')
    }
  })
})
```

- [ ] **Step 2: Ejecutar y ver el fallo**

Run: `pnpm exec vitest run --project unit tests/contracts/motion.test.ts`
Expected: FAIL — faltan `transition-opacity` en la sesión y `grid-rows-[0fr]` en el diálogo (las tres de la pista (b) ya pasan tras el merge; si alguna no pasa, es que (b) no está dentro: para y avisa).

- [ ] **Step 3: El cambio de paso** — `components/cook/cook-session.tsx`. Cruce por opacidad, **sin transform**: el informe es explícito («nunca añadir slide ni retrasar el gesto de swipe»).

```tsx
      {step ? (
        // Animación #4: el bloque entra con @starting-style desde opacidad 0.
        // 140 ms y solo opacidad: se toca decenas de veces por sesión y con las
        // manos mojadas, así que tiene que ser casi imperceptible. La `key`
        // fuerza el remontaje por paso, que es lo que dispara la entrada.
        <div key={step.id} className="flex flex-col gap-4 transition-opacity duration-(--dur-1) ease-(--ease-out) starting:opacity-0">
          <p data-testid="cook-step" className={cn('text-balance leading-snug', wall ? 'text-4xl' : 'text-2xl')}>
            {step.text}
          </p>
          <StepTimers text={step.text} locale={locale} stepIndex={index} timerSeconds={step.timerSeconds} />
        </div>
      ) : null}
```

(`starting:` es la variante de `tw-animate-css` para `@starting-style`, ya instalado. Si no estuviera disponible en la versión del repositorio, se usa `data-[entering]` o directamente `@starting-style` en el `@layer components` de la Tarea 2 — **para y pide**: sería CSS global y la matriz asigna ese fichero a la pista (a).)

- [ ] **Step 4: El bloque de sobras** — `components/cook/finish-dialog.tsx`, líneas 90-111. Patrón `grid-rows`, el único que anima una altura desconocida sin medirla:

```tsx
          <div
            data-open={withLeftovers ? 'true' : undefined}
            // Animación #5: hasta W6 el bloque aparecía de golpe y el diálogo
            // pegaba un salto de tamaño. grid-rows de 0fr a 1fr es la forma de
            // animar "alto automático" sin medir nada en JavaScript.
            className="grid grid-rows-[0fr] transition-[grid-template-rows] duration-(--dur-2) ease-in-out data-open:grid-rows-[1fr]"
          >
            <div className="overflow-hidden">
              <div className="flex flex-col gap-3 rounded-sm bg-surface-sunken p-3 opacity-0 transition-opacity duration-(--dur-2) delay-75 ease-(--ease-out) group-data-open:opacity-100">
                {/* … fecha, hueco y raciones de la sobra, sin cambios … */}
              </div>
            </div>
          </div>
```

El bloque deja de estar dentro de un ternario: ahora **siempre se monta** y lo que cambia es su altura. Consecuencia a vigilar: los campos de la sobra quedan en el DOM aunque estén ocultos, así que el contenedor exterior lleva `data-open` y el interior hereda con `group-data-open`, y **los campos se marcan `inert` cuando está cerrado** para que el foco no caiga dentro de una caja de altura cero:

```tsx
            <div className="overflow-hidden" inert={withLeftovers ? undefined : true}>
```

- [ ] **Step 5: Ampliar el test del diálogo** — en `components/cook/finish-dialog.test.tsx`:

```tsx
  it('el bloque de sobras se despliega en vez de aparecer, y no atrapa el foco cerrado', async () => {
    renderDialog()
    await userEvent.click(screen.getByRole('button', { name: /he terminado|i'm done/i }))
    const region = screen.getByLabelText(/fecha de la sobra|leftover date/i).closest('[inert]')
    expect(region).not.toBeNull()
    await userEvent.click(screen.getByRole('checkbox', { name: /sobras|leftovers/i }))
    expect(screen.getByLabelText(/fecha de la sobra|leftover date/i).closest('[inert]')).toBeNull()
  })
```

- [ ] **Step 6: Ejecutar**

Run: `pnpm exec vitest run --project ui components/cook && pnpm exec vitest run --project unit tests/contracts/motion.test.ts`
Expected: PASS los cuatro casos del contrato y todos los del proyecto `ui` de cocina.

- [ ] **Step 7: Commit**

```bash
pnpm exec tsc --noEmit && pnpm lint
git add components/cook tests/contracts/motion.test.ts
git commit -m "Suaviza el cambio de paso y el despliegue de las sobras"
```

---

### Task 15: Las puertas completas y los documentos que dicen la verdad

La última tarea de la oleada. Corre las tres puertas sobre la interfaz definitiva —incluida la pasada de axe en los dos temas, que es la que de verdad certifica los ratios que la Tarea 1 calculó sobre el papel— y pone al día los dos documentos que W6 deja desfasados.

**Files:**
- Modify: `e2e/a11y.spec.ts`, `docs/02-DISENO.md`, `AGENTS.md`, `docs/superpowers/plans/README.md`

**Interfaces:**
- Consumes: todo lo anterior.
- Produces: nada de código.

- [ ] **Step 1: Traer las tres pistas y correr la puerta principal**

```bash
git merge main            # (a) y (b) dentro; ya se hizo antes de la Tarea 14, se repite por si acaso
pnpm check
pnpm build
```
Expected: las dos verdes. Si `pnpm check` falla en un test de componente por una clase renombrada, **el arreglo es del test o del componente, nunca de un token**: cambiar un token a estas alturas invalidaría los ratios del contrato de la Tarea 1.

- [ ] **Step 2: Ampliar la pasada de axe a la puerta de entrada** — `e2e/a11y.spec.ts`. Las cinco pantallas siguen igual (y su `expect(page.getByRole('navigation')).toBeVisible()` sigue valiendo: la barra solo desaparece **dentro** de la sesión de cocina, no en la pestaña `/cook`). Se añade un bloque para las dos pantallas de auth, que W6 acaba de rediseñar y que hasta ahora nadie auditaba:

```ts
for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`accesibilidad de la puerta de entrada (${colorScheme})`, () => {
    test(`login y registro pasan axe en tema ${colorScheme}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme })
      // Sin sesión: son las dos únicas pantallas que se ven sin registrarse, y
      // en W6 estrenan wordmark, lavado de acento y tarjeta con sombra.
      for (const screen of ['/login', '/register']) {
        await page.goto(screen)
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
        const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze()
        expect(violations.map((v) => `${v.id} (${v.nodes.length}): ${v.help}`), `${screen} en tema ${colorScheme}`).toEqual([])
      }
    })
  })
}
```

- [ ] **Step 3: Correr los e2e enteros**

```bash
export LD_LIBRARY_PATH=$HOME/.local/chromium-deps/usr/lib/x86_64-linux-gnu
pnpm db:migrate && pnpm db:seed
pnpm e2e
```
Expected: los diecinueve specs verdes, **sin allowlist en axe** y sin excepciones. Las familias de hallazgo probables y su arreglo, para no improvisar:

- *color-contrast* en un texto sobre `--acc-soft` o `--warn-soft`: **no se toca el token**. Se mira si ese texto debería llevar `--acc-ink`/`--warn-ink` y no lo lleva (es el fallo esperable) y se arregla ahí.
- *aria-progressbar-name* en el progreso de la sesión: la Tarea 13 le puso `aria-label`; si falta, se pone.
- *nested-interactive* en el vacío de Hoy (un `EmptyState` dentro de un `Link`): el `EmptyState` no monta ningún control, así que no debería saltar; si salta, se saca la acción fuera del enlace.
- *region* / *landmark*: no aplica, `best-practice` está fuera de los tags.

Si una violación exigiera cambiar un token de `docs/02-DISENO.md`, **para y pregunta**: es una decisión de diseño, no de accesibilidad.

- [ ] **Step 4: Poner al día `docs/02-DISENO.md`** — cuatro cambios, ninguno cosmético:

1. **Tipografía.** La fila «Datos» pasa a distinguir los dos casos, que es la tensión que W6 cierra:

```md
| Rol | Familia | Uso |
|---|---|---|
| Títulos | **Outfit** 600/700 | Cabeceras de pantalla (`.title-screen`), títulos de contenido (`.title-content`) y **la cifra protagonista** (`.num-hero`, `.num-lead`) |
| Interfaz | **DM Sans** 400/500/600/700 | Todo el texto corriente |
| Datos | **JetBrains Mono** 500/600 | Cifras **en columna**: cantidades, fechas, tablas, totales pequeños (`.tabular`) |

La cifra protagonista —las kcal cocinadas del anillo de Hoy y las kcal por ración
de la ficha— va en **Outfit con `tabular-nums`**, no en monoespaciada: un número
hero en mono se lee como panel de control, justo lo que esta dirección evita
(ver «Qué evitar»). La monoespaciada se reserva para lo que se compara en
columna, que es donde su ancho fijo sirve para algo. Hasta W6 el mismo dato salía
en las dos familias según la pantalla.
```

2. **Sección nueva, «Superficie antes que línea»**: la jerarquía es sombra + escalón de fondo, no borde; `--sh-card` y `--sh-hero` son de dos capas; en «Noche suave» la sombra casi no se ve, así que el borde (`--line-2`) se queda entero en oscuro y casi desaparece en claro; `--surf-sunken` es el fondo del agrupador hundido.

3. **Sección nueva, «El estado seleccionado»**: `.pill-selected` (`--acc-soft` + `--acc-ink` + `--acc-line`), con la regla de que **nunca es la única señal** (siempre acompaña `aria-current` o `aria-pressed`) y de que vive dentro del área táctil, sin reducirla. Y el `--warn-ink` junto al bloque de `--on-acc`, con sus ratios: «`--warn` sirve para bordes, iconos y fondos; el texto pequeño de aviso va en `--warn-ink` (5,44:1 sobre `--surf`, 4,74:1 sobre `--warn-soft`)».

4. **«Reglas de tema»**: la viñeta «Respeta `prefers-reduced-motion`» se precisa —el interruptor es global y vive en `app/globals.css`; ningún componente escribe el suyo— y se añade el presupuesto de movimiento: `--dur-1` 140 ms para lo que se toca muchas veces, `--dur-2` 200 ms para asentados y salidas, `--dur-3` 500 ms para el anillo; y la lista de lo que **no** se anima (barra inferior, stepper, lista de comprobación, propuestas, parrilla de recetas) con su porqué.

También se corrige la línea de `--acc-ink` allí donde el documento lo describa, si lo hace, y se añade a «Componentes que hay que resolver bien» la fila del **vacío** (`EmptyState`) y la del **placeholder de receta**.

- [ ] **Step 5: Poner al día `AGENTS.md`** — solo el párrafo «Estado del proyecto», añadiendo la oleada al final:

```md
**W6 (identidad) hecha el 2026-08-28**: patrón único de «seleccionado» con
`--acc-soft`/`--acc-ink`, superficie en vez de línea (sombras de dos capas,
`--line-2` por tema, sin punteado en el plan), jerarquía tipográfica
(`.title-screen`, hero de kcal con fecha, una sola familia para las cifras
grandes), `EmptyState` y placeholder de receta con degradado por id, cocina a
pantalla completa con `data-fullscreen`, puerta de entrada con marca, `--warn-ink`
para el ámbar pequeño y las cinco animaciones aprobadas. Todo en `main` con
`pnpm check`, `pnpm build` y `pnpm e2e` verdes, y axe limpio en las cinco
pantallas más login y registro, en los dos temas.
```

Y en «Incoherencias entre docs, resueltas», una entrada nueva: «**Cifras**: Outfit para la cifra protagonista, JetBrains Mono para las cifras en columna (manda `docs/02-DISENO.md` desde W6)».

- [ ] **Step 6: El índice de planes** — `docs/superpowers/plans/README.md`, una línea con W6 y su fecha, en el mismo formato que las cinco anteriores.

- [ ] **Step 7: La comprobación final de la oleada**

```bash
git diff main --stat -- messages/ db/ lib/domain lib/validation lib/services lib/actions app/api lib/mcp eslint.config.mjs vitest.config.ts package.json pnpm-lock.yaml
git grep -ilE 'c[l]aude'
git log main..HEAD --format='%an %s' | grep -iE 'co-authored|generated'
```
Expected: las tres sin salida.

- [ ] **Step 8: Commit**

```bash
git add e2e/a11y.spec.ts docs/02-DISENO.md AGENTS.md docs/superpowers/plans/README.md
git commit -m "Pone al día el documento de diseño y el estado del proyecto"
```

---

## Criterio de W6 hecha

En `main`, con las tres pistas dentro:

1. **`pnpm check`, `pnpm build` y `pnpm e2e` verdes**, y `pnpm test:domain-coverage` al 100 % de líneas (que no debería haberse movido: W6 no toca el dominio).
2. **Axe limpio en siete pantallas y dos temas**: las cinco de siempre más `/login` y `/register`, con `wcag2a`, `wcag2aa`, `wcag21a` y `wcag21aa`, **sin una sola excepción en el spec**.
3. **Todo par de color nuevo cumple AA, medido y no estimado**: `tests/contracts/design-tokens.test.ts` calcula `--acc-ink` sobre `--surf`, `--bg`, `--surf-2` y `--acc-soft`, y `--warn-ink` sobre esos tres y `--warn-soft`, para **los ocho acentos y los dos temas**. El peor caso de la oleada es miel en claro: 4,62:1.
4. **Un solo patrón de seleccionado**: `grep -rn 'bg-primary/10' components app` vacío; `.pill-selected` en la barra inferior, los filtros de tags, los de dificultad, los dos chips de «cocinado», la cabecera del día de hoy y las cabeceras de ubicación de la despensa; `settings-nav.tsx` intacto.
5. **Superficie en vez de línea**: `grep -rn 'border-dashed' components app` vacío; `Card`, la fila de Hoy, el chip del plan, la tarjeta de propuesta, la fila de despensa y la de Cocinar llevan `shadow-card` y `border-line-2`; y **cada pantalla tiene su diferencia deliberada** (franja de hueco en Hoy, punto de ubicación en Despensa, icono en círculo en Cocinar).
6. **Una sola voz para las cifras y una sola cabecera**: `tests/contracts/ui-controls.test.ts` falla si un `<h1>` no usa `.title-screen` o `.title-content`; `kcal-ring.tsx` y `nutrition-row.tsx` pintan el mismo dato con la misma familia, y `docs/02-DISENO.md` lo dice.
7. **El ámbar se lee**: `grep -rn 'text-warn\b' components app | grep -v warn-ink` vacío; el patrón `--warn-soft` + `WarningIcon` intacto.
8. **Ocho vacíos con cara**: ningún `<p className="text-sm text-text-2">` haciendo de estado vacío en Hoy, Plan, Despensa, Cocinar, Recetas, Propuestas ni Compra; y el enlace de Hoy conserva su nombre accesible (`e2e/today.spec.ts:9` verde).
9. **La parrilla de recetas deja de ser una rejilla de clones**: `RecipePlaceholder` con ángulo derivado del id, determinista y con su test; ni un aviso de hidratación en `pnpm dev`.
10. **La cocina se lleva la pantalla sin duplicar el layout**: `grep -rn 'requireSession' 'app/(app)'` devuelve **una** línea; no existe ningún `layout.tsx` bajo `app/(app)/cook/`; con la sesión abierta no hay `role="navigation"`; y el vacío de «receta sin pasos» **sí** conserva la barra.
11. **La puerta de entrada tiene marca**: wordmark, lavado de acento y tarjeta con `shadow-hero` en login, registro e invitación, con `common.appName` y **cero activos nuevos**.
12. **Movimiento: cinco sí, cinco no.** `tests/contracts/motion.test.ts` verde: las cinco aceptadas con duración de token, las cinco rechazadas sin una sola transición, y ningún componente con su propia media query de `prefers-reduced-motion`.
13. **Cero i18n**: `git diff main -- messages/` vacío y `pnpm i18n:check` verde.
14. **Cero servidor y cero dependencias**: `git diff main --stat -- db/ lib/domain lib/validation lib/services lib/actions app/api lib/mcp package.json pnpm-lock.yaml eslint.config.mjs vitest.config.ts` vacío.
15. **Las siete reglas de `AGENTS.md` siguen en pie**: `lib/domain` puro y sin tocar; ningún cálculo delegado al modelo (W6 no habla con ninguno); la app funciona sin IA; `household_id` intacto (no hay tablas nuevas); ninguna lista de la compra propia; cero textos sin traducir (y cero claves nuevas); cero telemetría y cero red externa (el degradado es CSS y el wordmark es tipografía).
16. **Sin menciones a herramientas de IA**: `git grep -ilE 'c[l]aude'` vacío; ningún commit con trailers; autor `JarssS8` en todos.
17. **Los documentos dicen la verdad**: `docs/02-DISENO.md` describe la regla de las cifras, la jerarquía de superficie, el estado seleccionado, `--warn-ink` y el presupuesto de movimiento; `AGENTS.md` tiene W6 en «Estado del proyecto»; el índice de planes la lista.

Fuera de alcance, por si tienta al final: las cinco animaciones rechazadas, un layout paralelo para la cocina, fuentes o iconos nuevos y reescribir la dirección «Mercado».

---

## Decisiones tomadas en este plan (no cubiertas por los informes, o que los precisan)

Cada una con su coste si resulta equivocada, para que revertirla sea barato.

1. **La cifra protagonista va en Outfit; JetBrains Mono se reserva para las cifras en columna.** El informe deja la tensión abierta («conviene resolver esa tensión explícitamente en el doc») y recomienda esta dirección; este plan la cierra y la escribe en `docs/02-DISENO.md` (Tarea 15). La razón es del propio documento de diseño: «Qué evitar» dice que el aspecto de panel de control es lo que hizo fracasar la primera versión, y un número hero monoespaciado es exactamente eso. `tabular-nums` se conserva en `.num-hero` porque el número cambia en vivo por SSE y no debe bailar de ancho. **Coste si mal:** las kcal grandes pierden el aire de «dato medido»; se revierte cambiando dos declaraciones en `.num-hero`/`.num-lead`, sin tocar ningún componente.

2. **`--acc-ink` baja del 78 % al 60 % en tema claro, y el tema oscuro no se toca.** No lo pide ningún informe: salió al calcular los ratios del par que estrena la píldora. Con el 78 %, `text-acc-ink` daba **3,60:1 con «miel» y 4,16:1 con «pistacho» sobre blanco** —AA incumplido hoy, en `main`, en la barra inferior y en los enlaces de acento— y 3,24:1 sobre `--acc-soft`. Al 60 % el peor de los ocho da 5,14:1 sobre `--surf` y 4,62:1 sobre `--acc-soft`. En oscuro el token ya daba 5,25:1 en el peor caso, así que cambiarlo solo habría estropeado algo. **Coste si mal:** el verde de los textos de acento es más oscuro y algo menos vivo; se sube el porcentaje y se vuelve a correr `tests/contracts/design-tokens.test.ts`, que dirá exactamente en qué acento se rompe.

3. **El estado seleccionado es una clase de `@layer components` (`.pill-selected`), no una variante de `Button` ni un `cva`.** Los ocho sitios donde hay que ponerlo son de cinco formas distintas (un `Link` de la barra, dos `Button` de filtros, un `span` de chip, un `h2` de cabecera de grupo, un `div` de cabecera de día): una variante de `Button` solo habría servido en dos. Una clase CSS se compone con `cn()` en cualquier elemento, es greppable y el contrato la puede buscar. **Coste si mal:** una clase global más que Tailwind no conoce (no hay autocompletado); a cambio, cambiar el patrón de la app entera es editar cuatro líneas de CSS.

4. **`--acc-line` es decorativo y no se le exige 3:1.** Da 1,5–1,8:1 contra la superficie. Es deliberado: el estado seleccionado lo dicen **tres** cosas a la vez —fondo `--acc-soft`, tinta `--acc-ink` (≥4,5:1) y `aria-current`/`aria-pressed`— y el borde solo dibuja el canto de la píldora. Un borde al 3:1 sobre blanco sería una línea verde oscura y la píldora dejaría de parecer una superficie para parecer un botón. **Coste si mal:** si una revisión de accesibilidad exigiera 3:1 en el borde, se sube el porcentaje de la mezcla en un token y no cambia ni un componente.

5. **La sesión de cocina se saca con `:has()` sobre el layout existente, no con `usePathname` ni con un layout paralelo.** El informe descarta el layout paralelo (duplicaría `requireSession()`); `usePathname` obligaría a convertir el layout en componente de cliente, que es peor. `:has()` deja el layout como Server Component, no añade JavaScript y **el propio hijo declara lo que necesita**, que es la dirección correcta de la dependencia. Tailwind 4.3 lo soporta y el repositorio ya usa variantes `has-data-*`. **Coste si mal:** `:has()` no funciona en navegadores muy viejos (Safari < 15.4); allí la sesión se vería con el marco de la app, que es exactamente lo que hay hoy — degrada al estado actual, no rompe.

6. **`cn-toast` se define, no se borra.** La clase muerta se podía cerrar de dos formas. Se define porque el toast **sí** necesita el estilo del proyecto: sonner trae su propia sombra dura, que contradice «sombras suaves, nunca duras» de `docs/02-DISENO.md`, y el resto (fondo, texto, borde, radio) ya se le pasa por variables CSS en `sonner.tsx`, así que la clase es el único sitio donde poner la sombra y la familia tipográfica. **Coste si mal:** siete líneas de CSS que se borran junto con el `toastOptions` del componente.

7. **Las tres animaciones que viven en ficheros de pantalla viajan con la pantalla, no con la pista de movimiento.** Repartirlas así es lo único que hace que la matriz de solapes salga limpia: si (c) se quedara las cinco, `kcal-ring.tsx`, `pantry-row.tsx` y `day-column.tsx` los escribirían dos pistas a la vez. La coherencia se protege por otro lado: el contrato de movimiento (Tarea 14) las comprueba **todas**, estén donde estén, después de `git merge main`. **Coste si mal:** el informe de animaciones queda repartido entre cuatro tareas en vez de una; la tabla de «Orden de ejecución» dice cuál es cuál.

8. **El vacío de Hoy es un `EmptyState` envuelto en el `Link`, no un `EmptyState` con acción.** La restricción de cero claves i18n manda: `today.emptyPlanLink` es **una** cadena («No hay nada planificado. Ve al plan») y un `EmptyState` con título y acción necesitaría dos. Envolviendo el bloque entero, el nombre accesible del enlace sigue siendo esa cadena y `e2e/today.spec.ts:9` sigue verde. El `EmptyState` no monta ningún control, así que no hay interactivos anidados. **Coste si mal:** un objetivo táctil muy grande (que en Hoy es más virtud que defecto); si molesta, se añaden dos claves y se pasa a `title` + `action`, y esa sí sería una excepción anotada.

9. **`placeholderAngle` vive con el componente, no en `lib/domain`.** El dominio es «escalado, nutrición y consolidación» (regla 1 de `AGENTS.md`) y su contrato es que la pantalla, la REST y el MCP den los mismos números. El ángulo de un degradado no es un número que nadie consuma fuera de la pantalla, y meterlo ahí obligaría a mantener su cobertura al 100 % junto a las reglas de negocio. Sí es **determinista y con test**, que es lo que de verdad importa aquí (la hidratación). **Coste si mal:** si algún día el placeholder tuviera que salir igual en un correo o en una imagen generada en servidor, se mueve el fichero; son veinte líneas puras.

10. **`settings-nav.tsx` no se toca, ni siquiera su `min-h-10`.** Está en la lista «NO tocar» del informe como *el* patrón a copiar, y sus 40 px se quedan por debajo de los 44 que pide `AGENTS.md`. Es una desviación real, pero **preexistente y ajena a los cinco movimientos**: arreglarla dentro de una oleada de identidad la escondería en un commit de estilo. **Coste si mal:** una fila de pestañas de ajustes cuatro píxeles corta; se arregla con una clase en cuanto alguien lo levante como su propia tarea, con su nota en el contrato de controles.

11. **La pasada de axe se amplía a `/login` y `/register`, y no más allá.** §16 pide «las cinco pantallas»; W6 rediseña además la puerta de entrada, que hasta ahora nadie auditaba y que es la única superficie que se ve **sin sesión** (o sea, la más barata de auditar: dos `goto` y ninguna preparación). No se añade la sesión de cocina a la pasada porque exigiría crear receta, plan y entrada dentro del spec de accesibilidad, duplicando lo que ya hace `e2e/loop.spec.ts`. **Coste si mal:** la sesión de cocina no pasa por axe en W6; sus contrastes son los mismos tokens que el resto y su estructura la cubren seis tests de componente.

12. **Ninguna tarea de (b) ni de (c) escribe una línea de CSS global.** Es una restricción autoimpuesta, no de los informes, y es lo que permite que dos pistas corran en paralelo sobre una hoja de estilos compartida sin conflictos: si (b) necesita un token, es que falta una tarea en (a). El único sitio donde asoma es el paso 5 de la Tarea 13 (la barra de progreso quería un `bg-acc` que no existe y usa `bg-primary`, que resuelve al mismo `--acc`). **Coste si mal:** algún componente usa una utilidad con nombre menos expresivo del ideal; a cambio, `app/globals.css` tiene un solo autor en toda la oleada.

### Huecos de los informes que este plan cierra por su cuenta

- **El informe de identidad no mide `--acc-ink` sobre `--acc-soft` ni sobre superficie plana**: propone la píldora dando por bueno el token («probablemente sí, pero es el único punto que exige medida»). Se midió: fallaba en tres de ocho acentos, y **ya fallaba antes de la píldora**. Decisión 2 y Tarea 1.
- **El informe deja abierta la familia de las cifras grandes.** Decisión 1.
- **Ninguno de los dos informes dice qué hacer con `cn-toast`** más allá de señalarlo como bug muerto. Decisión 6.
- **El informe de animaciones dice que si se implementan dos o más filas «merecería la pena promover esos valores a tokens compartidos entonces, no antes»**: se implementan las cinco, así que se promueven (`--dur-1/2/3`, `--ease-out`, `--ease-in`) en la Tarea 1, y el contrato de la Tarea 14 exige que las cinco los usen en vez de números sueltos.
- **El informe propone `--surf-sunken: var(--surf-2)` sin decir quién lo usa.** Este plan lo asigna a tres consumidores concretos (el hueco vacío del plan, la caja de `EmptyState` y el lienzo del modo pared) y deja los otros dos usos de `--surf-2` donde estaban, que es lo que hace que el alias sirva para algo.
- **Ninguno de los dos dice cómo se reparten cinco animaciones entre tres pistas que comparten ficheros.** Decisión 7 y la tabla de «Orden de ejecución y merge».
- **El informe pide un `EmptyState` con «título en display, frase y acción opcional» sin reparar en que las ocho pantallas tienen una sola cadena cada una** y en que la oleada no puede añadir claves. Decisión 8 y la firma del «Contrato de la pista (a)».
