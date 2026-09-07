import { OAuthError } from '@cloudflare/workers-oauth-provider';
import { createClient } from '@supabase/supabase-js';
import type { Env } from './env.js';

export interface SupabaseSession {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

/** The query supabase-js's `_getUrlForProvider` builds for `signInWithOAuth({ provider })`. */
export function authorizeUrl(env: Env, provider: 'google' | 'apple', challenge: string): string {
  const url = new URL(`${env.SUPABASE_URL}/auth/v1/authorize`);
  url.searchParams.set('provider', provider);
  url.searchParams.set('redirect_to', `${env.PUBLIC_ORIGIN}/callback`);
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 's256');
  return url.toString();
}

function describeSupabaseError(json: unknown): string {
  if (json && typeof json === 'object') {
    const o = json as Record<string, unknown>;
    if (typeof o.error_description === 'string') return o.error_description;
    if (typeof o.msg === 'string') return o.msg;
    if (typeof o.error === 'string') return o.error;
  }
  return 'Supabase sign-in failed';
}

export type ExchangePkceResult =
  | { ok: true; session: SupabaseSession; userId: string; email?: string }
  | { ok: false; description: string };

export async function exchangePkce(env: Env, code: string, codeVerifier: string): Promise<ExchangePkceResult> {
  const res = await fetch(`${env.SUPABASE_URL}/auth/v1/token?grant_type=pkce`, {
    method: 'POST',
    headers: { apikey: env.SUPABASE_ANON_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({ auth_code: code, code_verifier: codeVerifier }),
  });
  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok) return { ok: false, description: describeSupabaseError(json) };
  const user = json.user as { id?: unknown; email?: unknown } | undefined;
  if (typeof user?.id !== 'string') return { ok: false, description: 'Supabase sign-in succeeded but returned no user' };
  const expiresAt =
    typeof json.expires_at === 'number' ? json.expires_at : Math.floor(Date.now() / 1000) + Number(json.expires_in);
  return {
    ok: true,
    session: { accessToken: String(json.access_token), refreshToken: String(json.refresh_token), expiresAt },
    userId: user.id,
    email: typeof user.email === 'string' ? user.email : undefined,
  };
}

/**
 * Rotates a Supabase refresh token. Supabase refresh tokens are single-use, so this must be
 * called at most once per Worker refresh (see `tokenExchangeCallback` in `worker/index.ts` for
 * why that's the only place it's safe to call this).
 */
export async function refreshSession(env: Env, refreshToken: string): Promise<SupabaseSession> {
  const res = await fetch(`${env.SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST',
    headers: { apikey: env.SUPABASE_ANON_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  if (res.status === 400 || res.status === 401 || res.status === 403) {
    throw new OAuthError('invalid_grant', { description: 'Rezet session expired or revoked; sign in again' });
  }
  if (res.status === 429) {
    throw new OAuthError('temporarily_unavailable', {
      description: 'upstream rate limited',
      statusCode: 429,
      headers: { 'Retry-After': res.headers.get('retry-after') ?? '60' },
    });
  }
  if (!res.ok) {
    throw new OAuthError('server_error', { description: `supabase refresh failed (${res.status})` });
  }
  const json = (await res.json()) as Record<string, unknown>;
  const expiresAt =
    typeof json.expires_at === 'number' ? json.expires_at : Math.floor(Date.now() / 1000) + Number(json.expires_in);
  return { accessToken: String(json.access_token), refreshToken: String(json.refresh_token), expiresAt };
}

export async function loadProfile(
  env: Env,
  accessToken: string,
  userId: string,
): Promise<{ householdId: string; locale: 'es' | 'en' } | null> {
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
  const { data, error } = await supabase
    .from('profile')
    .select('id, household_id, display_name, locale')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { householdId: data.household_id as string, locale: (data.locale as 'es' | 'en') ?? 'es' };
}
