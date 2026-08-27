import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { generateShopping, pushShopping } from '@/lib/services/shopping'
import { BaseUnitSchema, DateSchema, IdSchema } from '@/lib/validation/common'
import type { McpCtx } from '../auth'
import { guarded, hasScope } from '../guards'

const GenerateInput = z.strictObject({
  from: DateSchema.describe('Primer día del rango a consolidar'),
  to: DateSchema.describe('Último día del rango, inclusive'),
})

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
  let any = false

  // Consolidar exige ver el plan y la despensa: son las dos mitades del cálculo.
  if (hasScope(ctx, 'plan:read', 'pantry:read')) {
    any = true
    server.registerTool(
      'generate_shopping_list',
      {
        title: 'Generar la compra',
        description:
          'Consolida las comidas planificadas del rango, escala cada receta a sus raciones y RESTA lo que ya hay en la despensa. Devuelve la lista calculada; no la envía a ningún sitio. Las líneas marcadas unresolved o sin cantidad hay que revisarlas a mano. No inventes cantidades: usa las que devuelve.',
        inputSchema: GenerateInput,
      },
      guarded('No se pudo generar la lista.', async ({ from, to }: z.infer<typeof GenerateInput>) => generateShopping(ctx, { from, to })),
    )
  }

  if (hasScope(ctx, 'shopping:push')) {
    any = true
    server.registerTool(
      'push_to_shoplist',
      {
        title: 'Enviar a ShopList',
        description:
          'Envía a ShopList unas líneas ya calculadas (normalmente las de generate_shopping_list). Está separada a propósito de generar: enviar es una decisión del usuario, pregúntale antes. No la uses sin haber generado la lista.',
        inputSchema: PushInput,
      },
      guarded('No se pudo enviar la lista a ShopList.', async ({ lines }: z.infer<typeof PushInput>) => pushShopping(ctx, lines)),
    )
  }

  return any
}
