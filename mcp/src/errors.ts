import { ProtocolError } from '@modelcontextprotocol/server';
import type { CallToolResult } from '@modelcontextprotocol/server';
import { isAuthError, PostgrestError } from '@supabase/supabase-js';
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

export function toolError(e: unknown): CallToolResult {
  if (e instanceof NoSessionError) {
    return errorText(sessionMessage());
  }

  if (isAuthError(e)) {
    return errorText(sessionMessage());
  }

  if (e instanceof PostgrestError) {
    switch (e.code) {
      case '42501':
        return errorText(`rezet: not allowed / not found in this household (${e.message})`);
      case 'PGRST116':
        return errorText(`rezet: not found (${e.message})`);
      case 'P0001':
        return errorText(`rezet: ${e.message}`);
      case '22P02':
        return errorText(`rezet: invalid value: ${e.message}. Allowed units: g, ml, ud, tbsp`);
      case '23514':
        return errorText(`rezet: constraint violated: ${e.details || e.message}`);
      case '23505':
        return errorText(`rezet: already exists: ${e.details || e.message}`);
      default:
        console.error('[rezet-mcp] unhandled PostgrestError', e);
        return errorText(`rezet: unexpected database error: ${e.message}`);
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
