import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

// Los prompts son texto, no lógica: recuerdan las barandillas del producto
// para que el modelo no tenga que deducirlas. En español: es el idioma por
// defecto del hogar y el usuario los ve como comandos en su cliente.
function user(text: string) {
  return { messages: [{ role: 'user' as const, content: { type: 'text' as const, text } }] }
}

// Los cuatro prompts de docs/05-MCP.md ("Prompts MCP incluidos"). Se registran
// para cualquier contexto autenticado, sin comprobar scopes: son solo texto
// que recuerda al modelo qué herramientas llamar y en qué orden, así que no
// exponen nada que el propio catálogo de herramientas no exponga ya (y ese sí
// respeta los scopes al registrarse).
export function registerPrompts(server: McpServer): void {
  server.registerPrompt(
    'plan_week',
    { title: 'Planificar la semana', description: 'Propone las comidas de la semana usando lo que caduca y respetando alérgenos y tiempos.' },
    () =>
      user(
        [
          'Planifica las comidas de la próxima semana para este hogar.',
          'Empieza llamando a get_household_context y a get_pantry con expiresBefore para saber qué caduca pronto.',
          'Prioriza gastar lo que caduca antes. Evita repetir platos cocinados en los últimos catorce días (get_household_context te dice cuáles).',
          'Respeta los alérgenos y las preferencias de cada miembro, y los presupuestos de tiempo de los días que los tengan.',
          'Cuando lo tengas, llama a set_meal_plan una sola vez con todo el lote. Recuerda al usuario que queda pendiente de su aprobación en la app: tú no escribes el plan.',
        ].join(' '),
      ),
  )

  server.registerPrompt(
    'prepare_shopping',
    { title: 'Preparar la compra', description: 'Consolida el plan, resta la despensa y envía la lista a ShopList si el usuario quiere.' },
    () =>
      user(
        [
          'Prepara la compra de los próximos siete días.',
          'Llama a generate_shopping_list con el rango: el servidor consolida y resta la despensa, tú no calcules nada.',
          'Enseña la lista al usuario señalando las líneas marcadas unresolved o sin cantidad, que hay que revisar a mano.',
          'Solo si el usuario lo pide, llama después a push_to_shoplist con esas mismas líneas.',
        ].join(' '),
      ),
  )

  server.registerPrompt(
    'cooking_session',
    { title: 'Sesión de cocina', description: 'Guía paso a paso de una receta concreta.', argsSchema: { recipe: z.string().describe('Nombre o id de la receta') } },
    ({ recipe }) =>
      user(
        [
          `Guíame para cocinar «${recipe}».`,
          'Busca la receta con search_recipes y léela entera con get_recipe, escalada a las raciones que te diga.',
          'Dame un paso cada vez y espera a que te confirme antes de seguir. Las cantidades son las que devuelve get_recipe: no las recalcules.',
          'Al terminar, ofrécete a registrarlo con log_cooked, preguntando cuántas raciones han salido y si hay sobras.',
        ].join(' '),
      ),
  )

  server.registerPrompt(
    'nutrition_summary',
    { title: 'Resumen nutricional', description: 'Resumen de kilocalorías y macros de un rango.', argsSchema: { range: z.string().describe('Rango en lenguaje natural o dos fechas YYYY-MM-DD') } },
    ({ range }) =>
      user(
        [
          `Hazme un resumen nutricional de ${range}.`,
          'Usa get_meal_plan con ese rango: la nutrición agregada viene calculada por el servidor.',
          'Las kilocalorías son siempre por ración; si das un total, di claramente que es total y de cuántas raciones.',
          'Es informativo: no hay objetivo diario ni dieta que cumplir. No des consejos médicos.',
        ].join(' '),
      ),
  )
}
