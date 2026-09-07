import { afterEach, describe, expect, it, vi } from 'vitest';
import { zonedNow } from '../worker/clock.js';
import { s256Challenge } from '../worker/pkce.js';
import { isRezetProps, type RezetProps } from '../worker/props.js';

describe('zonedNow', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('shifts a summer (CEST, UTC+2) instant to Madrid wall-clock fields', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-15T10:00:00.000Z'));

    const result = zonedNow('Europe/Madrid');

    expect(result.toISOString()).toBe(new Date(Date.UTC(2026, 6, 15, 12, 0, 0)).toISOString());
  });

  it('shifts a winter (CET, UTC+1) instant to Madrid wall-clock fields', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-15T10:00:00.000Z'));

    const result = zonedNow('Europe/Madrid');

    expect(result.toISOString()).toBe(new Date(Date.UTC(2026, 0, 15, 11, 0, 0)).toISOString());
  });
});

describe('s256Challenge', () => {
  it('matches the RFC 7636 Appendix B test vector', async () => {
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    const challenge = await s256Challenge(verifier);
    expect(challenge).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  });
});

describe('isRezetProps', () => {
  const valid: RezetProps = {
    v: 1,
    userId: 'user-1',
    householdId: 'household-1',
    locale: 'es',
    provider: 'google',
    sb: { accessToken: 'a', refreshToken: 'r', expiresAt: 1234567890 },
  };

  it('accepts a valid shape', () => {
    expect(isRezetProps(valid)).toBe(true);
  });

  it('rejects a missing field', () => {
    const { householdId: _householdId, ...rest } = valid;
    expect(isRezetProps(rest)).toBe(false);
  });

  it('rejects the wrong v', () => {
    expect(isRezetProps({ ...valid, v: 2 })).toBe(false);
  });

  it('rejects a wrong-typed field', () => {
    expect(isRezetProps({ ...valid, userId: 42 })).toBe(false);
  });

  it('rejects an invalid locale', () => {
    expect(isRezetProps({ ...valid, locale: 'fr' })).toBe(false);
  });

  it('rejects an invalid provider', () => {
    expect(isRezetProps({ ...valid, provider: 'facebook' })).toBe(false);
  });

  it('rejects a malformed sb object', () => {
    expect(isRezetProps({ ...valid, sb: { accessToken: 'a' } })).toBe(false);
  });

  it('rejects non-objects', () => {
    expect(isRezetProps(null)).toBe(false);
    expect(isRezetProps('nope')).toBe(false);
    expect(isRezetProps(undefined)).toBe(false);
  });
});
