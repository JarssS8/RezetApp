# 05 · La capa MCP

Va **integrada en la app**, no en un repo aparte: una route handler en `/mcp` que
llama a las mismas funciones de `lib/domain` que usa la interfaz.

Todo lo de aquí sale de revisar los trece servidores MCP comunitarios que existen
para Mealie y Tandoor, y de un artículo de alguien que montó un agente de
planificación de comidas con MCP e IA local.

## Decisiones de transporte y forma

- **HTTP, no solo stdio.** Stdio solo funciona en la misma máquina. Con HTTP en
  `/mcp` sirve desde el móvil o desde un cliente MCP de escritorio sin túneles.
- **Herramientas por acción, no una por endpoint.** Un servidor de Mealie expone
  246 herramientas en espejo de la API y otro las condensa en 11. Las condensadas
  funcionan mucho mejor, sobre todo con modelos locales pequeños.
- **Perfiles.** `basico` (~12 herramientas, por defecto) y `completo`. Un servidor
  de Tandoor expone 271 y sería inmanejable sin perfiles.
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
| `set_meal_plan` | Añade o quita entradas, en lote | Planificar una semana debe ser una llamada, no catorce |
| `get_pantry` | Inventario, con filtro por lo que caduca antes de una fecha | Ese filtro habilita la mejor sugerencia del producto |
| `update_pantry` | Suma o resta existencias | Deltas, no absolutos: menos errores de concurrencia |
| `generate_shopping_list` | Consolida el plan y resta la despensa | Devuelve la lista calculada, no la envía |
| `push_to_shoplist` | Envía esa lista a ShopList | Separada a propósito: calcular y enviar son decisiones distintas |
| `log_cooked` | Marca cocinado, descuenta despensa, registra nutrición | Las tres cosas de forma atómica. Cierra el bucle |
| `get_household_context` | Miembros, alérgenos, objetivos, reglas, qué se cocinó hace poco | Una llamada al principio y el agente ya sabe con quién habla |

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

Si se usa un modelo local (llama-server, Ollama), hay que probar pronto con el modelo real. Un modelo de 4 a 12 mil
millones de parámetros se confunde entre herramientas parecidas, inventa parámetros
y a veces contesta sin llamar a nada. Lo que funciona con un modelo grande de API puede caerse con
Gemma. Esquemas estrictos que fallen ruidosamente.
