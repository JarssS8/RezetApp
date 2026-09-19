import type { Env } from './env.js';

/**
 * Every HTML response the auth relay serves carries these — no inline scripts, no framing, no caching.
 *
 * `form-action` must list every origin the consent form's POST is allowed to end up at, and Chromium
 * (and other browsers) enforce this across the *whole* redirect chain that submission triggers, not
 * just the first hop — POST /authorize replies with a 302 to Supabase, which itself 302s to the IdP's
 * own authorize endpoint before a real (non-redirect) document loads there. Restricting to `'self'`
 * alone silently blocks that hop with `net::ERR_ABORTED` and a CSP console error that (confusingly)
 * still names the original `/authorize` URL. Once the IdP's own page loads, this policy no longer
 * applies — that's a new document under the IdP's own CSP — so only the IdP's *entry* origin is needed,
 * not every domain its login flow might hop through afterward.
 */
export function securityHeaders(env: Env): Record<string, string> {
  const supabaseOrigin = new URL(env.SUPABASE_URL).origin;
  return {
    'content-type': 'text/html; charset=utf-8',
    'content-security-policy': `default-src 'none'; style-src 'unsafe-inline'; form-action 'self' ${supabaseOrigin} https://accounts.google.com https://appleid.apple.com; frame-ancestors 'none'`,
    'x-frame-options': 'DENY',
    'referrer-policy': 'no-referrer',
    'cache-control': 'no-store',
  };
}

/** Escapes text for use inside HTML content or an attribute value. Apply to every client-supplied string. */
export function sanitizeText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Validates `value` parses as an absolute http(s) URL, then escapes it for use in an `href`.
 * Returns `#` for anything else (relative URLs, `javascript:`, malformed input) so a bad value
 * can never become a live link.
 */
export function sanitizeUrl(value: string): string {
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '#';
    return sanitizeText(url.toString());
  } catch {
    return '#';
  }
}

function page(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${sanitizeText(title)}</title>
<style>
  body { font: 16px/1.5 system-ui, sans-serif; max-width: 32rem; margin: 4rem auto; padding: 0 1.5rem; color: #1a1a1a; }
  h1 { font-size: 1.25rem; }
  .provider { display: block; width: 100%; margin: 0.5rem 0; padding: 0.75rem 1rem; font: inherit; border: 1px solid #ccc; border-radius: 8px; background: #fff; cursor: pointer; }
  .provider:hover { background: #f5f5f5; }
  .cancel { display: inline-block; margin-top: 1rem; color: #666; }
  .scope { color: #444; }
  .warn { background: #fff4e5; color: #6b3f00; border: 1px solid #f0c68a; border-radius: 8px; padding: 0.75rem 1rem; }
  .warn code { word-break: break-all; }
</style>
</head>
<body>
${body}
</body>
</html>`;
}

// Domains we recognize as belonging to a client we (or the person authorizing) actually know.
// Anyone can register an OAuth client with any `clientName`, so that name alone proves nothing — the
// redirect URI is the one thing an attacker can't spoof without controlling that domain, and judging it
// needs the *whole* URL, not just `.host`: a non-http(s) scheme (`evilapp://claude.ai/cb`,
// `intent://claude.ai/...`) can carry any hostname it likes with no real ownership check behind it, and
// `.host` alone can't tell `https://claude.ai.evil.com` or `https://claude.ai@evil.com` apart from the
// genuine thing either — only `protocol` + `hostname` together can.
const KNOWN_HTTPS_DOMAINS = ['claude.ai', 'claude.com'];
const KNOWN_HTTP_LOOPBACK_HOSTS = ['localhost', '127.0.0.1'];

/** Known only for a real `https://claude.ai`/`claude.com` (or subdomain) redirect, or an `http://` loopback one — anything else, including every non-http(s) scheme, is unverified. */
export function isKnownRedirectUri(redirectUri: string): boolean {
  let url: URL;
  try {
    url = new URL(redirectUri);
  } catch {
    return false;
  }
  if (url.protocol === 'https:') {
    return KNOWN_HTTPS_DOMAINS.some((domain) => url.hostname === domain || url.hostname.endsWith(`.${domain}`));
  }
  if (url.protocol === 'http:') {
    return KNOWN_HTTP_LOOPBACK_HOSTS.includes(url.hostname);
  }
  return false;
}

/**
 * Where an authorization error may bounce the browser, or `null` to render it locally instead.
 * Registration is open, so a client's "registered" redirect URI is whatever its registrant chose:
 * bouncing every error there would make /authorize an open redirector on our origin (RFC 9700
 * §4.11.2). Only a redirect URI we already trust gets the standard error redirect.
 */
export function authorizationErrorRedirect(e: {
  code: string;
  description: string;
  redirectUri?: string;
  state?: string;
  issuer?: string;
}): string | null {
  if (!e.redirectUri || !isKnownRedirectUri(e.redirectUri)) return null;
  const redirect = new URL(e.redirectUri);
  redirect.searchParams.set('error', e.code);
  redirect.searchParams.set('error_description', e.description);
  if (e.state) redirect.searchParams.set('state', e.state);
  if (e.issuer) redirect.searchParams.set('iss', e.issuer);
  return redirect.toString();
}

export function consentPage(opts: {
  clientName: string;
  redirectUri: string;
  csrf: string;
  cancelUrl: string;
}): string {
  const clientName = sanitizeText(opts.clientName);
  const redirectUri = sanitizeText(opts.redirectUri);
  const csrf = sanitizeText(opts.csrf);
  const cancelUrl = sanitizeUrl(opts.cancelUrl);
  return page(
    'Connect to Rezet',
    `<h1>${clientName} wants access to your Rezet household</h1>
<p class="scope">It will redirect to <strong>${redirectUri}</strong> and will be able to read and change your
household's recipes, weekly plan, pantry and shopping list as you.</p>
${isKnownRedirectUri(opts.redirectUri) ? '' : `<p class="warn">Este cliente no está verificado: cualquiera puede registrar uno con el nombre que quiera. Continúa solo si reconoces esta dirección: <code>${redirectUri}</code></p>`}
<form method="POST" action="/authorize">
  <input type="hidden" name="csrf" value="${csrf}">
  <button class="provider" type="submit" name="provider" value="google">Continue with Google</button>
  <button class="provider" type="submit" name="provider" value="apple">Continue with Apple</button>
</form>
<a class="cancel" href="${cancelUrl}">Cancel</a>`,
  );
}

export function errorPage(opts: { title: string; message: string }): string {
  return page(
    opts.title,
    `<h1>${sanitizeText(opts.title)}</h1>
<p>${sanitizeText(opts.message)}</p>`,
  );
}

export function noHouseholdPage(opts: { appUrl: string }): string {
  return page(
    "You're signed in, but there's no Rezet household yet",
    `<h1>No Rezet household yet</h1>
<p>You're signed in, but this account has no Rezet household. Open <a href="${sanitizeUrl(opts.appUrl)}">${sanitizeText(
      opts.appUrl,
    )}</a>, sign in with the same account, create or join a household, then connect again from your AI client.</p>`,
  );
}
