# 05 · La capa MCP

Va **integrada en la app**, no en un repo aparte: una route handler en `/mcp` que
llama a las mismas funciones de `lib/domain` que usa la interfaz.

Todo lo de aquí sale de revisar los trece servidores MCP comunitarios que existen
para Mealie y Tandoor, y de un artículo de alguien que montó un agente de
planificación de comidas con MCP e IA local.

## Decisiones de transporte y forma

- **HTTP, no solo stdio.** Stdio solo funciona en la misma máquina. Con HTTP en
  `/mcp` sirve desde el móvil o desde un cliente MCP de escritorio sin túneles.
  Transporte: `WebStandardStreamableHTTPServerTransport` del SDK oficial sobre la
  route handler.
- **Autenticación:** Bearer `rz_…` (token visible en API con ese prefijo, guardado
  con sha256). Los conectores que exigen OAuth no pueden conectarse directamente
  (usar un cliente de escritorio o `mcp-remote --header`); OAuth queda como trabajo
  futuro.
- **Herramientas por acción, no una por endpoint.** Un servidor de Mealie expone
  246 herramientas en espejo de la API y otro las condensa en 11. Las condensadas
  funcionan mucho mejor, sobre todo con modelos locales pequeños.
- **Perfiles.** `basico` (~12 herramientas, por defecto) y `completo`. Un servidor
  de Tandoor expone 271 y sería inmanejable sin perfiles. El perfil (`basic`/`full`)
  lo fija cada token.
- **Pocas herramientas con nombres muy distintos entre sí**, y descripciones que
  digan cuándo **no** usarlas.

## Barandillas de seguridad

- **Crear sí, editar y borrar no** en el perfil básico. El agente puede añadir
  recetas pero no reescribir ni borrar las que ya existen. Se desbloquea si el
  usuario lo pide explícitamente.
- **Tokens con nombre y alcance**, revocables por separado. No un token maestro.
- **La IA propone, el usuario aprueba.** Los cambios de plan se devuelven como una
  propuesta que la interfaz enseña en diff. Nunca escritura directa silenciosa.
- OIDC opcional para quien exponga el MCP fuera de su red local.

## Las doce herramientas del perfil básico

Las doce ya existen.

| Herramienta | Existe | Qué hace | Por qué así |
|---|---|---|---|
| `search_recipes` | ✓ | Busca por texto, etiquetas, tiempo máximo, ingredientes que hay o faltan | Una herramienta con filtros ricos, no cinco búsquedas |
| `get_recipe` | ✓ | Receta completa, opcionalmente escalada a N raciones | El escalado es un parámetro, no otra herramienta |
| `create_recipe` | ✓ | Crea una receta estructurada | Permitido; editar y borrar quedan fuera del básico |
| `import_recipe` | ✓ | Desde URL, texto o imagen | Un punto de entrada; la app decide el método |
| `get_meal_plan` | ✓ | Plan de un rango de fechas, con nutrición agregada | Rango, no hoy/semana/mes por separado |
| `set_meal_plan` | ✓ | Crea una propuesta de entradas a añadir o quitar, en lote | Planificar una semana debe ser una llamada, no catorce; la propuesta la aprueba el usuario |
| `get_pantry` | ✓ | Inventario, con filtro por lo que caduca antes de una fecha | Ese filtro habilita la mejor sugerencia del producto |
| `update_pantry` | ✓ | Suma o resta existencias | Deltas, no absolutos: menos errores de concurrencia |
| `generate_shopping_list` | ✓ | Consolida el plan y resta la despensa | Devuelve la lista calculada, no la envía |
| `push_to_shoplist` | ✓ | Envía esa lista a ShopList | Separada a propósito: calcular y enviar son decisiones distintas |
| `log_cooked` | ✓ | Marca cocinado, descuenta despensa, registra nutrición | Las tres cosas de forma atómica. Cierra el bucle |
| `get_household_context` | ✓ | Miembros, alérgenos, objetivos, reglas, qué se cocinó hace poco | Una llamada al principio y el agente ya sabe con quién habla |

## Las herramientas del perfil completo

Se registran solo si el token tiene `mcp_profile = completo` **y** el alcance
que les corresponde. `merge_foods` (fusionar dos alimentos duplicados) queda
pendiente de la oleada W4, junto con las etiquetas jerárquicas: registrarla
vacía sería peor que no tenerla, un modelo pequeño la intentaría igual.

| Herramienta | Qué hace | Por qué solo en completo |
|---|---|---|
| `update_recipe` | Reemplaza por completo una receta existente | Reescribir una receta que ya usan otros huecos del plan pide confirmación explícita |
| `delete_recipe` | Borra una receta (borrado suave) | Irreversible desde el punto de vista del agente; el básico solo puede crear |
| `update_meal_plan_entry` | Cambia raciones, marca saltada o mueve de día/hueco una entrada ya existente | Toca una entrada sin pasar por la propuesta de `set_meal_plan` |
| `delete_pantry_item` | Elimina del inventario un artículo entero | Para dejarlo a cero sin perder ubicación ni caducidad basta `update_pantry` con un delta negativo |
| `create_food` | Añade un alimento al catálogo con su nutrición por 100 g | Un dato mal escrito (una densidad inventada, por ejemplo) estropea el escalado de cualquier receta que lo use |
| `merge_foods` | — | Pendiente de W4 |

## Alcance (scopes)

Cada herramienta exige el scope indicado, además del perfil (básico o
completo) que le corresponda. Un token nunca ve ni puede llamar a una
herramienta para la que le falte cualquiera de los dos.

| Herramienta | Scopes | Perfil |
|---|---|---|
| `get_household_context` | `household:read` | básico |
| `search_recipes`, `get_recipe` | `recipes:read` | básico |
| `create_recipe`, `import_recipe` | `recipes:write` | básico |
| `get_meal_plan` | `plan:read` | básico |
| `set_meal_plan` | `plan:write` | básico |
| `get_pantry` | `pantry:read` | básico |
| `update_pantry` | `pantry:write` | básico |
| `generate_shopping_list` | `plan:read` + `pantry:read` | básico |
| `push_to_shoplist` | `shopping:push` | básico |
| `log_cooked` | `cooking:write` | básico |
| `update_recipe`, `delete_recipe` | `recipes:write` | completo |
| `update_meal_plan_entry` | `plan:write` | completo |
| `delete_pantry_item` | `pantry:write` | completo |
| `create_food` | `recipes:write` | completo |
| `merge_foods` | — | pendiente (W4) |

## Conexión

El endpoint vive en `<host>/mcp` (por ejemplo `http://localhost:3000/mcp` en
desarrollo). Hace falta un token: créalo en **Ajustes → Tokens de API**
(`/settings/tokens`, solo el propietario del hogar). Al crearlo se eligen:

- **Alcance (scopes)** — qué puede leer o escribir el token, uno por uno según
  la tabla de arriba. Un token nunca tiene más alcance del que se le marque, y
  se puede revocar en cualquier momento sin tocar los demás.
- **Perfil** — `básico` o `completo`. El básico puede leer todo y crear
  (recetas, alimentos) pero no editar ni borrar nada que ya exista; el
  completo añade `update_recipe`, `delete_recipe`, `update_meal_plan_entry`,
  `delete_pantry_item` y `create_food` (`merge_foods` llega en W4). El perfil
  se fija al crear el token, no por sesión.

El token en claro (`rz_…`) solo se muestra una vez, al crearlo: guárdalo, la
base de datos solo conserva su hash.

### Cliente MCP de escritorio

La mayoría de clientes MCP de escritorio hablan stdio, no HTTP directo. Para
conectarlos a `/mcp` hace falta el puente
[`mcp-remote`](https://www.npmjs.com/package/mcp-remote), que el propio
cliente lanza con `npx` y que reenvía la cabecera `Authorization`:

```json
{
  "mcpServers": {
    "rezetapp": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "https://<host>/mcp",
        "--header",
        "Authorization: Bearer rz_…"
      ]
    }
  }
}
```

Sustituye `<host>` por el dominio (o `localhost:3000` en desarrollo) y
`rz_…` por el token creado en `/settings/tokens`.

**Límite conocido:** los conectores que exigen OAuth para añadir un servidor
MCP (sin opción de cabeceras personalizadas) no pueden conectarse
directamente a RezetApp — el endpoint solo acepta Bearer `rz_…`, no un flujo
OAuth. La vía soportada es un cliente MCP de escritorio (o cualquier cliente
que permita `mcp-remote --header`) o esta misma prueba manual con `curl`.
OIDC/OAuth queda como trabajo futuro (ver "Barandillas de seguridad" arriba).

### Prueba manual con `curl`

Con `pnpm dev` levantado y un token creado, `tools/list` confirma qué puede
ver ese token (depende de sus scopes y de su perfil):

```bash
curl -s -X POST localhost:3000/mcp \
  -H 'authorization: Bearer rz_…' \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

`prompts/list` enseña los cuatro prompts servidos (ver más abajo) y no
depende de ningún scope:

```bash
curl -s -X POST localhost:3000/mcp \
  -H 'authorization: Bearer rz_…' \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":2,"method":"prompts/list"}'
```

`resources/read` con `household://context` da el mismo contenido que
`get_household_context`, más lo que caduca pronto (necesita `household:read`):

```bash
curl -s -X POST localhost:3000/mcp \
  -H 'authorization: Bearer rz_…' \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":3,"method":"resources/read","params":{"uri":"household://context"}}'
```

Cualquier herramienta se llama con `tools/call`, pasando el nombre y sus
argumentos en `params`:

```bash
curl -s -X POST localhost:3000/mcp \
  -H 'authorization: Bearer rz_…' \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"search_recipes","arguments":{"q":"cebolla"}}}'
```

`set_meal_plan` es la herramienta que más conviene probar a mano, porque su
respuesta **no confirma un cambio ya hecho**: es una propuesta pendiente de
aprobación en la app.

```bash
curl -s -X POST localhost:3000/mcp \
  -H 'authorization: Bearer rz_…' \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"set_meal_plan","arguments":{"add":[{"date":"2026-09-01","slot":"dinner","recipeId":"<id de una receta del hogar>"}],"remove":[]}}}'
```

El `content[0].text` de esa respuesta trae `{ "proposalId": "…", "status":
"pending", "diff": { "add": […], "remove": […] } }`: `proposalId` identifica
la propuesta, `status` siempre empieza en `pending` y el plan real no cambia
hasta que alguien la aprueba desde la interfaz.

La cabecera `accept: application/json, text/event-stream` es obligatoria: el
transporte estándar de MCP exige que el cliente acepte ambos formatos aunque
el servidor (stateless en RezetApp: un `McpServer` por petición) siempre
responda en JSON puro.

## Prompts

El protocolo permite servir prompts, no solo herramientas: el cliente MCP los
enseña como comandos listos. Cuatro para empezar:

- **`plan_week`** (Planificar la semana) — usa lo que caduca, no repite lo de
  la semana pasada, respeta presupuestos de tiempo y alérgenos, y termina con
  una única llamada a `set_meal_plan`.
- **`prepare_shopping`** (Preparar la compra) — consolida el plan, resta la
  despensa y solo envía a ShopList si el usuario lo pide.
- **`cooking_session`** (Sesión de cocina, recibe `recipe`) — guía paso a paso
  de una receta concreta, sin recalcular cantidades.
- **`nutrition_summary`** (Resumen nutricional, recibe `range`) — resumen de
  kilocalorías y macros de un rango, siempre informativo.

Se registran para cualquier token autenticado, sin comprobar scopes: son solo
texto que recuerda al modelo qué herramientas llamar y en qué orden, y las
herramientas en sí ya respetan los scopes al registrarse.

## Recurso

`household://context` (mimeType `application/json`) da de una sola lectura lo
mismo que `get_household_context` más lo que caduca pronto: miembros,
alérgenos, raciones por defecto, artículos que caducan y lo cocinado
recientemente. Pensado para adjuntarse al principio de la conversación en vez
de llamarse como herramienta. Requiere `household:read`; sin ese scope no
aparece en `resources/list`.

## Modelos locales

El MCP se diseña pensando también en modelos locales pequeños (4B–8B
cuantizados, servidos con `llama-server` de llama.cpp u Ollama sobre `/v1`,
por ejemplo `qwen3` en 4B u 8B): pocas herramientas, nombres muy distintos
entre sí y esquemas estrictos que fallan con un error claro en vez de aceptar
cualquier cosa. El servidor nunca deja que el modelo calcule cantidades: eso
es "La regla de oro" de la sección siguiente. Ver la sección "IA opcional" del
README para cómo levantar un servidor de este tipo, y
`lib/mcp/local-model.db.test.ts` para una prueba de humo (se salta salvo que
haya un servidor local levantado) de si un modelo de este tamaño elige bien
entre estas herramientas.

## La regla de oro

**Ningún cálculo se delega al modelo.** Escalar cantidades, sumar calorías,
consolidar ingredientes y restar la despensa son operaciones deterministas del
servidor. El modelo decide *qué* hacer; el código decide *cuánto*.

Es lo que separa un sistema fiable de uno que a veces te dice que 250 g por 3 son
600 g. Y es la versión práctica de la lección del artículo:
*los resultados de las herramientas son la única fuente de verdad*.

Corolario para las descripciones de las herramientas: si el agente no ha leído un
dato de una herramienta, no lo afirma. No lo recuerda ni lo deduce.

Un modelo de 4 a 12 mil millones de parámetros se confunde entre herramientas
parecidas, inventa parámetros y a veces contesta sin llamar a nada: lo que
funciona con un modelo grande de API puede caerse con uno pequeño. De ahí los
esquemas estrictos que fallan con un error claro (ver "Modelos locales" más
arriba) en vez de aceptar cualquier cosa.
