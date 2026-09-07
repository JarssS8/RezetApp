import { OAuthError, OAuthProvider } from '@cloudflare/workers-oauth-provider';
import type { TokenExchangeCallbackOptions, TokenExchangeCallbackResult } from '@cloudflare/workers-oauth-provider';
import { createMcpHandler, getMcpAuthContext } from 'agents/mcp/server';
import { createClient } from '@supabase/supabase-js';
import { createRezetServer } from '../server.js';
import { authHandler } from './authHandler.js';
import { installClock } from './clock.js';
import type { Env } from './env.js';
import { isRezetProps, type RezetProps } from './props.js';
import { loadProfile, refreshSession } from './supabaseAuth.js';

const ACCESS_TOKEN_TTL = 45 * 60; // must stay below Supabase JWT expiry (§3.6)
const REFRESH_TOKEN_TTL = 30 * 24 * 3600; // provider default, stated explicitly

function invalidToken(env: Env, description: string): Response {
  const meta = `${env.PUBLIC_ORIGIN}/.well-known/oauth-protected-resource/mcp`;
  return new Response(JSON.stringify({ error: 'invalid_token', error_description: description }), {
    status: 401,
    headers: {
      'content-type': 'application/json',
      'www-authenticate': `Bearer error="invalid_token", error_description="${description}", resource_metadata="${meta}"`,
    },
  });
}

let mcp: ReturnType<typeof createMcpHandler> | undefined;

function mcpHandlerFor(env: Env) {
  mcp ??= createMcpHandler(
    () => {
      const props = getMcpAuthContext()?.props;
      if (!isRezetProps(props)) throw new Error('missing auth props'); // unreachable behind the wrapper
      installClock(env.REZET_TZ);
      const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        global: { headers: { Authorization: `Bearer ${props.sb.accessToken}` } },
      });
      return createRezetServer({
        supabase,
        householdId: props.householdId,
        locale: props.locale,
        reauthHint: 'Your Rezet connection expired. Reconnect the Rezet connector in your AI client to sign in again.',
      });
    },
    {
      route: '/mcp',
      allowedHostnames: [new URL(env.PUBLIC_ORIGIN).hostname],
    },
  );
  return mcp;
}

// IMPORTANT: OAuthProvider.validateHandler accepts only { fetch } objects or WorkerEntrypoint
// subclasses. createMcpHandler returns a bare callable, which validateHandler REJECTS
// ("must be either an ExportedHandler object with a fetch method or a class extending
// WorkerEntrypoint") — and its `.fetch` property has the signature (request, options), not
// (request, env, ctx). So wrap it. (Verified in @cloudflare/workers-oauth-provider@0.10.3
// dist/oauth-provider.js validateHandler(), and agents@0.22.0 handler-stateless.js.)
const apiHandler = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext & { props?: unknown }) {
    const props = ctx.props;
    if (!isRezetProps(props)) return invalidToken(env, 'grant has no Rezet session');
    if (props.sb.expiresAt * 1000 - Date.now() < 30_000) {
      // Supabase JWT (about to be) expired: make the client refresh its Worker token,
      // which runs tokenExchangeCallback → refreshSession() → new props. Never refresh here (§3.6).
      return invalidToken(env, 'session expired, refresh required');
    }
    return mcpHandlerFor(env)(request, env, ctx);
  },
};

/** Worker token dies ≥10 min before the Supabase JWT, so a valid Worker token implies a valid one. */
function clampTtl(expiresAt: number): number {
  const now = Math.floor(Date.now() / 1000);
  return Math.min(ACCESS_TOKEN_TTL, Math.max(60, expiresAt - now - 600));
}

async function onTokenExchange(
  options: TokenExchangeCallbackOptions,
  env: Env,
): Promise<TokenExchangeCallbackResult | undefined> {
  if (options.grantType !== 'refresh_token') return undefined; // authorization_code: keep props as minted in /callback
  if (!isRezetProps(options.props)) throw new OAuthError('invalid_grant', { description: 'grant has no Rezet session' });
  const fresh = await refreshSession(env, options.props.sb.refreshToken);
  // Cheap re-check: the user may have left/deleted their household via the app since the
  // last refresh. One extra `profile` select with the freshly-refreshed token — if the
  // profile row is gone, force re-auth the same way an expired/revoked session already
  // does; if it's still there but points at a different household, carry that forward
  // instead of rejecting (a legitimate household change shouldn't require a full re-auth).
  const profile = await loadProfile(env, fresh.accessToken, options.props.userId);
  if (!profile) {
    throw new OAuthError('invalid_grant', { description: 'Rezet session expired or revoked; sign in again' });
  }
  const newProps: RezetProps = { ...options.props, sb: fresh, householdId: profile.householdId };
  return { newProps, accessTokenTTL: clampTtl(fresh.expiresAt) };
}

let provider: OAuthProvider<Env> | undefined;

// `tokenExchangeCallback` receives only its options object, no `env` — so the provider is built
// lazily, once per isolate, capturing `env` in a closure. `env` identity is stable per isolate,
// same reasoning as `mcpHandlerFor` above.
function providerFor(env: Env): OAuthProvider<Env> {
  provider ??= new OAuthProvider<Env>({
    apiRoute: '/mcp',
    apiHandler,
    defaultHandler: authHandler,
    authorizeEndpoint: '/authorize',
    tokenEndpoint: '/token',
    clientRegistrationEndpoint: '/register',
    scopesSupported: ['rezet:household'],
    accessTokenTTL: ACCESS_TOKEN_TTL,
    refreshTokenTTL: REFRESH_TOKEN_TTL,
    allowImplicitFlow: false,
    disallowPublicClientRegistration: false, // Claude clients are public PKCE clients
    tokenExchangeCallback: (options) => onTokenExchange(options, env),
    // NOTE (plan/reality): the plan's §3.1 sketch had `onError: { response: (e) => … }`, but
    // @cloudflare/workers-oauth-provider@0.10.3's real type is a plain function returning
    // `Response | void`, not an object with a `response` key.
    onError: (e) => {
      console.error('[rezet-mcp] oauth', e.code);
    },
  });
  return provider;
}

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    return providerFor(env).fetch(request, env, ctx);
  },
};
