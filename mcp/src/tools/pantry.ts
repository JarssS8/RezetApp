import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/server';
import type { Ctx } from '../context.js';
import { withErrors } from '../errors.js';
import { mapPantryItem, resolveIngredientId } from '../mappers.js';
import { loadIngredients, loadPantry } from '../queries.js';
import { isoDate, LOCATIONS, UNITS } from '../schemas.js';

export function register(server: McpServer, ctx: Ctx): void {
  server.registerTool(
    'get_pantry',
    {
      title: 'Get pantry',
      description: 'List everything currently in the household pantry, sorted by location then name.',
      inputSchema: {},
      annotations: { readOnlyHint: true, idempotentHint: true },
    },
    withErrors(async () => {
      const [pantry, ingredients] = await Promise.all([
        loadPantry(ctx.supabase, ctx.householdId),
        loadIngredients(ctx.supabase, ctx.householdId),
      ]);
      const ingredientById = new Map(ingredients.map((i) => [i.id, i]));
      const items = pantry
        .map((p) => {
          const ing = ingredientById.get(p.ingredientId);
          return {
            id: p.id,
            ingredientId: p.ingredientId,
            name: ing ? ing.name[ctx.locale] || ing.name.es : p.ingredientId,
            group: ing?.group ?? 'seco',
            quantity: p.quantity,
            unit: p.unit,
            location: p.location,
            expiresInDays: p.expiresInDays,
          };
        })
        .sort((a, b) => a.location.localeCompare(b.location) || a.name.localeCompare(b.name));
      return { content: [{ type: 'text', text: JSON.stringify(items, null, 2) }] };
    }),
  );

  server.registerTool(
    'add_pantry_item',
    {
      title: 'Add pantry item',
      description:
        'Add a pantry item, or merge the quantity into an existing one with the same ingredient/unit/location. Resolves the ingredient by name (case-insensitive), creating it if it does not exist yet.',
      inputSchema: {
        name: z.string().trim().min(1),
        quantity: z.number().positive(),
        unit: z.enum(UNITS),
        location: z.enum(LOCATIONS),
        expiresOn: isoDate.optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    withErrors(async ({ name, quantity, unit, location, expiresOn }) => {
      const ingredientId = await resolveIngredientId(ctx.supabase, ctx.householdId, name, unit);

      const { data, error } = await ctx.supabase
        .rpc('pantry_add', {
          p_ingredient_id: ingredientId,
          p_quantity: quantity,
          p_unit: unit,
          p_location: location,
          p_expires_on: expiresOn ?? null,
        })
        .select('id, merged, added_quantity')
        .single();
      if (error) throw error;

      const id = data.id as string;
      const merged = data.merged as boolean;
      const addedQuantity = Number(data.added_quantity);

      const { data: row, error: rowError } = await ctx.supabase
        .from('pantry_item')
        .select('id, ingredient_id, quantity, unit, location, expires_on')
        .eq('id', id)
        .single();
      if (rowError) throw rowError;

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ id, ingredientId, merged, addedQuantity, pantryItem: mapPantryItem(row) }, null, 2),
          },
        ],
      };
    }),
  );
}
