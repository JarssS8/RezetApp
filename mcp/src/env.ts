import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const mcpDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const localEnvPath = path.join(mcpDir, '.env');
const appEnvPath = path.join(mcpDir, '..', 'app', '.env.local');

const envPath = existsSync(localEnvPath) ? localEnvPath : appEnvPath;
if (existsSync(envPath)) {
  process.loadEnvFile(envPath);
}

const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    `rezet-mcp: missing SUPABASE_URL / SUPABASE_ANON_KEY. Set them in one of:\n` +
      `  ${localEnvPath}\n` +
      `  ${appEnvPath}\n` +
      `(SUPABASE_URL / SUPABASE_ANON_KEY or VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)`
  );
}

export const env = { url, anonKey };
