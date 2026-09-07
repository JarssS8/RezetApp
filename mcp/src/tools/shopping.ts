import type { McpServer } from '@modelcontextprotocol/server';
import { dateKey, weekDays } from '../../../app/src/domain/dates';
import { createStoreDerivations } from '../../../app/src/domain/deriveStore';
import { SHOPPING_GROUP_ORDER } from '../../../app/src/domain/shopping';
import { roundNice } from '../../../app/src/domain/units';
import type { Ctx } from '../context.js';
import { withErrors } from '../errors.js';
import { loadSnapshot } from '../queries.js';
import { weekOffset } from '../schemas.js';

export function register(server: McpServer, ctx: Ctx): void {
  server.registerTool(
    'get_shopping_list',
    {
      title: 'Get shopping list',
      description:
        'Compute the shopping list for a given week: what the plan needs minus what is already in the pantry, grouped fresco/seco/conserva.',
      inputSchema: { weekOffset },
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    withErrors(async ({ weekOffset: offset }) => {
      const snapshot = await loadSnapshot(ctx.supabase, ctx.householdId);
      const { needsForWeek } = createStoreDerivations({
        pantry: snapshot.pantry,
        recipeById: snapshot.recipeById,
        ingredientById: snapshot.ingredientById,
        plan: snapshot.plan,
        locale: ctx.locale,
      });
      const needs = needsForWeek(offset);

      const dates = weekDays(offset).map(dateKey);
      const monday = dates[0]!;
      const sunday = dates[6]!;

      const groups = SHOPPING_GROUP_ORDER.map((group) => ({
        group,
        items: needs
          .filter((n) => n.group === group)
          .map((n) => ({
            key: n.key,
            ingredientId: n.ingredientId,
            name: n.name,
            quantity: n.quantity,
            quantityRounded: roundNice(n.quantity),
            unit: n.unit,
            checked: Boolean(snapshot.checked[n.key]),
          })),
      })).filter((g) => g.items.length > 0);

      return {
        content: [{ type: 'text', text: JSON.stringify({ weekOffset: offset, monday, sunday, groups }, null, 2) }],
      };
    }),
  );
}
