import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { generateShopping, pushShopping, ShopListError } from '@/lib/services/shopping'
import { BaseUnitSchema, DateRangeSchema, IdSchema } from '@/lib/validation/common'
import type { McpCtx } from '../auth'
import { guarded, hasScope, toolError, toolJson } from '../guards'

// Misma forma que ShoppingLineSchema (lib/validation/shopping.ts), estricta
// para que el SDK la valide tal cual. Lo normal es reenviar sin tocar las
// líneas que devolvió generate_shopping_list.
const PushInput = z.strictObject({
  lines: z
    .array(
      z.strictObject({
        foodId: IdSchema.nullable(),
        name: z.string().min(1),
        quantity: z.number().positive().nullable(),
        unit: BaseUnitSchema.nullable(),
        unresolved: z.boolean(),
        pantryUnmatched: z.boolean(),
      }),
    )
    .min(1)
    .max(500),
})

export function registerShoppingTools(server: McpServer, ctx: McpCtx): boolean {
  let registered = false

  // Consolidar exige ver el plan y la despensa: son las dos mitades del cálculo.
  if (hasScope(ctx, 'plan:read', 'pantry:read')) {
    registered = true
    server.registerTool(
      'generate_shopping_list',
      {
        title: 'Generar la compra',
        description:
          'Consolida las comidas planificadas del rango, escala cada receta a sus raciones y RESTA lo que ya hay en la despensa. Devuelve la lista calculada; no la envía a ningún sitio. Las líneas marcadas unresolved o sin cantidad hay que revisarlas a mano. No inventes cantidades: usa las que devuelve.',
        inputSchema: DateRangeSchema,
      },
      guarded('No se pudo generar la lista.', async ({ from, to }: z.infer<typeof DateRangeSchema>) => generateShopping(ctx, { from, to })),
    )
  }

  if (hasScope(ctx, 'shopping:push')) {
    registered = true
    server.registerTool(
      'push_to_shoplist',
      {
        title: 'Enviar a ShopList',
        description:
          'Envía a ShopList unas líneas ya calculadas (normalmente las de generate_shopping_list). Está separada a propósito de generar: enviar es una decisión del usuario, pregúntale antes. No la uses sin haber generado la lista.',
        inputSchema: PushInput,
      },
      // No usa guarded: un fallo de ShopList (servicio externo, no un
      // ServiceError propio) merece decirle al modelo el estado HTTP para que
      // sepa si tiene sentido reintentar, sin filtrar nunca la URL ni el
      // secreto de la integración (lib/integrations/shoplist.ts).
      async ({ lines }: z.infer<typeof PushInput>) => {
        try {
          return toolJson(await pushShopping(ctx, lines))
        } catch (e) {
          if (e instanceof ShopListError) return toolError(`ShopList respondió ${e.status}.`)
          console.error('[mcp]', e)
          return toolError('No se pudo enviar la lista a ShopList.')
        }
      },
    )
  }

  return registered
}
