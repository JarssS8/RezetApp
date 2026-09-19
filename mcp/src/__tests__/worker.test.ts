import { afterEach, describe, expect, it, vi } from 'vitest';
import { zonedNow } from '../worker/clock.js';
import { authorizationErrorRedirect, consentPage, isKnownRedirectUri } from '../worker/html.js';
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

describe('isKnownRedirectUri', () => {
  it('knows a real https://claude.ai redirect', () => {
    expect(isKnownRedirectUri('https://claude.ai/api/mcp/auth_callback')).toBe(true);
  });

  it('knows an http://localhost loopback redirect regardless of port', () => {
    expect(isKnownRedirectUri('http://localhost:33418/callback')).toBe(true);
  });

  it('knows an http://127.0.0.1 loopback redirect', () => {
    expect(isKnownRedirectUri('http://127.0.0.1:8080/cb')).toBe(true);
  });

  it('knows a claude.com subdomain over https', () => {
    expect(isKnownRedirectUri('https://api.claude.com/callback')).toBe(true);
  });

  it('treats a non-http(s) scheme carrying claude.ai as unverified, no warning skipped for it', () => {
    // `.host`/`.hostname` alone can't be trusted here: any scheme can claim any hostname with no
    // ownership check behind it, unlike a real https:// origin.
    expect(isKnownRedirectUri('evilapp://claude.ai/cb')).toBe(false);
  });

  it('treats an intent:// URI carrying claude.ai as unverified', () => {
    expect(isKnownRedirectUri('intent://claude.ai/callback#Intent;scheme=https;end')).toBe(false);
  });

  it('treats a look-alike subdomain (claude.ai.evil.com) as unverified', () => {
    expect(isKnownRedirectUri('https://claude.ai.evil.com/x')).toBe(false);
  });

  it('treats claude.ai appearing only in the path as unverified', () => {
    expect(isKnownRedirectUri('https://evil.com/claude.ai')).toBe(false);
  });

  it('treats claude.ai used as userinfo (before @) as unverified', () => {
    expect(isKnownRedirectUri('https://claude.ai@evil.com/')).toBe(false);
  });

  it('treats a loopback host over https (not http) as unverified', () => {
    expect(isKnownRedirectUri('https://localhost:33418/callback')).toBe(false);
  });

  it('treats a malformed URI as unverified rather than throwing', () => {
    expect(isKnownRedirectUri('not a url')).toBe(false);
  });
});

describe('consentPage', () => {
  const base = { clientName: 'Claude', csrf: 'csrf-token', cancelUrl: 'https://example.com/cancel' };

  it('shows no warning and the full redirect URI for a known client', () => {
    const html = consentPage({ ...base, redirectUri: 'https://claude.ai/api/mcp/auth_callback' });
    expect(html).not.toContain('class="warn"');
    expect(html).toContain('https://claude.ai/api/mcp/auth_callback');
  });

  it('shows the warning and the full redirect URI for an unverified client', () => {
    const html = consentPage({ ...base, redirectUri: 'evilapp://claude.ai/cb' });
    expect(html).toContain('class="warn"');
    expect(html).toContain('evilapp://claude.ai/cb');
  });
});

describe('authorizationErrorRedirect', () => {
  const err = { code: 'unsupported_response_type', description: 'bad response_type', state: 's1', issuer: 'https://mcp.test' };

  it('builds the error redirect for a known client redirect URI', () => {
    const to = authorizationErrorRedirect({ ...err, redirectUri: 'https://claude.ai/api/mcp/auth_callback' });
    expect(to).not.toBeNull();
    const url = new URL(to!);
    expect(url.origin + url.pathname).toBe('https://claude.ai/api/mcp/auth_callback');
    expect(url.searchParams.get('error')).toBe('unsupported_response_type');
    expect(url.searchParams.get('state')).toBe('s1');
    expect(url.searchParams.get('iss')).toBe('https://mcp.test');
  });

  // Auditoría run-3 (mcp/src/worker/authHandler:dcr-error-redirect-open-redirector): con registro
  // dinámico abierto, un redirect_uri "registrado" lo elige cualquiera, así que un error de
  // autorización no puede rebotar solo hacia él (RFC 9700 §4.11.2).
  it('refuses to redirect an authorization error to an unverified, self-registered URI', () => {
    expect(authorizationErrorRedirect({ ...err, redirectUri: 'https://evil.example/phish' })).toBeNull();
  });

  it('refuses when there is no redirect URI at all', () => {
    expect(authorizationErrorRedirect({ ...err, redirectUri: undefined })).toBeNull();
  });
});
