import { ProtocolError } from '@modelcontextprotocol/server';
import type { CallToolResult } from '@modelcontextprotocol/server';
import { isAuthError } from '@supabase/supabase-js';
import { NoSessionError } from './context.js';

function errorText(text: string): CallToolResult {
  return { isError: true, content: [{ type: 'text', text }] };
}

let reauthHint = '';

/** Set once by `createRezetServer(ctx)` so session-expired errors point at the right entrypoint's reauth flow. */
export function setReauthHint(hint: string): void {
  reauthHint = hint;
}

function sessionMessage(): string {
  return `rezet: session expired or missing.${reauthHint ? ` ${reauthHint}` : ''}`;
}

/**
 * postgrest-js 2.115 returns `error` as a plain object parsed straight out of the JSON response body —
 * never a `PostgrestError` class instance (only `throwOnError` builds one, and no tool here uses it).
 * `e instanceof PostgrestError` is therefore always false, so duck-type instead: anything with a string
 * `code` is treated as a PostgREST-shaped error, same as every tool's `if (error) throw error;` does.
 */
interface PostgrestLikeError {
  code: string;
  message?: unknown;
  status?: unknown;
}

function isPostgrestLikeError(e: unknown): e is PostgrestLikeError {
  return typeof e === 'object' && e !== null && typeof (e as { code?: unknown }).code === 'string';
}

/** PostgREST's own JWT-rejection codes — see https://postgrest.org/en/stable/references/errors.html */
const JWT_ERROR_CODES = new Set(['PGRST301', 'PGRST302', 'PGRST303']);

function isJwtOrAuthError(e: PostgrestLikeError): boolean {
  if (JWT_ERROR_CODES.has(e.code)) return true;
  // Some auth failures surface with an HTTP-401-shaped status instead of (or alongside) a PGRST3xx code.
  return e.status === 401 || e.status === '401';
}

// `raise exception 'REZET_TAG: prose'` inside our own plpgsql RPCs — the tag lets the UI branch on the
// case without depending on the exact wording; the prose is what the AI needs to recover, so it's the
// only part of a P0001 message that's safe (and meant) to reach the model verbatim.
const P0001_TAG = /^REZET_[A-Z_]+:\s*/;

export function toolError(e: unknown): CallToolResult {
  if (e instanceof NoSessionError) {
    return errorText(sessionMessage());
  }

  if (isAuthError(e)) {
    return errorText(sessionMessage());
  }

  if (isPostgrestLikeError(e)) {
    // El texto de Postgres (e.message/e.details) puede filtrar nombres de columna, restricciones u
    // otros detalles internos del esquema — nunca sale hacia el modelo, salvo el caso deliberado de
    // P0001 (nuestras propias RPCs) más abajo. El código sí, en el log, porque ayuda a depurar sin
    // exponer nada al cliente.
    if (isJwtOrAuthError(e)) {
      console.error('[rezet-mcp] jwt/auth error', e.code);
      return errorText(sessionMessage());
    }

    switch (e.code) {
      case '42501':
        console.error('[rezet-mcp] not allowed (42501)', e.code);
        return errorText('rezet: not allowed / not found in this household');
      case 'PGRST116':
        console.error('[rezet-mcp] not found (PGRST116)', e.code);
        return errorText('rezet: not found');
      case 'P0001': {
        console.error('[rezet-mcp] database rule violation (P0001)', e.code);
        const raw = typeof e.message === 'string' ? e.message : '';
        const stripped = raw.replace(P0001_TAG, '').trim();
        return errorText(stripped ? `rezet: ${stripped}` : 'rezet: database rule violation');
      }
      case '22P02':
        console.error('[rezet-mcp] invalid input value (22P02)', e.code);
        return errorText('rezet: invalid value. Allowed units: g, ml, ud, tbsp');
      case '23514':
        console.error('[rezet-mcp] constraint violated (23514)', e.code);
        return errorText('rezet: constraint violated');
      case '23505':
        console.error('[rezet-mcp] already exists (23505)', e.code);
        return errorText('rezet: already exists');
      default:
        console.error('[rezet-mcp] unhandled PostgrestError', e.code, e);
        return errorText('rezet: unexpected database error');
    }
  }

  console.error('[rezet-mcp] unexpected error', e);
  const message = e instanceof Error ? e.message : String(e);
  return errorText(`rezet: unexpected error: ${message}`);
}

export function withErrors<Args extends unknown[]>(
  fn: (...args: Args) => Promise<CallToolResult>,
): (...args: Args) => Promise<CallToolResult> {
  return async (...args: Args): Promise<CallToolResult> => {
    try {
      return await fn(...args);
    } catch (e) {
      if (e instanceof ProtocolError) throw e;
      return toolError(e);
    }
  };
}
