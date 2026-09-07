import { AuthorizationError, type AuthRequest } from '@cloudflare/workers-oauth-provider';
import type { Env } from './env.js';
import { consentPage, errorPage, noHouseholdPage, securityHeaders } from './html.js';
import { clearCookie, cookieName, createPending, readPending, setCookie, takePending, updatePending } from './pending.js';
import { randomVerifier, s256Challenge } from './pkce.js';
import type { RezetProps } from './props.js';
import { authorizeUrl, exchangePkce, loadProfile } from './supabaseAuth.js';

function html(env: Env, body: string, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(body, { status, headers: { ...securityHeaders(env), ...extraHeaders } });
}

function text(body: string, status = 400): Response {
  return new Response(body, { status, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } });
}

function readCookie(request: Request, name: string): string | undefined {
  const header = request.headers.get('cookie');
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return undefined;
}

function asProvider(value: File | string | null): 'google' | 'apple' | undefined {
  return value === 'google' || value === 'apple' ? value : undefined;
}

function handleInfo(env: Env): Response {
  return text(`Rezet MCP server. Add ${env.PUBLIC_ORIGIN}/mcp as a remote MCP server in your AI client.`, 200);
}

async function handleGetAuthorize(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  let authReq: AuthRequest;
  try {
    authReq = await env.OAUTH_PROVIDER.parseAuthRequest(request);
  } catch (e) {
    if (e instanceof AuthorizationError) {
      if (!e.redirectUri) return text(e.description, 400);
      const redirect = new URL(e.redirectUri);
      redirect.searchParams.set('error', e.code);
      redirect.searchParams.set('error_description', e.description);
      if (e.state) redirect.searchParams.set('state', e.state);
      if (e.issuer) redirect.searchParams.set('iss', e.issuer);
      return Response.redirect(redirect.toString(), 302);
    }
    throw e;
  }

  const client = await env.OAUTH_PROVIDER.lookupClient(authReq.clientId);
  if (!client) return text('unknown client', 400);

  const clientName = client.clientName ?? authReq.clientId;
  const pending = await createPending(env, { authReq, clientName });

  const cancelUrl = new URL(authReq.redirectUri);
  cancelUrl.searchParams.set('error', 'access_denied');
  cancelUrl.searchParams.set('state', authReq.state);

  const body = consentPage({
    clientName,
    redirectHost: new URL(authReq.redirectUri).host,
    csrf: pending.csrf,
    cancelUrl: cancelUrl.toString(),
  });

  return html(env, body, 200, { 'set-cookie': setCookie(url, pending.id) });
}

async function handlePostAuthorize(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const id = readCookie(request, cookieName(url));
  if (!id) return text('authorization expired, start again from your AI client', 400);

  const pending = await readPending(env, id);
  if (!pending) return text('authorization expired, start again from your AI client', 400);

  const form = await request.formData();
  const csrf = form.get('csrf');
  const provider = asProvider(form.get('provider'));
  // CSRF check: the cookie proves this browser started the flow, the hidden field proves this
  // POST came from the consent page we rendered for that pending record (not a forged form).
  if (typeof csrf !== 'string' || csrf !== pending.csrf) return text('invalid request, start again from your AI client', 400);
  if (!provider) return text('unknown provider', 400);

  const verifier = randomVerifier();
  const challenge = await s256Challenge(verifier);
  await updatePending(env, id, { provider, codeVerifier: verifier });

  return new Response(null, { status: 302, headers: { location: authorizeUrl(env, provider, challenge) } });
}

async function handleCallback(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);

  const upstreamError = url.searchParams.get('error');
  if (upstreamError) {
    const description = url.searchParams.get('error_description') ?? upstreamError;
    return html(env, errorPage({ title: 'Sign-in failed', message: description }), 400);
  }

  const id = readCookie(request, cookieName(url));
  if (!id) return text('authorization expired, start again from your AI client', 400);

  // Single-use: whether this succeeds or fails, the pending record must not be replayable.
  const pending = await takePending(env, id);
  if (!pending) return text('authorization expired, start again from your AI client', 400);
  if (!pending.provider || !pending.codeVerifier) {
    return text('authorization not started correctly, start again from your AI client', 400);
  }

  const code = url.searchParams.get('code');
  if (!code) return text('missing authorization code', 400);

  const clearHeader = { 'set-cookie': clearCookie(url) };

  const exchange = await exchangePkce(env, code, pending.codeVerifier);
  if (!exchange.ok) {
    return html(env, errorPage({ title: 'Sign-in failed', message: exchange.description }), 400, clearHeader);
  }

  const profile = await loadProfile(env, exchange.session.accessToken, exchange.userId);
  if (!profile) {
    // Deliberately do not call completeAuthorization: no grant, no props, the Supabase tokens
    // above simply die with this response.
    return html(env, noHouseholdPage({ appUrl: env.APP_URL }), 200, clearHeader);
  }

  const props: RezetProps = {
    v: 1,
    userId: exchange.userId,
    householdId: profile.householdId,
    locale: profile.locale,
    provider: pending.provider,
    sb: exchange.session,
  };

  const { redirectTo } = await env.OAUTH_PROVIDER.completeAuthorization({
    request: pending.authReq,
    userId: exchange.userId,
    metadata: { provider: pending.provider, clientName: pending.clientName },
    scope: ['rezet:household'],
    props,
  });

  return new Response(null, { status: 302, headers: { location: redirectTo, ...clearHeader } });
}

export const authHandler = {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/') return handleInfo(env);
    if (request.method === 'GET' && url.pathname === '/authorize') return handleGetAuthorize(request, env);
    if (request.method === 'POST' && url.pathname === '/authorize') return handlePostAuthorize(request, env);
    if (request.method === 'GET' && url.pathname === '/callback') return handleCallback(request, env);
    return text('not found', 404);
  },
};
