import type { OAuthHelpers } from '@cloudflare/workers-oauth-provider';

/**
 * `OAUTH_PROVIDER` is not a declared binding — `OAuthProvider` injects it into `env` at
 * request time (see `getOAuthApi` in `@cloudflare/workers-oauth-provider`). `wrangler types`
 * has no way to know about it, so it is added here by hand.
 */
export interface Env extends Cloudflare.Env {
  OAUTH_PROVIDER: OAuthHelpers;
}

/** Fails fast with a readable message instead of a confusing runtime error deep in a handler. */
export function assertEnv(env: Env): Env {
  const required = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'PUBLIC_ORIGIN', 'APP_URL', 'REZET_TZ'] as const;
  const missing = required.filter((key) => !env[key]);
  if (missing.length > 0) {
    throw new Error(`rezet-mcp worker: missing env var(s): ${missing.join(', ')}`);
  }
  if (!env.OAUTH_KV) {
    throw new Error('rezet-mcp worker: missing OAUTH_KV binding');
  }
  return env;
}
