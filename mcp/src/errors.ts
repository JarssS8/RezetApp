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
    // El texto de Postgres (e.message/e.details) puede filtrar nombres de columna, restricciones u
    // otros detalles internos del esquema — nunca sale hacia el modelo. El código sí, en el log,
    // porque ayuda a depurar sin exponer nada al cliente.
    switch (e.code) {
      case '42501':
        console.error('[rezet-mcp] not allowed (42501)', e.code);
        return errorText('rezet: not allowed / not found in this household');
      case 'PGRST116':
        console.error('[rezet-mcp] not found (PGRST116)', e.code);
        return errorText('rezet: not found');
      case 'P0001':
        console.error('[rezet-mcp] database rule violation (P0001)', e.code);
        return errorText('rezet: database rule violation');
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
