import { McpServer } from '@modelcontextprotocol/server';
import type { Ctx } from './context.js';
import { setReauthHint } from './errors.js';
import { register as registerRecipeTools } from './tools/recipes.js';
import { register as registerPlanTools } from './tools/plan.js';
import { register as registerPantryTools } from './tools/pantry.js';
import { register as registerShoppingTools } from './tools/shopping.js';
import { register as registerCookTools } from './tools/cook.js';
import { register as registerIntakeTools } from './tools/intake.js';
import appPackage from '../../app/package.json' with { type: 'json' };

// Rezet has one product version (app/package.json); connected AI clients see the same number.
export const SERVER_INFO = { name: 'rezet', version: appPackage.version };

export const INSTRUCTIONS =
  'Rezet manages a household weekly meal plan, recipes, pantry, and shopping list. ' +
  'Dates are always local calendar dates in YYYY-MM-DD form — call get_week_plan first to learn the ' +
  'concrete dates for "today", "tomorrow", "next Tuesday", etc. before calling add_to_plan. ' +
  'Units are g, ml, ud, and tbsp — always pick the one the household would recognize. ' +
  'Ingredient names should be given in Spanish, matching how this household names them (e.g. "lentejas", ' +
  'not "lentils") — they are matched case-insensitively against existing ingredients and created if missing. ' +
  'cook_recipe subtracts the scaled ingredient quantities from the pantry immediately and cannot be undone — ' +
  "confirm with the user before calling it. get_week_plan's kcal figures are the HOUSEHOLD's planned totals " +
  '(the whole cooked dish), never what any one person actually ate — use rezet_my_day for the connected ' +
  "person's own consumed/target/remaining kcal, and rezet_log_intake to log something they ate off-plan.";

export function createRezetServer(ctx: Ctx): McpServer {
  setReauthHint(ctx.reauthHint);

  const server = new McpServer(SERVER_INFO, { instructions: INSTRUCTIONS });

  registerRecipeTools(server, ctx);
  registerPlanTools(server, ctx);
  registerPantryTools(server, ctx);
  registerShoppingTools(server, ctx);
  registerCookTools(server, ctx);
  registerIntakeTools(server, ctx);

  return server;
}
