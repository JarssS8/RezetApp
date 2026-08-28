import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { Locale } from '@/lib/domain'

// Los prompts son texto, no lógica: recuerdan las barandillas del producto
// para que el modelo no tenga que deducirlas. Van en el idioma del hogar
// (ctx.locale): el usuario los ve como comandos en su cliente MCP, y en un
// hogar en inglés cuatro comandos en español son cuatro comandos que no se
// entienden. Los NOMBRES no se traducen nunca: son el identificador del
// protocolo, igual que los nombres de las herramientas.
function user(text: string) {
  return { messages: [{ role: 'user' as const, content: { type: 'text' as const, text } }] }
}

// Un texto por idioma. Se escriben a mano aquí, fuera de next-intl, por el
// mismo motivo que los avisos de push (W4, decisión 22): esto se registra en
// una petición sin contexto de React, y son ocho párrafos, no un catálogo.
type Texts = { title: string; description: string; lines: string[] }
type ByLocale = Record<Locale, Texts>

const PLAN_WEEK: ByLocale = {
  es: {
    title: 'Planificar la semana',
    description: 'Propone las comidas de la semana usando lo que caduca y respetando alérgenos y tiempos.',
    lines: [
      'Planifica las comidas de la próxima semana para este hogar.',
      'Empieza llamando a get_household_context y a get_pantry con expiresBefore para saber qué caduca pronto.',
      'Prioriza gastar lo que caduca antes. Evita repetir platos cocinados en los últimos catorce días (get_household_context te dice cuáles).',
      'Respeta los alérgenos y las preferencias de cada miembro, y los presupuestos de tiempo de los días que los tengan.',
      'Cuando lo tengas, llama a set_meal_plan una sola vez con todo el lote. Recuerda al usuario que queda pendiente de su aprobación en la app: tú no escribes el plan.',
    ],
  },
  en: {
    title: 'Plan the week',
    description: 'Proposes the week’s meals using what is about to expire, respecting allergens and time budgets.',
    lines: [
      'Plan next week’s meals for this household.',
      'Start by calling get_household_context and get_pantry with expiresBefore to learn what expires soon.',
      'Use up what expires first. Avoid repeating dishes cooked in the last fourteen days (get_household_context lists them).',
      'Respect every member’s allergens and preferences, and the time budgets of the days that have one.',
      'When you have it, call set_meal_plan once with the whole batch. Remind the user it is still pending their approval in the app: you do not write the plan.',
    ],
  },
}

const PREPARE_SHOPPING: ByLocale = {
  es: {
    title: 'Preparar la compra',
    description: 'Consolida el plan, resta la despensa y envía la lista a ShopList si el usuario quiere.',
    lines: [
      'Prepara la compra de los próximos siete días.',
      'Llama a generate_shopping_list con el rango: el servidor consolida y resta la despensa, tú no calcules nada.',
      'Enseña la lista al usuario señalando las líneas marcadas unresolved o sin cantidad, que hay que revisar a mano.',
      'Solo si el usuario lo pide, llama después a push_to_shoplist con esas mismas líneas.',
    ],
  },
  en: {
    title: 'Prepare the shopping',
    description: 'Consolidates the plan, subtracts the pantry and sends the list to ShopList if the user wants it.',
    lines: [
      'Prepare the shopping for the next seven days.',
      'Call generate_shopping_list with the range: the server consolidates and subtracts the pantry, you do not compute anything.',
      'Show the list to the user, pointing out the lines marked unresolved or without a quantity, which need a manual check.',
      'Only if the user asks, then call push_to_shoplist with those same lines.',
    ],
  },
}

const COOKING_SESSION: Record<Locale, Omit<Texts, 'lines'> & { lines: (recipe: string) => string[]; argument: string }> = {
  es: {
    title: 'Sesión de cocina',
    description: 'Guía paso a paso de una receta concreta.',
    argument: 'Nombre o id de la receta',
    lines: (recipe) => [
      `Guíame para cocinar «${recipe}».`,
      'Busca la receta con search_recipes y léela entera con get_recipe, escalada a las raciones que te diga.',
      'Dame un paso cada vez y espera a que te confirme antes de seguir. Las cantidades son las que devuelve get_recipe: no las recalcules.',
      'Al terminar, ofrécete a registrarlo con log_cooked, preguntando cuántas raciones han salido y si hay sobras.',
    ],
  },
  en: {
    title: 'Cooking session',
    description: 'Step-by-step guidance for one recipe.',
    argument: 'Recipe name or id',
    lines: (recipe) => [
      `Walk me through cooking “${recipe}”.`,
      'Find the recipe with search_recipes and read it in full with get_recipe, scaled to the servings I tell you.',
      'Give me one step at a time and wait for my confirmation before moving on. The quantities are the ones get_recipe returns: do not recompute them.',
      'When we finish, offer to record it with log_cooked, asking how many servings came out and whether there are leftovers.',
    ],
  },
}

const NUTRITION_SUMMARY: Record<Locale, Omit<Texts, 'lines'> & { lines: (range: string) => string[]; argument: string }> = {
  es: {
    title: 'Resumen nutricional',
    description: 'Resumen de kilocalorías y macros de un rango.',
    argument: 'Rango en lenguaje natural o dos fechas YYYY-MM-DD',
    lines: (range) => [
      `Hazme un resumen nutricional de ${range}.`,
      'Usa get_meal_plan con ese rango: la nutrición agregada viene calculada por el servidor.',
      'Las kilocalorías son siempre por ración; si das un total, di claramente que es total y de cuántas raciones.',
      'Es informativo: no hay objetivo diario ni dieta que cumplir. No des consejos médicos.',
    ],
  },
  en: {
    title: 'Nutrition summary',
    description: 'Calorie and macro summary for a range.',
    argument: 'Range in plain language, or two YYYY-MM-DD dates',
    lines: (range) => [
      `Give me a nutrition summary for ${range}.`,
      'Use get_meal_plan with that range: the aggregated nutrition comes computed by the server.',
      'Calories are always per serving; if you give a total, say clearly that it is a total and for how many servings.',
      'It is informational: there is no daily target and no diet to meet. Do not give medical advice.',
    ],
  },
}

// Los cuatro prompts de docs/05-MCP.md ("Prompts MCP incluidos"). Se registran
// para cualquier contexto autenticado, sin comprobar scopes: son solo texto
// que recuerda al modelo qué herramientas llamar y en qué orden, así que no
// exponen nada que el propio catálogo de herramientas no exponga ya (y ese sí
// respeta los scopes al registrarse).
export function registerPrompts(server: McpServer, locale: Locale): void {
  const planWeek = PLAN_WEEK[locale]
  server.registerPrompt('plan_week', { title: planWeek.title, description: planWeek.description }, () => user(planWeek.lines.join(' ')))

  const shopping = PREPARE_SHOPPING[locale]
  server.registerPrompt('prepare_shopping', { title: shopping.title, description: shopping.description }, () => user(shopping.lines.join(' ')))

  const cooking = COOKING_SESSION[locale]
  server.registerPrompt(
    'cooking_session',
    { title: cooking.title, description: cooking.description, argsSchema: { recipe: z.string().describe(cooking.argument) } },
    ({ recipe }) => user(cooking.lines(recipe).join(' ')),
  )

  const nutrition = NUTRITION_SUMMARY[locale]
  server.registerPrompt(
    'nutrition_summary',
    { title: nutrition.title, description: nutrition.description, argsSchema: { range: z.string().describe(nutrition.argument) } },
    ({ range }) => user(nutrition.lines(range).join(' ')),
  )
}
