import type { Env } from './env.js';
import { COPY, type Locale } from './strings.js';
import { BOWL_SVG, THEME_CSS } from './theme.js';

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

/**
 * The shell every page shares: Rezet's Login screen, rebuilt as static HTML — logo mark, wordmark,
 * tagline, then one card. `card` and `after` are raw HTML the caller has already sanitized.
 */
function page(locale: Locale, title: string, card: string, after = ''): string {
  const copy = COPY[locale];
  return `<!doctype html>
<html lang="${copy.htmlLang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${sanitizeText(title)}</title>
<style>${THEME_CSS}</style>
</head>
<body>
<div class="wrap">
  <div class="col">
    <div class="head">
      <div class="mark">${BOWL_SVG}</div>
      <div>
        <div class="brand">Rezet</div>
        <p class="tag">${sanitizeText(copy.tagline)}</p>
      </div>
    </div>
    <div class="card">
${card}
    </div>
${after}
  </div>
</div>
</body>
</html>`;
}

/** Splits a copy template on its single `{placeholder}`, escaping the literal parts around it. */
function fill(template: string, token: string, value: string): string {
  return sanitizeText(template).split(`{${token}}`).join(value);
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
  locale: Locale;
}): string {
  const copy = COPY[opts.locale];
  const clientName = sanitizeText(opts.clientName);
  const redirectUri = sanitizeText(opts.redirectUri);
  const csrf = sanitizeText(opts.csrf);
  const cancelUrl = sanitizeUrl(opts.cancelUrl);
  const warn = isKnownRedirectUri(opts.redirectUri)
    ? ''
    : `      <p class="warn">${sanitizeText(copy.unverified)} <code>${redirectUri}</code></p>\n`;
  return page(
    opts.locale,
    copy.consentTitle,
    `      <h1>${fill(copy.heading, 'client', clientName)}</h1>
      <p class="scope">${sanitizeText(copy.redirectsTo)} <strong>${redirectUri}</strong>. ${sanitizeText(copy.scope)}</p>
${warn}      <form method="POST" action="/authorize">
        <input type="hidden" name="csrf" value="${csrf}">
        <button class="provider" type="submit" name="provider" value="google">${sanitizeText(copy.continueGoogle)}</button>
        <button class="provider secondary" type="submit" name="provider" value="apple">${sanitizeText(copy.continueApple)}</button>
      </form>`,
    `    <a class="cancel" href="${cancelUrl}">${sanitizeText(copy.cancel)}</a>`,
  );
}

export function errorPage(opts: { title: string; message: string; locale: Locale }): string {
  return page(
    opts.locale,
    opts.title,
    `      <h1>${sanitizeText(opts.title)}</h1>
      <p class="scope">${sanitizeText(opts.message)}</p>`,
  );
}

export function noHouseholdPage(opts: { appUrl: string; locale: Locale }): string {
  const copy = COPY[opts.locale];
  const link = `<a href="${sanitizeUrl(opts.appUrl)}">${sanitizeText(opts.appUrl)}</a>`;
  return page(
    opts.locale,
    copy.noHouseholdTitle,
    `      <h1>${sanitizeText(copy.noHouseholdTitle)}</h1>
      <p class="scope">${fill(copy.noHouseholdBody, 'app', link)}</p>`,
  );
}
