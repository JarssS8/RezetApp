import { describe, expect, it } from 'vitest';
import { setReauthHint, toolError } from '../errors.js';

/** Extracts the plain-text body vitest can assert on, same shape `errorText` builds. */
function textOf(result: ReturnType<typeof toolError>): string {
  const first = result.content[0];
  if (!first || first.type !== 'text') throw new Error('expected a text content block');
  return first.text;
}

describe('toolError', () => {
  it('treats a plain object with a string `code` as a PostgREST error, not the class instance', () => {
    // postgrest-js 2.115 hands back exactly this shape — a plain object parsed from JSON, never a
    // `PostgrestError` instance — so `e instanceof PostgrestError` would always be false here.
    const plainError = { code: '23505', message: 'duplicate key value violates unique constraint "x"' };
    const result = toolError(plainError);
    expect(result.isError).toBe(true);
    expect(textOf(result)).toBe('rezet: already exists');
  });

  it('passes a P0001 message through, stripping a leading REZET_TAG:', () => {
    const plainError = { code: 'P0001', message: 'REZET_NOT_ADMIN: recipe not found in this household' };
    expect(textOf(toolError(plainError))).toBe('rezet: recipe not found in this household');
  });

  it('passes a P0001 message through untouched when it has no tag', () => {
    const plainError = { code: 'P0001', message: 'recipe not found in this household' };
    expect(textOf(toolError(plainError))).toBe('rezet: recipe not found in this household');
  });

  it('falls back to a generic message when a P0001 error has no usable text', () => {
    const plainError = { code: 'P0001' };
    expect(textOf(toolError(plainError))).toBe('rezet: database rule violation');
  });

  it('returns the session-expired message for PGRST301 (JWT expired)', () => {
    setReauthHint('');
    const plainError = { code: 'PGRST301', message: 'JWT expired' };
    expect(textOf(toolError(plainError))).toBe('rezet: session expired or missing.');
  });

  it('returns the session-expired message for PGRST302 and PGRST303 too', () => {
    setReauthHint('');
    expect(textOf(toolError({ code: 'PGRST302', message: 'x' }))).toBe('rezet: session expired or missing.');
    expect(textOf(toolError({ code: 'PGRST303', message: 'x' }))).toBe('rezet: session expired or missing.');
  });

  it('returns the session-expired message for an HTTP-401-shaped error', () => {
    setReauthHint('');
    expect(textOf(toolError({ code: 'PGRST000', status: 401, message: 'no' }))).toBe(
      'rezet: session expired or missing.',
    );
  });

  it('includes the reauth hint set by setReauthHint on a session-expired error', () => {
    setReauthHint('Run `npm run login` again.');
    expect(textOf(toolError({ code: 'PGRST301', message: 'JWT expired' }))).toBe(
      'rezet: session expired or missing. Run `npm run login` again.',
    );
    setReauthHint('');
  });

  it('never leaks the raw message for a non-P0001 code such as 23505', () => {
    const plainError = {
      code: '23505',
      message: 'duplicate key value violates unique constraint "recipe_household_id_name_key"',
    };
    const text = textOf(toolError(plainError));
    expect(text).toBe('rezet: already exists');
    expect(text).not.toContain('recipe_household_id_name_key');
  });

  it('keeps a fixed message with no raw Postgres text for other known codes', () => {
    expect(textOf(toolError({ code: '42501', message: 'permission denied for table pantry_item' }))).toBe(
      'rezet: not allowed / not found in this household',
    );
    expect(textOf(toolError({ code: 'PGRST116', message: 'no rows' }))).toBe('rezet: not found');
    expect(textOf(toolError({ code: '22P02', message: 'invalid input syntax' }))).toBe(
      'rezet: invalid value. Allowed units: g, ml, ud, tbsp',
    );
    expect(textOf(toolError({ code: '23514', message: 'check constraint "x" violated' }))).toBe(
      'rezet: constraint violated',
    );
  });

  it('falls back to a fixed message for an unrecognized code, without leaking its text', () => {
    const text = textOf(toolError({ code: '99999', message: 'some internal detail' }));
    expect(text).toBe('rezet: unexpected database error');
    expect(text).not.toContain('some internal detail');
  });

  it('still handles a real Error for non-Postgres failures', () => {
    expect(textOf(toolError(new Error('boom')))).toBe('rezet: unexpected error: boom');
  });
});
