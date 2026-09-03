# AGENTS.md — RezetApp

Contexto para cualquier asistente de código. Léelo entero antes de tocar nada.

## Qué es esto

RezetApp es un **recetario self-hosted** con planificador de comidas, despensa,
conteo de calorías y un **endpoint MCP** para que un asistente de IA lo maneje.
Multi-hogar (varias personas comparten datos), open source, sin nada de pago.

**No lleva lista de la compra.** Eso ya existe: es ShopList, otra app del mismo
autor en producción. RezetApp calcula qué hace falta y lo empuja allí.
Ver `docs/06-SHOPLIST.md`. Si te piden "añade la lista de la compra", para y
pregunta — casi seguro es un malentendido.

## Estado del proyecto

W0 (esqueleto) y W1 (contratos: esquema, dominio, auth, validación, eventos)
hechas el 2026-08-26. W2 (módulos) hecha el 2026-08-27: alimentos, recetas,
plan, despensa, IA opcional, ShopList, ajustes y MCP mínimo. W3 (el bucle)
hecha el 2026-08-27: `logCooked` transaccional con descuento de despensa, modo
cocina móvil, pantalla Hoy con SSE, REST completa (§11) con `openapi.json` y
Swagger autoalojado, MCP completo (12 herramientas + perfil completo, prompts y
recurso). W4 (extras) hecha el 2026-08-27: autorrelleno por reglas, cocina con
temporizadores y voz, importar de foto y PDF, migración desde Mealie y Tandoor,
etiquetas jerárquicas, colecciones, fusionar alimentos, alérgenos por miembro,
estadísticas de plan frente a realidad, PWA y avisos push de caducidad.
**W5 (remate) hecha el 2026-08-28**: NativeSelect único
(`components/ui/native-select.tsx`) como única forma de pintar una lista
desplegable, 44 px de objetivo táctil protegido por contrato, deuda saldada
(migración desde Mealie/Tandoor robusta y repetible, sin reexport de `db`
fuera de `lib/services`, prompts MCP en el idioma del hogar), e2e del bucle
completo y pasada de axe AA en las cinco pantallas y los dos temas.
**W6 (identidad) hecha el 2026-08-28**: patrón único de «seleccionado» con
`--acc-soft`/`--acc-ink`, superficie en vez de línea (sombras de dos capas,
`--line-2` por tema, sin punteado en el plan), jerarquía tipográfica
(`.title-screen`, hero de kcal con fecha, una sola familia para las cifras
grandes), `EmptyState` y placeholder de receta con degradado por id, cocina a
pantalla completa con `data-fullscreen`, puerta de entrada con marca, `--warn-ink`
para el ámbar pequeño y las cinco animaciones aprobadas. Todo en `main` con
`pnpm check`, `pnpm build` y `pnpm e2e` verdes, y axe limpio en las cinco
pantallas más login y registro, en los dos temas. El proyecto está completo.
**W10 (caché) hecha el 2026-08-30**: el temporizador ciego de frescura de
30 s se sustituye por caché por componentes (`cacheComponents`) con etiquetas
por hogar — cada lectura pasa por una función `"use cache"` de `lib/cache`
con `(householdId, locale, …)` al principio de la firma, y cada escritura
la caduca desde `lib/services` con `invalidateHousehold`, junto a la línea
que emite el evento SSE, así que las tres puertas (acciones, REST, MCP) la
heredan por construcción. `household_id` llega ahora también a cada clave de
caché (regla 4). El armazón estático de las cinco pantallas —imprescindible
para que la ventana de cliente exista— se guarda con `pnpm check:shell`
(`tests/contracts/prerender-shell.test.ts` contra un `pnpm build` real), una
puerta aparte de `pnpm check` porque necesita el árbol de build compilado.
Trampa pendiente si algún día se añade una Content-Security-Policy: el
`<script>` inline de `PREFS_BOOT_SCRIPT` (`lib/prefs.ts`, pinta tema/acento/idioma
antes del primer pintado) dejaría de ejecutarse bajo un CSP sin
`'unsafe-inline'`; el arreglo es un nonce por petición leído con `headers()`
en `app/layout.tsx` — pero eso vuelve dinámico al layout raíz y se lleva por
delante el armazón estático que esta misma oleada acaba de conseguir, así que
tocaría regenerar `pnpm check:shell` a la vez que se active el CSP, no antes
ni después. Siguiente: mantenimiento. El spec
(`docs/superpowers/specs/2026-08-26-rezetapp-design.md`) manda sobre estos docs
cuando difieren; los planes están en `docs/superpowers/plans/`.

## Comandos

- `pnpm dev` — desarrollo (necesita Postgres: `docker compose up -d db`)
- `pnpm build` · `pnpm start` — producción local
- `pnpm check` — typecheck + lint + i18n + tests + cobertura de `lib/domain` (lo que debe estar verde antes de cada commit)
- `pnpm typecheck` · `pnpm lint` · `pnpm i18n:check` — cada pata por separado
- `pnpm test` · `pnpm test -- lib/domain/scaling.test.ts` — todos / uno
- `pnpm test:domain-coverage` — cobertura de `lib/domain` (umbral: 100 % de líneas)
- `pnpm check:shell` — construye y comprueba que el armazón estático de las cinco pantallas sigue prerenderizado (`tests/contracts/prerender-shell.test.ts`); aparte de `pnpm check` porque exige un `pnpm build` real
- `pnpm e2e` — Playwright (levanta `pnpm dev` si no hay `E2E_BASE_URL`; ver `e2e/README.md`)
- `pnpm db:generate` — genera migración desde `db/schema/`
- `pnpm db:migrate` · `pnpm db:seed` — aplicar migraciones / sembrar (idempotente)
- `pnpm import:mealie <fichero> --household <uuid> [--dry-run]` · `pnpm import:tandoor …` — migrar recetas desde otra app (repetible, no duplica)
- `pnpm notify:expiring` — enviar los avisos push de caducidad (pensado para un cron diario)
- `pnpm build:icons` — regenerar los PNG de `public/` desde el SVG (se versionan)
- `pnpm build:scripts` — empaquetar `migrate`/`seed`/`notify-expiring` para la imagen
- `docker compose up -d` — app + Postgres; la app migra y siembra al arrancar

## Stack decidido

No lo cambies sin decirlo explícitamente y explicar por qué.

- **Next.js 16** (App Router) + **React 19** + **TypeScript**
- **Tailwind v4** + **shadcn/ui** — componentes en el repo, para modificarlos
- **PostgreSQL 17** + **Drizzle ORM** (no Prisma: migraciones más transparentes,
  imagen más ligera)
- **Passkeys** con `@simplewebauthn/server` + `/browser`. OIDC opcional después
- **Server-Sent Events** para tiempo real (no WebSockets: no hacen falta) y
  **Cache Components** para la caché de pantalla: cada lectura pasa por una
  función `"use cache"` con el hogar en la clave y etiquetada `h:<id>:<ámbito>`,
  y cada escritura la caduca desde `lib/services` con `invalidateHousehold`,
  junto a la línea que emite el evento. Las dos son lo mismo dicho a dos
  públicos: el evento avisa a las pantallas abiertas, la etiqueta a la caché.
- **MCP** con el SDK oficial de TypeScript, sobre una route handler en `/mcp`
- **Docker Compose**: una imagen de la app + Postgres
- **Capacitor** más adelante para el APK de Android. iPhone se queda en PWA

Decisiones que el kit dejaba abiertas, cerradas el 2026-08-26:

- **pnpm** como gestor de paquetes. Node ≥ 24.
- **Sesiones propias**: `@simplewebauthn` + tabla `sessions` + cookie con id
  opaco firmado (HMAC). Sin JWT, sin Auth.js.
- **i18n con `next-intl`**, mensajes en `messages/es.json` y `messages/en.json`.
- **`zod`** como único esquema de validación: formularios, REST, herramientas MCP
  y OpenAPI (`zod-openapi`).
- **IA con Vercel AI SDK**: adaptadores `@ai-sdk/anthropic`, `@ai-sdk/openai` y
  `@ai-sdk/openai-compatible` (cualquier servidor local: `llama-server` de
  llama.cpp recomendado, Ollama, LM Studio, vLLM). El hogar elige proveedor en
  ajustes. Tope de gasto en `lib/ai`.
- **SSE** con bus de eventos en proceso. Una sola instancia; sin Redis.
- **Imágenes** en volumen local `./data/uploads`, servidas por Next.
- **Tests**: `vitest` para dominio y unidades; `playwright` para flujos
  (passkeys con autenticador virtual).
- **Migraciones** al arrancar el contenedor con `scripts/migrate.ts`
  (`migrate()` de `drizzle-orm`); `drizzle-kit` solo en desarrollo.

## Respuestas a las cuatro preguntas abiertas

Cerradas el 2026-08-26:

1. **Kcal: informativas.** Por ración y por 100 g junto a la receta, agregadas en
   el plan y en el anillo de Hoy. Sin objetivo diario ni diario alimentario.
2. **Raciones por hueco con default del hogar.** `households.default_servings`;
   cada `meal_plan_entries.servings` puede diferir (invitados).
3. **Cocina en móvil.** Modo cocina para 6" en mano. El modo pared/tablet se
   planeó para la fase 5 y llegó con W4.
4. **IA: elegible entre servidor local OpenAI-compatible y API cloud.** GPU
   objetivo 4–8 GB → modelos 4B–8B cuantizados (Q4_K_M) servidos con
   `llama-server` (llama.cpp): salida estructurada por gramática, control de
   VRAM. Ollama vale igual (misma API en `/v1`). Las herramientas MCP se diseñan para ese caso: pocas,
   nombres muy distintos, esquemas estrictos que fallan ruidosamente.

## Las siete reglas que no se negocian

1. **`lib/domain` es puro.** Escalado de cantidades, cálculo nutricional y
   consolidación de ingredientes viven ahí, sin importar nada de React, Next ni
   HTTP. La UI, la API REST y el MCP consumen las mismas funciones. Ahí van los
   tests. Es lo que garantiza que la pantalla y la IA nunca den números distintos.

2. **Ningún cálculo se delega al modelo.** Escalar, sumar calorías, consolidar y
   restar despensa son operaciones deterministas del servidor. El modelo decide
   *qué* hacer; el código decide *cuánto*.

3. **La app funciona entera sin IA.** Sin clave de API y sin modelo local sigue siendo
   un recetario completo. La IA acelera, nunca habilita.

4. **`household_id` en cada fila desde el primer commit.** Aunque la interfaz
   arranque en modo individual. Meterlo después es una migración horrible.

5. **La compra es de ShopList.** No modeles listas ni ítems de compra aquí.

6. **i18n desde el día 1** (`es` y `en`). Nunca texto de interfaz hardcodeado.

7. **Cero telemetría.** Y dicho en el README.

## Reglas de dominio críticas

Estas tres son las que diferencian a RezetApp. Están detalladas en
`docs/03-DOMINIO.md` — no improvises sobre ellas.

- **Escalado no lineal.** Los ingredientes tienen un flag `scales_linearly`. Sal,
  especias, levadura y alcohol se ajustan con `ratio^0.65`, no se multiplican.
  La UI lo marca en ámbar. Duplicar la sal arruina el plato.
- **Kilocalorías siempre por ración.** Al escalar, el valor por ración *no cambia*;
  lo que cambia es el total. Nunca muestres "412 kcal" a secas.
- **Unidades.** Se guardan siempre en unidad base (g, ml, ud) y se convierten al
  mostrar. Una taza de harina y una de azúcar no pesan lo mismo: la conversión es
  por alimento, no global.

## Convenciones de código

- Identificadores en **inglés**, comentarios y documentación en **español**.
- Nada de `any`. Si no sabes el tipo, defínelo.
- Server Components por defecto; `'use client'` solo donde haga falta interacción.
- Los componentes de shadcn se editan directamente — están en el repo por eso.
  No los envuelvas en capas para no tocarlos.
- Cada función de `lib/domain` con su test. El resto, tests donde aporten.
- Los tests que tocan Postgres van bajo `db/**`, `lib/services/**`, `lib/actions/**`,
  `lib/auth/**` o `scripts/*.test.ts` (proyecto vitest `db`, ver `DB_TEST_GLOBS`):
  solo ahí `getTestDb()` funciona, y solo ahí los ficheros corren en serie.
- Commits en español, imperativo, cortos. **Sin trailers** (`Co-Authored-By`,
  `Generated with`…) ni menciones a herramientas de IA en commits, código, docs
  o colaboradores. El autor es siempre el usuario.

## Estructura objetivo

```
app/
  (app)/            interfaz: hoy, cocinar, plan, despensa, recetas
  api/v1/           REST + OpenAPI generado
  mcp/route.ts      endpoint MCP sobre las mismas funciones de dominio
lib/
  domain/           escalado, nutrición, consolidación (puro, testeable)
  ai/               adaptadores de proveedor + tope de gasto
  integrations/
    shoplist.ts     cliente de la Edge Function de ShopList
db/
  schema.ts         Drizzle
  migrations/
docs/               estos documentos
```

## Las cinco pantallas

Hoy · Cocinar · Plan · Despensa · Recetas. Barra inferior, nada más.
La nutrición, los ajustes y las tiendas **no tienen pestaña**: viven dentro de la
pantalla donde importan. Si una funcionalidad nueva pide una sexta pestaña,
probablemente esté mal ubicada. Ver `docs/01-PRODUCTO.md`.

## Diseño

Dirección **Mercado**: blanco limpio, verde huerta, esquinas generosas.
Modo oscuro **Noche suave**: carbón cálido, no negro azulado.
Tokens listos en `design-tokens.css`. Detalles en `docs/02-DISENO.md`.

No uses el aspecto por defecto de shadcn tal cual — es lo que hace que las cosas
parezcan plantilla. Aplica los tokens antes de dar nada por bueno.

## Incoherencias entre docs, resueltas

- Token de aviso: **`--warn`** (manda `design-tokens.css`). Donde los docs
  digan `--p-warn`, léase `--warn`.
- Campos de despensa: **`location` / `expires_at`** (manda `docs/04-DATOS.md`).
- Los ejemplos en español de `docs/03-DOMINIO.md` y `docs/06-SHOPLIST.md`
  (`escalar`, `Linea`, `enviarACompra`…) se implementan con identificadores en
  inglés (`scaleQuantity`, `ShoppingLine`, `pushToShopList`).
- **Cifras**: Outfit para la cifra protagonista, JetBrains Mono para las
  cifras en columna (manda `docs/02-DISENO.md` desde W6).

## Índice de documentos

| Documento | Qué contiene |
|---|---|
| `docs/01-PRODUCTO.md` | Visión, las cinco pantallas, qué NO construir |
| `docs/02-DISENO.md` | Tokens, tipografía, componentes, iconos |
| `docs/03-DOMINIO.md` | Escalado, kcal, unidades, despensa — las reglas duras |
| `docs/04-DATOS.md` | Esquema de Drizzle propuesto |
| `docs/05-MCP.md` | Las 12 herramientas, barandillas y prompts |
| `docs/06-SHOPLIST.md` | Integración con la app de la compra |
| `docs/07-ROADMAP.md` | Fases 0 a 5 y catálogo de funcionalidades |

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
