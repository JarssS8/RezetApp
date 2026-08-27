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

| Herramienta | Qué hace | Por qué así |
|---|---|---|
| `search_recipes` | Busca por texto, etiquetas, tiempo máximo, ingredientes que hay o faltan | Una herramienta con filtros ricos, no cinco búsquedas |
| `get_recipe` | Receta completa, opcionalmente escalada a N raciones | El escalado es un parámetro, no otra herramienta |
| `create_recipe` | Crea una receta estructurada | Permitido; editar y borrar quedan fuera del básico |
| `import_recipe` | Desde URL, texto o imagen | Un punto de entrada; la app decide el método |
| `get_meal_plan` | Plan de un rango de fechas, con nutrición agregada | Rango, no hoy/semana/mes por separado |
| `set_meal_plan` | Crea una propuesta de entradas a añadir o quitar, en lote | Planificar una semana debe ser una llamada, no catorce; la propuesta la aprueba el usuario |
| `get_pantry` | Inventario, con filtro por lo que caduca antes de una fecha | Ese filtro habilita la mejor sugerencia del producto |
| `update_pantry` | Suma o resta existencias | Deltas, no absolutos: menos errores de concurrencia |
| `generate_shopping_list` | Consolida el plan y resta la despensa | Devuelve la lista calculada, no la envía |
| `push_to_shoplist` | Envía esa lista a ShopList | Separada a propósito: calcular y enviar son decisiones distintas |
| `log_cooked` | Marca cocinado, descuenta despensa, registra nutrición | Las tres cosas de forma atómica. Cierra el bucle |
| `get_household_context` | Miembros, alérgenos, objetivos, reglas, qué se cocinó hace poco | Una llamada al principio y el agente ya sabe con quién habla |

## Conexión

El endpoint vive en `<host>/mcp` (por ejemplo `http://localhost:3000/mcp` en
desarrollo). Hace falta un token: créalo en **Ajustes → Tokens de API**
(`/settings/tokens`, solo el propietario del hogar). Al crearlo se eligen:

- **Alcance (scopes)** — qué puede leer o escribir el token. Para lo que hay en
  W2 basta con `household:read` (contexto del hogar) y `recipes:read`
  (buscar y leer recetas). Un token nunca tiene más alcance del que se le
  marque, y se puede revocar en cualquier momento sin tocar los demás.
- **Perfil** — `básico` o `completo`. En W2 ambos exponen las mismas
  herramientas (las 12 del perfil básico llegan por oleadas); `completo`
  queda reservado para cuando existan las que faltan.

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
ver ese token:

```bash
curl -s -X POST localhost:3000/mcp \
  -H 'authorization: Bearer rz_…' \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

Las tres herramientas de esta oleada se llaman con `tools/call`, pasando el
nombre y sus argumentos en `params`:

```bash
curl -s -X POST localhost:3000/mcp \
  -H 'authorization: Bearer rz_…' \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"get_household_context","arguments":{}}}'

curl -s -X POST localhost:3000/mcp \
  -H 'authorization: Bearer rz_…' \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"search_recipes","arguments":{"q":"cebolla"}}}'

curl -s -X POST localhost:3000/mcp \
  -H 'authorization: Bearer rz_…' \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"get_recipe","arguments":{"id":"<id de una receta del hogar>"}}}'
```

La cabecera `accept: application/json, text/event-stream` es obligatoria: el
transporte estándar de MCP exige que el cliente acepte ambos formatos aunque
el servidor (stateless en RezetApp: un `McpServer` por petición) siempre
responda en JSON puro.

## Modelos locales

El MCP se diseña pensando también en modelos locales pequeños (4B–8B
cuantizados, servidos con `llama-server` u Ollama sobre `/v1`): pocas
herramientas, nombres muy distintos entre sí y esquemas estrictos que fallan
con un error claro en vez de aceptar cualquier cosa. Ver la sección "IA
opcional" del README para cómo levantar un servidor de este tipo.

## La regla de oro

**Ningún cálculo se delega al modelo.** Escalar cantidades, sumar calorías,
consolidar ingredientes y restar la despensa son operaciones deterministas del
servidor. El modelo decide *qué* hacer; el código decide *cuánto*.

Es lo que separa un sistema fiable de uno que a veces te dice que 250 g por 3 son
600 g. Y es la versión práctica de la lección del artículo:
*los resultados de las herramientas son la única fuente de verdad*.

Corolario para las descripciones de las herramientas: si el agente no ha leído un
dato de una herramienta, no lo afirma. No lo recuerda ni lo deduce.

## Prompts MCP incluidos

El protocolo permite servir prompts, no solo herramientas. El usuario los ve como
comandos listos. Cuatro para empezar:

- **Planificar la semana** — usa lo que caduca, no repite lo de la semana pasada,
  respeta presupuestos de tiempo y alérgenos.
- **Preparar la compra** — consolida, resta despensa, envía a ShopList.
- **Sesión de cocina** — guía paso a paso de una receta concreta.
- **Resumen nutricional** — del rango que se le pida.

## Nota sobre modelos locales

Si se usa un modelo local (un servidor local compatible con la API de OpenAI:
llama-server de llama.cpp recomendado, Ollama, LM Studio, vLLM…), hay que
probar pronto con el modelo real. Un modelo de 4 a 12 mil millones de parámetros
se confunde entre herramientas parecidas, inventa parámetros y a veces contesta
sin llamar a nada. Lo que funciona con un modelo grande de API puede caerse con
Gemma. Esquemas estrictos que fallen ruidosamente.

Un MCP mínimo (contexto, buscar, receta) llega en la oleada W2 para conservar el feedback temprano.
