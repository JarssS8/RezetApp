/**
 * Rezet's design tokens and the handful of classes the relay's pages need, as one inline
 * stylesheet.
 *
 * Ported from `app/src/styles/tokens.css` + `app/src/ui/tokens.ts` + `app/src/screens/Login.tsx`;
 * values are copied, not re-derived (see CLAUDE.md: the tokens and the type scale are not
 * negotiable). Two deliberate differences from the app:
 *
 * - the theme is `prefers-color-scheme`, not `<html data-theme>`: switching that needs JS, and the
 *   CSP here is `default-src 'none'` with no `script-src` at all.
 * - the accent is always the default green: the user's chosen accent lives in the app's
 *   localStorage, on a different origin, unreachable from this Worker.
 *
 * Everything is inline for the same reason — no external stylesheet, font or image would load
 * under that CSP, and adding an origin to it just to style a login page is not worth it.
 */
export const THEME_CSS = `
:root{
  --bg:        oklch(0.982 0.005 120);
  --bg2:       oklch(0.955 0.007 120);
  --surface:   #ffffff;
  --surface2:  oklch(0.968 0.006 120);
  --text:      oklch(0.235 0.012 150);
  --muted:     oklch(0.53 0.012 150);
  --line:      oklch(0.905 0.008 150);
  --accent:    oklch(0.54 0.105 156);
  --warn:      oklch(0.545 0.13 62);
  --shadow-m:  0 1px 2px rgba(30,40,30,.05), 0 8px 24px rgba(25,40,25,.07);
  --soft:      color-mix(in oklab, var(--accent) 15%, var(--bg));
  --onaccent:  #ffffff;
  --accent-ink: color-mix(in oklab, var(--accent) 85%, black);
  --warn-ink:   color-mix(in oklab, var(--warn) 90%, black);
  --warnsoft:  color-mix(in oklab, var(--warn) 16%, var(--bg));
  color-scheme: light;
}
@media (prefers-color-scheme: dark){
  :root{
    --bg:        oklch(0.185 0.008 150);
    --bg2:       oklch(0.16 0.008 150);
    --surface:   oklch(0.238 0.009 150);
    --surface2:  oklch(0.275 0.009 150);
    --text:      oklch(0.955 0.006 120);
    --muted:     oklch(0.70 0.011 140);
    --line:      oklch(0.325 0.010 150);
    --shadow-m:  0 1px 2px rgba(0,0,0,.3), 0 12px 32px rgba(0,0,0,.34);
    --accent-ink: color-mix(in oklab, var(--accent) 70%, white);
    --warn-ink:   color-mix(in oklab, var(--warn) 70%, white);
    color-scheme: dark;
  }
}

*{box-sizing:border-box}
html,body{margin:0;padding:0;min-height:100%}
body{
  background:var(--bg);
  color:var(--text);
  font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text",system-ui,"Helvetica Neue",Helvetica,sans-serif;
  -webkit-font-smoothing:antialiased;
  text-rendering:optimizeLegibility;
  font-size:16px;
  letter-spacing:-.01em;
  line-height:1.5;
}
a{color:var(--accent-ink);text-decoration:none}
a:hover{color:color-mix(in oklab, var(--accent-ink) 75%, var(--text))}
:focus{outline:none}
:focus-visible{outline:2px solid var(--accent);outline-offset:2px;border-radius:inherit}

@keyframes rise{from{opacity:0;transform:translateY(14px) scale(.985)}to{opacity:1;transform:none}}

.wrap{
  min-height:100vh;
  display:grid;
  place-items:center;
  padding:24px;
  background:radial-gradient(120% 90% at 50% -10%, var(--soft) 0%, var(--bg) 62%);
}
.col{width:100%;max-width:400px;animation:rise .5s cubic-bezier(.2,.7,.2,1) both}

.head{display:flex;flex-direction:column;align-items:center;gap:14px;margin-bottom:34px;text-align:center}
.mark{
  width:64px;height:64px;border-radius:20px;
  background:var(--accent);color:var(--onaccent);
  display:grid;place-items:center;
  box-shadow:var(--shadow-m);
}
.brand{font-size:34px;font-weight:700;letter-spacing:-.028em;line-height:1.05}
.tag{margin:8px auto 0;font-size:16px;color:var(--muted);letter-spacing:-.005em;max-width:280px;text-wrap:pretty}

.card{
  background:var(--surface);
  border:1px solid var(--line);
  border-radius:24px;
  padding:22px;
  box-shadow:var(--shadow-m);
  display:flex;
  flex-direction:column;
  gap:12px;
}
.card h1{margin:0;font-size:22px;font-weight:700;letter-spacing:-.024em;line-height:1.2;text-wrap:pretty}
.card p{margin:0}
.scope{font-size:14.5px;color:var(--muted);letter-spacing:-.005em;line-height:1.5}
.scope strong{color:var(--text);font-weight:600;word-break:break-all}

form{display:flex;flex-direction:column;gap:12px;margin:2px 0 0}
.provider{
  display:flex;align-items:center;justify-content:center;
  width:100%;height:52px;
  border:0;border-radius:15px;
  padding:0 20px;
  font:inherit;font-size:16px;font-weight:650;letter-spacing:-.015em;
  background:var(--accent);color:var(--onaccent);
  cursor:pointer;
  -webkit-tap-highlight-color:transparent;
  transition:transform .12s cubic-bezier(.2,.7,.2,1), filter .12s ease;
}
.provider:active{transform:scale(.98)}
.provider.secondary{
  height:48px;border-radius:14px;padding:0 16px;
  font-size:15.5px;font-weight:600;
  background:var(--surface2);
  color:var(--text);
}
.provider.secondary:active{transform:scale(.96)}
.provider:hover{filter:brightness(1.04)}

.cancel{display:block;text-align:center;margin-top:16px;font-size:14px;font-weight:550;color:var(--muted)}
.cancel:hover{color:var(--text)}

.warn{
  background:var(--warnsoft);
  color:var(--warn-ink);
  border-radius:13px;
  padding:12px 14px;
  font-size:13.5px;
  line-height:1.5;
}
.warn code{word-break:break-all;font-size:13px}

@media (prefers-reduced-motion: reduce){
  *{animation-duration:.01ms !important;transition-duration:.12s !important}
}
`;

/** The `bowl` glyph from `app/src/ui/Icon.tsx`, at the Login screen's size and stroke. */
export const BOWL_SVG = `<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 14h16a8 8 0 0 1-8 6 8 8 0 0 1-8-6ZM12 4v3"/></svg>`;
