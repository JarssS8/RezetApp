import type { AuthRequest } from '@cloudflare/workers-oauth-provider';
import type { Env } from './env.js';

const PENDING_TTL_SECONDS = 600;

export interface PendingRecord {
  authReq: AuthRequest;
  clientName: string;
  createdAt: number;
  csrf: string;
  provider?: 'google' | 'apple';
  codeVerifier?: string;
}

function key(id: string): string {
  return `rezet:pending:${id}`;
}

export async function createPending(
  env: Env,
  input: { authReq: AuthRequest; clientName: string },
): Promise<{ id: string; csrf: string }> {
  const id = crypto.randomUUID();
  const csrf = crypto.randomUUID();
  const record: PendingRecord = { authReq: input.authReq, clientName: input.clientName, createdAt: Date.now(), csrf };
  await env.OAUTH_KV.put(key(id), JSON.stringify(record), { expirationTtl: PENDING_TTL_SECONDS });
  return { id, csrf };
}

export async function readPending(env: Env, id: string): Promise<PendingRecord | undefined> {
  const raw = await env.OAUTH_KV.get(key(id));
  return raw ? (JSON.parse(raw) as PendingRecord) : undefined;
}

export async function updatePending(env: Env, id: string, patch: Partial<PendingRecord>): Promise<void> {
  const existing = await readPending(env, id);
  if (!existing) return;
  const record: PendingRecord = { ...existing, ...patch };
  await env.OAUTH_KV.put(key(id), JSON.stringify(record), { expirationTtl: PENDING_TTL_SECONDS });
}

/** Get + delete in one call: a pending record is consumed exactly once, at `/callback`. */
export async function takePending(env: Env, id: string): Promise<PendingRecord | undefined> {
  const record = await readPending(env, id);
  if (record) await env.OAUTH_KV.delete(key(id));
  return record;
}

/**
 * `wrangler dev`/`http://localhost` rejects cookies with the `__Host-` prefix (it requires
 * `Secure`, which requires https), so drop the prefix outside production.
 */
export function cookieName(url: URL): string {
  return url.protocol === 'https:' ? '__Host-REZET_PENDING' : 'REZET_PENDING';
}

export function setCookie(url: URL, id: string): string {
  const secure = url.protocol === 'https:' ? ' Secure;' : '';
  return `${cookieName(url)}=${id}; HttpOnly;${secure} Path=/; SameSite=Lax; Max-Age=${PENDING_TTL_SECONDS}`;
}

export function clearCookie(url: URL): string {
  const secure = url.protocol === 'https:' ? ' Secure;' : '';
  return `${cookieName(url)}=; HttpOnly;${secure} Path=/; SameSite=Lax; Max-Age=0`;
}
