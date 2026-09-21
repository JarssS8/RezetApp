import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import type { Ctx } from './context.js';
import { env } from './env.js';
import { createRezetServer } from './server.js';
import { createRezetClient, requireSession } from './supabase.js';

// touch env now so a missing SUPABASE_URL/ANON_KEY fails fast at startup
void env;

const supabase = createRezetClient({ autoRefresh: true });

supabase.auth.onAuthStateChange((event) => {
  console.error(`[rezet-mcp] auth ${event}`);
});

let session;
try {
  session = await requireSession(supabase);
} catch (err) {
  console.error(`[rezet-mcp] ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}

const ctx: Ctx = {
  supabase,
  householdId: session.householdId,
  userId: session.userId,
  locale: session.locale,
  reauthHint: 'Run `npm run login` in /home/jars/Programing/Rezet/mcp, then restart the MCP server.',
};

const server = createRezetServer(ctx);

const transport = new StdioServerTransport();
await server.connect(transport);

console.error(`[rezet-mcp] ready as ${session.email} / household ${session.householdId}`);
